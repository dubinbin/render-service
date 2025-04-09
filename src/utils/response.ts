import { SuccessResponse, ErrorResponse } from '@/interface/response';
import { HttpStatus } from '@midwayjs/core';

/**
 * 响应工具类
 */
export class ResponseUtil {
  /**
   * 成功响应
   * @param data 响应数据
   * @param message 成功消息
   * @param code 状态码
   */
  static success<T = any>(
    data: T,
    message = '操作成功',
    code = HttpStatus.OK
  ): SuccessResponse<T> {
    return {
      code,
      success: true,
      data,
      message,
      timestamp: Date.now(),
    };
  }

  /**
   * 失败响应
   * @param message 错误消息
   * @param code 错误码
   * @param error 错误详情
   */
  static error(
    message = '操作失败',
    code = HttpStatus.BAD_REQUEST,
    error?: any
  ): ErrorResponse {
    return {
      code,
      success: false,
      message,
      error,
      timestamp: Date.now(),
    };
  }
}
