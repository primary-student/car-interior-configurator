import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/car-interior-configurator/',
  build: {
    // 显式关闭 sourcemap：生产包不带源码映射，避免源码结构随产物外泄
    sourcemap: false,
  },
})
