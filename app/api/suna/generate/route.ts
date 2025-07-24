import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/libs/supabase'
import { proxyDB } from '@/libs/proxy-db'
import { v4 as uuidv4 } from 'uuid'

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let userId: string | null = null
  let requestData: any = null

  try {
    // 解析请求数据
    requestData = await request.json()
    const { story_description, tags, custom_tags } = requestData
    
    // 获取用户认证
    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      await proxyDB.logError({
        endpoint: '/api/suna/generate',
        error_type: 'AUTH_ERROR',
        error_message: 'Unauthorized access attempt',
        request_data: { story_description: story_description?.substring(0, 100) },
        severity: 'warning'
      })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    userId = user.id

    // 检查API限流
    const rateLimitOk = await proxyDB.checkRateLimit(userId, '/api/suna/generate', 50) // 每小时50次
    if (!rateLimitOk) {
      await proxyDB.logError({
        user_id: userId,
        endpoint: '/api/suna/generate',
        error_type: 'RATE_LIMIT_EXCEEDED',
        error_message: 'User exceeded rate limit',
        severity: 'warning'
      })
      return NextResponse.json({ 
        error: 'Rate limit exceeded. Please try again later.' 
      }, { status: 429 })
    }

    // 获取JWT token用于Suna AI认证
    const { data: { session } } = await supabase.auth.getSession()
    const jwt = session?.access_token
    
    if (!jwt) {
      await proxyDB.logError({
        user_id: userId,
        endpoint: '/api/suna/generate',
        error_type: 'JWT_ERROR',
        error_message: 'No valid JWT session',
        severity: 'error'
      })
      return NextResponse.json({ error: 'No valid session' }, { status: 401 })
    }

    // 生成本地任务ID
    const localTaskId = uuidv4()

    // 在主数据库创建生成任务记录
    const { data: task, error: taskError } = await supabase
      .from('story_generation_tasks')
      .insert({
        id: localTaskId,
        user_id: userId,
        story_description,
        tags,
        custom_tags,
        status: 'pending'
      })
      .select()
      .single()

    if (taskError) {
      await proxyDB.logError({
        user_id: userId,
        endpoint: '/api/suna/generate',
        error_type: 'DATABASE_ERROR',
        error_message: `Failed to create task: ${taskError.message}`,
        request_data: requestData,
        severity: 'error'
      })
      return NextResponse.json({ error: 'Failed to create task' }, { status: 500 })
    }

    // 在代理数据库创建任务映射
    await proxyDB.createSunaTaskMapping({
      local_task_id: localTaskId,
      user_id: userId,
      status: 'pending',
      request_data: requestData,
      retry_count: 0,
      max_retries: 3
    })

    try {
      // 构建故事创作提示
      const storyPrompt = `创作一个儿童绘本故事：${story_description}。
标签：${tags?.join(', ')}${custom_tags ? `, ${custom_tags.join(', ')}` : ''}。

请生成一个完整的儿童绘本故事，包括：
1. 故事标题
2. 每一页的文字内容（适合3-8岁儿童）
3. 每一页的图片描述（详细描述场景、角色、色彩等）
4. 故事应该有教育意义和正面价值观

请按照以下格式输出：
标题：[故事标题]

第1页：
文字：[页面文字内容]
图片：[详细的图片描述]

第2页：
文字：[页面文字内容]
图片：[详细的图片描述]

...以此类推，生成6-10页的完整故事。`

      // 调用Suna AI API
      const formData = new FormData()
      formData.append('prompt', storyPrompt)
      formData.append('model_name', 'openai/gpt-4o')
      formData.append('enable_thinking', 'false')
      formData.append('reasoning_effort', 'medium')
      formData.append('stream', 'true')
      formData.append('enable_context_manager', 'false')

      const sunaApiStart = Date.now()
      const sunaResponse = await fetch('https://suna-1.learnwise.app/agent/initiate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${jwt}`
        },
        body: formData
      })

      const sunaApiTime = Date.now() - sunaApiStart

      if (!sunaResponse.ok) {
        const errorText = await sunaResponse.text()
        console.error('Suna AI API error:', sunaResponse.status, errorText)
        
        await proxyDB.logError({
          user_id: userId,
          endpoint: '/api/suna/generate',
          error_type: 'SUNA_API_ERROR',
          error_message: `Suna AI API error: ${sunaResponse.status} - ${errorText}`,
          request_data: requestData,
          severity: 'error'
        })

        throw new Error(`Suna AI API error: ${sunaResponse.status}`)
      }

      const sunaData = await sunaResponse.json()
      console.log('Suna AI response:', sunaData)
      
      // 更新任务状态和Suna AI信息
      const { error: updateError } = await supabase
        .from('story_generation_tasks')
        .update({
          status: 'processing',
          suna_thread_id: sunaData.thread_id,
          suna_agent_run_id: sunaData.agent_run_id
        })
        .eq('id', localTaskId)

      if (updateError) {
        console.error('Error updating task:', updateError)
      }

      // 更新代理数据库的任务映射
      await proxyDB.updateSunaTaskStatus(localTaskId, {
        suna_thread_id: sunaData.thread_id,
        suna_agent_run_id: sunaData.agent_run_id,
        status: 'processing',
        response_data: sunaData
      })

      // 记录成功的API请求
      const responseTime = Date.now() - startTime
      await proxyDB.logRequest({
        user_id: userId,
        endpoint: '/api/suna/generate',
        method: 'POST',
        request_body: requestData,
        response_body: {
          task_id: localTaskId,
          thread_id: sunaData.thread_id,
          agent_run_id: sunaData.agent_run_id,
          status: 'processing'
        },
        status_code: 200,
        response_time_ms: responseTime,
        ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
        user_agent: request.headers.get('user-agent')
      })

      // 记录性能指标
      await proxyDB.recordMetric('suna_api_response_time', sunaApiTime, 'ms', {
        endpoint: 'initiate',
        success: true
      })

      return NextResponse.json({ 
        task_id: localTaskId,
        thread_id: sunaData.thread_id,
        agent_run_id: sunaData.agent_run_id,
        status: 'processing',
        message: 'Story generation started successfully'
      })

    } catch (sunaError) {
      console.error('Suna AI API error:', sunaError)
      
      // 更新任务状态为失败
      await supabase
        .from('story_generation_tasks')
        .update({ 
          status: 'failed', 
          error_message: sunaError.message 
        })
        .eq('id', localTaskId)

      // 更新代理数据库
      await proxyDB.updateSunaTaskStatus(localTaskId, {
        status: 'failed',
        error_message: sunaError.message
      })

      // 记录失败的API请求
      const responseTime = Date.now() - startTime
      await proxyDB.logRequest({
        user_id: userId,
        endpoint: '/api/suna/generate',
        method: 'POST',
        request_body: requestData,
        response_body: { error: 'Failed to start story generation' },
        status_code: 500,
        response_time_ms: responseTime,
        ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
        user_agent: request.headers.get('user-agent')
      })

      await proxyDB.logError({
        user_id: userId,
        endpoint: '/api/suna/generate',
        error_type: 'SUNA_API_CALL_FAILED',
        error_message: sunaError.message,
        request_data: requestData,
        severity: 'error'
      })

      return NextResponse.json({ 
        task_id: localTaskId,
        status: 'failed',
        error: 'Failed to start story generation'
      }, { status: 500 })
    }
    
  } catch (error) {
    console.error('Error in generate API:', error)
    
    const responseTime = Date.now() - startTime
    
    // 记录失败的请求
    if (userId) {
      await proxyDB.logRequest({
        user_id: userId,
        endpoint: '/api/suna/generate',
        method: 'POST',
        request_body: requestData,
        response_body: { error: 'Internal server error' },
        status_code: 500,
        response_time_ms: responseTime,
        ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
        user_agent: request.headers.get('user-agent')
      })
    }

    await proxyDB.logError({
      user_id: userId,
      endpoint: '/api/suna/generate',
      error_type: 'INTERNAL_ERROR',
      error_message: error.message,
      stack_trace: error.stack,
      request_data: requestData,
      severity: 'error'
    })

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

