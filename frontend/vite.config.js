import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

/** 开发时 /api 代理目标；若 3001 不是本项目的 Nest（例如跑了别的 Monitor），可设为 TraceFlow 实际端口 */
const API_PROXY_TARGET = process.env.VITE_API_PROXY_TARGET || 'http://localhost:3001'

/** 前端打包时间（默认取执行 build 的时刻）；CI 可设 VITE_APP_BUILD_TIME=ISO 字符串以与流水线一致 */
const APP_BUILD_TIME = process.env.VITE_APP_BUILD_TIME || new Date().toISOString()
/** 可选：短 commit，便于区分部署（例：CI 设 VITE_APP_GIT_SHA=$GITHUB_SHA） */
const APP_GIT_SHA = process.env.VITE_APP_GIT_SHA || ''

export default defineConfig({
  plugins: [react()],
  root: '.',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3002,
    proxy: {
      '/api': {
        target: API_PROXY_TARGET,
        changeOrigin: true,
      },
      '/socket.io': {
        target: API_PROXY_TARGET,
        changeOrigin: true,
        ws: true,
      },
    },
    ws: {
      // 禁用 Vite 自带的 WebSocket 服务器，避免与 socket.io 冲突
      pingInterval: 60000,
      pingTimeout: 30000,
    },
  },
  build: {
    outDir: '../public/app',
    emptyOutDir: true,
    base: '/',
    sourcemap: true, // 启用 sourcemap
  },
  define: {
    'import.meta.env.VITE_APP_BUILD_TIME': JSON.stringify(APP_BUILD_TIME),
    'import.meta.env.VITE_APP_GIT_SHA': JSON.stringify(APP_GIT_SHA),
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'socket.io-client',
      'recharts',
      'axios',
      'react-markdown',
      'antd',
      '@ant-design/pro-layout',
      '@ant-design/icons',
      'dayjs',
      'react-intl',
    ],
  },
})
