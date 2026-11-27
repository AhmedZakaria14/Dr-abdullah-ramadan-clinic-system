import { request } from 'node:https';
import { pipeline } from 'node:stream/promises';
import type { Request, Response } from 'express';

const hopByHop = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade',
]);

function sendJsonError(res: Response, status: number, error: string) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error }));
}

export default async function handler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store');
  const origin = process.env.CRM_API_ORIGIN;
  if (!origin) {
    return sendJsonError(res, 503, 'The persistent CRM backend is not configured');
  }

  try {
    const target = new URL(origin);
    if (target.protocol !== 'https:' || target.username || target.password) {
      throw new Error('CRM_API_ORIGIN must be an HTTPS origin');
    }
    const incoming = new URL(req.url || '/api', 'http://localhost');
    const rewrittenPath = incoming.searchParams.get('__path');
    incoming.searchParams.delete('__path');
    target.pathname = rewrittenPath === null
      ? incoming.pathname
      : `/api/${rewrittenPath.replace(/^\/+/, '')}`;
    target.search = incoming.search;
    target.hash = '';
    if (!target.pathname.startsWith('/api/')) {
      return sendJsonError(res, 404, 'API endpoint not found');
    }

    const headers = Object.fromEntries(
      Object.entries(req.headers).filter(([name]) => !hopByHop.has(name) && name !== 'host')
    );
    // Preserve the original bytes for webhook signature verification.
    const parsedBody = req.readableEnded && req.body !== undefined
      ? Buffer.isBuffer(req.body) || typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
      : null;
    if (parsedBody !== null) headers['content-length'] = String(Buffer.byteLength(parsedBody));

    await new Promise<void>((resolve, reject) => {
      const upstream = request(target, { method: req.method, headers }, (response) => {
        res.statusCode = response.statusCode || 502;
        for (const [name, value] of Object.entries(response.headers)) {
          if (value !== undefined && !hopByHop.has(name)) res.setHeader(name, value);
        }
        pipeline(response, res).then(resolve, reject);
      });
      upstream.on('error', reject);
      upstream.setTimeout(60_000, () => upstream.destroy(new Error('CRM backend timed out')));
      res.once('close', () => {
        if (!res.writableFinished) upstream.destroy(new Error('Client disconnected'));
      });
      if (parsedBody !== null || req.readableEnded) {
        upstream.end(parsedBody ?? undefined);
      } else {
        req.once('error', (error) => upstream.destroy(error));
        req.pipe(upstream);
      }
    });
  } catch {
    if (!res.headersSent && !res.destroyed) {
      sendJsonError(res, 502, 'The persistent CRM backend is unavailable');
    }
  }
}
