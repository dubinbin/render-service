import { Provide, Inject, ILogger, Config } from '@midwayjs/core';
import path = require('path');
import fs = require('fs');
import { FILE_DATA_PATH } from '@/constant';

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
      // 构建文件路径
      const filePath = path.join(
        this.renderConfig.outputDir || `${process.cwd()}/render_output`,
        taskId,
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
          url: `${FILE_DATA_PATH}/render_output/${taskId}.jpg`,
        })
      );

      return {
        success: response.ok,
        message: `Upload completed with status ${response.status}`,
        url: `${FILE_DATA_PATH}/render_output/${taskId}.jpg`,
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

  // 可选：添加一个验证上传是否成功的方法
  async verifyUpload(taskId: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${FILE_DATA_PATH}/render_output/${taskId}.jpg`,
        {
          method: 'HEAD', // 只获取头信息
        }
      );

      if (!response.ok) {
        this.logger.warn(
          `Uploaded file verification failed for task: ${taskId}`
        );
        return false;
      }

      const contentLength = response.headers.get('content-length');
      const contentType = response.headers.get('content-type');

      this.logger.info(`File verification for task ${taskId}:`, {
        contentLength,
        contentType,
      });

      return true;
    } catch (error) {
      this.logger.error(`File verification failed for task ${taskId}:`, error);
      return false;
    }
  }
}
