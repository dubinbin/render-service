import { Provide, Inject, Config } from '@midwayjs/core';
import { ILogger } from '@midwayjs/logger';
import { TaskSchedulerService } from './taskSchedulerService';
import { ScriptExecutorService } from './scriptExecutorService';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import {
  IRenderDataType,
  IRenderTaskTypeFromTask,
  LOG_STAGE,
} from '@/constant';
import { LogService } from './log.service';
import { renderTemplate } from '@/utils/helper';

const writeFileAsync = promisify(fs.writeFile);
const mkdirAsync = promisify(fs.mkdir);

@Provide()
export class GeneratePythonScriptService {
  @Inject()
  logger: ILogger;

  @Inject()
  taskScheduler: TaskSchedulerService;

  @Inject()
  scriptExecutor: ScriptExecutorService;

  @Inject()
  logService: LogService;

  @Config('render')
  renderConfig: {
    outputDir: string;
    blenderRunPath: string;
  };

  @Config('model')
  modelConfig: {
    modelDir: string;
  };

  /**
   * 创建Python渲染脚本并执行
   * @param taskId 任务ID
   * @param params 渲染参数
   * @returns 执行结果
   */
  async StartCreateAndExecuteScript(
    taskId: string,
    params: IRenderTaskTypeFromTask
  ): Promise<any> {
    try {
      // 生成脚本
      const scriptPath = await this.createBlenderScript(taskId, params);
      // 执行脚本
      const result = await this.scriptExecutor.executeScript(
        taskId,
        scriptPath,
        params
      );

      return {
        scriptPath,
        ...result,
      };
    } catch (error) {
      this.logger.error(`创建并执行脚本失败: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * 创建Python渲染脚本
   * @param taskId 任务ID
   * @param _params 渲染参数
   * @returns 脚本路径
   */
  async createBlenderScript(
    taskId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    data: IRenderTaskTypeFromTask
  ): Promise<string> {
    try {
      const renderParamsResult = JSON.parse(
        data.payload || '{}'
      ) as IRenderDataType;
      const materialList = renderParamsResult?.materialList;

      const replacementItemsArr =
        materialList?.map(material => {
          return {
            target: material.originalMaterialName,
            fbx: material.newMaterialName,
            collection_name: material.newMaterialName,
          };
        }) || [];

      const renderParams = renderParamsResult?.renderParams;
      const quality = renderParams?.quality || '1k';

      const templatePath = path.join(
        process.cwd(), // 使用项目根目录
        'src',
        'templates',
        'blender_render.py'
      );
      const pythonTemplate = await fs.promises.readFile(templatePath, 'utf-8');
      // 1. 替换模板中的变量
      const renderOutputDir = `${this.renderConfig.outputDir}/${taskId}/`;
      const renderedTemplate = renderTemplate(pythonTemplate, {
        blendFilePath: `${this.modelConfig.modelDir}/${renderParamsResult?.modelName}.blend`,
        taskId,
        outputDir: renderOutputDir,
        replacementItems: replacementItemsArr,
        quality,
        blenderRunPath: this.renderConfig.blenderRunPath,
        clientId: data?.clientId || '',
        clientJwt: data?.clientJwt || '',
        fileDataId: data?.projectId || '',
      });
      // 2. 确保脚本目录存在
      const scriptDir = this.renderConfig.outputDir;
      await mkdirAsync(scriptDir, { recursive: true });

      // 3. 创建任务输出目录
      const outputDir = path.join(scriptDir, taskId);
      await mkdirAsync(outputDir, { recursive: true });

      // 4. 创建脚本名称和路径
      const scriptName = `render_task_${taskId}.py`;
      const scriptPath = path.join(scriptDir, scriptName);

      // 5. 创建输出文件名和路径
      const outputFileName = `render_${taskId}.jpg`;
      const outputFilePath = path.join(outputDir, outputFileName);

      // 6. 创建文件并写入内容
      await writeFileAsync(scriptPath, renderedTemplate);

      this.logService.addLog(
        taskId,
        LOG_STAGE.start,
        `Python脚本已生成: ${scriptPath}`
      );

      this.logService.addLog(
        taskId,
        LOG_STAGE.start,
        `输出将保存到: ${outputFilePath}`
      );

      this.logger.info(`Python脚本已生成: ${scriptPath}`);
      this.logger.info(`输出将保存到: ${outputFilePath}`);

      return scriptPath;
    } catch (error) {
      this.logService.addLog(
        taskId,
        LOG_STAGE.start,
        `创建Python脚本失败: ${error}`
      );
      this.logger.error('创建Python脚本失败', error);
      throw new Error(`创建Python脚本失败: ${error.message}`);
    }
  }
}
