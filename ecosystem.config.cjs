/**
 * PM2 配置：在仓库根目录执行 pm2 start ecosystem.config.cjs --env <env_name>
 *
 * 支持环境：
 * - local: 本地开发，使用本地配置
 * - dev: 开发环境
 * - production: 生产环境（默认）
 *
 * PM2 的 --env 参数会设置 NODE_ENV，本配置据此选择对应环境配置
 */

// 从 NODE_ENV 获取环境（PM2 的 --env 会设置这个）
const pm2Env = process.env.NODE_ENV || process.env.npm_lifecycle_event || 'production';

// 映射 PM2 env 到 OPENCLAW_ENV
const envMap = {
  local: 'local',
  dev: 'dev',
  development: 'dev',
  production: 'production',
  prod: 'production',
};

const openclawEnv = envMap[pm2Env] || 'production';

console.log(`[ecosystem.config.cjs] PM2 env: ${pm2Env}, OPENCLAW_ENV: ${openclawEnv}`);

// 使用系统 python3
const PYTHON3_PATH = 'python3';

// 不同环境的配置
const envConfigs = {
  local: {
    NODE_ENV: 'local',
    OPENCLAW_ENV: 'local',
    OPENCLAW_VERBOSE: '1',
  },
  dev: {
    NODE_ENV: 'development',
    OPENCLAW_ENV: 'dev',
    OPENCLAW_VERBOSE: '1',
  },
  production: {
    NODE_ENV: 'production',
    OPENCLAW_ENV: 'production',
    OPENCLAW_VERBOSE: '0',
  },
};

const envConfig = envConfigs[openclawEnv] || envConfigs.production;

// 为 PM2 的 --env 参数提供明确的环境定义
// PM2 会合并 base + env_xxx 到应用配置中
module.exports = {
  apps: [
    {
      name: 'claw-gateway',
      script: './scripts/start-openclaw.sh',
      cwd: __dirname,
      interpreter: 'bash',
      autorestart: true,
      max_restarts: 20,
      min_uptime: '10s',
      watch: false,
      ignore_watch: [
        'node_modules',
        'logs',
        'openClawRuntime',
        '__pycache__',
      ],
      max_memory_restart: '2G',
      restart_delay: 5000,
      // 基础环境变量（所有环境共享）
      env: {
        NODE_ENV: 'production',
        OPENCLAW_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=2048',
      },
      // 开发环境
      env_dev: envConfigs.dev,
      // 本地环境
      env_local: envConfigs.local,
      // 生产环境（显式定义）
      env_production: envConfigs.production,
    },
    {
      name: 'stock-assistant',
      script: './skills/stock-assistant/scripts/main.py',
      cwd: __dirname,
      interpreter: PYTHON3_PATH,
      args: './skills/stock-assistant/config/assistant_config.json',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '5s',
      watch: false,
      ignore_watch: [
        'node_modules',
        'logs',
        '__pycache__',
      ],
      env: {
        PYTHONIOENCODING: 'utf-8',
        NODE_ENV: 'production',
        OPENCLAW_ENV: 'production',
      },
      env_dev: {
        PYTHONIOENCODING: 'utf-8',
        ...envConfigs.dev,
      },
      env_local: {
        PYTHONIOENCODING: 'utf-8',
        ...envConfigs.local,
      },
      env_production: {
        PYTHONIOENCODING: 'utf-8',
        ...envConfigs.production,
      },
      max_memory_restart: '100M',
      restart_delay: 3000,
    },
  ],
};
