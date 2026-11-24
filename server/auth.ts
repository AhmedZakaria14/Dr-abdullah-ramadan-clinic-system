import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SqlDb } from './db.ts';

function loadFirebaseConfig(): { projectId?: string; firestoreDatabaseId?: string } {
  const candidates = [
    path.resolve(process.cwd(), 'firebase-applet-config.json'),
  ];
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    candidates.push(path.resolve(here, '..', 'firebase-applet-config.json'));
  } catch {
    // Ignore import.meta.url fallback error
  }
  for (const configPath of candidates) {
    try {
      if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
      }
    } catch {
      // Try next candidate
    }
  }
  return {};
}

const firebaseConfig = loadFirebaseConfig();

async function ensureFirebaseAdminApp() {
  if (!firebaseConfig?.projectId || firebaseConfig.projectId === 'remixed-project-id') {
    return null;
  }
  const fbAppPkg = 'firebase-admin/app';
  const { initializeApp, getApps } = await import(/* @vite-ignore */ fbAppPkg);
  if (!getApps().length) {
    initializeApp({
      projectId: firebaseConfig.projectId,
    });
  }
  return getApps()[0] || null;
}

export const MASTER_OWNER_EMAIL = 'azeco77@gmail.com';
export const DEFAULT_ADMIN_USERNAME = 'admin';
const CLINIC_BIZ_ID = 'dr-abdullah-ramadan-dental';

const SESSION_SECRET =
  process.env.AUTH_SESSION_SECRET ||
  process.env.INTEGRATION_ENCRYPTION_KEY ||
  crypto
    .createHash('sha256')
    .update(`dental-crm-session-v1:${firebaseConfig?.projectId || 'local'}:${CLINIC_BIZ_ID}`)
    .digest('hex');

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash?: string | null): boolean {
  if (!password || !storedHash || !storedHash.startsWith('scrypt:')) return false;
  const parts = storedHash.split(':');
  if (parts.length !== 3) return false;
  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export interface SessionTokenPayload {
  sub: string;
  username: string;
  email: string;
  name: string;
  isOwner: boolean;
  isPlatformSuperAdmin: boolean;
  accountSlot: 'manager' | 'moderator' | 'accountant';
  role?: Role;
  iat?: number;
  exp: number;
}

export function signSessionToken(payload: Omit<SessionTokenPayload, 'exp' | 'iat'>): string {
  const now = Date.now();
  const fullPayload: SessionTokenPayload = {
    ...payload,
    iat: now,
    exp: now + SESSION_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `lf1.${body}.${sig}`;
}

export function verifySessionToken(token: string): SessionTokenPayload | null {
  if (!token || !token.startsWith('lf1.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, body, sig] = parts;
  if (!body || !sig) return null;
  try {
    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expectedSig, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionTokenPayload;
    if (!parsed || typeof parsed.exp !== 'number' || parsed.exp < Date.now()) return null;
    if (!parsed.sub || !parsed.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function recordAccountRevocation(
  db: SqlDb,
  params: { userId?: string | null; username?: string | null; email?: string | null; reason?: string }
): void {
  try {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const cleanUserId = params.userId?.trim() || null;
    const cleanUsername = params.username?.trim().toLowerCase() || null;
    const cleanEmail = params.email?.trim().toLowerCase() || null;
    if (!cleanUserId && !cleanUsername && !cleanEmail) return;
    db.prepare(`
      INSERT INTO revoked_accounts (id, user_id, username, email, revoked_at_ms, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), cleanUserId, cleanUsername, cleanEmail, nowMs, params.reason || 'revoked', nowIso);
  } catch {
    // Ignore if table not yet initialized
  }
}

export function clearAccountRevocation(
  db: SqlDb,
  params: { userId?: string | null; username?: string | null; email?: string | null }
): void {
  try {
    const conditions: string[] = [];
    const args: string[] = [];
    if (params.userId?.trim()) {
      conditions.push('user_id = ?');
      args.push(params.userId.trim());
    }
    if (params.username?.trim()) {
      conditions.push('LOWER(username) = ?');
      args.push(params.username.trim().toLowerCase());
    }
    if (params.email?.trim()) {
      conditions.push('LOWER(email) = ?');
      args.push(params.email.trim().toLowerCase());
    }
    if (conditions.length === 0) return;
    db.prepare(`DELETE FROM revoked_accounts WHERE ${conditions.join(' OR ')}`).run(...args);
  } catch {
    // Ignore if table not yet initialized
  }
}

function isSessionRevoked(db: SqlDb, session: SessionTokenPayload): boolean {
  // Always reject legacy removed accountant account tokens
  if (
    session.sub === 'clinic-accountant' ||
    session.username?.trim().toLowerCase() === 'accountant' ||
    session.accountSlot === 'accountant'
  ) {
    return true;
  }
  try {
    const cleanSub = session.sub.trim();
    const cleanUsername = (session.username || '').trim().toLowerCase();
    const cleanEmail = (session.email || '').trim().toLowerCase();
    const row = db
      .prepare(`
        SELECT MAX(revoked_at_ms) as revoked_at_ms
        FROM revoked_accounts
        WHERE user_id = ?
           OR (username IS NOT NULL AND LOWER(username) = ?)
           OR (email IS NOT NULL AND LOWER(email) = ?)
      `)
      .get(cleanSub, cleanUsername, cleanEmail) as { revoked_at_ms?: number | null } | undefined;
    if (row && typeof row.revoked_at_ms === 'number' && row.revoked_at_ms > 0) {
      const issuedAt = typeof session.iat === 'number' ? session.iat : 0;
      return row.revoked_at_ms >= issuedAt;
    }
  } catch {
    // Ignore if table does not exist in minimal test DB
  }
  return false;
}

const VAULT_ENCRYPTION_KEY = crypto
  .createHash('sha256')
  .update(`dental-crm-accounts-vault-v1:${SESSION_SECRET}`)
  .digest();

export function normalizeLoginIdentifier(raw: string): string {
  const asciiDigits = raw
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  let cleaned = asciiDigits.trim().toLowerCase();
  // Strip accidental leading '@' when user copies "@mod1" from the accounts table (unless it is an email)
  if (cleaned.startsWith('@') && !cleaned.slice(1).includes('@')) {
    cleaned = cleaned.slice(1).trim();
  }
  return cleaned;
}

interface VaultAccountRecord {
  id: string;
  firebase_uid: string | null;
  username: string | null;
  password_hash: string | null;
  email: string;
  full_name: string;
  default_language: string;
  theme: string;
  is_platform_super_admin: number;
  created_at: string;
  updated_at: string;
  membership_id: string;
  invited_email: string;
  display_name: string | null;
  account_slot: 'manager' | 'moderator';
  role: Role;
  status: 'active' | 'invited' | 'inactive';
  membership_updated_at: string;
}

interface VaultRevocationRecord {
  id: string;
  user_id: string | null;
  username: string | null;
  email: string | null;
  revoked_at_ms: number;
  reason: string | null;
  created_at: string;
}

interface AccountsVaultPayload {
  v: 1;
  generatedAtMs: number;
  accounts: VaultAccountRecord[];
  revocations: VaultRevocationRecord[];
}

export function exportEncryptedAccountsVault(db: SqlDb): string {
  try {
    const accounts = db
      .prepare(`
        SELECT
          u.id,
          u.firebase_uid,
          u.username,
          u.password_hash,
          u.email,
          u.full_name,
          u.default_language,
          u.theme,
          u.is_platform_super_admin,
          u.created_at,
          u.updated_at,
          bm.id as membership_id,
          bm.invited_email,
          bm.display_name,
          bm.account_slot,
          bm.role,
          bm.status,
          bm.updated_at as membership_updated_at
        FROM business_memberships bm
        JOIN users u ON u.id = bm.user_id
        WHERE bm.business_id = ?
          AND bm.account_slot IN ('manager', 'moderator')
        ORDER BY u.created_at ASC
        LIMIT 50
      `)
      .all(CLINIC_BIZ_ID) as VaultAccountRecord[];

    let revocations: VaultRevocationRecord[] = [];
    try {
      revocations = db
        .prepare(`
          SELECT id, user_id, username, email, revoked_at_ms, reason, created_at
          FROM revoked_accounts
          ORDER BY revoked_at_ms DESC
          LIMIT 100
        `)
        .all() as VaultRevocationRecord[];
    } catch {
      revocations = [];
    }

    const payload: AccountsVaultPayload = {
      v: 1,
      generatedAtMs: Date.now(),
      accounts,
      revocations,
    };
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', VAULT_ENCRYPTION_KEY, iv);
    const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `vlt1.${iv.toString('base64url')}.${authTag.toString('base64url')}.${encrypted.toString('base64url')}`;
  } catch {
    return '';
  }
}

export function hydrateAccountsFromEncryptedVault(db: SqlDb, vaultToken?: string | null): boolean {
  if (!vaultToken || typeof vaultToken !== 'string' || !vaultToken.startsWith('vlt1.')) {
    return false;
  }
  const parts = vaultToken.split('.');
  if (parts.length !== 4) return false;
  const [, ivB64, tagB64, dataB64] = parts;
  if (!ivB64 || !tagB64 || !dataB64) return false;

  let payload: AccountsVaultPayload;
  try {
    const iv = Buffer.from(ivB64, 'base64url');
    const authTag = Buffer.from(tagB64, 'base64url');
    const ciphertext = Buffer.from(dataB64, 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', VAULT_ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    payload = JSON.parse(decrypted) as AccountsVaultPayload;
    if (!payload || payload.v !== 1 || !Array.isArray(payload.accounts)) return false;
  } catch {
    return false;
  }

  const clinicExists = db.prepare('SELECT id FROM businesses WHERE id = ?').get(CLINIC_BIZ_ID);
  if (!clinicExists) return false;

  // 1. Merge revocations first so deleted/deactivated accounts stay revoked across containers
  if (Array.isArray(payload.revocations)) {
    for (const rev of payload.revocations.slice(0, 100)) {
      if (!rev || typeof rev.revoked_at_ms !== 'number') continue;
      const cleanEmail = rev.email?.trim().toLowerCase() || null;
      const cleanUser = rev.username?.trim().toLowerCase() || null;
      if (cleanEmail === MASTER_OWNER_EMAIL || cleanUser === DEFAULT_ADMIN_USERNAME) continue;
      try {
        const existsRev = db
          .prepare('SELECT id FROM revoked_accounts WHERE id = ?')
          .get(rev.id);
        if (!existsRev) {
          db.prepare(`
            INSERT OR IGNORE INTO revoked_accounts (id, user_id, username, email, revoked_at_ms, reason, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            rev.id || crypto.randomUUID(),
            rev.user_id || null,
            cleanUser,
            cleanEmail,
            rev.revoked_at_ms,
            rev.reason || 'revoked',
            rev.created_at || new Date(rev.revoked_at_ms).toISOString()
          );
        }
        // If revoked as deleted and newer than local user, remove stale local non-owner copy
        if (rev.reason === 'deleted') {
          const localUser = (
            (rev.user_id ? db.prepare('SELECT id, username, email, updated_at FROM users WHERE id = ?').get(rev.user_id) : null) ||
            (cleanUser ? db.prepare('SELECT id, username, email, updated_at FROM users WHERE LOWER(username) = ?').get(cleanUser) : null) ||
            (cleanEmail ? db.prepare('SELECT id, username, email, updated_at FROM users WHERE LOWER(email) = ?').get(cleanEmail) : null)
          ) as { id: string; username?: string; email?: string; updated_at?: string } | undefined;
          if (
            localUser &&
            localUser.id !== 'clinic-owner-manager' &&
            localUser.username?.toLowerCase() !== DEFAULT_ADMIN_USERNAME &&
            localUser.email?.toLowerCase() !== MASTER_OWNER_EMAIL
          ) {
            const localUpdatedMs = Date.parse(localUser.updated_at || '') || 0;
            if (rev.revoked_at_ms >= localUpdatedMs) {
              db.prepare('DELETE FROM business_memberships WHERE business_id = ? AND user_id = ?').run(CLINIC_BIZ_ID, localUser.id);
              const rem = (db.prepare('SELECT COUNT(*) as c FROM business_memberships WHERE user_id = ?').get(localUser.id) as { c: number }).c;
              if (rem === 0) {
                db.prepare('UPDATE leads SET assigned_to_user_id = NULL WHERE assigned_to_user_id = ?').run(localUser.id);
                db.prepare('UPDATE follow_up_tasks SET assigned_to_user_id = NULL WHERE assigned_to_user_id = ?').run(localUser.id);
                db.prepare('DELETE FROM users WHERE id = ?').run(localUser.id);
              }
            }
          }
        }
      } catch {
        // Ignore single revocation merge errors
      }
    }
  }

  // 2. Hydrate verified accounts & memberships from the server-encrypted vault
  let hydratedAny = false;
  for (const acct of payload.accounts.slice(0, 50)) {
    if (!acct || !acct.id || !acct.email) continue;
    const cleanEmail = String(acct.email).trim().toLowerCase();
    const cleanUsername = acct.username ? String(acct.username).trim().toLowerCase() : null;
    if (acct.id === 'clinic-accountant' || cleanUsername === 'accountant' || cleanEmail === 'accountant@drabdullahramadan.local') {
      continue;
    }

    const isOwnerAcct =
      acct.id === 'clinic-owner-manager' ||
      cleanUsername === DEFAULT_ADMIN_USERNAME ||
      cleanEmail === MASTER_OWNER_EMAIL;

    const acctUpdatedMs = Math.max(
      Date.parse(acct.updated_at || '') || 0,
      Date.parse(acct.membership_updated_at || '') || 0
    );

    // Respect newer local deletion revocations
    if (!isOwnerAcct) {
      try {
        const revRow = db
          .prepare(`
            SELECT MAX(revoked_at_ms) as revoked_at_ms
            FROM revoked_accounts
            WHERE reason = 'deleted'
              AND (user_id = ? OR (username IS NOT NULL AND LOWER(username) = ?) OR (email IS NOT NULL AND LOWER(email) = ?))
          `)
          .get(acct.id, cleanUsername || '', cleanEmail) as { revoked_at_ms?: number | null } | undefined;
        if (revRow?.revoked_at_ms && revRow.revoked_at_ms > acctUpdatedMs) {
          continue;
        }
      } catch {
        // ignore
      }
    }

    const validHash =
      typeof acct.password_hash === 'string' && acct.password_hash.startsWith('scrypt:')
        ? acct.password_hash
        : null;
    if (!validHash && !isOwnerAcct) continue;

    const existingUser = (
      db.prepare('SELECT * FROM users WHERE id = ?').get(acct.id) ||
      (cleanUsername ? db.prepare('SELECT * FROM users WHERE LOWER(username) = ?').get(cleanUsername) : null) ||
      db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(cleanEmail)
    ) as any;

    const now = new Date().toISOString();
    const targetSlot: 'manager' | 'moderator' = isOwnerAcct
      ? 'manager'
      : acct.account_slot === 'manager' && acct.role === 'business_admin'
        ? 'manager'
        : 'moderator';
    const targetRole: Role = targetSlot === 'manager' ? 'business_admin' : 'moderator';
    const targetStatus: 'active' | 'invited' | 'inactive' = isOwnerAcct
      ? 'active'
      : acct.status === 'inactive'
        ? 'inactive'
        : 'active';

    let finalUserId = acct.id;
    try {
      if (!existingUser) {
        db.prepare(`
          INSERT INTO users (id, firebase_uid, username, password_hash, email, full_name, default_language, theme, is_platform_super_admin, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          acct.id,
          acct.firebase_uid || `local-${acct.id}`,
          cleanUsername,
          validHash,
          cleanEmail,
          acct.full_name || cleanUsername || cleanEmail.split('@')[0],
          acct.default_language === 'en' ? 'en' : 'ar',
          acct.theme === 'dark' ? 'dark' : 'light',
          isOwnerAcct ? 1 : 0,
          acct.created_at || now,
          acct.updated_at || now
        );
        hydratedAny = true;
      } else {
        finalUserId = existingUser.id;
        const localUpdatedMs = Date.parse(existingUser.updated_at || '') || 0;
        const needsPasswordBackfill = !existingUser.password_hash && Boolean(validHash);
        if (needsPasswordBackfill || acctUpdatedMs > localUpdatedMs) {
          db.prepare(`
            UPDATE users
            SET username = COALESCE(NULLIF(?, ''), username),
                password_hash = COALESCE(?, password_hash),
                full_name = COALESCE(NULLIF(?, ''), full_name),
                updated_at = ?
            WHERE id = ?
          `).run(
            cleanUsername || '',
            validHash,
            acct.full_name || '',
            acct.updated_at || now,
            finalUserId
          );
          hydratedAny = true;
        }
      }

      const existingMembership = db
        .prepare(
          `SELECT id, updated_at FROM business_memberships
           WHERE business_id = ? AND (user_id = ? OR LOWER(invited_email) = ?)
           LIMIT 1`
        )
        .get(CLINIC_BIZ_ID, finalUserId, cleanEmail) as { id: string; updated_at?: string } | undefined;

      if (!existingMembership) {
        db.prepare(`
          INSERT INTO business_memberships (id, business_id, user_id, invited_email, display_name, account_slot, role, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(business_id, invited_email) DO UPDATE SET
            user_id = excluded.user_id,
            account_slot = excluded.account_slot,
            role = excluded.role,
            display_name = COALESCE(NULLIF(excluded.display_name, ''), display_name),
            status = excluded.status,
            updated_at = excluded.updated_at
        `).run(
          acct.membership_id || crypto.randomUUID(),
          CLINIC_BIZ_ID,
          finalUserId,
          acct.invited_email?.trim().toLowerCase() || cleanEmail,
          acct.display_name || acct.full_name || cleanUsername || cleanEmail.split('@')[0],
          targetSlot,
          targetRole,
          targetStatus,
          acct.created_at || now,
          acct.membership_updated_at || acct.updated_at || now
        );
        hydratedAny = true;
      } else {
        const localMemUpdatedMs = Date.parse(existingMembership.updated_at || '') || 0;
        if (acctUpdatedMs > localMemUpdatedMs) {
          db.prepare(`
            UPDATE business_memberships
            SET user_id = ?,
                account_slot = ?,
                role = ?,
                display_name = COALESCE(NULLIF(?, ''), display_name),
                status = ?,
                updated_at = ?
            WHERE id = ?
          `).run(
            finalUserId,
            targetSlot,
            targetRole,
            acct.display_name || acct.full_name || '',
            targetStatus,
            acct.membership_updated_at || acct.updated_at || now,
            existingMembership.id
          );
          hydratedAny = true;
        }
      }
    } catch {
      // Ignore single-record hydration conflict safely
    }
  }

  return hydratedAny;
}

export async function syncSystemAccountsToFirestore(db: SqlDb): Promise<void> {
  const projectId = firebaseConfig?.projectId;
  const dbId = firebaseConfig?.firestoreDatabaseId;
  if (!projectId || !dbId) return;
  // Only attempt Admin Firestore sync when GCP credentials exist in the runtime environment
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.K_SERVICE) return;

  try {
    const app = await ensureFirebaseAdminApp();
    if (!app) return;
    const fbFirestorePkg = 'firebase-admin/firestore';
    const { getFirestore: getAdminFirestore } = await import(/* @vite-ignore */ fbFirestorePkg);
    const adminFs = getAdminFirestore(app, dbId);
    const rows = db
      .prepare(`
        SELECT u.id, u.username, u.email, u.full_name, u.is_platform_super_admin,
               bm.account_slot, bm.role, bm.status
        FROM users u
        JOIN business_memberships bm ON bm.user_id = u.id
        WHERE bm.business_id = ?
      `)
      .all(CLINIC_BIZ_ID) as any[];

    const nowIso = new Date().toISOString();
    for (const r of rows) {
      const normalizedSlot = r.account_slot === 'manager' ? 'manager' : 'moderator';
      const firestoreRole = normalizedSlot === 'manager' ? 'full_access' : 'moderator';
      const normalizedEmail = String(r.email || '').trim().toLowerCase();
      const isRowOwner = Boolean(
        r.is_platform_super_admin ||
          r.username === DEFAULT_ADMIN_USERNAME ||
          normalizedEmail === MASTER_OWNER_EMAIL
      );
      await adminFs.collection('users').doc(r.id).set(
        {
          uid: r.id,
          username: r.username || normalizedEmail.split('@')[0],
          email: normalizedEmail,
          fullName: r.full_name,
          accountType: normalizedSlot,
          isOwner: isRowOwner,
          defaultLanguage: 'ar',
          theme: 'light',
          updatedAt: nowIso,
        },
        { merge: true }
      );
      if (normalizedEmail && normalizedEmail.includes('@')) {
        await adminFs.collection('authorized_emails').doc(normalizedEmail).set(
          {
            email: normalizedEmail,
            displayName: r.full_name,
            accountType: normalizedSlot,
            role: firestoreRole,
            isOwner: isRowOwner,
            status: r.status === 'inactive' ? 'inactive' : 'active',
            grantedBy: MASTER_OWNER_EMAIL,
            updatedAt: nowIso,
          },
          { merge: true }
        );
      }
    }
    await adminFs.collection('users').doc('clinic-accountant').delete().catch(() => {});
    await adminFs.collection('authorized_emails').doc('accountant@drabdullahramadan.local').delete().catch(() => {});
  } catch {
    // Graceful skip when Firestore Admin credentials are unavailable
  }
}

export async function removeAccountFromFirestore(userId?: string | null, email?: string | null): Promise<void> {
  const projectId = firebaseConfig?.projectId;
  const dbId = firebaseConfig?.firestoreDatabaseId;
  if (!projectId || !dbId) return;
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.K_SERVICE) return;

  try {
    const app = await ensureFirebaseAdminApp();
    if (!app) return;
    const fbFirestorePkg = 'firebase-admin/firestore';
    const { getFirestore: getAdminFirestore } = await import(/* @vite-ignore */ fbFirestorePkg);
    const adminFs = getAdminFirestore(app, dbId);
    if (userId && userId !== 'clinic-owner-manager') {
      await adminFs.collection('users').doc(userId).delete().catch(() => {});
    }
    const cleanEmail = email?.trim().toLowerCase();
    if (cleanEmail && cleanEmail !== MASTER_OWNER_EMAIL) {
      await adminFs.collection('authorized_emails').doc(cleanEmail).delete().catch(() => {});
    }
  } catch {
    // Graceful skip when Firestore Admin credentials are unavailable
  }
}

export type Role = 'super_admin' | 'business_admin' | 'manager' | 'moderator' | 'employee';

export interface AuthUser {
  id: string;
  firebaseUid: string;
  username?: string;
  email: string;
  fullName: string;
  isDemoUser: boolean;
  isPlatformSuperAdmin: boolean;
  isOwner: boolean;
}

export interface AuthRequest extends Request {
  authUser?: AuthUser;
  membership?: {
    id: string;
    business_id: string;
    role: Role;
    status: string;
    account_slot?: 'manager' | 'moderator' | 'accountant';
  };
  rawBody?: Buffer;
}

export type TokenVerifier = (token: string) => Promise<{
  uid: string;
  email: string;
  name?: string;
  picture?: string;
}>;

export const defaultTokenVerifier: TokenVerifier = async (token: string) => {
  const app = await ensureFirebaseAdminApp();
  if (!app) {
    throw new Error('Firebase Admin is not configured in this environment');
  }
  const fbAuthPkg = 'firebase-admin/auth';
  const { getAuth } = await import(/* @vite-ignore */ fbAuthPkg);
  const adminAuth = getAuth(app);
  const decoded = await adminAuth.verifyIdToken(token);
  if (!decoded.email) {
    throw new Error('Verified token missing email address');
  }
  return {
    uid: decoded.uid,
    email: decoded.email.toLowerCase(),
    name: decoded.name || decoded.email.split('@')[0],
    picture: decoded.picture,
  };
};

export function upsertUserFromAuth(
  db: SqlDb,
  payload: { uid: string; email: string; name?: string; picture?: string; username?: string }
): AuthUser {
  const now = new Date().toISOString();
  const normalizedEmail = payload.email.toLowerCase().trim();
  const normalizedUsername = payload.username?.trim().toLowerCase() || undefined;
  const isOwner = normalizedEmail === MASTER_OWNER_EMAIL || normalizedUsername === DEFAULT_ADMIN_USERNAME;
  const existingByUid = db.prepare('SELECT * FROM users WHERE firebase_uid = ? OR id = ?').get(payload.uid, payload.uid) as any;
  const existingByUsername = !existingByUid && normalizedUsername
    ? (db.prepare('SELECT * FROM users WHERE LOWER(username) = ?').get(normalizedUsername) as any)
    : null;
  const existingByEmail = !existingByUid && !existingByUsername
    ? (db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(normalizedEmail) as any)
    : null;
  const existing = existingByUid || existingByUsername || existingByEmail;

  let userId: string;
  let isPlatformSuperAdmin = isOwner ? 1 : 0;

  if (existing) {
    userId = existing.id;
    isPlatformSuperAdmin = isOwner ? 1 : existing.is_platform_super_admin || 0;
    db.prepare(`
      UPDATE users
      SET firebase_uid = COALESCE(firebase_uid, ?),
          username = COALESCE(username, ?),
          email = ?,
          full_name = COALESCE(NULLIF(?, ''), full_name),
          avatar_url = COALESCE(?, avatar_url),
          is_platform_super_admin = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      payload.uid,
      normalizedUsername || null,
      normalizedEmail,
      payload.name || '',
      payload.picture || null,
      isPlatformSuperAdmin,
      now,
      userId
    );
  } else {
    userId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO users (id, firebase_uid, username, email, full_name, avatar_url, default_language, theme, is_platform_super_admin, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'ar', 'light', ?, ?, ?)
    `).run(
      userId,
      payload.uid,
      normalizedUsername || null,
      normalizedEmail,
      payload.name || normalizedEmail.split('@')[0],
      payload.picture || null,
      isPlatformSuperAdmin,
      now,
      now
    );
  }

  // Activate any pending or pre-seeded workspace memberships for this email
  db.prepare(`
    UPDATE business_memberships
    SET user_id = ?,
        status = CASE WHEN status = 'invited' THEN 'active' ELSE status END,
        updated_at = ?
    WHERE LOWER(invited_email) = ? AND status != 'inactive'
  `).run(userId, now, normalizedEmail);

  // Guarantee Owner (admin / azeco77@gmail.com) always has full business_admin Manager membership on clinic workspace
  if (isOwner) {
    const clinicExists = db.prepare('SELECT id FROM businesses WHERE id = ?').get(CLINIC_BIZ_ID);
    if (clinicExists) {
      db.prepare(`
        INSERT INTO business_memberships (id, business_id, user_id, invited_email, display_name, account_slot, role, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'manager', 'business_admin', 'active', ?, ?)
        ON CONFLICT(business_id, invited_email) DO UPDATE SET
          user_id = excluded.user_id,
          account_slot = 'manager',
          role = 'business_admin',
          status = 'active',
          updated_at = excluded.updated_at
      `).run(
        crypto.randomUUID(),
        CLINIC_BIZ_ID,
        userId,
        normalizedEmail,
        payload.name || 'المدير (admin) | Manager (Owner)',
        now,
        now
      );
    }
  }

  return {
    id: userId,
    firebaseUid: existing?.firebase_uid || payload.uid,
    username: existing?.username || normalizedUsername,
    email: normalizedEmail,
    fullName: payload.name || existing?.full_name || normalizedEmail.split('@')[0],
    isDemoUser: false,
    isPlatformSuperAdmin: Boolean(isPlatformSuperAdmin),
    isOwner,
  };
}

export async function resolveUserFromToken(
  db: SqlDb,
  token: string,
  verifier: TokenVerifier = defaultTokenVerifier
): Promise<AuthUser> {
  // 1. Check signed traditional username/password session token
  const session = verifySessionToken(token);
  if (session) {
    const isOwnerSession = Boolean(
      session.isOwner ||
        session.username?.trim().toLowerCase() === DEFAULT_ADMIN_USERNAME ||
        session.email?.trim().toLowerCase() === MASTER_OWNER_EMAIL
    );

    if (!isOwnerSession && isSessionRevoked(db, session)) {
      throw new Error('Account access has been revoked');
    }

    const sessionEmail = session.email.trim().toLowerCase();
    const sessionUsername = (session.username || '').trim().toLowerCase();
    const resolvedSlot: 'manager' | 'moderator' =
      isOwnerSession || (session.accountSlot === 'manager' && session.role === 'business_admin')
        ? 'manager'
        : 'moderator';
    const resolvedRole: Role = resolvedSlot === 'manager' ? 'business_admin' : 'moderator';

    const dbUser =
      (db.prepare('SELECT * FROM users WHERE id = ?').get(session.sub) as any) ||
      (sessionUsername
        ? (db.prepare('SELECT * FROM users WHERE LOWER(username) = ?').get(sessionUsername) as any)
        : null) ||
      (db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(sessionEmail) as any);

    if (dbUser) {
      const isUserOwner = Boolean(
        isOwnerSession ||
          dbUser.username?.toLowerCase() === DEFAULT_ADMIN_USERNAME ||
          dbUser.email?.toLowerCase() === MASTER_OWNER_EMAIL
      );
      const userEmail = String(dbUser.email || sessionEmail).trim().toLowerCase();
      const now = new Date().toISOString();

      const existingMembership = db
        .prepare(
          `SELECT id, user_id, status, account_slot, role FROM business_memberships
           WHERE business_id = ? AND (user_id = ? OR LOWER(invited_email) = ?)`
        )
        .get(CLINIC_BIZ_ID, dbUser.id, userEmail) as
        | { id: string; user_id?: string | null; status: string; account_slot?: string; role?: Role }
        | undefined;

      if (existingMembership && existingMembership.status === 'inactive' && !isUserOwner) {
        throw new Error('Account has been deactivated');
      }

      if (existingMembership && (existingMembership.user_id !== dbUser.id || existingMembership.status === 'invited')) {
        db.prepare(
          "UPDATE business_memberships SET user_id = ?, status = 'active', updated_at = ? WHERE id = ?"
        ).run(dbUser.id, now, existingMembership.id);
      } else if (!existingMembership) {
        const clinicExists = db.prepare('SELECT id FROM businesses WHERE id = ?').get(CLINIC_BIZ_ID);
        if (clinicExists) {
          const targetSlot = isUserOwner ? 'manager' : resolvedSlot;
          const targetRole: Role = isUserOwner ? 'business_admin' : resolvedRole;
          db.prepare(`
            INSERT INTO business_memberships (id, business_id, user_id, invited_email, display_name, account_slot, role, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
            ON CONFLICT(business_id, invited_email) DO UPDATE SET
              user_id = excluded.user_id,
              account_slot = excluded.account_slot,
              role = excluded.role,
              status = 'active',
              updated_at = excluded.updated_at
          `).run(
            crypto.randomUUID(),
            CLINIC_BIZ_ID,
            dbUser.id,
            userEmail,
            dbUser.full_name || session.name || sessionUsername || userEmail.split('@')[0],
            targetSlot,
            targetRole,
            now,
            now
          );
        }
      }

      return {
        id: dbUser.id,
        firebaseUid: dbUser.firebase_uid || dbUser.id,
        username: dbUser.username || session.username,
        email: userEmail,
        fullName: dbUser.full_name || session.name,
        isDemoUser: false,
        isPlatformSuperAdmin: Boolean(dbUser.is_platform_super_admin || isUserOwner),
        isOwner: isUserOwner,
      };
    }

    // Reconstruct valid, non-revoked HMAC-signed session (Owner/Manager OR Moderator) if a serverless/multi-instance SQLite container cold-started.
    // Preserves session.sub and strictly honors the server-signed role/slot (moderators NEVER escalate to business_admin).
    const now = new Date().toISOString();
    const targetId = session.sub;
    const displayName = session.name || sessionUsername || sessionEmail.split('@')[0];
    const isSuper = isOwnerSession ? 1 : 0;

    try {
      db.prepare(`
        INSERT INTO users (id, firebase_uid, username, email, full_name, default_language, theme, is_platform_super_admin, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'ar', 'light', ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          username = COALESCE(excluded.username, users.username),
          email = excluded.email,
          full_name = COALESCE(NULLIF(excluded.full_name, ''), users.full_name),
          updated_at = excluded.updated_at
      `).run(
        targetId,
        `local-${targetId}`,
        sessionUsername || null,
        sessionEmail,
        displayName,
        isSuper,
        now,
        now
      );
    } catch {
      // Fallback if username/email unique constraint raced with another request
      const raced =
        (sessionUsername
          ? (db.prepare('SELECT * FROM users WHERE LOWER(username) = ?').get(sessionUsername) as any)
          : null) ||
        (db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(sessionEmail) as any);
      if (raced) {
        return {
          id: raced.id,
          firebaseUid: raced.firebase_uid || raced.id,
          username: raced.username || session.username,
          email: String(raced.email || sessionEmail).toLowerCase(),
          fullName: raced.full_name || displayName,
          isDemoUser: false,
          isPlatformSuperAdmin: Boolean(raced.is_platform_super_admin || isOwnerSession),
          isOwner: isOwnerSession,
        };
      }
    }

    const clinicExists = db.prepare('SELECT id FROM businesses WHERE id = ?').get(CLINIC_BIZ_ID);
    if (clinicExists) {
      db.prepare(`
        INSERT INTO business_memberships (id, business_id, user_id, invited_email, display_name, account_slot, role, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
        ON CONFLICT(business_id, invited_email) DO UPDATE SET
          user_id = excluded.user_id,
          account_slot = excluded.account_slot,
          role = excluded.role,
          status = 'active',
          updated_at = excluded.updated_at
      `).run(
        crypto.randomUUID(),
        CLINIC_BIZ_ID,
        targetId,
        sessionEmail,
        displayName,
        resolvedSlot,
        resolvedRole,
        now,
        now
      );
    }

    return {
      id: targetId,
      firebaseUid: `local-${targetId}`,
      username: sessionUsername || session.username,
      email: sessionEmail,
      fullName: displayName,
      isDemoUser: false,
      isPlatformSuperAdmin: isOwnerSession,
      isOwner: isOwnerSession,
    };
  }

  // 2. Fallback to injected TokenVerifier (used by automated acceptance test mocks)
  const verified = await verifier(token);
  return upsertUserFromAuth(db, verified);
}

export function createAuthMiddleware(db: SqlDb, verifier: TokenVerifier = defaultTokenVerifier) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice('Bearer '.length).trim();
      try {
        req.authUser = await resolveUserFromToken(db, token, verifier);
        return next();
      } catch {
        return res.status(401).json({ error: 'Unauthorized: Invalid or expired authentication token' });
      }
    }

    // Allow x-demo-session only in automated test environment
    if (process.env.NODE_ENV === 'test' && req.headers['x-demo-session'] === 'true') {
      req.authUser = {
        id: 'clinic-owner-manager',
        firebaseUid: 'seed-uid-clinic-owner-manager',
        username: DEFAULT_ADMIN_USERNAME,
        email: MASTER_OWNER_EMAIL,
        fullName: 'حساب المدير (المالك الرئيسي) | Manager (Owner)',
        isDemoUser: true,
        isPlatformSuperAdmin: true,
        isOwner: true,
      };
      return next();
    }

    return res.status(401).json({ error: 'Unauthorized: Authentication required' });
  };
}

export function requireBusinessAccess(db: SqlDb, allowedRoles?: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const businessId = req.params.businessId || req.body?.businessId;
    if (!businessId || !req.authUser) {
      return res.status(400).json({ error: 'Missing business context' });
    }

    const business = db.prepare('SELECT id, is_demo FROM businesses WHERE id = ?').get(businessId) as
      | { id: string; is_demo: number }
      | undefined;
    if (!business) {
      return res.status(404).json({ error: 'Business workspace not found' });
    }

    // Strict Demo vs Production isolation (for automated tests)
    if (req.authUser.isDemoUser && business.is_demo !== 1) {
      return res.status(403).json({ error: 'Forbidden: Demo session cannot access production workspaces' });
    }

    if (req.authUser.isDemoUser && business.is_demo === 1) {
      const demoRoleHeader = req.headers['x-demo-role'] as Role | undefined;
      const effectiveRole: Role =
        demoRoleHeader && ['business_admin', 'manager', 'employee'].includes(demoRoleHeader)
          ? demoRoleHeader
          : 'business_admin';
      const demoUserIdHeader = req.headers['x-demo-user-id'] as string | undefined;
      if (effectiveRole === 'employee' && demoUserIdHeader) {
        req.authUser = { ...req.authUser, id: demoUserIdHeader };
      }
      if (allowedRoles && !allowedRoles.includes(effectiveRole)) {
        return res.status(403).json({ error: 'Forbidden: Insufficient role permissions' });
      }
      req.membership = {
        id: 'demo-membership',
        business_id: businessId,
        role: effectiveRole,
        status: 'active',
        account_slot: 'manager',
      };
      return next();
    }

    const membership = db
      .prepare(
        `SELECT id, business_id, role, status, account_slot FROM business_memberships
         WHERE business_id = ? AND (user_id = ? OR LOWER(invited_email) = LOWER(?)) AND status = 'active'
         LIMIT 1`
      )
      .get(businessId, req.authUser.id, req.authUser.email || '') as
      | { id: string; business_id: string; role: Role; status: string; account_slot?: 'manager' | 'moderator' | 'accountant' }
      | undefined;

    if (!membership) {
      if ((req.authUser.isOwner || req.authUser.username === DEFAULT_ADMIN_USERNAME) && business.id === CLINIC_BIZ_ID) {
        req.membership = {
          id: 'owner-membership',
          business_id: businessId,
          role: 'business_admin',
          status: 'active',
          account_slot: 'manager',
        };
        return next();
      }
      if (req.authUser.isPlatformSuperAdmin && business.is_demo === 0) {
        return res.status(403).json({ error: 'Forbidden: You do not have access to this business workspace' });
      }
      if (business.is_demo === 1 && req.authUser.isOwner) {
        req.membership = {
          id: 'owner-demo-access',
          business_id: businessId,
          role: 'business_admin',
          status: 'active',
          account_slot: 'manager',
        };
        return next();
      }
      return res.status(403).json({ error: 'Forbidden: Cross-tenant access denied' });
    }

    if (allowedRoles && !allowedRoles.includes(membership.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions for this action' });
    }

    req.membership = membership;
    next();
  };
}

export function writeAuditLog(
  db: SqlDb,
  params: {
    businessId?: string | null;
    actorUserId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    details?: Record<string, unknown>;
    ipAddress?: string;
  }
) {
  try {
    db.prepare(`
      INSERT INTO audit_logs (id, business_id, actor_user_id, action, entity_type, entity_id, details_json, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      params.businessId || null,
      params.actorUserId || null,
      params.action,
      params.entityType,
      params.entityId || null,
      JSON.stringify(params.details || {}),
      params.ipAddress || null,
      new Date().toISOString()
    );
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

export function createRateLimiter(maxRequests = 180, windowMs = 60_000) {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || 'global';
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > maxRequests) {
      return res.status(429).json({ error: 'Too many requests. Please slow down and try again.' });
    }

    next();
  };
}
