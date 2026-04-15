import { Injectable, OnModuleInit, Optional, Inject } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { OnboardingStorageService } from '../onboarding/onboarding-storage.service';

export interface Config {
  // 服务器配置
  host: string;
  port: number;

  // OpenClaw 本地数据目录配置
  /** OpenClaw state 目录（存放 agents/*/ sessions; /*.jsonl） */
  openclawStateDir?: string;
  /** OpenClaw 工作目录 */
  openclawWorkspaceDir?: string;
  /** OpenClaw 配置文件路径 */
  openclawConfigPath?: string;
  /** OpenClaw 日志路径（可选） */
  openclawLogPath?: string;
  /** Bootstrap 文件覆盖配置（可选） */
  bootstrapFileOverrides?: Record<string, string>;

  // 访问保护配置
  accessToken?: string;
  accessMode: 'local-only' | 'token' | 'none';

  // 数据目录
  dataDir: string;

  /**
   * 由 transcript .jsonl 字节数估算 token 时的除数（启发式，非 tokenizer）。
   * 可通过环境变量 TOKEN_ESTIMATE_BYTES_DIVISOR 覆盖，默认 4。
   */
  tokenEstimateBytesDivisor: number;

  /**
   * accessMode 为 none 时是否允许通过 API 写入工作区引导文件（默认关闭）。
   * 环境变量 OPENCLAW_WORKSPACE_WRITE=1 / true 开启。
   */
  workspaceWriteWhenAccessNoneEnabled: boolean;

  // ========== IM 推送配置（新增）==========
  /**
   * 数据源配置
   */
  sources?: Array<{
    type: 'openclaw' | 'dify' | 'langchain';
    enabled: boolean;
    config: Record<string, any>;
  }>;

  /**
   * IM 推送配置
   */
  im?: {
    enabled: boolean;
    channels?: {
      feishu?: {
        enabled: boolean;
        appId: string;
        appSecret: string;
        targetUserId: string;
        rateLimit?: number;
      };
      dingtalk?: any; // 未来扩展
      wecom?: any; // 未来扩展
    };
  };
}

/**
 * 仅依赖 `getConfig()` 的读接口，便于测试与 Setup 里注入临时配置，
 * 避免对完整 `ConfigService` 类做 `as any`。
 */
export interface ConfigReader {
  getConfig(): Config;
}

@Injectable()
export class ConfigService implements ConfigReader, OnModuleInit {
  private config: Config;
  private configPath: string;

  constructor(
    @Optional()
    @Inject(OnboardingStorageService)
    private readonly onboardingStorage?: OnboardingStorageService,
  ) {
    // 使用 realpathSync 解析符号链接，确保路径正确
    const realCwd = fs.realpathSync(process.cwd());
    this.configPath = path.join(realCwd, 'config', 'openclaw.runtime.json');
    this.config = this.loadConfig();
  }

  async onModuleInit() {
    // 如果注入了 OnboardingStorageService，尝试从 ~/.openclawTraceFlow 加载配置并合并
    if (this.onboardingStorage) {
      await this.loadOnboardingConfigIfExists();
    }
  }

  private async loadOnboardingConfigIfExists() {
    if (!this.onboardingStorage) {
      return;
    }

    try {
      const onboardingConfig =
        await this.onboardingStorage.loadOnboardingConfig();
      if (onboardingConfig) {
        // 合并 onboarding 配置到当前配置（onboarding 配置优先级最高）
        this.config = {
          ...this.config,
          openclawStateDir:
            onboardingConfig.openclaw.stateDir || this.config.openclawStateDir,
          openclawWorkspaceDir:
            onboardingConfig.openclaw.workspaceDir ||
            this.config.openclawWorkspaceDir,
          openclawConfigPath:
            onboardingConfig.openclaw.configPath ||
            this.config.openclawConfigPath,
          host: onboardingConfig.traceflow.host || this.config.host,
          port: onboardingConfig.traceflow.port || this.config.port,
          accessMode:
            onboardingConfig.traceflow.accessMode || this.config.accessMode,
          accessToken:
            onboardingConfig.traceflow.accessToken || this.config.accessToken,
        };
        console.log('Loaded configuration from ~/.openclawTraceFlow');
      }
    } catch (error) {
      console.warn('Failed to load onboarding config:', error);
    }
  }

  private loadConfig(): Config {
    // 使用 realpathSync 解析符号链接，确保路径正确
    const realCwd = fs.realpathSync(process.cwd());

    // 1. 默认配置
    const defaultConfig: Partial<Config> = {
      host: '0.0.0.0',
      port: 3001,
      /** 留空则从环境变量或默认路径解析 */
      openclawStateDir: undefined,
      accessMode: 'none',
      dataDir: path.join(realCwd, 'data'),
      tokenEstimateBytesDivisor: 4,
      workspaceWriteWhenAccessNoneEnabled: false,
    };

    // 2. 从配置文件加载（如果存在）
    let fileConfig: Partial<Config> = {};
    if (fs.existsSync(this.configPath)) {
      try {
        const content = fs.readFileSync(this.configPath, 'utf-8');
        fileConfig = JSON.parse(content);
      } catch (error) {
        console.warn('Failed to load config file:', error);
      }
    }

    // 3. 环境变量覆盖
    const envConfig: Partial<Config> = {
      host: process.env.HOST || undefined,
      port: process.env.PORT ? parseInt(process.env.PORT) : undefined,
      openclawStateDir: process.env.OPENCLAW_STATE_DIR || undefined,
      openclawWorkspaceDir: process.env.OPENCLAW_WORKSPACE_DIR || undefined,
      openclawConfigPath:
        process.env.OPENCLAW_CONFIG_PATH ||
        process.env.CLAWDBOT_CONFIG_PATH ||
        undefined,
      accessToken: process.env.OPENCLAW_RUNTIME_ACCESS_TOKEN || undefined,
      accessMode:
        (process.env.OPENCLAW_ACCESS_MODE as Config['accessMode']) || undefined,
      dataDir:
        process.env.TRACEFLOW_DATA_DIR || process.env.DATA_DIR || undefined,
      tokenEstimateBytesDivisor: process.env.TOKEN_ESTIMATE_BYTES_DIVISOR
        ? parseFloat(process.env.TOKEN_ESTIMATE_BYTES_DIVISOR)
        : undefined,
      workspaceWriteWhenAccessNoneEnabled:
        process.env.OPENCLAW_WORKSPACE_WRITE === '1' ||
        process.env.OPENCLAW_WORKSPACE_WRITE === 'true',
    };

    // 4. 合并配置（fileConfig 优先级最高，用户手动编辑的 > 环境变量）
    const merged = {
      ...defaultConfig,
      ...Object.fromEntries(
        Object.entries(envConfig).filter(([_, v]) => v !== undefined),
      ),
      ...fileConfig,
    } as Config;

    // 5. 展开路径中的 ~
    if (merged.openclawStateDir?.startsWith('~/')) {
      merged.openclawStateDir = path.join(
        os.homedir(),
        merged.openclawStateDir.slice(2),
      );
    }
    if (merged.openclawWorkspaceDir?.startsWith('~/')) {
      merged.openclawWorkspaceDir = path.join(
        os.homedir(),
        merged.openclawWorkspaceDir.slice(2),
      );
    }
    if (merged.openclawConfigPath?.startsWith('~/')) {
      merged.openclawConfigPath = path.join(
        os.homedir(),
        merged.openclawConfigPath.slice(2),
      );
    }

    if (
      typeof merged.tokenEstimateBytesDivisor !== 'number' ||
      !Number.isFinite(merged.tokenEstimateBytesDivisor) ||
      merged.tokenEstimateBytesDivisor <= 0
    ) {
      merged.tokenEstimateBytesDivisor = 4;
    }

    if (typeof merged.workspaceWriteWhenAccessNoneEnabled !== 'boolean') {
      merged.workspaceWriteWhenAccessNoneEnabled = false;
    }

    // 6. 确保数据目录存在（dataDir 由 cwd + 配置文件 + DATA_DIR 等合并决定，不写死）
    if (!fs.existsSync(merged.dataDir)) {
      fs.mkdirSync(merged.dataDir, { recursive: true });
    }

    // 6. 保存配置快照
    this.saveConfigSnapshot(merged);

    return merged;
  }

  private saveConfigSnapshot(config: Config): void {
    const snapshotPath = path.join(config.dataDir, 'config', 'snapshot.json');
    const snapshotDir = path.dirname(snapshotPath);

    if (!fs.existsSync(snapshotDir)) {
      fs.mkdirSync(snapshotDir, { recursive: true });
    }

    // 过滤掉敏感信息
    const safeConfig = {
      ...config,
      accessToken: config.accessToken ? '[REDACTED]' : undefined,
    };

    fs.writeFileSync(snapshotPath, JSON.stringify(safeConfig, null, 2));
  }

  getConfig(): Config {
    return this.config;
  }

  updateConfig(updates: Partial<Config>): Config {
    this.config = { ...this.config, ...updates };

    // 保存到配置文件
    const configDir = path.dirname(this.configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));

    return this.config;
  }

  /**
   * 重新加载路径相关配置（含 ~ 展开），使 PathConfigController 保存的文件配置
   * 立即反映到内存中，避免 getConfig() 仍返回启动时的旧值。
   */
  reloadPaths(): Config {
    const configPath = path.join(
      process.cwd(),
      'config',
      'openclaw.runtime.json',
    );
    if (!fs.existsSync(configPath)) {
      return this.config;
    }
    try {
      const fileConfig = JSON.parse(
        fs.readFileSync(configPath, 'utf-8'),
      ) as Partial<Config>;
      const pathFields: (keyof Config)[] = [
        'openclawStateDir',
        'openclawWorkspaceDir',
        'openclawConfigPath',
        'openclawLogPath',
      ];
      for (const field of pathFields) {
        const val = fileConfig[field];
        if (typeof val === 'string') {
          (this.config as unknown as Record<string, unknown>)[field] =
            val.startsWith('~/') ? path.join(os.homedir(), val.slice(2)) : val;
        }
      }
      return this.config;
    } catch (error) {
      console.warn('[ConfigService.reloadPaths] Failed to reload:', error);
      return this.config;
    }
  }

  validateToken(token?: string): boolean {
    // 如果是 local-only 模式，不需要 token
    if (this.config.accessMode === 'local-only') {
      return true;
    }

    // 如果是 token 模式，验证 token
    if (this.config.accessMode === 'token' && this.config.accessToken) {
      return token === this.config.accessToken;
    }

    // none 模式，不需要验证
    return true;
  }

  isPublicAccess(): boolean {
    return this.config.host === '0.0.0.0';
  }

  getAccessMode(): 'local-only' | 'token' | 'none' {
    return this.config.accessMode;
  }

  /** 是否允许写入工作区核心引导文件（PUT /api/skills/system-prompt/workspace-file） */
  isWorkspaceBootstrapWriteAllowed(): boolean {
    const c = this.config;
    if (c.accessMode === 'token' || c.accessMode === 'local-only') {
      return true;
    }
    return c.workspaceWriteWhenAccessNoneEnabled === true;
  }
}
