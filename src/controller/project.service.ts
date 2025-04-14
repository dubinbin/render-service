import { ProjectService } from '@/service/project.service';
import { Body, Controller, Get, Inject, Param, Post } from '@midwayjs/core';
import { Project } from '@prisma/client';
import { ILogger } from '@midwayjs/logger';
import { PrismaService } from '@/providers/prisma';
@Controller('/api/project')
export class ProjectController {
  @Inject()
  projectService: ProjectService;

  @Inject()
  logger: ILogger;

  @Post('/create')
  async createProject(@Body() project: Project) {
    return await this.projectService.createProject(project);
  }

  @Get('/detail/:projectId')
  async getProject(@Param('projectId') projectId: string) {
    try {
      const project = await this.projectService.getProject(projectId);
      return {
        success: true,
        data: project,
      };
    } catch (error) {
      this.logger.error('获取项目详情失败', error);
      return { success: false, data: null };
    }
  }

  /**
   * 获取任务列表
   * @param options 查询选项
   */
  @Get('/list')
  async listProjects(options: { skip?: number; take?: number }): Promise<{
    success: boolean;
    data: {
      projects: Project[];
      total: number;
    };
  }> {
    try {
      const { skip = 0, take = 10 } = options;

      // 查询总数
      const total = await PrismaService.project.count();
      // 查询任务列表
      const projects = await PrismaService.project.findMany({
        skip,
        take,
        orderBy: [{ createdAt: 'desc' }],
      });

      // 转换为任务消息格式
      return {
        success: true,
        data: {
          total,
          projects: projects.map(project => ({
            id: project.id,
            name: project.name,
            createdAt: project.createdAt,
            projectId: project.projectId,
            model: project.model,
            assignee: project.assignee,
          })),
        },
      };
    } catch (error) {
      this.logger.error('获取任务列表失败', error);
      return { success: false, data: { projects: [], total: 0 } };
    }
  }
}
