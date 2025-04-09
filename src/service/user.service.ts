import { Provide } from '@midwayjs/core';
import { ResponseUtil } from '@/utils/response';
import { IUserOptions } from '@/interface';

@Provide()
export class UserService {
  async getUser(options: IUserOptions) {
    // 自定义成功响应
    return ResponseUtil.success(
      {
        items: [1, 2, 3],
        total: 3,
        ...options,
      },
      '创建成功',
      201
    );
  }
}
