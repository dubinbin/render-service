import { Provide, Inject, Config } from '@midwayjs/core';
import { ILogger } from '@midwayjs/logger';
import { TaskSchedulerService } from './taskSchedulerService';
import { TaskStatus } from '../constant/taskStatus';
import { TaskPersistenceService } from './taskPersistenceService';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as moment from 'moment';
import { promisify } from 'util';
import * as readline from 'readline';
import { LogService } from './log.service';
import { CALLBACK_CLIENT_URL, LOG_STAGE } from '@/constant';
import { ArchiveService } from './archive.service';
import { CallbackParams } from '@/types';

const mkdirAsync = promisify(fs.mkdir);
// Replace deprecated fs.exists with fs.access
const existsAsync = promisify(fs.access);

@Provide()
export class ScriptExecutorService {
  @Inject()
  logger: ILogger;

  @Inject()
  taskScheduler: TaskSchedulerService;

  @Inject()
  taskPersistence: TaskPersistenceService;

  @Inject()
  logService: LogService;

  @Inject()
  archiveService: ArchiveService;

  @Config('render')
  renderConfig: {
    outputDir: string;
  };

  @Config('task')
  taskConfig: {
    maxConcurrentTasks: number;
    taskTimeout: number;
    taskTypes: Record<string, any>;
  };

  /**
   * 执行Python脚本
   * @param taskId 任务ID
   * @param scriptPath 脚本路径
   * @param args 脚本参数
   * @returns 执行结果
   */
  async executeScript(
    taskId: string,
    scriptPath: string,
    callbackParams: CallbackParams,
    args: string[] = []
  ): Promise<{
    success: boolean;
    outputPath?: string;
    errorMessage?: string;
    exitCode?: number;
  }> {
    // 创建日志目录
    const logsDir = path.join(process.cwd(), 'logs');
    try {
      await existsAsync(logsDir);
    } catch (error) {
      // 目录不存在，创建它
      await mkdirAsync(logsDir, { recursive: true });
    }

    // 创建日志文件
    const logFileName = `${taskId}.log`;
    const logFilePath = path.join(logsDir, logFileName);
    const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

    try {
      // 获取任务
      const task = await this.taskScheduler.getTaskStatus(taskId);
      if (!task) {
        throw new Error(`无法找到任务: ${taskId}`);
      }

      // 记录开始执行日志
      this.logger.info(`开始执行脚本: ${scriptPath}, 任务ID: ${taskId}`);

      this.logService.addLog(
        taskId,
        LOG_STAGE.processing,
        `[${moment().format(
          'YYYY-MM-DD HH:mm:ss'
        )}] 开始执行脚本: ${scriptPath}, 任务ID: ${taskId}`
      );

      this.writeLog(
        logStream,
        `[${moment().format(
          'YYYY-MM-DD HH:mm:ss'
        )}] 开始执行脚本: ${scriptPath}`
      );
      this.writeLog(
        logStream,
        `[${moment().format('YYYY-MM-DD HH:mm:ss')}] 任务ID: ${taskId}`
      );
      this.writeLog(
        logStream,
        `[${moment().format('YYYY-MM-DD HH:mm:ss')}] 参数: ${args.join(' ')}`
      );

      this.logService.addLog(
        taskId,
        LOG_STAGE.processing,
        `[${moment().format('YYYY-MM-DD HH:mm:ss')}] 执行参数: ${args.join(
          ' '
        )}`
      );

      // 更新任务状态为执行中
      await this.taskScheduler.updateTaskStatus(taskId, TaskStatus.PROCESSING);
      this.writeLog(
        logStream,
        `[${moment().format('YYYY-MM-DD HH:mm:ss')}] 任务状态已更新为: 执行中`
      );

      this.logService.addLog(
        taskId,
        LOG_STAGE.processing,
        `[${moment().format('YYYY-MM-DD HH:mm:ss')}] 任务状态已更新为: 执行中`
      );

      // 记录开始时间
      const startTime = Date.now();

      return new Promise((resolve, reject) => {
        // 执行Python脚本
        const pythonProcess = spawn(
          '/Applications/Blender.app/Contents/MacOS/Blender',
          ['--background', '--python', scriptPath, ...args]
        );
        let lastProgress = 0;
        let totalOutput = '';
        let errorOutput = '';

        // 创建进度匹配的正则表达式
        const progressRegex = /正在处理: (\d+)\/(\d+)/;
        const errorRegex = /错误类型: (\w+)/;

        // 处理标准输出
        pythonProcess.stdout.on('data', data => {
          const output = data.toString();
          totalOutput += output;

          // 写入日志
          this.writeLog(
            logStream,
            `[${moment().format(
              'YYYY-MM-DD HH:mm:ss'
            )}] [stdout] ${output.trim()}`
          );

          this.logService.addLog(
            taskId,
            LOG_STAGE.processing,
            `[${moment().format(
              'YYYY-MM-DD HH:mm:ss'
            )}] python script stdout: ${output.trim()}`
          );

          // 尝试从输出中提取进度信息
          const progressMatch = output.match(progressRegex);
          if (progressMatch && progressMatch.length >= 3) {
            const current = parseInt(progressMatch[1], 10);
            const total = parseInt(progressMatch[2], 10);
            if (!isNaN(current) && !isNaN(total) && total > 0) {
              const progress = Math.floor((current / total) * 100);
              if (progress > lastProgress) {
                lastProgress = progress;
                // 更新任务进度
                this.taskScheduler
                  .updateTaskProgress(taskId, progress)
                  .catch(err => {
                    this.logger.error(`更新任务进度失败: ${err.message}`);
                    this.writeLog(
                      logStream,
                      `[${moment().format(
                        'YYYY-MM-DD HH:mm:ss'
                      )}] [错误] 更新任务进度失败: ${err.message}`
                    );

                    this.logService.addLog(
                      taskId,
                      LOG_STAGE.processing,
                      `[${moment().format(
                        'YYYY-MM-DD HH:mm:ss'
                      )}] 更新任务进度失败: ${err.message}`
                    );
                  });
              }
            }
          }
        });

        // 处理标准错误
        pythonProcess.stderr.on('data', data => {
          const output = data.toString();
          errorOutput += output;
          // 写入日志
          this.writeLog(
            logStream,
            `[${moment().format(
              'YYYY-MM-DD HH:mm:ss'
            )}] [stderr] ${output.trim()}`
          );

          this.logService.addLog(
            taskId,
            LOG_STAGE.processing,
            `python script stderr: ${output.trim()}`
          );

          // 尝试提取错误类型
          const errorMatch = output.match(errorRegex);
          if (errorMatch && errorMatch.length >= 2) {
            this.writeLog(
              logStream,
              `[${moment().format(
                'YYYY-MM-DD HH:mm:ss'
              )}] [错误] 检测到错误类型: ${errorMatch[1]}`
            );

            this.logService.addLog(
              taskId,
              LOG_STAGE.processing,
              `python script stderr: ${errorMatch[1]}`
            );
          }
        });

        // 处理脚本执行完成
        pythonProcess.on('close', async code => {
          const executionTime = Date.now() - startTime;
          this.writeLog(
            logStream,
            `[${moment().format(
              'YYYY-MM-DD HH:mm:ss'
            )}] 脚本执行完成，退出码: ${code}`
          );

          this.logService.addLog(
            taskId,
            LOG_STAGE.processing,
            `脚本执行完成，退出码: ${code}`
          );
          this.writeLog(
            logStream,
            `[${moment().format('YYYY-MM-DD HH:mm:ss')}] 执行时间: ${(
              executionTime / 1000
            ).toFixed(2)}秒`
          );

          try {
            if (code === 0) {
              // 成功执行
              this.writeLog(
                logStream,
                `[${moment().format('YYYY-MM-DD HH:mm:ss')}] 任务执行成功`
              );

              await this.logService.addLog(
                taskId,
                LOG_STAGE.completed,
                `[${moment().format(
                  'YYYY-MM-DD HH:mm:ss'
                )}] python script completed`
              );

              // 更新任务状态为已完成
              await this.taskScheduler.updateTaskStatus(
                taskId,
                TaskStatus.COMPLETED,
                {
                  progress: 100,
                  data: {
                    ...task.data,
                    logFile: logFilePath,
                    executionTime,
                    output: totalOutput,
                  },
                }
              );

              this.completeTaskAction(taskId, callbackParams);

              resolve({
                success: true,
                outputPath: logFilePath,
                exitCode: code,
              });
            } else {
              // 失败执行
              this.writeLog(
                logStream,
                `[${moment().format(
                  'YYYY-MM-DD HH:mm:ss'
                )}] 任务执行失败，退出码: ${code}`
              );

              await this.logService.addLog(
                taskId,
                LOG_STAGE.completed,
                `[${moment().format(
                  'YYYY-MM-DD HH:mm:ss'
                )}] python script failed, exit code: ${code}`
              );

              this.completeTaskAction(taskId, callbackParams);
              // 提取错误信息
              const errorMessage =
                errorOutput || `脚本执行失败，退出码: ${code}`;

              // 更新任务状态为失败
              await this.taskScheduler.updateTaskStatus(
                taskId,
                TaskStatus.FAILED,
                {
                  error: errorMessage,
                  data: {
                    ...task.data,
                    logFile: logFilePath,
                    executionTime,
                    exitCode: code,
                  },
                }
              );

              resolve({
                success: false,
                errorMessage,
                exitCode: code,
                outputPath: logFilePath,
              });
            }
          } catch (err) {
            this.writeLog(
              logStream,
              `[${moment().format(
                'YYYY-MM-DD HH:mm:ss'
              )}] [错误] 更新任务状态失败: ${err.message}`
            );

            this.logService.addLog(
              taskId,
              LOG_STAGE.completed,
              `[${moment().format('YYYY-MM-DD HH:mm:ss')}] 更新任务状态失败: ${
                err.message
              }`
            );
            this.logger.error(`更新任务状态失败: ${err.message}`);
            reject(err);
          } finally {
            // 关闭日志流
            logStream.end();
          }
        });

        // 处理进程错误
        pythonProcess.on('error', async err => {
          this.writeLog(
            logStream,
            `[${moment().format(
              'YYYY-MM-DD HH:mm:ss'
            )}] [错误] 启动脚本时出错: ${err.message}`
          );

          this.logService.addLog(
            taskId,
            LOG_STAGE.processing,
            `[${moment().format('YYYY-MM-DD HH:mm:ss')}] 启动脚本时出错: ${
              err.message
            }`
          );
          try {
            // 更新任务状态为失败
            await this.taskScheduler.updateTaskStatus(
              taskId,
              TaskStatus.FAILED,
              {
                error: `启动脚本时出错: ${err.message}`,
              }
            );
          } catch (updateErr) {
            this.logger.error(`更新任务状态失败: ${updateErr.message}`);
            this.logService.addLog(
              taskId,
              LOG_STAGE.processing,
              `[${moment().format('YYYY-MM-DD HH:mm:ss')}] 更新任务状态失败: ${
                updateErr.message
              }`
            );
          } finally {
            // 关闭日志流
            logStream.end();
            reject(err);
          }
        });

        // 设置超时控制
        const timeout =
          this.taskConfig.taskTypes.render.timeout ||
          this.taskConfig.taskTimeout;
        const timeoutId = setTimeout(() => {
          this.writeLog(
            logStream,
            `[${moment().format('YYYY-MM-DD HH:mm:ss')}] [错误] 脚本执行超时 (${
              timeout / 1000
            }秒)`
          );

          this.logService.addLog(
            taskId,
            LOG_STAGE.processing,
            `[${moment().format('YYYY-MM-DD HH:mm:ss')}] 脚本执行超时 (${
              timeout / 1000
            }秒)`
          );
          // 终止进程
          pythonProcess.kill();

          // 更新任务状态为失败
          this.taskScheduler
            .updateTaskStatus(taskId, TaskStatus.FAILED, {
              error: `脚本执行超时 (${timeout / 1000}秒)`,
            })
            .catch(err => {
              this.logger.error(`更新任务状态失败: ${err.message}`);
            });

          logStream.end();
          resolve({
            success: false,
            errorMessage: `脚本执行超时 (${timeout / 1000}秒)`,
            exitCode: -1,
            outputPath: logFilePath,
          });
        }, timeout);

        // 脚本执行完成后清除超时
        pythonProcess.on('close', () => {
          clearTimeout(timeoutId);
        });
      });
    } catch (error) {
      // 记录错误
      this.writeLog(
        logStream,
        `[${moment().format('YYYY-MM-DD HH:mm:ss')}] [错误] ${error.message}`
      );

      await this.logService.addLog(
        taskId,
        LOG_STAGE.completed,
        `[${moment().format('YYYY-MM-DD HH:mm:ss')}] [错误] ${error.message}`
      );
      this.logger.error(`执行脚本时出错: ${error.message}`);

      this.completeTaskAction(taskId, callbackParams);

      // 更新任务状态为失败
      await this.taskScheduler.updateTaskStatus(taskId, TaskStatus.FAILED, {
        error: error.message,
      });

      // 关闭日志流
      logStream.end();

      return {
        success: false,
        errorMessage: error.message,
      };
    }
  }

  async completeTaskAction(taskId: string, callbackParams: CallbackParams) {
    this.logger.info(
      `完成任务-回调前端: ${taskId}-${callbackParams?.clientId}-${callbackParams?.clientJwt}`
    );
    await this.logService.addLog(
      taskId,
      LOG_STAGE.completed,
      `[${moment().format(
        'YYYY-MM-DD HH:mm:ss'
      )}] finished render task completed`
    );
    this.archiveService.archiveLogs(taskId);
    // 给前端一个回调
    this.callbackTaskToClient(taskId, callbackParams);
  }

  async callbackTaskToClient(taskId: string, callbackParams: CallbackParams) {
    // 给前端一个回调
    const { clientId, clientJwt } = callbackParams;
    try {
      fetch(`${CALLBACK_CLIENT_URL}/api/renderPicSuccessFul`, {
        method: 'POST',
        body: JSON.stringify({
          picName: `${taskId}.jpg`,
          clientId,
        }),
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': clientId || '',
          'x-task-id': taskId || '',
          Authorization: `Bearer ${clientJwt || ''}`,
        },
      });
    } catch (error) {
      this.logger.error(`回调前端失败: ${error.message}`);
    }
  }

  /**
   * 读取脚本执行日志
   * @param taskId 任务ID
   * @returns 日志内容
   */
  async getScriptLog(taskId: string): Promise<{
    success: boolean;
    content?: string;
    error?: string;
  }> {
    try {
      // 查找最新的日志文件
      const dateStr = moment().format('YYYY-MM-DD');
      const logFileName = `${dateStr}-${taskId}.log`;
      const logFilePath = path.join(process.cwd(), 'logs', logFileName);
      // 检查日志文件是否存在
      if (!fs.existsSync(logFilePath)) {
        // 尝试查找旧的日志文件
        const logsDir = path.join(process.cwd(), 'logs');
        if (!fs.existsSync(logsDir)) {
          return {
            success: false,
            error: '日志目录不存在',
          };
        }

        // 读取日志目录中的所有文件
        const files = fs.readdirSync(logsDir);

        // 查找与任务ID匹配的日志文件
        const taskLogFile = files.find(file => file.includes(taskId));

        if (!taskLogFile) {
          return {
            success: false,
            error: `找不到任务 ${taskId} 的日志文件`,
          };
        }

        // 使用找到的日志文件
        const taskLogPath = path.join(logsDir, taskLogFile);
        const content = fs.readFileSync(taskLogPath, 'utf-8');

        return {
          success: true,
          content,
        };
      }

      // 读取日志文件内容
      const content = fs.readFileSync(logFilePath, 'utf-8');

      return {
        success: true,
        content,
      };
    } catch (error) {
      this.logger.error(`读取脚本日志失败: ${error.message}`);
      return {
        success: false,
        error: `读取日志失败: ${error.message}`,
      };
    }
  }

  /**
   * 分页读取日志
   * @param taskId 任务ID
   * @param pageSize 每页行数
   * @param page 页码
   */
  async getScriptLogPaginated(
    taskId: string,
    pageSize = 100,
    page = 1
  ): Promise<{
    success: boolean;
    content?: string[];
    totalLines?: number;
    currentPage: number;
    totalPages?: number;
    error?: string;
  }> {
    try {
      // 查找日志文件
      const dateStr = moment().format('YYYY-MM-DD');
      const logFileName = `${dateStr}-${taskId}.log`;
      const logFilePath = path.join(process.cwd(), 'logs', logFileName);
      let finalLogPath = logFilePath;
      // 检查日志文件是否存在
      if (!fs.existsSync(logFilePath)) {
        // 尝试查找旧的日志文件
        const logsDir = path.join(process.cwd(), 'logs');
        if (!fs.existsSync(logsDir)) {
          return {
            success: false,
            error: '日志目录不存在',
            currentPage: page,
          };
        }

        // 读取日志目录中的所有文件
        const files = fs.readdirSync(logsDir);

        // 查找与任务ID匹配的日志文件
        const taskLogFile = files.find(file => file.includes(taskId));

        if (!taskLogFile) {
          return {
            success: false,
            error: `找不到任务 ${taskId} 的日志文件`,
            currentPage: page,
          };
        }

        // 使用找到的日志文件
        finalLogPath = path.join(logsDir, taskLogFile);
      }

      // 读取所有行
      const allLines: string[] = [];
      const fileStream = fs.createReadStream(finalLogPath);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      // 按行读取
      for await (const line of rl) {
        allLines.push(line);
      }

      // 计算分页
      const totalLines = allLines.length;
      const totalPages = Math.ceil(totalLines / pageSize);
      const startIndex = (page - 1) * pageSize;
      const endIndex = Math.min(startIndex + pageSize, totalLines);

      // 提取当前页的行
      const paginatedLines = allLines.slice(startIndex, endIndex);

      return {
        success: true,
        content: paginatedLines,
        totalLines,
        currentPage: page,
        totalPages,
      };
    } catch (error) {
      this.logger.error(`分页读取脚本日志失败: ${error.message}`);
      return {
        success: false,
        error: `读取日志失败: ${error.message}`,
        currentPage: page,
      };
    }
  }

  /**
   * 写入日志
   */
  private writeLog(logStream: fs.WriteStream, message: string): void {
    logStream.write(`${message}\n`);
  }
}
