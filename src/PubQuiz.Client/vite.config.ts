import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: path.resolve(__dirname, '../PubQuiz.Server/wwwroot'),
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          motion: ['framer-motion'],
          signalr: ['@microsoft/signalr']
        }
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://localhost:5443',
        changeOrigin: true,
        secure: false
      },
      '/hubs': {
        target: 'https://localhost:5443',
        ws: true,
        changeOrigin: true,
        secure: false
      }
    }
  }
});
