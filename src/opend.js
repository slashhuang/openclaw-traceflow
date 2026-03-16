/**
 * OpenD 启动逻辑核心模块
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class OpenDManager {
  constructor(config) {
    this.config = config;
    this.opendDir = null;
    this.childProcess = null;
  }

  /**
   * 查找 OpenD 安装目录
   */
  findOpenDDirectory() {
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
        console.log(`[opend] 找到 OpenD 目录：${dir}`);
        this.opendDir = dir;
        return dir;
      }
    }

    return null;
  }

  /**
   * 生成 OpenD 配置文件
   */
  generateConfigFile() {
    if (!this.opendDir) {
      throw new Error('未找到 OpenD 目录');
    }

    const configPath = path.join(this.opendDir, 'FutuOpenD.xml');

    // 如果配置文件已存在，可以选择更新或保留
    if (fs.existsSync(configPath)) {
      console.log(`[opend] 配置文件已存在：${configPath}`);
      // 可以选择是否覆盖，这里选择保留原有配置
      return configPath;
    }

    // 生成新的配置文件
    const xmlContent = this.generateXmlConfig();
    fs.writeFileSync(configPath, xmlContent, 'utf-8');
    console.log(`[opend] 已生成配置文件：${configPath}`);

    return configPath;
  }

  /**
   * 生成 XML 配置内容
   */
  generateXmlConfig() {
    const { futu } = this.config;

    let authSection = '';

    if (futu.authcode) {
      // 使用 authcode 免密登录
      authSection = `    <authcode>${futu.authcode}</authcode>`;
    } else if (futu.password) {
      // 使用密码登录
      authSection = `    <auth>${this.md5(futu.password)}</auth>
    <imppwd>${futu.password}</imppwd>`;
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<config>
    <!-- 监听端口 -->
    <listen_port>${futu.listenPort}</listen_port>
    <websocket_port>${futu.websocketPort}</websocket_port>

    <!-- 模式：1=模拟，2=实盘 -->
    <is_mod>${futu.isMod}</is_mod>

    <!-- 富途服务器 -->
    <server>${futu.server}</server>

    <!-- 登录凭证 -->
    <phonecode>86</phonecode>
    <accno>${futu.accno}</accno>
${authSection}
</config>`;
  }

  /**
   * 简单的 MD5 实现（用于密码加密）
   * 注意：这只是一个简单实现，生产环境建议使用 crypto 模块
   */
  md5(str) {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(str).digest('hex');
  }

  /**
   * 启动 OpenD
   */
  start(consoleOutput = false) {
    return new Promise((resolve, reject) => {
      if (!this.opendDir) {
        reject(new Error('未找到 OpenD 目录，请先安装 OpenD'));
        return;
      }

      const executable = path.join(this.opendDir, 'FutuOpenD');
      const configFile = path.join(this.opendDir, 'FutuOpenD.xml');

      // 检查文件是否存在
      if (!fs.existsSync(executable)) {
        reject(new Error(`可执行文件不存在：${executable}`));
        return;
      }

      if (!fs.existsSync(configFile)) {
        console.log('[opend] 配置文件不存在，尝试生成...');
        try {
          this.generateConfigFile();
        } catch (err) {
          reject(new Error(`生成配置文件失败：${err.message}`));
          return;
        }
      }

      // 启动参数
      const args = [
        `-cfg_file=${configFile}`,
        `-console=${consoleOutput ? '1' : '0'}`
      ];

      console.log(`[opend] 启动命令：${executable} ${args.join(' ')}`);

      //  spawn 子进程
      this.childProcess = spawn(executable, args, {
        cwd: this.opendDir,
        stdio: consoleOutput ? 'inherit' : ['ignore', 'pipe', 'pipe'],
        detached: false
      });

      this.childProcess.on('error', (err) => {
        console.error('[opend] 启动错误:', err);
        reject(err);
      });

      this.childProcess.on('exit', (code, signal) => {
        console.log(`[opend] 进程退出：code=${code}, signal=${signal}`);
      });

      // 如果不是控制台模式，监听输出
      if (!consoleOutput && this.childProcess.stdout) {
        this.childProcess.stdout.on('data', (data) => {
          console.log(`[opend] ${data.toString().trim()}`);
        });

        this.childProcess.stderr.on('data', (data) => {
          console.error(`[opend] ${data.toString().trim()}`);
        });
      }

      // 等待进程启动
      setTimeout(() => {
        if (this.childProcess && !this.childProcess.killed) {
          console.log(`[opend] OpenD 已启动 (PID: ${this.childProcess.pid})`);
          resolve(this.childProcess.pid);
        } else {
          reject(new Error('OpenD 启动失败'));
        }
      }, 2000);
    });
  }

  /**
   * 停止 OpenD
   */
  stop() {
    if (this.childProcess) {
      console.log('[opend] 停止 OpenD...');
      this.childProcess.kill('SIGTERM');
      this.childProcess = null;
    }
  }

  /**
   * 获取进程状态
   */
  isRunning() {
    if (!this.childProcess) {
      return false;
    }

    try {
      process.kill(this.childProcess.pid, 0);
      return true;
    } catch (err) {
      return false;
    }
  }
}

module.exports = OpenDManager;
