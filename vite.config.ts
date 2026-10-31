import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
  server: { port: 5199, strictPort: true },
});
