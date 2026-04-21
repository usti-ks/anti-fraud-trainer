import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxyPort = process.env.GIGACHAT_PORT || 8787;
const proxyTarget = process.env.GIGACHAT_PROXY_TARGET || `http://localhost:${proxyPort}`;

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/gigachat': {
        target: proxyTarget,
        changeOrigin: true,
      },
    },
  },
});
