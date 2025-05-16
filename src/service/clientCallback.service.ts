import { CALLBACK_CLIENT_URL } from '@/constant';
import { CallbackParams } from '@/types';
import { ILogger, Inject, Provide } from '@midwayjs/core';
import { FileService } from './file.service';

@Provide()
export class ClientCallbackService {
  @Inject()
  logger: ILogger;

  @Inject()
  fileService: FileService;

  async callbackTaskToClient(taskId: string, callbackParams: CallbackParams) {
    // 给前端一个回调
    const { clientId, clientJwt, fileDataId } = callbackParams;
    const uploadResult = await this.fileService.uploadFile(taskId);
    try {
      const res = await fetch(
        `${CALLBACK_CLIENT_URL}/api/renderPicSuccessFul`,
        {
          method: 'POST',
          body: JSON.stringify({
            picName: uploadResult.url,
            fileDataId: fileDataId,
            clientId,
          }),
          headers: {
            'Content-Type': 'application/json',
            'x-client-id': clientId || '',
            'x-task-id': taskId || '',
            Authorization: `Bearer ${clientJwt || ''}`,
          },
        }
      );
      this.logger.info(
        `回调前端成功: ${res.status} -- ${taskId} -- ${clientId} -- ${clientJwt} -- ${fileDataId} -- ${uploadResult.url}`
      );
    } catch (error) {
      this.logger.error(`回调前端失败: ${error.message}`);
    }
  }
}
