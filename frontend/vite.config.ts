import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: '../internal/assets/dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/index.js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
      '/_mapping': 'http://localhost:8080',
    },
  },
})
