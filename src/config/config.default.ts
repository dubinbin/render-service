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
  alias: {
    '@': join(__dirname, '../'),
  },
} as MidwayConfig;
