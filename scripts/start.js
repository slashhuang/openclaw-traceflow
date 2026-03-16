#!/usr/bin/env node
/**
 * Futu OpenD 启动脚本
 * 支持前台/后台模式，支持验证码输入
 */

const path = require('path');
const { loadConfig } = require('../src/config');
const { validateConfig } = require('../src/validator');
const OpenDManager = require('../src/opend');

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  return {
    background: args.includes('--background') || args.includes('-b'),
    help: args.includes('--help') || args.includes('-h'),
  };
}

function printHelp() {
  console.log(`
Futu OpenD 启动工具

用法:
  npm run futu              # 前台启动（支持验证码）
  npm run futu:bg           # 后台启动（免密登录时）
  node scripts/start.js     # 前台启动
  node scripts/start.js -b  # 后台启动

选项:
  -b, --background    后台模式
  -h, --help          显示帮助

配置方式:
  1. config.json - 在项目根目录创建 config.json 文件
  2. .env - 在项目根目录创建 .env 文件
  3. 环境变量 - 使用 FUTU_* 前缀的环境变量

配置项:
  futu.accno          富途账号
  futu.password       登录密码（或使用 authcode）
  futu.authcode       免密登录 authcode
  futu.listenPort     API 监听端口（默认：11113）
  futu.websocketPort  WebSocket 端口（默认：33333）
  futu.isMod          模式：1=模拟，2=实盘（默认：1）
  futu.server         富途服务器（默认：nz-futu-1.futunn.com:9292）
`);
}

// 检查操作系统
function checkOS() {
  const platform = process.platform;
  if (platform !== 'linux') {
    console.log(`[start] 警告：当前系统为 ${platform}，Futu OpenD 仅支持 Linux`);
    console.log('[start] Mac 用户请使用富途官方 Mac OpenD 应用');

    // Mac 用户提示
    if (platform === 'darwin') {
      console.log(`
Mac 用户启动 OpenD 方式：
1. 打开 富途牛牛 Mac 版
2. 进入 设置 -> OpenD 设置
3. 设置端口：API 端口 11113，WebSocket 端口 33333
4. 启动 OpenD
`);
    }

    return false;
  }
  return true;
}

// 查找 OpenD 安装目录
function findOpenDDirectory() {
  const fs = require('fs');

  // 可能的目录列表（按优先级）
  const possibleDirs = [
    path.join(__dirname, '..', 'Futu_OpenD_Centos7'),  // 推荐
    path.join(__dirname, '..', 'Futu_OpenD'),
    path.join(__dirname, '..', 'Futu_OpenD_Linux'),
    path.join(__dirname, '..', 'opend'),
    path.join(process.env.HOME || '', 'Futu_OpenD'),
    '/opt/Futu_OpenD',
    '/usr/local/Futu_OpenD',
  ];

  for (const dir of possibleDirs) {
    const executable = path.join(dir, 'FutuOpenD');
    const configFile = path.join(dir, 'FutuOpenD.xml');

    if (fs.existsSync(executable) && fs.existsSync(configFile)) {
      return dir;
    }
  }

  return null;
}

// 生成配置文件
function generateConfigFile(config, opendDir) {
  const fs = require('fs');
  const configPath = path.join(opendDir, 'FutuOpenD.xml');

  if (fs.existsSync(configPath)) {
    console.log(`[start] 配置文件已存在：${configPath}`);
    return configPath;
  }

  const crypto = require('crypto');
  const md5 = (str) => crypto.createHash('md5').update(str).digest('hex');

  let authSection = '';
  if (config.futu.authcode) {
    authSection = `    <authcode>${config.futu.authcode}</authcode>`;
  } else if (config.futu.password) {
    authSection = `    <auth>${md5(config.futu.password)}</auth>
    <imppwd>${config.futu.password}</imppwd>`;
  }

  const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<config>
    <!-- 监听端口 -->
    <listen_port>${config.futu.listenPort}</listen_port>
    <websocket_port>${config.futu.websocketPort}</websocket_port>

    <!-- 模式：1=模拟，2=实盘 -->
    <is_mod>${config.futu.isMod}</is_mod>

    <!-- 富途服务器 -->
    <server>${config.futu.server}</server>

    <!-- 登录凭证 -->
    <phonecode>86</phonecode>
    <accno>${config.futu.accno}</accno>
${authSection}
</config>`;

  fs.writeFileSync(configPath, xmlContent, 'utf-8');
  console.log(`[start] 已生成配置文件：${configPath}`);
  return configPath;
}

// 主函数
async function main() {
  const options = parseArgs();

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  console.log('[start] ====================================');
  console.log('[start] Futu OpenD 启动工具 v1.0.0');
  console.log('[start] ====================================');

  // 检查操作系统
  const isLinux = checkOS();
  if (!isLinux) {
    // 非 Linux 系统，仅提供信息，不退出
    console.log('[start] 程序退出');
    process.exit(0);
  }

  // 加载配置
  console.log('[start] 加载配置...');
  const config = loadConfig();

  // 验证配置
  const validation = validateConfig(config);
  if (!validation.valid) {
    console.error('[start] 配置验证失败:');
    validation.errors.forEach(err => console.error(`  - ${err}`));
    process.exit(1);
  }

  // 显示警告
  validation.warnings.forEach(warn => console.warn(`[start] 警告：${warn}`));

  // 显示配置
  console.log('[start] 配置信息:');
  console.log(`  - 账号：${config.futu.accno}`);
  console.log(`  - 端口：${config.futu.listenPort} (API), ${config.futu.websocketPort} (WebSocket)`);
  console.log(`  - 模式：${config.futu.isMod === 1 ? '模拟' : '实盘'}`);
  console.log(`  - 服务器：${config.futu.server}`);

  // 查找 OpenD 目录
  let opendDir = findOpenDDirectory();
  if (!opendDir) {
    console.error(`[start] 未找到 OpenD 安装目录`);
    console.error(`[start] 请先安装 OpenD，参考：https://openapi.futumm.com/futu-api-doc/opend/opend-download.html`);
    console.error(`[start] 或将 OpenD 放置到以下目录之一:`);
    console.error(`  - ${path.join(__dirname, '..', 'Futu_OpenD')}`);
    console.error(`  - ${path.join(__dirname, '..', 'Futu_OpenD_Linux')}`);
    console.error(`  - /opt/Futu_OpenD`);
    process.exit(1);
  }

  console.log(`[start] OpenD 目录：${opendDir}`);

  // 生成配置文件
  try {
    generateConfigFile(config, opendDir);
  } catch (err) {
    console.error(`[start] 生成配置文件失败：${err.message}`);
  }

  // 启动 OpenD
  const { spawn } = require('child_process');
  const executable = path.join(opendDir, 'FutuOpenD');
  const configFile = path.join(opendDir, 'FutuOpenD.xml');

  const args = [
    `-cfg_file=${configFile}`,
    `-console=1`  // 始终使用控制台输出，方便查看日志和验证码
  ];

  console.log(`[start] 启动 OpenD...`);
  if (options.background) {
    console.log(`[start] 模式：后台`);
  } else {
    console.log(`[start] 模式：前台（支持验证码输入）`);
  }

  const childProcess = spawn(executable, args, {
    cwd: opendDir,
    stdio: 'inherit',
    detached: options.background
  });

  childProcess.on('error', (err) => {
    console.error('[start] 启动错误:', err);
    process.exit(1);
  });

  childProcess.on('exit', (code, signal) => {
    console.log(`[start] OpenD 退出：code=${code}, signal=${signal}`);
    if (!options.background) {
      process.exit(code || 0);
    }
  });

  console.log(`[start] OpenD 已启动 (PID: ${childProcess.pid})`);

  // 如果是后台模式， detached 并退出
  if (options.background) {
    childProcess.unref();
    console.log('[start] 后台模式，主进程退出');
    // 不立即退出，让 PM2 等工具管理
  }
}

// 运行
main().catch(err => {
  console.error('[start] 错误:', err);
  process.exit(1);
});
