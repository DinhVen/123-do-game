import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'assets',
    sourcemap: false
  }
});
