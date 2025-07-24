# AI儿童绘本网站设置指南

## 🏗️ 架构概览

本项目采用三数据库架构：

```
儿童绘本网站前端 (Next.js)
    ↓
后端API代理层 (Next.js API Routes)
    ↓
┌─────────────────┬─────────────────┬─────────────────┐
│  儿童绘本数据库   │  后端代理数据库   │  Suna AI数据库   │
│   (现有业务)     │   (新建管理)     │   (AI服务)      │
└─────────────────┴─────────────────┴─────────────────┘
```

## 📋 设置步骤

### 1. 创建后端代理数据库

#### 1.1 新建Supabase项目
1. 访问 [supabase.com](https://supabase.com)
2. 点击 "New Project"
3. 项目设置：
   - 名称：`ai-children-book-proxy`
   - 密码：设置强密码
   - 区域：选择最近区域
4. 等待项目创建完成

#### 1.2 执行数据库表结构
1. 进入项目仪表板
2. 点击 "SQL Editor"
3. 复制 `database/proxy-database-schema.sql` 全部内容
4. 粘贴到编辑器并执行

#### 1.3 获取API密钥
进入 Settings → API，复制：
- Project URL
- anon public key  
- service_role key

### 2. 配置环境变量

更新 `.env.local` 文件：

```env
# 儿童绘本网站主数据库
NEXT_PUBLIC_SUPABASE_URL=https://hoxobnyuyugywksztmhr.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-main-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-main-service-key

# 后端代理数据库（新建）
PROXY_SUPABASE_URL=https://your-proxy-project.supabase.co
PROXY_SUPABASE_ANON_KEY=your-proxy-anon-key
PROXY_SUPABASE_SERVICE_KEY=your-proxy-service-key

# Suna AI 配置
SUNA_API_BASE_URL=https://suna-1.learnwise.app
SUNA_SUPABASE_URL=https://supabase.learnwise.app

# 其他配置
NEXTAUTH_SECRET=your-nextauth-secret
NEXTAUTH_URL=http://localhost:3001
```

### 3. 安装依赖

```bash
npm install
```

### 4. 启动开发服务器

```bash
npm run dev
```

## 🧪 测试流程

### 4.1 数据库连接测试
- 检查代理数据库连接
- 验证表结构创建
- 测试RLS策略

### 4.2 API端点测试
- `/api/suna/generate` - 创建绘本任务
- `/api/suna/status` - 查询任务状态  
- `/api/suna/result` - 获取生成结果

### 4.3 前端集成测试
- 用户认证流程
- 绘本创作界面
- 进度查看页面
- 结果展示页面

## 📊 数据库表结构

### 后端代理数据库表

1. **proxy_requests** - API请求日志
2. **api_rate_limits** - API限流管理
3. **auth_tokens** - 认证令牌管理
4. **error_logs** - 错误日志记录
5. **suna_task_mapping** - Suna AI任务映射
6. **api_configs** - API配置管理
7. **system_metrics** - 系统监控指标

### 主要功能

- ✅ **请求日志记录** - 所有API调用的详细日志
- ✅ **限流保护** - 防止API滥用
- ✅ **错误追踪** - 完整的错误记录和分析
- ✅ **任务映射** - 本地任务与Suna AI任务的关联
- ✅ **性能监控** - 系统性能指标收集
- ✅ **安全策略** - RLS行级安全控制

## 🔧 故障排除

### 常见问题

1. **数据库连接失败**
   - 检查环境变量配置
   - 确认API密钥正确
   - 验证网络连接

2. **API调用失败**
   - 检查Suna AI认证
   - 验证JWT token有效性
   - 查看错误日志表

3. **前端显示异常**
   - 检查浏览器控制台
   - 验证API响应格式
   - 确认路由配置

### 调试工具

- **数据库日志**: 查看 `proxy_requests` 表
- **错误追踪**: 查看 `error_logs` 表  
- **性能监控**: 查看 `system_metrics` 表
- **浏览器开发工具**: Network 和 Console 面板

## 📈 监控和维护

### 日志清理
系统会自动清理旧日志：
- 代理请求日志：保留30天
- 系统监控数据：保留7天
- 已解决错误日志：保留90天

### 性能优化
- 数据库索引已优化
- API响应时间监控
- 自动限流保护
- 错误重试机制

## 🚀 部署准备

完成测试后，准备部署：
1. 环境变量配置
2. 数据库迁移
3. 域名和SSL配置
4. 监控告警设置

---

**需要帮助？** 请查看错误日志或联系开发团队。

