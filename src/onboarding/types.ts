/**
 * OnBoarding 配置类型定义
 * 对应 PRD §3.1.1
 */

/**
 * 路径来源类型
 */
export type PathSource =
  | 'explicit'
  | 'env'
  | 'inferred'
  | 'fallback'
  | 'config-file'
  | 'cli'
  | 'sessions-json'
  | 'none';

/**
 * 路径来源标记
 */
export interface PathSources {
  stateDir: PathSource;
  workspaceDir: PathSource;
  configPath: PathSource;
}

/**
 * OpenClaw 配置
 */
export interface OpenClawConfig {
  /** OpenClaw 状态目录（对应 OPENCLAW_STATE_DIR） */
  stateDir: string;
  /** 工作区目录（对应 agents.defaults.workspace） */
  workspaceDir: string;
  /** 主配置文件路径（对应 OPENCLAW_CONFIG_PATH，可选） */
  configPath?: string;
  /** 路径来源标记 */
  pathSources: PathSources;
  /** OpenClaw CLI 路径（可选） */
  cliBinary?: string;
  /** Profile 信息（如果使用 OPENCLAW_PROFILE） */
  profile?: string;
}

/**
 * 访问模式
 */
export type AccessMode = 'local-only' | 'token' | 'none';

/**
 * TraceFlow 配置
 */
export interface TraceFlowConfig {
  /** TraceFlow 服务 host */
  host: string;
  /** TraceFlow 服务 port */
  port: number;
  /** 访问模式 */
  accessMode: AccessMode;
  /** 访问令牌（加密存储） */
  accessToken?: string;
  /** 数据目录 */
  dataDir: string;
}

/**
 * OnBoarding 步骤完成状态
 */
export interface OnBoardingSteps {
  /** 路径配置完成 */
  pathConfiguration: boolean;
  /** 访问控制配置完成 */
  accessConfiguration: boolean;
}

/**
 * 用户信息（可选）
 */
export interface UserInfo {
  id?: string;
  name?: string;
  email?: string;
}

/**
 * OnBoarding 主配置
 */
export interface OnboardingConfig {
  /** 配置版本 */
  version: string;
  /** 完成时间（ISO 8601 timestamp） */
  completedAt: string;
  /** 用户信息（可选） */
  user?: UserInfo;
  /** OpenClaw 配置 */
  openclaw: OpenClawConfig;
  /** TraceFlow 配置 */
  traceflow: TraceFlowConfig;
  /** OnBoarding 步骤状态 */
  onboardingSteps: OnBoardingSteps;
}

/**
 * Bootstrap 文件覆盖配置
 */
export interface BootstrapOverrides {
  /** 逻辑文件名 → 绝对路径映射 */
  files: Record<string, string>;
  /** 更新时间 */
  updatedAt: string;
  /** 来源 */
  source: 'onboarding' | 'user-edit' | 'import';
}

/**
 * UI 偏好设置
 */
export interface UIPreferences {
  theme?: 'light' | 'dark' | 'auto';
  language?: 'zh-CN' | 'en-US';
  dashboardRefreshInterval?: number;
}

/**
 * 功能偏好设置
 */
export interface FeaturePreferences {
  enableWorkspaceWrite: boolean;
  tokenEstimateBytesDivisor: number;
}

/**
 * 路径偏好设置
 */
export interface PathPreferences {
  openclawLogPath?: string;
}

/**
 * 用户偏好设置
 */
export interface UserPreferences {
  ui: UIPreferences;
  features: FeaturePreferences;
  paths: PathPreferences;
}

/**
 * 配置备份信息
 */
export interface ConfigBackup {
  /** 备份文件名 */
  filename: string;
  /** 备份时间 */
  timestamp: string;
  /** 文件大小（字节） */
  size: number;
  /** 配置版本 */
  version?: string;
}
