import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface Config {
  // 服务器配置
  host: string;
  port: number;

  // OpenClaw Gateway 配置
  openclawGatewayUrl: string;
  /** Gateway WS 鉴权（与 gateway.auth 一致，用于拉取运行时路径） */
  openclawGatewayToken?: string;
  openclawGatewayPassword?: string;
  openclawStateDir?: string;
  /** 手动指定工作目录（可选，留空则从 Gateway/CLI 解析） */
  openclawWorkspaceDir?: string;

  // 访问保护配置
  accessToken?: string;
  accessMode: 'local-only' | 'token' | 'none';

  // 数据目录
  dataDir: string;

  /** OpenClaw 日志文件路径（用户配置，OpenClaw 输出到该文件） */
  openclawLogPath?: string;
}

@Injectable()
export class ConfigService {
  private config: Config;
  private configPath: string;

  constructor() {
    // 使用 realpathSync 解析符号链接，确保路径正确
    const realCwd = fs.realpathSync(process.cwd());
    this.configPath = path.join(realCwd, 'config', 'openclaw.runtime.json');
    this.config = this.loadConfig();
  }

  private loadConfig(): Config {
    // 使用 realpathSync 解析符号链接，确保路径正确
    const realCwd = fs.realpathSync(process.cwd());

    // 1. 默认配置
    const defaultConfig: Partial<Config> = {
      host: '127.0.0.1',
      port: 3001,
      openclawGatewayUrl: 'http://localhost:18789',
      /** 留空则由 OpenClawService 通过 CLI / 环境变量自动解析 */
      openclawStateDir: undefined,
      accessMode: 'local-only',
      dataDir: path.join(realCwd, 'data'),
      /** OpenClaw 日志路径，需用户配置（OpenClaw 输出到该文件） */
      openclawLogPath: undefined,
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
      openclawGatewayUrl: process.env.OPENCLAW_GATEWAY_URL || undefined,
      openclawGatewayToken: process.env.OPENCLAW_GATEWAY_TOKEN || undefined,
      openclawGatewayPassword: process.env.OPENCLAW_GATEWAY_PASSWORD || undefined,
      openclawStateDir: process.env.OPENCLAW_STATE_DIR || undefined,
      openclawWorkspaceDir: process.env.OPENCLAW_WORKSPACE_DIR || undefined,
      accessToken: process.env.OPENCLAW_RUNTIME_ACCESS_TOKEN || undefined,
      accessMode: process.env.OPENCLAW_ACCESS_MODE as Config['accessMode'] || undefined,
      dataDir: process.env.DATA_DIR || undefined,
      openclawLogPath: process.env.OPENCLAW_LOG_PATH || undefined,
    };

    // 4. 合并配置
    const merged = {
      ...defaultConfig,
      ...fileConfig,
      ...Object.fromEntries(Object.entries(envConfig).filter(([_, v]) => v !== undefined)),
    } as Config;

    // 5. 确保数据目录存在（dataDir 由 cwd + 配置文件 + DATA_DIR 等合并决定，不写死）
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
      openclawGatewayToken: config.openclawGatewayToken ? '[REDACTED]' : undefined,
      openclawGatewayPassword: config.openclawGatewayPassword ? '[REDACTED]' : undefined,
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
}
