import { CALLBACK_CLIENT_URL, LOG_STAGE } from '@/constant';
import { CallbackParams } from '@/types';
import { ILogger, Inject, Provide } from '@midwayjs/core';
import { FileService } from './file.service';
import { LogService } from './log.service';

@Provide()
export class ClientCallbackService {
  @Inject()
  logger: ILogger;

  @Inject()
  logService: LogService;

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
      this.logService.addLog(
        taskId,
        LOG_STAGE.processing,
        `回调前端失败: ${error.message}`,
        true,
        callbackParams
      );
    }
  }

  async callbackErrorToClient(callbackParams: CallbackParams, message: string) {
    const { clientId, fileDataId } = callbackParams;
    try {
      const data = {
        fileDataId,
        clientId,
        type: 'pic',
        message,
      };
      const params = new URLSearchParams(data);

      await fetch(`${CALLBACK_CLIENT_URL}/api/renderModelOrPicError`, {
        method: 'POST',
        body: params.toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
    } catch (e) {
      this.logger.error(`callbackErrorToClient前端失败: ${e.message}`);
    }
  }
}
