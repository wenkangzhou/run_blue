import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// A shell-exported stale key otherwise wins over .env.local in Next.js.
delete process.env.KIMI_API_KEY;

const nextBin = require.resolve('next/dist/bin/next');
const child = spawn(
  process.execPath,
  [nextBin, 'dev', '-p', '6364', '--webpack'],
  { stdio: 'inherit', env: process.env }
);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
