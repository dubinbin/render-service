import { TaskStatus } from '../constant/taskStatus';

export interface TaskMessage {
  id: string;
  type: string;
  data: any;
  createdAt: number;
  status: TaskStatus;
  updatedAt?: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  progress?: number; // 0-100
  priority?: number; // 优先级，数字越小优先级越高
}

export interface TaskResult {
  success: boolean;
  data?: any;
  error?: string;
}
