import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/libs/supabase'
import { proxyDB } from '@/libs/proxy-db'

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  let userId: string | null = null

  try {
    // 获取查询参数
    const { searchParams } = new URL(request.url)
    const taskId = searchParams.get('task_id')
    
    if (!taskId) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 })
    }

    // 获取用户认证
    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      await proxyDB.logError({
        endpoint: '/api/suna/result',
        error_type: 'AUTH_ERROR',
        error_message: 'Unauthorized access attempt',
        request_data: { task_id: taskId },
        severity: 'warning'
      })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    userId = user.id

    // 检查API限流
    const rateLimitOk = await proxyDB.checkRateLimit(userId, '/api/suna/result', 100) // 每小时100次
    if (!rateLimitOk) {
      return NextResponse.json({ 
        error: 'Rate limit exceeded. Please try again later.' 
      }, { status: 429 })
    }

    // 从主数据库获取任务信息
    const { data: task, error: taskError } = await supabase
      .from('story_generation_tasks')
      .select('*')
      .eq('id', taskId)
      .eq('user_id', userId)
      .single()

    if (taskError || !task) {
      await proxyDB.logError({
        user_id: userId,
        endpoint: '/api/suna/result',
        error_type: 'TASK_NOT_FOUND',
        error_message: `Task not found: ${taskId}`,
        severity: 'warning'
      })
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // 如果任务未完成，返回状态信息
    if (task.status !== 'completed') {
      return NextResponse.json({
        task_id: taskId,
        status: task.status,
        message: task.status === 'processing' ? 'Task is still processing' : 'Task not completed',
        error_message: task.error_message
      })
    }

    // 从代理数据库获取Suna任务映射
    const sunaMapping = await proxyDB.getSunaTaskMapping(taskId)
    
    if (!sunaMapping || !sunaMapping.suna_agent_run_id) {
      await proxyDB.logError({
        user_id: userId,
        endpoint: '/api/suna/result',
        error_type: 'MAPPING_NOT_FOUND',
        error_message: `Suna task mapping not found: ${taskId}`,
        severity: 'warning'
      })
      return NextResponse.json({ 
        error: 'Task mapping not found'
      }, { status: 404 })
    }

    try {
      // 获取JWT token
      const { data: { session } } = await supabase.auth.getSession()
      const jwt = session?.access_token
      
      if (!jwt) {
        return NextResponse.json({ error: 'No valid session' }, { status: 401 })
      }

      // 从Suna AI获取结果 - 使用stream endpoint获取完整结果
      const sunaResponse = await fetch(
        `https://suna-1.learnwise.app/agent-run/${sunaMapping.suna_agent_run_id}/stream?token=${jwt}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${jwt}`,
            'Accept': 'text/event-stream'
          }
        }
      )

      if (!sunaResponse.ok) {
        throw new Error(`Suna AI API error: ${sunaResponse.status}`)
      }

      // 处理SSE流数据
      const reader = sunaResponse.body?.getReader()
      const decoder = new TextDecoder()
      let result = ''
      let messages = []

      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value)
            const lines = chunk.split('\n')

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6))
                  if (data.type === 'message' && data.content) {
                    messages.push(data)
                    if (data.role === 'assistant') {
                      result += data.content
                    }
                  }
                } catch (parseError) {
                  // 忽略解析错误，继续处理
                }
              }
            }
          }
        } finally {
          reader.releaseLock()
        }
      }

      // 解析故事内容
      const storyData = parseStoryContent(result)

      // 如果已经有绘本数据，直接返回
      const { data: existingStorybook } = await supabase
        .from('storybooks')
        .select(`
          *,
          storybook_pages (*)
        `)
        .eq('generation_task_id', taskId)
        .single()

      if (existingStorybook) {
        // 记录成功的API请求
        const responseTime = Date.now() - startTime
        await proxyDB.logRequest({
          user_id: userId,
          endpoint: '/api/suna/result',
          method: 'GET',
          request_body: { task_id: taskId },
          response_body: { task_id: taskId, status: 'completed', has_storybook: true },
          status_code: 200,
          response_time_ms: responseTime,
          ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
          user_agent: request.headers.get('user-agent')
        })

        return NextResponse.json({
          task_id: taskId,
          status: 'completed',
          storybook: existingStorybook,
          raw_content: result
        })
      }

      // 创建新的绘本记录
      if (storyData.title && storyData.pages.length > 0) {
        const { data: newStorybook, error: storybookError } = await supabase
          .from('storybooks')
          .insert({
            title: storyData.title,
            description: task.story_description,
            generation_task_id: taskId,
            created_at: new Date().toISOString()
          })
          .select()
          .single()

        if (storybookError) {
          throw new Error(`Failed to create storybook: ${storybookError.message}`)
        }

        // 创建绘本页面
        const pages = storyData.pages.map((page, index) => ({
          storybook_id: newStorybook.id,
          page_number: index + 1,
          content: page.text,
          image_description: page.image,
          created_at: new Date().toISOString()
        }))

        const { data: newPages, error: pagesError } = await supabase
          .from('storybook_pages')
          .insert(pages)
          .select()

        if (pagesError) {
          throw new Error(`Failed to create pages: ${pagesError.message}`)
        }

        // 创建用户绘本关联
        await supabase
          .from('user_storybooks')
          .insert({
            user_id: userId,
            storybook_id: newStorybook.id,
            created_at: new Date().toISOString()
          })

        const completeStorybook = {
          ...newStorybook,
          storybook_pages: newPages
        }

        // 记录成功的API请求
        const responseTime = Date.now() - startTime
        await proxyDB.logRequest({
          user_id: userId,
          endpoint: '/api/suna/result',
          method: 'GET',
          request_body: { task_id: taskId },
          response_body: { task_id: taskId, status: 'completed', storybook_created: true },
          status_code: 200,
          response_time_ms: responseTime,
          ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
          user_agent: request.headers.get('user-agent')
        })

        return NextResponse.json({
          task_id: taskId,
          status: 'completed',
          storybook: completeStorybook,
          raw_content: result
        })
      } else {
        // 解析失败，返回原始内容
        return NextResponse.json({
          task_id: taskId,
          status: 'completed',
          raw_content: result,
          error: 'Failed to parse story content'
        })
      }

    } catch (sunaError) {
      console.error('Error fetching Suna AI result:', sunaError)
      
      await proxyDB.logError({
        user_id: userId,
        endpoint: '/api/suna/result',
        error_type: 'SUNA_RESULT_FETCH_FAILED',
        error_message: sunaError.message,
        request_data: { task_id: taskId, agent_run_id: sunaMapping.suna_agent_run_id },
        severity: 'error'
      })

      return NextResponse.json({
        task_id: taskId,
        status: 'error',
        error: 'Failed to fetch result from Suna AI'
      }, { status: 500 })
    }

  } catch (error) {
    console.error('Error in result API:', error)
    
    const responseTime = Date.now() - startTime
    
    if (userId) {
      await proxyDB.logRequest({
        user_id: userId,
        endpoint: '/api/suna/result',
        method: 'GET',
        request_body: { task_id: new URL(request.url).searchParams.get('task_id') },
        response_body: { error: 'Internal server error' },
        status_code: 500,
        response_time_ms: responseTime,
        ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
        user_agent: request.headers.get('user-agent')
      })
    }

    await proxyDB.logError({
      user_id: userId,
      endpoint: '/api/suna/result',
      error_type: 'INTERNAL_ERROR',
      error_message: error.message,
      stack_trace: error.stack,
      severity: 'error'
    })

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// 解析故事内容的辅助函数
function parseStoryContent(content: string) {
  const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0)
  
  let title = ''
  const pages = []
  let currentPage = null

  for (const line of lines) {
    if (line.startsWith('标题：')) {
      title = line.replace('标题：', '').trim()
    } else if (line.match(/^第\d+页：?$/)) {
      if (currentPage && currentPage.text && currentPage.image) {
        pages.push(currentPage)
      }
      currentPage = { text: '', image: '' }
    } else if (line.startsWith('文字：')) {
      if (currentPage) {
        currentPage.text = line.replace('文字：', '').trim()
      }
    } else if (line.startsWith('图片：')) {
      if (currentPage) {
        currentPage.image = line.replace('图片：', '').trim()
      }
    }
  }

  // 添加最后一页
  if (currentPage && currentPage.text && currentPage.image) {
    pages.push(currentPage)
  }

  return { title, pages }
}

