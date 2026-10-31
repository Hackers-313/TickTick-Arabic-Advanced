import { spawn } from 'node:child_process';
import { createServer } from 'vite';

const server = await createServer({ server: { port: 5199 } });
await server.listen();
const url = `http://localhost:5199`;
server.printUrls();

const child = spawn(process.platform === 'win32' ? 'node_modules\\electron\\dist\\electron.exe' : 'node_modules/.bin/electron', ['.'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
});

child.on('close', async () => {
  await server.close();
  process.exit(0);
});
