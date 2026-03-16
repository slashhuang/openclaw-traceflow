/**
 * PM2 配置：在仓库根目录执行 pm2 start ecosystem.config.cjs
 *
 * 启动 Futu OpenD 守护进程
 */

module.exports = {
  apps: [
    {
      name: 'futu-opend',
      script: './scripts/start.sh',
      cwd: __dirname,
      interpreter: 'bash',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      watch: false,
      ignore_watch: [
        'node_modules',
        'logs',
        'Futu_OpenD',
        'Futu_OpenD_Linux',
        'Futu_OpenD_Centos7',
        '__pycache__',
      ],
      max_memory_restart: '200M',
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
