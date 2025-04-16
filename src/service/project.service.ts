import { PrismaService } from '@/providers/prisma';
import { ILogger, Inject, Provide } from '@midwayjs/core';
import { Project } from '@prisma/client';

@Provide()
export class ProjectService {
  @Inject()
  logger: ILogger;

  async createProject(project: Project) {
    return await PrismaService.project.create({
      data: project,
    });
  }

  async getProject(projectId: string) {
    return await PrismaService.project.findUnique({
      where: {
        projectId: projectId,
      },
      include: {
        Task: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });
  }

  async listProjects(options: { skip?: number; take?: number }) {
    return await PrismaService.project.findMany({
      skip: options.skip,
      take: options.take,
    });
  }
}
