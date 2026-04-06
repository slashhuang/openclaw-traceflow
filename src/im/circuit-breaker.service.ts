import { Injectable, Logger } from '@nestjs/common';

/**
 * 熔断器状态
 */
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * 熔断器配置
 */
export interface CircuitBreakerConfig {
  /** 失败次数阈值（达到后触发熔断） */
  failureThreshold: number;
  /** 统计窗口（毫秒） */
  windowMs: number;
  /** 熔断后等待恢复时间（毫秒） */
  resetTimeoutMs: number;
  /** 半开状态允许通过的请求数 */
  halfOpenRequests: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5, // 5 次失败触发熔断
  windowMs: 60 * 1000, // 60 秒窗口
  resetTimeoutMs: 30 * 1000, // 30 秒后尝试恢复
  halfOpenRequests: 3, // 半开状态允许 3 个请求探测
};

/**
 * 熔断器 - 保护外部 API 调用
 * 状态机：CLOSED → OPEN → HALF_OPEN → CLOSED
 */
@Injectable()
export class CircuitBreaker {
  private readonly logger = new Logger(CircuitBreaker.name);

  private state: CircuitState = 'CLOSED';
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private halfOpenSuccesses: number = 0;
  private nextAttemptTime: number = 0;

  constructor(
    private readonly config: CircuitBreakerConfig = DEFAULT_CONFIG,
    private readonly name: string = 'default',
  ) {}

  /**
   * 检查是否允许请求通过
   */
  canRequest(): boolean {
    switch (this.state) {
      case 'CLOSED':
        return true;

      case 'OPEN':
        if (Date.now() >= this.nextAttemptTime) {
          this.state = 'HALF_OPEN';
          this.halfOpenSuccesses = 0;
          this.logger.log(
            `[${this.name}] Circuit breaker entering HALF_OPEN state`,
          );
          return true;
        }
        return false;

      case 'HALF_OPEN':
        return this.halfOpenSuccesses < this.config.halfOpenRequests;

      default:
        return false;
    }
  }

  /**
   * 记录成功
   */
  onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.config.halfOpenRequests) {
        this.reset();
        this.logger.log(
          `[${this.name}] Circuit breaker reset to CLOSED (recovered)`,
        );
      }
    } else if (this.state === 'CLOSED') {
      // 成功后可以减少失败计数（可选）
      if (this.failures > 0) {
        this.failures = Math.max(0, this.failures - 1);
      }
    }
  }

  /**
   * 记录失败
   */
  onFailure(error?: Error): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      // 半开状态失败，立即回到 OPEN
      this.open();
      this.logger.warn(
        `[${this.name}] Circuit breaker OPEN (failure in HALF_OPEN): ${error?.message}`,
      );
    } else if (this.state === 'CLOSED') {
      if (this.failures >= this.config.failureThreshold) {
        this.open();
        this.logger.error(
          `[${this.name}] Circuit breaker OPEN (threshold reached): ${error?.message}`,
        );
      } else {
        this.logger.warn(
          `[${this.name}] Failure ${this.failures}/${this.config.failureThreshold}`,
        );
      }
    }
  }

  /**
   * 执行受保护的函数
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.canRequest()) {
      throw new CircuitBreakerOpenError(
        `Circuit breaker [${this.name}] is OPEN`,
      );
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  /**
   * 执行函数，失败时不抛异常（用于" fire and forget"场景）
   */
  async executeAndSuppress<T>(
    fn: () => Promise<T>,
    fallback?: T,
  ): Promise<T | undefined> {
    if (!this.canRequest()) {
      this.logger.warn(
        `[${this.name}] Circuit breaker OPEN, skipping execution`,
      );
      return fallback;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      return fallback;
    }
  }

  /**
   * 打开熔断器
   */
  private open(): void {
    this.state = 'OPEN';
    this.nextAttemptTime = Date.now() + this.config.resetTimeoutMs;
  }

  /**
   * 重置熔断器
   */
  private reset(): void {
    this.state = 'CLOSED';
    this.failures = 0;
    this.halfOpenSuccesses = 0;
    this.nextAttemptTime = 0;
  }

  /**
   * 获取当前状态
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    state: CircuitState;
    failures: number;
    halfOpenSuccesses: number;
    nextAttemptTime: number | null;
  } {
    return {
      state: this.state,
      failures: this.failures,
      halfOpenSuccesses: this.halfOpenSuccesses,
      nextAttemptTime: this.state === 'OPEN' ? this.nextAttemptTime : null,
    };
  }
}

/**
 * 熔断器打开错误
 */
export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

/**
 * 熔断器管理服务
 * 为不同的操作提供独立的熔断器实例
 */
@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private breakers = new Map<string, CircuitBreaker>();

  /**
   * 获取或创建熔断器
   */
  get(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    let breaker = this.breakers.get(name);
    if (!breaker) {
      breaker = new CircuitBreaker({ ...DEFAULT_CONFIG, ...config }, name);
      this.breakers.set(name, breaker);
      this.logger.debug(`Created circuit breaker: ${name}`);
    }
    return breaker;
  }

  /**
   * 移除熔断器
   */
  remove(name: string): void {
    this.breakers.delete(name);
  }

  /**
   * 获取所有熔断器状态
   */
  getAllStats(): Map<
    string,
    {
      state: CircuitState;
      failures: number;
      halfOpenSuccesses: number;
      nextAttemptTime: number | null;
    }
  > {
    const stats = new Map<
      string,
      {
        state: CircuitState;
        failures: number;
        halfOpenSuccesses: number;
        nextAttemptTime: number | null;
      }
    >();
    for (const [name, breaker] of this.breakers.entries()) {
      stats.set(name, breaker.getStats());
    }
    return stats;
  }
}
