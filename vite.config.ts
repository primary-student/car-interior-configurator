import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// base 由环境变量决定：
//   默认 '/car-interior-configurator/' —— 部署在 GitHub Pages 的项目子路径下
//   BASE='/'                          —— 部署在独立域名 / 平台根路径下
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE ?? '/car-interior-configurator/',
  build: {
    // 显式关闭 sourcemap：生产包不带源码映射，避免源码结构随产物外泄
    sourcemap: false,
  },
})
