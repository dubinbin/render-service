import { Catch, HttpStatus, MidwayHttpError } from '@midwayjs/core';
import { Context } from '@midwayjs/koa';
import { ErrorResponse } from '@/interface/response';

@Catch()
export class DefaultFilter {
  async catch(err: Error | MidwayHttpError, ctx: Context) {
    // 构建错误响应
    const response: ErrorResponse = {
      code: err['status'] || HttpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: err.message || '服务器内部错误',
      timestamp: Date.now(),
    };

    // 如果是开发环境，可以添加堆栈信息
    if (process.env.NODE_ENV === 'development') {
      response.error = err.stack;
    }

    // 设置状态码
    ctx.status = response.code;
    return response;
  }
}
