# 渲染任务编排系统

[English Documentation](../README.md)

## 系统描述

本系统是基于 Blender 的分布式渲染任务编排平台，通过模块化设计自动化完成从模型上传到渲染输出存储的完整工作流程。采用任务队列调度机制支持高并发渲染操作，具备完善的状态跟踪和访问控制功能。

## 核心架构组件

<img src="images/whiteboard_exported_image.png" width="600" alt="系统架构图">

1. **数据存储层**
   - **模型/材质存储**：处理用户上传的3D模型和材质文件（OSS/COS对象存储）
   - **关系数据库**：存储渲染任务元数据、用户权限和系统日志（标记为"database(data persistence)"）
   - **分布式缓存**：Redis加速任务状态查询（标记为"distributed cache(id)"）

2. **任务调度层**
   - **消息队列(MQ)**：RabbitMQ/Kafka用于异步任务处理（标记为"Queue(MQ)"）
   - **任务调度器**：RenderTask Scheduler Manager处理任务分配和负载均衡
   - **执行日志器**：executilelogger记录端到端任务状态

3. **计算服务层**
   - **渲染容器集群**：Render Container Server在Docker容器中运行Blender+Cycles引擎
   - **脚本生成器**：Create Rendered Script自动生成Blender Python执行脚本

4. **管理界面层**
   - **权限系统**：基于RBAC的权限系统（rabec）
   - **前端UI**：Frontend UI提供任务提交/监控界面
   - **模型管理器**：Model data manager system处理模型元数据组装

### 核心工作流程

<img src="images/20220d4034596.png" width="600" alt="系统架构图">

### 主要特性

**状态同步**：
- 双向状态验证（sync task status ↔ check task status）
- 多级状态存储（DB + 缓存）

**容错机制**：
- 自动任务重试
- 原子性渲染结果写入（update render result to database）

**安全控制**：
- 模型访问权限验证
- 操作审计日志

## 部署指南

### 环境要求

部署系统前，请确保已安装以下环境：

- **Docker** 20.10+
- **Docker Compose** 2.0+
- **Node.js** 16.0+ 
- **npm** 或 **yarn**
- **PM2**（进程管理器）
- **Blender** 4.0+（预装在渲染镜像中）

### 服务依赖

系统需要以下服务：

- **Redis** 6.2+
- **MySQL** 8.0+
- **RabbitMQ** 3.9+
- **Dufs**（文件服务器 - 临时解决方案）

### 分步部署

#### 1. 基础设施搭建

使用 Docker Compose 启动所需服务：

```bash
# 启动所有基础设施服务
docker-compose up -d

# 或单独启动各个服务
docker-compose up -d redis mysql rabbitmq dufs
```

#### 2. 文件服务器配置

通过修改 `docker-compose.yml` 中的卷映射来配置 Dufs 文件服务器：

```yaml
dufs:
  # ... 其他配置
  volumes:
    - /你的/静态文件/目录:/data  # 修改此路径
```

**重要提示**：将 `/你的/静态文件/目录` 替换为你实际的静态文件目录路径。

#### 3. 数据库初始化

使用 Prisma 初始化数据库架构：

```bash
# 生成 Prisma 客户端并初始化数据库
npx prisma generate
npx prisma db push  # 或 npx prisma migrate dev
```

#### 4. 应用部署

安装依赖并构建应用：

```bash
# 安装依赖
npm install
# 或
yarn install

# 构建应用
npm run build
# 或
yarn build
```

使用 PM2 启动应用：

```bash
# 使用 PM2 启动渲染服务
pm2 start ./bootstrap.js --name render-service

# 检查服务状态
pm2 status

# 查看日志
pm2 logs render-service
```

### 服务端点

部署成功后，以下服务将可用：

| 服务 | 端口 | URL | 描述 |
|------|------|-----|------|
| 渲染服务 | 3000 | http://localhost:3000 | 主应用API |
| Redis | 6379 | localhost:6379 | 缓存服务 |
| MySQL | 3306 | localhost:3306 | 数据库服务 |
| RabbitMQ 管理界面 | 15672 | http://localhost:15672 | 消息队列管理（admin/6653145） |
| RabbitMQ AMQP | 5672 | localhost:5672 | 消息队列协议 |
| Dufs 文件服务器 | 5001 | http://localhost:5001 | 静态文件服务器 |

### 配置说明

#### 数据库配置
- **MySQL Root 密码**：`6653145`
- **数据库主机**：`localhost:3306`
- 请相应更新应用的数据库连接字符串

#### 消息队列配置
- **RabbitMQ 用户名**：`admin`
- **RabbitMQ 密码**：`6653145`
- **管理界面URL**：http://localhost:15672

#### 文件服务器配置
- **Dufs 提供静态文件服务**，来自映射目录
- **已启用 CORS** 支持跨域请求
- **已启用上传/下载/删除** 权限
- 访问地址：http://localhost:5001

### 重要注意事项

⚠️ **安全考虑**：
- 在生产环境中更改默认密码
- 配置适当的防火墙规则
- 在生产环境中使用 HTTPS

⚠️ **文件存储**：
- Dufs 用作**临时文件服务器解决方案**
- 生产环境建议使用专业对象存储（AWS S3、阿里云 OSS 等）
- 确保有足够的磁盘空间存储模型文件和渲染输出

⚠️ **性能调优**：
- 监控 Redis 内存使用情况
- 根据工作负载配置 MySQL
- 根据渲染负载调整 RabbitMQ 队列设置

### 故障排除

#### 常见问题

1. **端口冲突**：
   ```bash
   # 检查端口使用情况
   netstat -tulpn | grep :5001
   
   # 如需要，在 docker-compose.yml 中修改端口
   ```

2. **数据库连接问题**：
   ```bash
   # 检查 MySQL 容器日志
   docker-compose logs mysql
   
   # 验证数据库连接
   docker-compose exec mysql mysql -u root -p
   ```

3. **文件服务器访问问题**：
   ```bash
   # 检查 Dufs 容器日志
   docker-compose logs dufs
   
   # 验证目录权限
   ls -la /你的/静态文件/目录
   ```

### 开发模式

开发时，可以单独启动服务：

```bash
# 仅启动基础设施
docker-compose up -d redis mysql rabbitmq dufs

# 以开发模式运行应用
npm run dev
# 或
yarn dev
```

### 监控

监控你的服务：

```bash
# 检查所有容器状态
docker-compose ps

# 监控 PM2 进程
pm2 monit

# 查看应用日志
pm2 logs render-service --lines 100
```

## 使用示例

1. 通过前端UI上传模型文件
2. 系统自动生成任务ID
3. 在任务控制台监控实时进度：

```bash
# 任务状态API示例
GET /api/tasks/{task_id}/status
```

4. 结果文件自动保存到配置的对象存储中