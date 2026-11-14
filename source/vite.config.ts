import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  publicDir: 'public',
  build: {
    outDir: '../web',
    emptyOutDir: false,
    rollupOptions: { output: { entryFileNames: 'assets/main.js', chunkFileNames: 'assets/[name].js', assetFileNames:'assets/[name][extname]' } }
  },
  server: { host: '0.0.0.0' }
});
