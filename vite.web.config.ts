import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve('web'),
  base: './',
  plugins: [react(), {
    name: 'browser-sqlite-adapter',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === './db' && importer && /electron[/\\]main[/\\](repo|dataService)\.ts$/.test(importer)) {
        return resolve('src/web/db.web.ts').replace(/\\/g, '/');
      }
    },
  }],
  build: { outDir: resolve('dist/web'), emptyOutDir: true, rollupOptions: { input: resolve('web/index.html') } },
});
