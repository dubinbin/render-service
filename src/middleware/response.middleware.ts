import { IMiddleware } from '@midwayjs/core';
import { Middleware } from '@midwayjs/decorator';
import { NextFunction, Context } from '@midwayjs/koa';
import { ResponseUtil } from '@/utils/response';

@Middleware()
export class ResponseMiddleware implements IMiddleware<Context, NextFunction> {
  resolve() {
    return async (ctx: Context, next: NextFunction) => {
      // 执行下一个中间件
      const result = await next();

      // 如果响应已被设置或没有返回值，则不处理
      if (ctx.body !== undefined || result === undefined) {
        return;
      }

      // 如果返回的已经是标准格式，则不处理
      if (result && typeof result === 'object' && 'success' in result) {
        ctx.body = result;
        return;
      }

      // 包装为成功响应
      ctx.body = ResponseUtil.success(result);
    };
  }

  static getName(): string {
    return 'response';
  }
}
