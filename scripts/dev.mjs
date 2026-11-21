import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const backendDir = path.join(rootDir, 'backend');
const venvUvicorn = path.join(backendDir, '.venv', 'bin', 'uvicorn');
const bootstrapScript = path.join(rootDir, 'scripts', 'bootstrap-backend.sh');
const localViteBin = path.join(
  rootDir,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'vite.cmd' : 'vite'
);

const backendPort = Number(process.env.BACKEND_PORT || 8001);

let backendProc = null;
let bootstrapProc = null;
let viteProc = null;
let shuttingDown = false;

function isBackendHealthy(port, host = '127.0.0.1') {
  return new Promise(resolve => {
    const socket = new net.Socket();
    socket.setTimeout(500);
    socket.once('connect', async () => {
      socket.destroy();
      try {
        const res = await fetch(`http://${host}:${port}/api/health`);
        if (res.ok) {
          const data = await res.json();
          resolve(data?.app_name === 'ImageLab Backend');
          return;
        }
      } catch {
        // Ignore transient health check errors
      }
      resolve(false);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      resolve(false);
    });
    socket.connect(port, host);
  });
}

function startUvicorn() {
  if (shuttingDown || backendProc) return;
  if (!fs.existsSync(venvUvicorn)) {
    console.warn('[ImageLab] FastAPI uvicorn binary not found at', venvUvicorn);
    return;
  }

  console.log(`[ImageLab] Starting FastAPI backend on 127.0.0.1:${backendPort}...`);
  const proc = spawn(
    venvUvicorn,
    ['app.main:app', '--host', '127.0.0.1', '--port', String(backendPort)],
    {
      cwd: backendDir,
      stdio: 'inherit',
      env: { ...process.env, PYTHONPATH: backendDir },
    }
  );
  backendProc = proc;

  proc.on('error', err => {
    console.error('[ImageLab] Failed to launch FastAPI backend:', err.message);
    if (backendProc === proc) backendProc = null;
  });

  proc.on('exit', (code, signal) => {
    if (backendProc === proc) backendProc = null;
    if (!shuttingDown && code !== null && code !== 0) {
      console.error(`[ImageLab] FastAPI exited with code ${code} (signal ${signal})`);
    }
  });
}

async function ensureBackendRunning() {
  try {
    const alreadyRunning = await isBackendHealthy(backendPort);
    if (alreadyRunning) {
      console.log(`[ImageLab] Reusing running FastAPI backend on 127.0.0.1:${backendPort}`);
      return;
    }

    if (fs.existsSync(venvUvicorn)) {
      startUvicorn();
      return;
    }

    if (!fs.existsSync(bootstrapScript)) {
      console.warn('[ImageLab] Backend bootstrap script missing; running frontend only.');
      return;
    }

    console.log('[ImageLab] Python virtualenv missing — bootstrapping FastAPI backend in background...');
    const proc = spawn('bash', [bootstrapScript], {
      cwd: rootDir,
      stdio: 'inherit',
      env: process.env,
    });
    bootstrapProc = proc;

    proc.on('error', err => {
      console.error('[ImageLab] Backend bootstrap spawn error:', err.message);
      if (bootstrapProc === proc) bootstrapProc = null;
    });

    proc.on('exit', code => {
      if (bootstrapProc === proc) bootstrapProc = null;
      if (shuttingDown) return;
      if (code === 0 && fs.existsSync(venvUvicorn)) {
        startUvicorn();
      } else {
        console.error(`[ImageLab] Backend bootstrap exited with code ${code}; Vite will keep serving frontend.`);
      }
    });
  } catch (err) {
    console.error('[ImageLab] Unexpected error starting backend:', err);
  }
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const proc of [bootstrapProc, backendProc, viteProc]) {
    if (proc && !proc.killed) {
      try {
        proc.kill('SIGTERM');
      } catch {
        // Ignore already-exited processes
      }
    }
  }
  process.exit(exitCode);
}

function main() {
  // 1. Start Vite IMMEDIATELY on port 3000 so the dev server is always ready right away.
  const viteCmd = fs.existsSync(localViteBin)
    ? localViteBin
    : process.platform === 'win32'
      ? 'npx.cmd'
      : 'npx';
  const viteArgs = fs.existsSync(localViteBin)
    ? ['--port=3000', '--host=0.0.0.0']
    : ['vite', '--port=3000', '--host=0.0.0.0'];

  viteProc = spawn(viteCmd, viteArgs, {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_BACKEND_PROXY_TARGET: `http://127.0.0.1:${backendPort}`,
    },
  });

  viteProc.on('error', err => {
    console.error('[ImageLab] Failed to start Vite dev server:', err.message);
    shutdown(1);
  });

  viteProc.on('exit', code => {
    shutdown(code ?? 0);
  });

  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));

  // 2. Start or auto-bootstrap FastAPI backend in parallel (non-blocking, crash-isolated).
  void ensureBackendRunning();
}

main();
