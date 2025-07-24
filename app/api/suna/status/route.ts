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
        endpoint: '/api/suna/status',
        error_type: 'AUTH_ERROR',
        error_message: 'Unauthorized access attempt',
        request_data: { task_id: taskId },
        severity: 'warning'
      })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    userId = user.id

    // 检查API限流
    const rateLimitOk = await proxyDB.checkRateLimit(userId, '/api/suna/status', 200) // 每小时200次
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
        endpoint: '/api/suna/status',
        error_type: 'TASK_NOT_FOUND',
        error_message: `Task not found: ${taskId}`,
        severity: 'warning'
      })
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // 从代理数据库获取Suna任务映射
    const sunaMapping = await proxyDB.getSunaTaskMapping(taskId)
    
    if (!sunaMapping) {
      await proxyDB.logError({
        user_id: userId,
        endpoint: '/api/suna/status',
        error_type: 'MAPPING_NOT_FOUND',
        error_message: `Suna task mapping not found: ${taskId}`,
        severity: 'warning'
      })
      return NextResponse.json({ 
        task_id: taskId,
        status: task.status,
        error: 'Task mapping not found'
      }, { status: 200 })
    }

    // 如果任务还在处理中，查询Suna AI状态
    if (task.status === 'processing' && sunaMapping.suna_agent_run_id) {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const jwt = session?.access_token
        
        if (jwt) {
          const sunaResponse = await fetch(
            `https://suna-1.learnwise.app/agent-run/${sunaMapping.suna_agent_run_id}`,
            {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${jwt}`
              }
            }
          )

          if (sunaResponse.ok) {
            const sunaData = await sunaResponse.json()
            
            // 如果Suna AI任务已完成，更新本地状态
            if (sunaData.status === 'completed' || sunaData.status === 'failed') {
              const newStatus = sunaData.status === 'completed' ? 'completed' : 'failed'
              
              // 更新主数据库
              await supabase
                .from('story_generation_tasks')
                .update({ 
                  status: newStatus,
                  completed_at: new Date().toISOString(),
                  error_message: sunaData.error
                })
                .eq('id', taskId)

              // 更新代理数据库
              await proxyDB.updateSunaTaskStatus(taskId, {
                status: newStatus,
                response_data: sunaData,
                error_message: sunaData.error
              })

              task.status = newStatus
              task.completed_at = new Date().toISOString()
              task.error_message = sunaData.error
            }
          }
        }
      } catch (sunaError) {
        console.error('Error checking Suna AI status:', sunaError)
        await proxyDB.logError({
          user_id: userId,
          endpoint: '/api/suna/status',
          error_type: 'SUNA_STATUS_CHECK_FAILED',
          error_message: sunaError.message,
          request_data: { task_id: taskId, agent_run_id: sunaMapping.suna_agent_run_id },
          severity: 'warning'
        })
      }
    }

    // 记录成功的API请求
    const responseTime = Date.now() - startTime
    await proxyDB.logRequest({
      user_id: userId,
      endpoint: '/api/suna/status',
      method: 'GET',
      request_body: { task_id: taskId },
      response_body: {
        task_id: taskId,
        status: task.status,
        progress: task.progress
      },
      status_code: 200,
      response_time_ms: responseTime,
      ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
      user_agent: request.headers.get('user-agent')
    })

    return NextResponse.json({
      task_id: taskId,
      status: task.status,
      progress: task.progress || 0,
      created_at: task.created_at,
      updated_at: task.updated_at,
      completed_at: task.completed_at,
      error_message: task.error_message,
      suna_thread_id: sunaMapping.suna_thread_id,
      suna_agent_run_id: sunaMapping.suna_agent_run_id
    })

  } catch (error) {
    console.error('Error in status API:', error)
    
    const responseTime = Date.now() - startTime
    
    if (userId) {
      await proxyDB.logRequest({
        user_id: userId,
        endpoint: '/api/suna/status',
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
      endpoint: '/api/suna/status',
      error_type: 'INTERNAL_ERROR',
      error_message: error.message,
      stack_trace: error.stack,
      severity: 'error'
    })

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

