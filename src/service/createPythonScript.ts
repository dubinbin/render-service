import { Provide, Inject, Config } from '@midwayjs/core';
import { ILogger } from '@midwayjs/logger';
import { TaskSchedulerService } from './taskSchedulerService';
import { ScriptExecutorService } from './scriptExecutorService';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

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

  @Config('render')
  renderConfig: {
    outputDir: string;
  };

  /**
   * 创建Python渲染脚本并执行
   * @param taskId 任务ID
   * @param params 渲染参数
   * @returns 执行结果
   */
  async StartCreateAndExecuteScript(taskId: string, params: any): Promise<any> {
    try {
      // 生成脚本
      const scriptPath = await this.createBlenderScript(taskId, params);

      // 执行脚本
      const result = await this.scriptExecutor.executeScript(
        taskId,
        scriptPath
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
   * @param params 渲染参数
   * @returns 脚本路径
   */
  async createBlenderScript(taskId: string, params: any): Promise<string> {
    try {
      // 1. Python脚本模板
      const pythonTemplate = `
import time
import sys
import random
import os

print("脚本开始执行")
print("任务ID: ${taskId}")

# 模拟一些工作
for i in range(5):
    print(f"正在处理: {i+1}/5")
    time.sleep(1)  # 每次暂停1秒
    
    # 随机模拟错误，30%概率失败
    if random.random() < 0.3:  # 30%的概率抛出异常
        print(f"处理步骤 {i+1} 时遇到随机错误")
        error_type = random.choice(["ValueError", "IOError", "RuntimeError", "MemoryError"])
        print(f"错误类型: {error_type}")
        
        # 为了更清晰地表明这是模拟错误，我们写入一个错误状态文件
        try:
            print(f"错误详情已写入")
        except Exception as e:
            print(f"写入错误文件时遇到问题: {e}")
        
        # 根据错误类型执行不同的失败行为
        if error_type == "ValueError":
            print("参数错误，无法继续执行")
            sys.exit(1)  # 错误退出，状态码1
        elif error_type == "IOError":
            print("IO错误，文件操作失败")
            sys.exit(2)  # 错误退出，状态码2
        elif error_type == "RuntimeError":
            print("运行时错误，任务中断")
            sys.exit(3)  # 错误退出，状态码3
        else:
            print("严重错误，程序崩溃")
            os._exit(1)  # 强制终止进程
    
    print(f"步骤 {i+1} 完成")

# 如果有参数，打印出来
if len(sys.argv) > 1:
    print(f"收到参数: {sys.argv[1:]}")

# 最后一步，有10%的概率在最后一刻失败
if random.random() < 0.1:  # 10%的概率在最后失败
    print("任务即将完成，但在最后阶段失败")
    sys.exit(99)

print("脚本执行完成")
`;

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
      const outputFileName = `render_${taskId}.png`;
      const outputFilePath = path.join(outputDir, outputFileName);

      // 6. 创建文件并写入内容
      await writeFileAsync(scriptPath, pythonTemplate);

      this.logger.info(`Python脚本已生成: ${scriptPath}`);
      this.logger.info(`输出将保存到: ${outputFilePath}`);

      return scriptPath;
    } catch (error) {
      this.logger.error('创建Python脚本失败', error);
      throw new Error(`创建Python脚本失败: ${error.message}`);
    }
  }
}
