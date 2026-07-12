/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      // Backend routes have NO /api prefix (/auth/*, /recipes/* at the root),
      // so strip the prefix while forwarding: /api/recipes → :5109/recipes.
      // Run the backend with the http launch profile (the https profile
      // 307-redirects port 5109 and breaks this proxy).
      '/api': {
        target: 'http://localhost:5109',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
