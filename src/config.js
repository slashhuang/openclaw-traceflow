/**
 * 配置加载模块
 * 支持 config.json 和 .env 两种配置方式
 * 优先级：环境变量 > config.json > 默认值
 */

const fs = require('fs');
const path = require('path');

// 尝试加载 .env 文件
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const dotenv = require('dotenv');
    dotenv.config({ path: envPath });
    console.log('[config] 已加载 .env 文件');
  }
}

// 尝试加载 config.json 文件
function loadConfigJson() {
  const configPath = path.join(__dirname, '..', 'config.json');
  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(content);
  }
  return null;
}

// 获取环境变量或默认值
function getEnv(key, defaultValue) {
  const value = process.env[key];
  if (value !== undefined) {
    // 尝试转换为数字
    const num = Number(value);
    if (!isNaN(num)) {
      return num;
    }
    return value;
  }
  return defaultValue;
}

// 加载配置
function loadConfig() {
  // 加载 .env
  loadEnv();

  // 加载 config.json
  const configJson = loadConfigJson();

  // 合并配置：环境变量 > config.json > 默认值
  const config = {
    futu: {
      accno: getEnv('FUTU_ACCNO', configJson?.futu?.accno || ''),
      password: getEnv('FUTU_PASSWORD', configJson?.futu?.password || ''),
      authcode: getEnv('FUTU_AUTHCODE', configJson?.futu?.authcode || ''),
      listenPort: getEnv('FUTU_LISTEN_PORT', configJson?.futu?.listenPort || 11113),
      websocketPort: getEnv('FUTU_WEBSOCKET_PORT', configJson?.futu?.websocketPort || 33333),
      isMod: getEnv('FUTU_IS_MOD', configJson?.futu?.isMod || 1),
      server: getEnv('FUTU_SERVER', configJson?.futu?.server || 'nz-futu-1.futunn.com:9292'),
    }
  };

  return config;
}

module.exports = {
  loadConfig,
  getEnv
};
