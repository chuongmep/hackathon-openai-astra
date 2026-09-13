import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    headers: {'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless'},
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/v1': {target: 'http://127.0.0.1:3001', rewrite: () => '/embed/'},
      '/embed': {target: 'http://127.0.0.1:3001', ws: true},
    },
  },
});
