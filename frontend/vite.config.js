import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

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
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3001',
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
