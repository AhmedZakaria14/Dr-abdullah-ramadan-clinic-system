import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { buildApp } from '../server/app.ts';
import { createDatabase } from '../server/db.ts';
import {
  CLINIC_WORKSPACE_ID,
  extractGoogleSheetCsvUrl,
  syncWorkspaceFromConfiguredSheet,
  upsertSheetSourceInConfig,
} from '../server/services/sheetSyncService.ts';

process.env.NODE_ENV = 'test';
process.env.ADMIN_DEFAULT_PASSWORD = randomBytes(24).toString('base64url');
process.env.AUTH_SESSION_SECRET = randomBytes(32).toString('base64url');
const moderatorPassword = randomBytes(24).toString('base64url');

const workspace = `/businesses/${CLINIC_WORKSPACE_ID}`;
const directory = mkdtempSync(join(tmpdir(), 'clinic-crm-test-'));
const databasePath = join(directory, 'clinic.db');
let server: Server;
let baseUrl: string;

async function start() {
  const db = createDatabase(databasePath, 'native');
  server = buildApp({ db }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  baseUrl = `http://127.0.0.1:${address.port}/api`;
  return db;
}

async function stop() {
  const closed = once(server, 'close');
  server.close();
  server.closeAllConnections();
  await closed;
}

before(start);
after(async () => {
  await stop();
  rmSync(directory, { recursive: true, force: true });
});

async function api(path: string, token?: string, method = 'GET', body?: unknown) {
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  const response = await fetch(baseUrl + path, { method, headers, body: JSON.stringify(body) });
  return { status: response.status, data: await response.json() as any };
}

async function login(username: string, password: string) {
  const result = await api('/auth/login', undefined, 'POST', { username, password });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(typeof result.data.token, 'string');
  assert.equal('accountVault' in result.data, false);
  return result.data.token as string;
}

test('persists independent logins, read and unread state, and live events across devices', async () => {
  const owner = await login('admin', process.env.ADMIN_DEFAULT_PASSWORD!);
  const invitation = await api(`${workspace}/members/invite`, owner, 'POST', {
    username: 'test.moderator',
    password: moderatorPassword,
    displayName: 'Test moderator',
    accountSlot: 'moderator',
  });
  assert.equal(invitation.status, 201, JSON.stringify(invitation.data));

  const phone = await login('test.moderator', moderatorPassword);
  const secondDevice = await login('test.moderator', moderatorPassword);
  assert.notEqual(phone, secondDevice);
  const blocked = await api(`${workspace}/sheet-source/sync`, phone, 'POST', {
    csvText: 'id,full_name\nrow,Unauthorized',
  });
  assert.equal(blocked.status, 403);

  const created = await api(`${workspace}/leads`, owner, 'POST', { fullName: 'Synthetic patient' });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.lead.is_read, 0);
  const detail = `${workspace}/leads/${created.data.lead.id}`;

  const abort = new AbortController();
  const events = await fetch(`${baseUrl}${workspace}/events?token=${encodeURIComponent(secondDevice)}`, {
    signal: AbortSignal.any([abort.signal, AbortSignal.timeout(3_000)]),
  });
  assert.equal(events.status, 200);
  const reader = events.body!.getReader();
  try {
    const opened = await api(detail, phone);
    assert.equal(opened.data.lead.is_read, 1);
    let stream = '';
    while (!stream.includes('event: lead_updated')) {
      const { value, done } = await reader.read();
      assert.equal(done, false);
      stream += new TextDecoder().decode(value);
    }
    const markedUnread = await api(`${detail}/read`, owner, 'POST', { isRead: false });
    assert.equal(markedUnread.data.lead.is_read, 0);
    const passiveRefresh = await api(`${detail}?markRead=false`, secondDevice);
    assert.equal(passiveRefresh.data.lead.is_read, 0);
    assert.equal(passiveRefresh.data.lead.read_at, null);
  } finally {
    abort.abort();
    await reader.cancel().catch(() => {});
  }

  await stop();
  await start();
  assert.equal((await api('/me', phone)).status, 200);
  assert.equal((await api('/me', secondDevice)).status, 200);
  assert.equal((await api(`${detail}?markRead=false`, secondDevice)).data.lead.is_read, 0);
  await login('test.moderator', moderatorPassword);
});

test('preserves IDs, read state and CRM notes when sheet rows are reordered or updated', async () => {
  const owner = await login('admin', process.env.ADMIN_DEFAULT_PASSWORD!);
  const sync = (csvText: string) => api(`${workspace}/sheet-source/sync`, owner, 'POST', { csvText });
  const header = 'full_name,phone_number,quantity_sizes';
  const a = 'First synthetic lead,+201000000001,Original sheet note';
  const b = 'Second synthetic lead,+201000000002,Second sheet note';

  const first = await sync([header, a, b].join('\n'));
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.createdCount, 2);
  const id = first.data.newLeads.find((lead: any) => lead.fullName === 'First synthetic lead').id;
  const detail = `${workspace}/leads/${id}`;
  const read = await api(`${detail}/read`, owner, 'POST', { isRead: true });
  assert.equal(read.data.lead.is_read, 1);
  const db = createDatabase(databasePath, 'native');
  db.prepare('UPDATE leads SET notes_summary = ? WHERE id = ?').run('CRM follow-up note', id);
  const reordered = await sync([header, b, a].join('\n'));
  assert.equal(reordered.data.createdCount, 0);
  assert.equal(reordered.data.updatedCount, 0);
  const updated = await sync([header, b, a.replace('Original sheet note', 'Updated sheet note')].join('\n'));
  assert.equal(updated.data.createdCount, 0);
  assert.equal(updated.data.updatedCount, 1);
  const refreshed = await api(`${detail}?markRead=false`, owner);
  assert.equal(refreshed.data.lead.is_read, 1);
  assert.equal(refreshed.data.lead.notes_summary, 'CRM follow-up note');
  const replay = await sync([header, b, a.replace('Original sheet note', 'Updated sheet note')].join('\n'));
  assert.equal(replay.data.updatedCount, 0);
});

test('joins concurrent sheet polls and keeps CRM records when the source becomes empty', async (context) => {
  const db = createDatabase(':memory:', 'native');
  buildApp({ db });
  let csv = 'id,full_name,phone_number\nread-retention-test,Synthetic lead,+201000000003';
  const sheet = 'https://docs.google.com/spreadsheets/d/synthetic-clinic-sheet/edit#gid=417';
  assert.match(extractGoogleSheetCsvUrl(sheet) || '', /[?&]gid=417$/);
  const googleFetch = context.mock.method(globalThis, 'fetch', async (input: URL | string) => {
    assert.equal(new URL(input).searchParams.get('gid'), '417');
    return new Response(csv, { headers: { 'Content-Type': 'text/csv' } });
  });
  const clinicIntegration = db.prepare("SELECT id FROM integrations WHERE provider = 'google_sheets'").get();
  // Use only a synthetic source; no network call or patient data.
  db.prepare('UPDATE integrations SET config_json = ? WHERE id = ?').run('{"sheetSourcesCleared":true}', clinicIntegration.id);
  upsertSheetSourceInConfig(db, CLINIC_WORKSPACE_ID, sheet);
  const [first, second] = await Promise.all([
    syncWorkspaceFromConfiguredSheet(db, CLINIC_WORKSPACE_ID),
    syncWorkspaceFromConfiguredSheet(db, CLINIC_WORKSPACE_ID),
  ]);
  assert.equal(googleFetch.mock.callCount(), 1);
  assert.equal(first.createdCount, 1);
  assert.deepEqual(second, first);
  const id = first.newLeads[0].id;
  db.prepare('UPDATE leads SET is_read = 1 WHERE id = ?').run(id);
  csv = 'id,full_name,phone_number';
  await syncWorkspaceFromConfiguredSheet(db, CLINIC_WORKSPACE_ID, { force: true });
  assert.equal(db.prepare('SELECT is_read FROM leads WHERE id = ?').get(id).is_read, 1);
});
