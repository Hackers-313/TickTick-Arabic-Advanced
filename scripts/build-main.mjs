import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';

const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: false,
  external: ['electron'],
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': '"production"' },
};

mkdirSync('dist/main', { recursive: true });
mkdirSync('dist/preload', { recursive: true });

await build({
  ...common,
  entryPoints: ['electron/main/index.ts'],
  outfile: 'dist/main/index.js',
});

await build({
  ...common,
  entryPoints: ['electron/preload/index.ts'],
  outfile: 'dist/preload/index.js',
});
