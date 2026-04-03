import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import type {
  OnboardingConfig,
  BootstrapOverrides,
  UserPreferences,
  ConfigBackup,
} from './types';

/**
 * OnBoarding 配置存储服务
 *
 * 负责：
 * 1. 配置文件的读写（~/.openclawTraceFlow）
 * 2. 敏感信息加密/解密
 * 3. 配置自动备份与恢复
 * 4. 日志记录
 *
 * 对应 PRD §3.1.1 & §7.5
 */
@Injectable()
export class OnboardingStorageService {
  private readonly logger = new Logger(OnboardingStorageService.name);
  private encryptionKey: Buffer;

  // 目录路径常量
  private readonly TRACEFLOW_HOME: string;
  private readonly CONFIG_DIR: string;
  private readonly CACHE_DIR: string;
  private readonly LOGS_DIR: string;
  private readonly BACKUPS_DIR: string;
  private readonly ENCRYPTION_KEY_PATH: string;

  // 配置文件路径
  private readonly ONBOARDING_CONFIG_PATH: string;
  private readonly BOOTSTRAP_OVERRIDES_PATH: string;
  private readonly PREFERENCES_PATH: string;

  // 常量
  private static readonly MAX_BACKUPS = 10;
  private static readonly ENCRYPTION_ALGORITHM = 'aes-256-cbc';
  private static readonly CONFIG_VERSION = '1.0.0';

  constructor() {
    this.TRACEFLOW_HOME = path.join(os.homedir(), '.openclawTraceFlow');
    this.CONFIG_DIR = path.join(this.TRACEFLOW_HOME, 'config');
    this.CACHE_DIR = path.join(this.TRACEFLOW_HOME, 'cache');
    this.LOGS_DIR = path.join(this.TRACEFLOW_HOME, 'logs');
    this.BACKUPS_DIR = path.join(this.TRACEFLOW_HOME, 'backups');
    this.ENCRYPTION_KEY_PATH = path.join(this.TRACEFLOW_HOME, '.encryption.key');

    this.ONBOARDING_CONFIG_PATH = path.join(this.CONFIG_DIR, 'onboarding.json');
    this.BOOTSTRAP_OVERRIDES_PATH = path.join(this.CONFIG_DIR, 'bootstrap-overrides.json');
    this.PREFERENCES_PATH = path.join(this.CONFIG_DIR, 'preferences.json');

    this.ensureDirectories();
    this.encryptionKey = this.getOrCreateEncryptionKey();
  }

  /**
   * 确保所有必要的目录存在
   */
  private ensureDirectories(): void {
    const dirs = [
      this.TRACEFLOW_HOME,
      this.CONFIG_DIR,
      this.CACHE_DIR,
      this.LOGS_DIR,
      this.BACKUPS_DIR,
    ];

    for (const dir of dirs) {
      if (!fsSync.existsSync(dir)) {
        try {
          fsSync.mkdirSync(dir, { recursive: true, mode: 0o700 });
          this.logger.log(`Created directory: ${dir}`);
        } catch (error) {
          this.logger.error(`Failed to create directory ${dir}: ${error}`);
        }
      }
    }
  }

  /**
   * 获取或创建加密密钥
   */
  private getOrCreateEncryptionKey(): Buffer {
    if (fsSync.existsSync(this.ENCRYPTION_KEY_PATH)) {
      try {
        return fsSync.readFileSync(this.ENCRYPTION_KEY_PATH);
      } catch (error) {
        this.logger.error(`Failed to read encryption key: ${error}`);
        throw new Error('Encryption key corrupted. Please restore from backup or re-run onboarding.');
      }
    }

    // 生成新密钥
    const key = crypto.randomBytes(32); // 256 bits
    try {
      fsSync.writeFileSync(this.ENCRYPTION_KEY_PATH, key, { mode: 0o600 });
      this.logger.log('Generated new encryption key');
      return key;
    } catch (error) {
      this.logger.error(`Failed to save encryption key: ${error}`);
      throw new Error('Failed to create encryption key');
    }
  }

  /**
   * 加密字符串
   * 格式: {iv_hex}:{encrypted_hex}
   */
  private encrypt(text: string): string {
    if (!text) return '';

    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(
        OnboardingStorageService.ENCRYPTION_ALGORITHM,
        this.encryptionKey,
        iv,
      );
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      return `${iv.toString('hex')}:${encrypted}`;
    } catch (error) {
      this.logger.error(`Encryption failed: ${error}`);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * 解密字符串
   */
  private decrypt(encrypted: string): string {
    if (!encrypted) return '';

    try {
      const parts = encrypted.split(':');
      if (parts.length !== 2) {
        throw new Error('Invalid encrypted format');
      }

      const [ivHex, encryptedText] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const decipher = crypto.createDecipheriv(
        OnboardingStorageService.ENCRYPTION_ALGORITHM,
        this.encryptionKey,
        iv,
      );
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      this.logger.error(`Decryption failed: ${error}`);
      throw new Error('Failed to decrypt data. The encryption key may be corrupted.');
    }
  }

  /**
   * 加密配置中的敏感字段
   */
  private encryptSensitiveFields(config: OnboardingConfig): OnboardingConfig {
    const result = { ...config };

    // 加密 gateway token 和 password
    if (result.gateway?.token) {
      result.gateway.token = this.encrypt(result.gateway.token);
    }
    if (result.gateway?.password) {
      result.gateway.password = this.encrypt(result.gateway.password);
    }

    // 加密 traceflow accessToken
    if (result.traceflow?.accessToken) {
      result.traceflow.accessToken = this.encrypt(result.traceflow.accessToken);
    }

    return result;
  }

  /**
   * 解密配置中的敏感字段
   */
  private decryptSensitiveFields(config: OnboardingConfig): OnboardingConfig {
    const result = { ...config };

    // 解密 gateway token 和 password
    if (result.gateway?.token) {
      try {
        result.gateway.token = this.decrypt(result.gateway.token);
      } catch (error) {
        this.logger.warn('Failed to decrypt gateway token');
        result.gateway.token = undefined;
      }
    }
    if (result.gateway?.password) {
      try {
        result.gateway.password = this.decrypt(result.gateway.password);
      } catch (error) {
        this.logger.warn('Failed to decrypt gateway password');
        result.gateway.password = undefined;
      }
    }

    // 解密 traceflow accessToken
    if (result.traceflow?.accessToken) {
      try {
        result.traceflow.accessToken = this.decrypt(result.traceflow.accessToken);
      } catch (error) {
        this.logger.warn('Failed to decrypt traceflow accessToken');
        result.traceflow.accessToken = undefined;
      }
    }

    return result;
  }

  /**
   * 保存 onboarding 配置
   */
  async saveOnboardingConfig(config: OnboardingConfig): Promise<void> {
    try {
      // 备份现有配置
      if (fsSync.existsSync(this.ONBOARDING_CONFIG_PATH)) {
        await this.backupConfig('onboarding.json');
      }

      // 加密敏感信息
      const configToSave = this.encryptSensitiveFields(config);

      // 写入文件（权限 0o600）
      await fs.writeFile(
        this.ONBOARDING_CONFIG_PATH,
        JSON.stringify(configToSave, null, 2),
        { mode: 0o600 },
      );

      this.logger.log(`Saved onboarding config to ${this.ONBOARDING_CONFIG_PATH}`);
    } catch (error) {
      this.logger.error(`Failed to save onboarding config: ${error}`);
      throw new Error('Failed to save configuration');
    }
  }

  /**
   * 加载 onboarding 配置
   */
  async loadOnboardingConfig(): Promise<OnboardingConfig | null> {
    if (!fsSync.existsSync(this.ONBOARDING_CONFIG_PATH)) {
      return null;
    }

    try {
      const content = await fs.readFile(this.ONBOARDING_CONFIG_PATH, 'utf-8');
      const config = JSON.parse(content) as OnboardingConfig;

      // 解密敏感信息
      return this.decryptSensitiveFields(config);
    } catch (error) {
      this.logger.error(`Failed to load onboarding config: ${error}`);

      // 尝试从备份恢复
      this.logger.log('Attempting to restore from backup...');
      const restored = await this.restoreFromLatestBackup('onboarding.json');
      if (restored) {
        this.logger.log('Successfully restored from backup');
        return this.loadOnboardingConfig();
      }

      return null;
    }
  }

  /**
   * 保存 bootstrap 覆盖配置
   */
  async saveBootstrapOverrides(overrides: BootstrapOverrides): Promise<void> {
    try {
      await fs.writeFile(
        this.BOOTSTRAP_OVERRIDES_PATH,
        JSON.stringify(overrides, null, 2),
        { mode: 0o600 },
      );
      this.logger.log('Saved bootstrap overrides');
    } catch (error) {
      this.logger.error(`Failed to save bootstrap overrides: ${error}`);
      throw error;
    }
  }

  /**
   * 加载 bootstrap 覆盖配置
   */
  async loadBootstrapOverrides(): Promise<BootstrapOverrides | null> {
    if (!fsSync.existsSync(this.BOOTSTRAP_OVERRIDES_PATH)) {
      return null;
    }

    try {
      const content = await fs.readFile(this.BOOTSTRAP_OVERRIDES_PATH, 'utf-8');
      return JSON.parse(content) as BootstrapOverrides;
    } catch (error) {
      this.logger.error(`Failed to load bootstrap overrides: ${error}`);
      return null;
    }
  }

  /**
   * 保存用户偏好
   */
  async savePreferences(preferences: UserPreferences): Promise<void> {
    try {
      await fs.writeFile(
        this.PREFERENCES_PATH,
        JSON.stringify(preferences, null, 2),
      );
      this.logger.log('Saved user preferences');
    } catch (error) {
      this.logger.error(`Failed to save preferences: ${error}`);
      throw error;
    }
  }

  /**
   * 加载用户偏好
   */
  async loadPreferences(): Promise<UserPreferences | null> {
    if (!fsSync.existsSync(this.PREFERENCES_PATH)) {
      return null;
    }

    try {
      const content = await fs.readFile(this.PREFERENCES_PATH, 'utf-8');
      return JSON.parse(content) as UserPreferences;
    } catch (error) {
      this.logger.error(`Failed to load preferences: ${error}`);
      return null;
    }
  }

  /**
   * 备份配置文件
   */
  private async backupConfig(filename: string): Promise<void> {
    const sourcePath = path.join(this.CONFIG_DIR, filename);
    if (!fsSync.existsSync(sourcePath)) {
      return;
    }

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFilename = `${filename}.backup.${timestamp}`;
      const backupPath = path.join(this.BACKUPS_DIR, backupFilename);

      await fs.copyFile(sourcePath, backupPath);
      this.logger.log(`Backed up ${filename} to ${backupFilename}`);

      // 清理旧备份
      await this.cleanupOldBackups(filename);
    } catch (error) {
      this.logger.error(`Failed to backup ${filename}: ${error}`);
    }
  }

  /**
   * 清理旧备份（保留最近 N 个）
   */
  private async cleanupOldBackups(filename: string): Promise<void> {
    try {
      const files = await fs.readdir(this.BACKUPS_DIR);
      const backups = files
        .filter((f) => f.startsWith(`${filename}.backup.`))
        .sort()
        .reverse();

      // 删除超过限制的备份
      for (let i = OnboardingStorageService.MAX_BACKUPS; i < backups.length; i++) {
        const backupPath = path.join(this.BACKUPS_DIR, backups[i]);
        await fs.unlink(backupPath);
        this.logger.log(`Deleted old backup: ${backups[i]}`);
      }
    } catch (error) {
      this.logger.error(`Failed to cleanup old backups: ${error}`);
    }
  }

  /**
   * 列出可用的配置备份
   */
  async listBackups(filename: string = 'onboarding.json'): Promise<ConfigBackup[]> {
    try {
      const files = await fs.readdir(this.BACKUPS_DIR);
      const backups = files
        .filter((f) => f.startsWith(`${filename}.backup.`))
        .sort()
        .reverse();

      const result: ConfigBackup[] = [];
      for (const backup of backups) {
        const backupPath = path.join(this.BACKUPS_DIR, backup);
        const stats = await fs.stat(backupPath);
        const timestampStr = backup.replace(`${filename}.backup.`, '');

        result.push({
          filename: backup,
          timestamp: timestampStr,
          size: stats.size,
        });
      }

      return result;
    } catch (error) {
      this.logger.error(`Failed to list backups: ${error}`);
      return [];
    }
  }

  /**
   * 从备份恢复配置
   */
  async restoreFromBackup(backupFilename: string): Promise<boolean> {
    const backupPath = path.join(this.BACKUPS_DIR, backupFilename);
    if (!fsSync.existsSync(backupPath)) {
      this.logger.error(`Backup file not found: ${backupFilename}`);
      return false;
    }

    try {
      // 确定目标文件
      let targetFilename = backupFilename;
      if (backupFilename.includes('.backup.')) {
        targetFilename = backupFilename.split('.backup.')[0];
      }
      const targetPath = path.join(this.CONFIG_DIR, targetFilename);

      // 备份当前文件（如果存在）
      if (fsSync.existsSync(targetPath)) {
        await this.backupConfig(targetFilename);
      }

      // 恢复备份
      await fs.copyFile(backupPath, targetPath);
      this.logger.log(`Restored ${targetFilename} from ${backupFilename}`);

      return true;
    } catch (error) {
      this.logger.error(`Failed to restore from backup: ${error}`);
      return false;
    }
  }

  /**
   * 从最新备份恢复
   */
  private async restoreFromLatestBackup(filename: string): Promise<boolean> {
    const backups = await this.listBackups(filename);
    if (backups.length === 0) {
      return false;
    }

    return this.restoreFromBackup(backups[0].filename);
  }

  /**
   * 记录 onboarding 日志
   */
  async logOnboardingEvent(
    event: string,
    data?: Record<string, any>,
  ): Promise<void> {
    const logPath = path.join(this.LOGS_DIR, 'onboarding.log');
    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
      data,
    };

    try {
      await fs.appendFile(logPath, JSON.stringify(logEntry) + '\n');
    } catch (error) {
      this.logger.error(`Failed to write log: ${error}`);
    }
  }

  /**
   * 获取 TraceFlow 主目录路径
   */
  getTraceFlowHome(): string {
    return this.TRACEFLOW_HOME;
  }

  /**
   * 检查是否已完成 onboarding
   */
  async hasCompletedOnboarding(): Promise<boolean> {
    const config = await this.loadOnboardingConfig();
    return config !== null && !!config.completedAt;
  }

  /**
   * 检查目录是否可写
   */
  isWritable(): boolean {
    try {
      fsSync.accessSync(this.TRACEFLOW_HOME, fsSync.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 导出配置（用于备份/迁移）
   */
  async exportConfig(): Promise<{
    onboarding: OnboardingConfig | null;
    bootstrapOverrides: BootstrapOverrides | null;
    preferences: UserPreferences | null;
  }> {
    return {
      onboarding: await this.loadOnboardingConfig(),
      bootstrapOverrides: await this.loadBootstrapOverrides(),
      preferences: await this.loadPreferences(),
    };
  }

  /**
   * 导入配置
   */
  async importConfig(config: {
    onboarding?: OnboardingConfig;
    bootstrapOverrides?: BootstrapOverrides;
    preferences?: UserPreferences;
  }): Promise<void> {
    if (config.onboarding) {
      await this.saveOnboardingConfig(config.onboarding);
    }
    if (config.bootstrapOverrides) {
      await this.saveBootstrapOverrides(config.bootstrapOverrides);
    }
    if (config.preferences) {
      await this.savePreferences(config.preferences);
    }
  }
}
