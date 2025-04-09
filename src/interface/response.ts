/**
 * 通用响应结构
 */
export interface ResponseStructure<T = any> {
  code: number; // 状态码
  success: boolean; // 是否成功
  data?: T; // 响应数据
  message?: string; // 消息提示
  timestamp?: number; // 时间戳
}

/**
 * 成功响应结构
 */
export interface SuccessResponse<T = any> extends ResponseStructure<T> {
  success: true;
  data: T;
}

/**
 * 失败响应结构
 */
export interface ErrorResponse extends ResponseStructure {
  success: false;
  error?: any; // 错误详情
}
