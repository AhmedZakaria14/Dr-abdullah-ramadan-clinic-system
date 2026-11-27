import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ensureDbReady, getDb } from './server/db.ts';
import { buildApp } from './server/app.ts';
import { startAttachedSheetWatcher } from './server/services/sheetSyncService.ts';

export { buildApp };

const __dirname =
  typeof import.meta !== 'undefined' && Boolean(import.meta.url)
    ? path.dirname(fileURLToPath(import.meta.url))
    : process.cwd();

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.DATABASE_PATH || !path.isAbsolute(process.env.DATABASE_PATH)) {
      throw new Error('Set DATABASE_PATH to an absolute path on the persistent database volume');
    }
    if ((process.env.AUTH_SESSION_SECRET?.trim().length || 0) < 32) {
      throw new Error('Set AUTH_SESSION_SECRET to a shared secret of at least 32 characters');
    }
  } else {
    await ensureDbReady();
  }
  const db = getDb();
  const app = buildApp({ db });
  startAttachedSheetWatcher(db);
  const rawEnvPort = process.env.PORT ? Number(process.env.PORT) : NaN;
  const nginxPort = process.env.NGINX_PORT ? Number(process.env.NGINX_PORT) : NaN;
  const defaultAppPort = Number(process.env.DEFAULT_APP_PORT || 3000);
  const PORT =
    process.env.NODE_ENV !== 'production'
      ? defaultAppPort
      : Number.isFinite(rawEnvPort) && rawEnvPort !== nginxPort
        ? rawEnvPort
        : defaultAppPort;

  if (process.env.NODE_ENV !== 'production') {
    const vitePkg = 'vite';
    const { createServer: createViteServer } = await import(/* @vite-ignore */ vitePkg);
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Dr. Abdullah Ramadan Dental Clinics CRM server listening on http://0.0.0.0:${PORT}`);
  });
}

const isMainEntry =
  Boolean(process.argv[1]) &&
  typeof import.meta !== 'undefined' &&
  Boolean(import.meta.url) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainEntry && process.env.NODE_ENV !== 'test') {
  startServer();
}
