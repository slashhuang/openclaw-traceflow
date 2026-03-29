/**
 * OpenClaw Audit System - 异步任务队列
 *
 * @see PRD: docs/PRD-openclaw-audit-system.md Section 11.2.4
 */

interface Task<T> {
  id: string;
  fn: () => Promise<T>;
  resolve: (result: T) => void;
  reject: (error: Error) => void;
}

interface TaskResult<T> {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: T;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

export class AsyncTaskQueue {
  private readonly queue: Task<any>[] = [];
  private readonly results: Map<string, TaskResult<any>> = new Map();
  private running = 0;
  private readonly maxConcurrent: number;

  constructor(maxConcurrent: number = 5) {
    this.maxConcurrent = maxConcurrent;
  }

  // 添加任务
  add<T>(fn: () => Promise<T>, timeoutMs: number = 30000): Promise<T> {
    const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // 初始化任务状态
    this.results.set(id, {
      id,
      status: 'pending',
      createdAt: Date.now(),
    });

    return new Promise<T>((resolve, reject) => {
      this.queue.push({ id, fn, resolve, reject });
      this.processQueue();

      // 超时保护
      setTimeout(() => {
        const result = this.results.get(id);
        if (
          result &&
          (result.status === 'pending' || result.status === 'running')
        ) {
          this.results.set(id, {
            ...result,
            status: 'failed',
            error: 'Task timeout',
            completedAt: Date.now(),
          });
          reject(new Error('Task timeout'));
        }
      }, timeoutMs);
    });
  }

  // 处理队列
  private async processQueue() {
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      const task = this.queue.shift()!;
      this.running++;

      // 更新任务状态
      const result = this.results.get(task.id);
      if (result) {
        this.results.set(task.id, {
          ...result,
          status: 'running',
        });
      }

      // 执行任务
      task
        .fn()
        .then((res) => {
          const result = this.results.get(task.id);
          if (result) {
            this.results.set(task.id, {
              ...result,
              status: 'completed',
              result: res,
              completedAt: Date.now(),
            });
          }
          task.resolve(res);
        })
        .catch((err) => {
          const result = this.results.get(task.id);
          if (result) {
            this.results.set(task.id, {
              ...result,
              status: 'failed',
              error: err.message,
              completedAt: Date.now(),
            });
          }
          task.reject(err);
        })
        .finally(() => {
          this.running--;
          this.processQueue();
        });
    }
  }

  // 获取任务状态
  getTaskStatus<T>(id: string): TaskResult<T> | undefined {
    return this.results.get(id) as TaskResult<T> | undefined;
  }

  // 清理已完成的任务
  cleanup(maxAgeMs: number = 3600000) {
    const now = Date.now();
    for (const [id, result] of this.results.entries()) {
      if (result.completedAt && now - result.completedAt > maxAgeMs) {
        this.results.delete(id);
      }
    }
  }
}

// 全局任务队列实例
export const evaluationTaskQueue = new AsyncTaskQueue(5);
