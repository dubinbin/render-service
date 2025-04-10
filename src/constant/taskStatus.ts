export enum TaskStatus {
  PENDING = 'pending', // 未开始
  PROCESSING = 'processing', // 进行中
  COMPLETED = 'completed', // 已完成
  FAILED = 'failed', // 失败
}

// 可以根据需要添加更多任务状态
export const TASK_STATUS_CONFIG = {
  // 这里可以为每种状态配置额外的属性
  [TaskStatus.PENDING]: {
    displayName: '等待中',
    order: 1,
  },
  [TaskStatus.PROCESSING]: {
    displayName: '进行中',
    order: 2,
  },
  [TaskStatus.COMPLETED]: {
    displayName: '已完成',
    order: 3,
  },
  [TaskStatus.FAILED]: {
    displayName: '失败',
    order: 4,
  },
};
