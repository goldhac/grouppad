import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// The Express backend (server.js) runs on :3000 and owns all /api routes,
// Google OAuth (/api/auth/google*) and the magic-link verify redirect.
// It has NO CORS and sets an HttpOnly SameSite=Lax cookie, so in dev we must
// stay same-origin by proxying everything the backend owns through Vite.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    // Express serves this directory (added to server.js ahead of legacy public/).
    outDir: 'dist',
    emptyOutDir: true,
  },
});
