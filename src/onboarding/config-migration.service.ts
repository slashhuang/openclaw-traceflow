import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { OnboardingStorageService } from './onboarding-storage.service';
import type { Config } from '../config/config.service';
import type { OnboardingConfig } from './types';

/**
 * 配置迁移服务
 *
 * 负责：
 * 1. 从旧配置文件迁移到新存储位置
 * 2. 配置版本升级
 * 3. 配置格式转换
 *
 * 对应 PRD §7.5.6
 */
@Injectable()
export class ConfigMigrationService {
  private readonly logger = new Logger(ConfigMigrationService.name);

  constructor(
    private readonly onboardingStorage: OnboardingStorageService,
  ) {}

  /**
   * 从旧的 config/openclaw.runtime.json 迁移到 ~/.openclawTraceFlow
   */
  async migrateFromLegacyConfig(legacyConfigPath: string): Promise<boolean> {
    if (!fsSync.existsSync(legacyConfigPath)) {
      this.logger.warn(`Legacy config file not found: ${legacyConfigPath}`);
      return false;
    }

    try {
      // 读取旧配置
      const content = await fs.readFile(legacyConfigPath, 'utf-8');
      const legacyConfig = JSON.parse(content) as Config;

      this.logger.log('Read legacy config, converting to new format...');

      // 转换为新格式
      const onboardingConfig = this.convertLegacyConfig(legacyConfig);

      // 保存到新位置
      await this.onboardingStorage.saveOnboardingConfig(onboardingConfig);

      // 备份旧配置文件
      await this.backupLegacyConfig(legacyConfigPath);

      // 记录迁移日志
      await this.onboardingStorage.logOnboardingEvent('config_migrated', {
        from: legacyConfigPath,
        to: this.onboardingStorage.getTraceFlowHome(),
        version: onboardingConfig.version,
      });

      this.logger.log('Successfully migrated config to new location');
      return true;
    } catch (error) {
      this.logger.error(`Failed to migrate config: ${error}`);
      return false;
    }
  }

  /**
   * 将旧配置转换为新的 OnboardingConfig 格式
   */
  private convertLegacyConfig(legacyConfig: Config): OnboardingConfig {
    return {
      version: '1.0.0',
      completedAt: new Date().toISOString(),
      openclaw: {
        stateDir: legacyConfig.openclawStateDir || '',
        workspaceDir: legacyConfig.openclawWorkspaceDir || '',
        configPath: legacyConfig.openclawConfigPath,
        pathSources: {
          stateDir: legacyConfig.openclawStateDir ? 'explicit' : 'fallback',
          workspaceDir: legacyConfig.openclawWorkspaceDir ? 'explicit' : 'none',
          configPath: legacyConfig.openclawConfigPath ? 'explicit' : 'none',
        },
      },
      gateway: {
        enabled: !!legacyConfig.openclawGatewayUrl,
        url: legacyConfig.openclawGatewayUrl,
        token: legacyConfig.openclawGatewayToken,
        password: legacyConfig.openclawGatewayPassword,
        connectionStatus: 'disconnected',
      },
      traceflow: {
        host: legacyConfig.host,
        port: legacyConfig.port,
        accessMode: legacyConfig.accessMode,
        accessToken: legacyConfig.accessToken,
        dataDir: legacyConfig.dataDir,
      },
      onboardingSteps: {
        pathConfiguration: !!(legacyConfig.openclawStateDir || legacyConfig.openclawWorkspaceDir),
        gatewaySetup: !!legacyConfig.openclawGatewayUrl,
        accessConfiguration: !!legacyConfig.accessMode,
      },
    };
  }

  /**
   * 备份旧配置文件
   */
  private async backupLegacyConfig(legacyConfigPath: string): Promise<void> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = `${legacyConfigPath}.migrated.${timestamp}`;
      await fs.copyFile(legacyConfigPath, backupPath);
      this.logger.log(`Backed up legacy config to ${backupPath}`);
    } catch (error) {
      this.logger.error(`Failed to backup legacy config: ${error}`);
    }
  }

  /**
   * 升级配置版本
   */
  async upgradeConfigVersion(
    from: string,
    to: string,
  ): Promise<boolean> {
    try {
      const config = await this.onboardingStorage.loadOnboardingConfig();
      if (!config) {
        this.logger.warn('No config found to upgrade');
        return false;
      }

      if (config.version === to) {
        this.logger.log(`Config already at version ${to}`);
        return true;
      }

      this.logger.log(`Upgrading config from ${from} to ${to}...`);

      // 执行版本升级逻辑
      const upgraded = this.performVersionUpgrade(config, from, to);

      // 保存升级后的配置
      await this.onboardingStorage.saveOnboardingConfig(upgraded);

      // 记录升级日志
      await this.onboardingStorage.logOnboardingEvent('config_upgraded', {
        from,
        to,
      });

      this.logger.log(`Successfully upgraded config to version ${to}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to upgrade config: ${error}`);
      return false;
    }
  }

  /**
   * 执行版本升级（可扩展以支持多个版本）
   */
  private performVersionUpgrade(
    config: OnboardingConfig,
    from: string,
    to: string,
  ): OnboardingConfig {
    const upgraded = { ...config };

    // 根据版本执行不同的升级逻辑
    // 示例: 从 1.0.0 升级到 1.1.0
    if (from === '1.0.0' && to === '1.1.0') {
      // 添加新字段或修改结构
      // upgraded.newField = defaultValue;
    }

    upgraded.version = to;
    return upgraded;
  }

  /**
   * 验证配置完整性
   */
  async validateConfig(): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];

    try {
      const config = await this.onboardingStorage.loadOnboardingConfig();
      if (!config) {
        errors.push('Configuration file not found');
        return { valid: false, errors };
      }

      // 验证必填字段
      if (!config.openclaw?.stateDir) {
        errors.push('Missing required field: openclaw.stateDir');
      }
      if (!config.openclaw?.workspaceDir) {
        errors.push('Missing required field: openclaw.workspaceDir');
      }
      if (!config.traceflow?.host) {
        errors.push('Missing required field: traceflow.host');
      }
      if (!config.traceflow?.port) {
        errors.push('Missing required field: traceflow.port');
      }

      // 验证版本
      if (!config.version) {
        errors.push('Missing configuration version');
      }

      // 验证路径存在性（可选，仅警告）
      if (config.openclaw.stateDir && !fsSync.existsSync(this.expandPath(config.openclaw.stateDir))) {
        this.logger.warn(`State directory does not exist: ${config.openclaw.stateDir}`);
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    } catch (error) {
      errors.push(`Validation error: ${error}`);
      return { valid: false, errors };
    }
  }

  /**
   * 展开路径中的 ~
   */
  private expandPath(pathStr: string): string {
    if (pathStr.startsWith('~/') || pathStr === '~') {
      return path.join(
        require('os').homedir(),
        pathStr.slice(1).replace(/^\//, ''),
      );
    }
    return path.resolve(pathStr);
  }

  /**
   * 重置配置到默认状态
   */
  async resetToDefault(): Promise<boolean> {
    try {
      // 备份当前配置
      const current = await this.onboardingStorage.loadOnboardingConfig();
      if (current) {
        await this.onboardingStorage.logOnboardingEvent('config_reset', {
          previousVersion: current.version,
        });
      }

      // 创建默认配置
      const defaultConfig: OnboardingConfig = {
        version: '1.0.0',
        completedAt: new Date().toISOString(),
        openclaw: {
          stateDir: path.join(require('os').homedir(), '.openclaw'),
          workspaceDir: path.join(require('os').homedir(), '.openclaw', 'workspace'),
          pathSources: {
            stateDir: 'fallback',
            workspaceDir: 'fallback',
            configPath: 'none',
          },
        },
        gateway: {
          enabled: false,
          url: 'http://localhost:18789',
          connectionStatus: 'disconnected',
        },
        traceflow: {
          host: '0.0.0.0',
          port: 3001,
          accessMode: 'none',
          dataDir: './data',
        },
        onboardingSteps: {
          pathConfiguration: false,
          gatewaySetup: false,
          accessConfiguration: false,
        },
      };

      await this.onboardingStorage.saveOnboardingConfig(defaultConfig);
      this.logger.log('Reset configuration to default');
      return true;
    } catch (error) {
      this.logger.error(`Failed to reset config: ${error}`);
      return false;
    }
  }

  /**
   * 自动检测并迁移（如果需要）
   */
  async autoMigrateIfNeeded(legacyConfigPath: string): Promise<boolean> {
    // 检查是否已有新配置
    const hasNewConfig = await this.onboardingStorage.hasCompletedOnboarding();
    if (hasNewConfig) {
      this.logger.log('New config already exists, skipping migration');
      return false;
    }

    // 检查是否有旧配置需要迁移
    if (!fsSync.existsSync(legacyConfigPath)) {
      this.logger.log('No legacy config found, nothing to migrate');
      return false;
    }

    this.logger.log('Detected legacy config, starting auto-migration...');
    return this.migrateFromLegacyConfig(legacyConfigPath);
  }
}
