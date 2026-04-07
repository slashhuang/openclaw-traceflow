import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/** 开发时 /api 代理目标；若 3001 不是本项目的 Nest（例如跑了别的 Monitor），可设为 TraceFlow 实际端口 */
const API_PROXY_TARGET = process.env.VITE_API_PROXY_TARGET || 'http://localhost:3001'

/** 前端打包时间（默认取执行 build 的时刻，北京时间）；CI 可设 VITE_APP_BUILD_TIME=ISO 字符串以与流水线一致 */
function getBeijingTimeISOString() {
  const now = new Date()
  const beijingTimeStr = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
  // 将 "2026/4/7 14:30:00" 转换为 ISO 格式 "2026-04-07T14:30:00+08:00"
  const [datePart, timePart] = beijingTimeStr.split(' ')
  const [year, month, day] = datePart.split('/').map(v => v.padStart(2, '0'))
  const [hour, minute, second] = timePart.split(':')
  return `${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`
}
const APP_BUILD_TIME = process.env.VITE_APP_BUILD_TIME || getBeijingTimeISOString()
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
        /** 避免 Gateway 慢时 health/overview 等长请求被代理提前掐断成 502 */
        timeout: 120_000,
        proxyTimeout: 120_000,
      },
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
