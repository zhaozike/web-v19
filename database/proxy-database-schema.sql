-- 后端代理数据库表结构
-- 用于管理API代理、认证、日志等功能

-- 启用必要的扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. API代理请求日志表
CREATE TABLE proxy_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    request_body JSONB,
    response_body JSONB,
    status_code INTEGER,
    response_time_ms INTEGER,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. API限流管理表
CREATE TABLE api_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    endpoint VARCHAR(255) NOT NULL,
    request_count INTEGER DEFAULT 0,
    window_start TIMESTAMPTZ DEFAULT NOW(),
    window_duration_minutes INTEGER DEFAULT 60,
    max_requests INTEGER DEFAULT 100,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, endpoint, window_start)
);

-- 3. 认证令牌管理表
CREATE TABLE auth_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    token_type VARCHAR(50) DEFAULT 'jwt',
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(token_hash)
);

-- 4. 错误日志表
CREATE TABLE error_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    endpoint VARCHAR(255),
    error_type VARCHAR(100),
    error_message TEXT,
    stack_trace TEXT,
    request_data JSONB,
    severity VARCHAR(20) DEFAULT 'error',
    resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Suna AI任务映射表
CREATE TABLE suna_task_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    local_task_id UUID NOT NULL,
    user_id UUID NOT NULL,
    suna_thread_id VARCHAR(255),
    suna_agent_run_id VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending',
    request_data JSONB,
    response_data JSONB,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(local_task_id)
);

-- 6. API配置表
CREATE TABLE api_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_name VARCHAR(100) NOT NULL,
    endpoint_url TEXT NOT NULL,
    api_key_encrypted TEXT,
    rate_limit_per_hour INTEGER DEFAULT 1000,
    timeout_seconds INTEGER DEFAULT 30,
    retry_attempts INTEGER DEFAULT 3,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(service_name)
);

-- 7. 系统监控表
CREATE TABLE system_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_name VARCHAR(100) NOT NULL,
    metric_value NUMERIC,
    metric_unit VARCHAR(20),
    tags JSONB,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引以提高查询性能
CREATE INDEX idx_proxy_requests_user_id ON proxy_requests(user_id);
CREATE INDEX idx_proxy_requests_created_at ON proxy_requests(created_at);
CREATE INDEX idx_proxy_requests_endpoint ON proxy_requests(endpoint);

CREATE INDEX idx_rate_limits_user_endpoint ON api_rate_limits(user_id, endpoint);
CREATE INDEX idx_rate_limits_window_start ON api_rate_limits(window_start);

CREATE INDEX idx_auth_tokens_user_id ON auth_tokens(user_id);
CREATE INDEX idx_auth_tokens_hash ON auth_tokens(token_hash);
CREATE INDEX idx_auth_tokens_expires ON auth_tokens(expires_at);

CREATE INDEX idx_error_logs_user_id ON error_logs(user_id);
CREATE INDEX idx_error_logs_created_at ON error_logs(created_at);
CREATE INDEX idx_error_logs_severity ON error_logs(severity);

CREATE INDEX idx_suna_mapping_local_task ON suna_task_mapping(local_task_id);
CREATE INDEX idx_suna_mapping_user_id ON suna_task_mapping(user_id);
CREATE INDEX idx_suna_mapping_status ON suna_task_mapping(status);
CREATE INDEX idx_suna_mapping_suna_ids ON suna_task_mapping(suna_thread_id, suna_agent_run_id);

CREATE INDEX idx_api_configs_service ON api_configs(service_name);
CREATE INDEX idx_system_metrics_name_time ON system_metrics(metric_name, recorded_at);

-- 创建更新时间触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为需要的表添加更新时间触发器
CREATE TRIGGER update_api_rate_limits_updated_at 
    BEFORE UPDATE ON api_rate_limits 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_suna_task_mapping_updated_at 
    BEFORE UPDATE ON suna_task_mapping 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_configs_updated_at 
    BEFORE UPDATE ON api_configs 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 插入初始配置数据
INSERT INTO api_configs (service_name, endpoint_url, rate_limit_per_hour, timeout_seconds) VALUES
('suna_ai', 'https://suna-1.learnwise.app', 500, 60),
('supabase_main', 'https://your-project.supabase.co', 10000, 30);

-- 创建RLS (Row Level Security) 策略
ALTER TABLE proxy_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE suna_task_mapping ENABLE ROW LEVEL SECURITY;

-- RLS策略：用户只能访问自己的数据
CREATE POLICY "Users can view own proxy requests" ON proxy_requests
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own proxy requests" ON proxy_requests
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own rate limits" ON api_rate_limits
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own auth tokens" ON auth_tokens
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own error logs" ON error_logs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own task mappings" ON suna_task_mapping
    FOR ALL USING (auth.uid() = user_id);

-- 创建服务角色策略（用于后端API）
CREATE POLICY "Service role can manage all data" ON proxy_requests
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage rate limits" ON api_rate_limits
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage auth tokens" ON auth_tokens
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage error logs" ON error_logs
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage task mappings" ON suna_task_mapping
    FOR ALL USING (auth.role() = 'service_role');

-- 创建视图用于监控和统计
CREATE VIEW api_usage_stats AS
SELECT 
    user_id,
    endpoint,
    DATE(created_at) as date,
    COUNT(*) as request_count,
    AVG(response_time_ms) as avg_response_time,
    COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count
FROM proxy_requests
GROUP BY user_id, endpoint, DATE(created_at);

CREATE VIEW error_summary AS
SELECT 
    error_type,
    COUNT(*) as error_count,
    DATE(created_at) as date,
    severity
FROM error_logs
WHERE resolved = FALSE
GROUP BY error_type, DATE(created_at), severity
ORDER BY error_count DESC;

-- 创建清理旧数据的函数
CREATE OR REPLACE FUNCTION cleanup_old_logs()
RETURNS void AS $$
BEGIN
    -- 删除30天前的代理请求日志
    DELETE FROM proxy_requests WHERE created_at < NOW() - INTERVAL '30 days';
    
    -- 删除7天前的系统监控数据
    DELETE FROM system_metrics WHERE recorded_at < NOW() - INTERVAL '7 days';
    
    -- 删除已解决的90天前的错误日志
    DELETE FROM error_logs WHERE resolved = TRUE AND created_at < NOW() - INTERVAL '90 days';
    
    RAISE NOTICE 'Old logs cleaned up successfully';
END;
$$ LANGUAGE plpgsql;

-- 创建定期清理的计划任务（需要pg_cron扩展）
-- SELECT cron.schedule('cleanup-logs', '0 2 * * *', 'SELECT cleanup_old_logs();');

COMMENT ON TABLE proxy_requests IS '存储所有API代理请求的日志';
COMMENT ON TABLE api_rate_limits IS '管理用户API调用频率限制';
COMMENT ON TABLE auth_tokens IS '管理用户认证令牌';
COMMENT ON TABLE error_logs IS '记录系统错误和异常';
COMMENT ON TABLE suna_task_mapping IS '映射本地任务ID到Suna AI任务ID';
COMMENT ON TABLE api_configs IS '存储各种API服务的配置';
COMMENT ON TABLE system_metrics IS '系统性能和监控指标';

