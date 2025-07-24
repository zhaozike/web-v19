import { createClient } from '@supabase/supabase-js'

// 后端代理数据库配置
const proxySupabaseUrl = process.env.PROXY_SUPABASE_URL!
const proxySupabaseServiceKey = process.env.PROXY_SUPABASE_SERVICE_KEY!
const proxySupabaseAnonKey = process.env.PROXY_SUPABASE_ANON_KEY!

// 服务端客户端（用于API路由）
export const proxySupabaseAdmin = createClient(
  proxySupabaseUrl,
  proxySupabaseServiceKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

// 客户端（用于前端，如果需要）
export const createProxyClient = () => {
  return createClient(proxySupabaseUrl, proxySupabaseAnonKey)
}

// 数据库表类型定义
export interface ProxyRequest {
  id: string
  user_id: string
  endpoint: string
  method: string
  request_body?: any
  response_body?: any
  status_code?: number
  response_time_ms?: number
  ip_address?: string
  user_agent?: string
  created_at: string
}

export interface ApiRateLimit {
  id: string
  user_id: string
  endpoint: string
  request_count: number
  window_start: string
  window_duration_minutes: number
  max_requests: number
  created_at: string
  updated_at: string
}

export interface AuthToken {
  id: string
  user_id: string
  token_hash: string
  token_type: string
  expires_at?: string
  is_active: boolean
  last_used_at?: string
  created_at: string
}

export interface ErrorLog {
  id: string
  user_id?: string
  endpoint?: string
  error_type?: string
  error_message?: string
  stack_trace?: string
  request_data?: any
  severity: string
  resolved: boolean
  created_at: string
}

export interface SunaTaskMapping {
  id: string
  local_task_id: string
  user_id: string
  suna_thread_id?: string
  suna_agent_run_id?: string
  status: string
  request_data?: any
  response_data?: any
  error_message?: string
  retry_count: number
  max_retries: number
  created_at: string
  updated_at: string
}

export interface ApiConfig {
  id: string
  service_name: string
  endpoint_url: string
  api_key_encrypted?: string
  rate_limit_per_hour: number
  timeout_seconds: number
  retry_attempts: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SystemMetric {
  id: string
  metric_name: string
  metric_value?: number
  metric_unit?: string
  tags?: any
  recorded_at: string
}

// 工具函数
export class ProxyDatabase {
  private client = proxySupabaseAdmin

  // 记录API请求日志
  async logRequest(data: Omit<ProxyRequest, 'id' | 'created_at'>) {
    const { error } = await this.client
      .from('proxy_requests')
      .insert(data)
    
    if (error) {
      console.error('Failed to log proxy request:', error)
    }
  }

  // 检查和更新API限流
  async checkRateLimit(userId: string, endpoint: string, maxRequests: number = 100): Promise<boolean> {
    const windowStart = new Date()
    windowStart.setMinutes(windowStart.getMinutes() - 60) // 1小时窗口

    // 获取当前窗口的请求计数
    const { data: existing, error: fetchError } = await this.client
      .from('api_rate_limits')
      .select('*')
      .eq('user_id', userId)
      .eq('endpoint', endpoint)
      .gte('window_start', windowStart.toISOString())
      .single()

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Rate limit check error:', fetchError)
      return true // 允许请求，避免因错误阻塞
    }

    if (existing) {
      if (existing.request_count >= maxRequests) {
        return false // 超出限制
      }

      // 更新计数
      await this.client
        .from('api_rate_limits')
        .update({ 
          request_count: existing.request_count + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
    } else {
      // 创建新的限流记录
      await this.client
        .from('api_rate_limits')
        .insert({
          user_id: userId,
          endpoint,
          request_count: 1,
          window_start: new Date().toISOString(),
          max_requests: maxRequests
        })
    }

    return true
  }

  // 记录错误日志
  async logError(data: Omit<ErrorLog, 'id' | 'created_at'>) {
    const { error } = await this.client
      .from('error_logs')
      .insert(data)
    
    if (error) {
      console.error('Failed to log error:', error)
    }
  }

  // 创建Suna任务映射
  async createSunaTaskMapping(data: Omit<SunaTaskMapping, 'id' | 'created_at' | 'updated_at'>) {
    const { data: result, error } = await this.client
      .from('suna_task_mapping')
      .insert(data)
      .select()
      .single()
    
    if (error) {
      console.error('Failed to create Suna task mapping:', error)
      throw error
    }

    return result
  }

  // 更新Suna任务状态
  async updateSunaTaskStatus(localTaskId: string, updates: Partial<SunaTaskMapping>) {
    const { error } = await this.client
      .from('suna_task_mapping')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('local_task_id', localTaskId)
    
    if (error) {
      console.error('Failed to update Suna task status:', error)
      throw error
    }
  }

  // 获取Suna任务映射
  async getSunaTaskMapping(localTaskId: string): Promise<SunaTaskMapping | null> {
    const { data, error } = await this.client
      .from('suna_task_mapping')
      .select('*')
      .eq('local_task_id', localTaskId)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        return null // 未找到
      }
      console.error('Failed to get Suna task mapping:', error)
      throw error
    }

    return data
  }

  // 获取API配置
  async getApiConfig(serviceName: string): Promise<ApiConfig | null> {
    const { data, error } = await this.client
      .from('api_configs')
      .select('*')
      .eq('service_name', serviceName)
      .eq('is_active', true)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        return null
      }
      console.error('Failed to get API config:', error)
      throw error
    }

    return data
  }

  // 记录系统指标
  async recordMetric(metricName: string, value: number, unit?: string, tags?: any) {
    const { error } = await this.client
      .from('system_metrics')
      .insert({
        metric_name: metricName,
        metric_value: value,
        metric_unit: unit,
        tags
      })
    
    if (error) {
      console.error('Failed to record metric:', error)
    }
  }

  // 获取用户API使用统计
  async getUserApiStats(userId: string, days: number = 7) {
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const { data, error } = await this.client
      .from('proxy_requests')
      .select('endpoint, status_code, response_time_ms, created_at')
      .eq('user_id', userId)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to get user API stats:', error)
      return []
    }

    return data
  }
}

// 导出单例实例
export const proxyDB = new ProxyDatabase()

