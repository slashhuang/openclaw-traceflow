#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// 检查是否已构建
const distPath = path.join(__dirname, '..', 'dist', 'main.js');

try {
  require.resolve(distPath);
} catch (error) {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║  OpenClaw Monitor - 首次启动                              ║
╠═══════════════════════════════════════════════════════════╣
║  需要先构建项目...                                        ║
╚═══════════════════════════════════════════════════════════╝
  `);

  const build = spawn('npx', ['tsc'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    shell: true,
  });

  build.on('close', (code) => {
    if (code === 0) {
      startServer();
    } else {
      console.error('构建失败，请手动运行：npm run build');
      process.exit(1);
    }
  });
}

function startServer() {
  const args = process.argv.slice(2);
  const nodeArgs = [distPath, ...args];

  const server = spawn('node', nodeArgs, {
    stdio: 'inherit',
    env: { ...process.env },
  });

  server.on('close', (code) => {
    process.exit(code);
  });

  server.on('error', (err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
