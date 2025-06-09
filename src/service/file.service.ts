import { Provide, Inject, ILogger, Config } from '@midwayjs/core';
import path = require('path');
import fs = require('fs');
import { CALLBACK_CLIENT_URL, FILE_DATA_PATH } from '@/constant';

@Provide()
export class FileService {
  @Inject()
  logger: ILogger;

  @Config('render')
  renderConfig: {
    outputDir: string;
  };
  async uploadFile(taskId: string) {
    try {
      const fileDataId = taskId.replace(/_cam.+/, '');
      // 构建文件路径
      const filePath = path.join(
        this.renderConfig.outputDir || `${process.cwd()}/render_output`,
        fileDataId,
        `${taskId}.jpg`
      );

      // 检查文件是否存在
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      // 读取文件
      const fileBuffer = fs.readFileSync(filePath);

      // 直接上传二进制数据
      const response = await fetch(
        `${FILE_DATA_PATH}/render_output/${taskId}.jpg`,
        {
          method: 'PUT',
          body: fileBuffer, // 直接发送文件buffer
          headers: {
            'Content-Type': 'image/jpeg', // 设置正确的 Content-Type
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Upload failed with status: ${response.status}`);
      }

      this.logger.info(
        `File uploaded successfully for task: ${taskId}`,
        JSON.stringify({
          success: response.ok,
          message: `Upload completed with status ${response.status}`,
          url: `${CALLBACK_CLIENT_URL}/render_output/${taskId}.jpg`,
        })
      );

      return {
        success: response.ok,
        message: `Upload completed with status ${response.status}`,
        url: `${CALLBACK_CLIENT_URL}/render_output/${taskId}.jpg`,
      };
    } catch (error: any) {
      this.logger.error(`Failed to upload file for task ${taskId}:`, {
        error: error.message,
        stack: error.stack,
      });
      return {
        success: false,
        message: `Upload failed: ${error.message}`,
        url: '',
      };
    }
  }
}
