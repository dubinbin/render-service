import { MidwayConfig } from '@midwayjs/core';
import { tmpdir } from 'os';
import { join } from 'path';

export default {
  // use for cookie sign key, should change to your own and keep security
  keys: '1733214267974_3114',
  koa: {
    port: 7001,
  },
  jwt: {
    secret: 'render_service',
    expiresIn: '2d',
  },
  passport: {
    session: false,
  },
  midwayLogger: {
    clients: {},
  },
  cors: {
    origin: '*', // for production, should be set a specific domain
  },
  busboy: {
    mode: 'file',
    tmpdir: join(tmpdir(), 'midway-busboy-files'),
    cleanTimeout: 2 * 60 * 1000,
  },
  redis: {
    client: {
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
    },
  },
  rabbitmq: {
    url: process.env.RABBITMQ_URL,
  },
  // 任务调度器配置
  task: {
    maxConcurrentTasks: 1,
    taskTimeout: 30 * 60 * 1000,
    retryCount: 2,
    taskTypes: {
      // 渲染任务配置
      render: {
        handler: 'processRenderTask',
        timeout: 60 * 60 * 1000,
      },
      // 可以添加更多任务类型
    },
  },
  alias: {
    '@': join(__dirname, '../'),
  },
  render: {
    outputDir: join(process.cwd(), 'render_output'),
  },
} as MidwayConfig;
