import type { Response } from 'express';
import crypto from 'node:crypto';
import type { SqlDb } from '../db.ts';
import { DEFAULT_ADMIN_USERNAME, MASTER_OWNER_EMAIL } from '../auth.ts';

export interface SseClientMeta {
  userId?: string | null;
  isAdmin?: boolean;
}

interface SseClientEntry {
  res: Response;
  userId: string | null;
  isAdmin: boolean;
}

export interface LivePresenceRecord {
  businessId: string;
  userId: string;
  online: boolean;
  activeTab: string;
  activeLeadId: string | null;
  activeLeadName: string | null;
  activeLeadCode: string | null;
  lastActionType: string | null;
  lastActionAr: string | null;
  lastActionEn: string | null;
  lastSeenAt: string;
  updatedAt: string;
}

export interface LiveActivityEvent {
  id: string;
  businessId: string;
  actorUserId: string;
  actorName: string;
  actorUsername?: string | null;
  activityType: string;
  descriptionAr: string;
  descriptionEn: string;
  leadId?: string | null;
  leadCode?: string | null;
  leadName?: string | null;
  createdAt: string;
}

const ALLOWED_TABS = new Set([
  'dashboard',
  'leads',
  'pipeline',
  'followups',
  'campaigns',
  'team',
  'integrations',
  'settings',
]);

// SSE Subscriber Registry per workspace (with role scoping for Admin-only monitoring events)
const sseClients = new Map<string, Set<SseClientEntry>>();
const sseClientByRes = new WeakMap<Response, SseClientEntry>();
// Active SSE connection counts per (businessId -> userId -> count)
const onlineConnectionCounts = new Map<string, Map<string, number>>();
// In-memory live presence cache per (businessId -> userId -> LivePresenceRecord)
const livePresenceCache = new Map<string, Map<string, LivePresenceRecord>>();

function getOnlineMap(businessId: string): Map<string, number> {
  let map = onlineConnectionCounts.get(businessId);
  if (!map) {
    map = new Map();
    onlineConnectionCounts.set(businessId, map);
  }
  return map;
}

function getPresenceMap(businessId: string): Map<string, LivePresenceRecord> {
  let map = livePresenceCache.get(businessId);
  if (!map) {
    map = new Map();
    livePresenceCache.set(businessId, map);
  }
  return map;
}

export function isUserOnlineInWorkspace(businessId: string, userId?: string | null): boolean {
  if (!businessId || !userId) return false;
  const count = onlineConnectionCounts.get(businessId)?.get(userId) || 0;
  if (count > 0) return true;
  // Also consider user online if they sent a presence heartbeat within the last 45 seconds
  const cached = livePresenceCache.get(businessId)?.get(userId);
  if (cached?.lastSeenAt) {
    const ageMs = Date.now() - Date.parse(cached.lastSeenAt);
    if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= 45_000) {
      return true;
    }
  }
  return false;
}

export function addSseClient(businessId: string, res: Response, meta?: SseClientMeta) {
  let set = sseClients.get(businessId);
  if (!set) {
    set = new Set();
    sseClients.set(businessId, set);
  }
  const entry: SseClientEntry = {
    res,
    userId: meta?.userId?.trim() || null,
    isAdmin: Boolean(meta?.isAdmin),
  };
  set.add(entry);
  sseClientByRes.set(res, entry);

  if (entry.userId) {
    const counts = getOnlineMap(businessId);
    const prev = counts.get(entry.userId) || 0;
    counts.set(entry.userId, prev + 1);

    const pMap = getPresenceMap(businessId);
    const nowIso = new Date().toISOString();
    const existing = pMap.get(entry.userId);
    const nextRecord: LivePresenceRecord = {
      businessId,
      userId: entry.userId,
      online: true,
      activeTab: existing?.activeTab || 'leads',
      activeLeadId: existing?.activeLeadId || null,
      activeLeadName: existing?.activeLeadName || null,
      activeLeadCode: existing?.activeLeadCode || null,
      lastActionType: existing?.lastActionType || 'connected',
      lastActionAr: existing?.lastActionAr || 'متصل بالنظام الآن',
      lastActionEn: existing?.lastActionEn || 'Connected to CRM now',
      lastSeenAt: nowIso,
      updatedAt: nowIso,
    };
    pMap.set(entry.userId, nextRecord);

    if (!entry.isAdmin) {
      broadcastToWorkspaceAdmins(businessId, 'presence_updated', {
        businessId,
        presence: nextRecord,
      });
    }
  }
}

export function removeSseClient(businessId: string, res: Response) {
  const set = sseClients.get(businessId);
  const entry = sseClientByRes.get(res);
  if (set && entry) {
    set.delete(entry);
    if (set.size === 0) {
      sseClients.delete(businessId);
    }
  }
  if (entry?.userId) {
    const counts = onlineConnectionCounts.get(businessId);
    if (counts) {
      const next = Math.max(0, (counts.get(entry.userId) || 1) - 1);
      if (next === 0) {
        counts.delete(entry.userId);
        const pMap = livePresenceCache.get(businessId);
        const existing = pMap?.get(entry.userId);
        const nowIso = new Date().toISOString();
        const offlineRecord: LivePresenceRecord = {
          businessId,
          userId: entry.userId,
          online: false,
          activeTab: existing?.activeTab || 'leads',
          activeLeadId: existing?.activeLeadId || null,
          activeLeadName: existing?.activeLeadName || null,
          activeLeadCode: existing?.activeLeadCode || null,
          lastActionType: existing?.lastActionType || 'disconnected',
          lastActionAr: existing?.lastActionAr || 'غادر الجلسة',
          lastActionEn: existing?.lastActionEn || 'Session disconnected',
          lastSeenAt: nowIso,
          updatedAt: nowIso,
        };
        pMap?.set(entry.userId, offlineRecord);
        if (!entry.isAdmin) {
          broadcastToWorkspaceAdmins(businessId, 'presence_updated', {
            businessId,
            presence: offlineRecord,
          });
        }
      } else {
        counts.set(entry.userId, next);
      }
    }
  }
}

export function broadcastWorkspaceEvent(businessId: string, event: string, data: Record<string, unknown>) {
  const set = sseClients.get(businessId);
  if (!set || set.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const entry of set) {
    try {
      entry.res.write(payload);
    } catch {
      set.delete(entry);
    }
  }
}

// Strictly admin-only SSE broadcast: lower-privilege roles (moderator/employee/manager) NEVER receive monitoring events
export function broadcastToWorkspaceAdmins(businessId: string, event: string, data: Record<string, unknown>) {
  const set = sseClients.get(businessId);
  if (!set || set.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const entry of set) {
    if (!entry.isAdmin) continue;
    try {
      entry.res.write(payload);
    } catch {
      set.delete(entry);
    }
  }
}

function sanitizeShortText(raw: unknown, maxLen: number): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().replace(/\s+/g, ' ');
  if (!cleaned) return null;
  return cleaned.slice(0, maxLen);
}

export function updateUserPresence(
  db: SqlDb,
  businessId: string,
  userId: string,
  patch: {
    activeTab?: string | null;
    activeLeadId?: string | null;
    activeLeadName?: string | null;
    activeLeadCode?: string | null;
    lastActionType?: string | null;
    lastActionAr?: string | null;
    lastActionEn?: string | null;
    broadcastToAdmins?: boolean;
  }
): LivePresenceRecord {
  const nowIso = new Date().toISOString();
  const pMap = getPresenceMap(businessId);
  const cached = pMap.get(userId);

  let dbRow: any = null;
  try {
    dbRow = db
      .prepare('SELECT * FROM user_presence WHERE business_id = ? AND user_id = ?')
      .get(businessId, userId);
  } catch {
    dbRow = null;
  }

  const rawTab = typeof patch.activeTab === 'string' ? patch.activeTab.trim().toLowerCase() : '';
  const safeTab = ALLOWED_TABS.has(rawTab)
    ? rawTab
    : cached?.activeTab || dbRow?.active_tab || 'leads';

  const nextLeadId =
    patch.activeLeadId !== undefined
      ? sanitizeShortText(patch.activeLeadId, 120)
      : cached?.activeLeadId ?? dbRow?.active_lead_id ?? null;
  const nextLeadName =
    patch.activeLeadName !== undefined
      ? sanitizeShortText(patch.activeLeadName, 160)
      : patch.activeLeadId === null
        ? null
        : cached?.activeLeadName ?? dbRow?.active_lead_name ?? null;
  const nextLeadCode =
    patch.activeLeadCode !== undefined
      ? sanitizeShortText(patch.activeLeadCode, 40)
      : patch.activeLeadId === null
        ? null
        : cached?.activeLeadCode ?? dbRow?.active_lead_code ?? null;

  const nextActionType =
    patch.lastActionType !== undefined
      ? sanitizeShortText(patch.lastActionType, 60)
      : cached?.lastActionType ?? dbRow?.last_action_type ?? null;
  const nextActionAr =
    patch.lastActionAr !== undefined
      ? sanitizeShortText(patch.lastActionAr, 240)
      : cached?.lastActionAr ?? dbRow?.last_action_ar ?? null;
  const nextActionEn =
    patch.lastActionEn !== undefined
      ? sanitizeShortText(patch.lastActionEn, 240)
      : cached?.lastActionEn ?? dbRow?.last_action_en ?? null;

  try {
    db.prepare(`
      INSERT INTO user_presence (
        business_id, user_id, active_tab, active_lead_id, active_lead_name, active_lead_code,
        last_action_type, last_action_ar, last_action_en, last_seen_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(business_id, user_id) DO UPDATE SET
        active_tab = excluded.active_tab,
        active_lead_id = excluded.active_lead_id,
        active_lead_name = excluded.active_lead_name,
        active_lead_code = excluded.active_lead_code,
        last_action_type = COALESCE(excluded.last_action_type, user_presence.last_action_type),
        last_action_ar = COALESCE(excluded.last_action_ar, user_presence.last_action_ar),
        last_action_en = COALESCE(excluded.last_action_en, user_presence.last_action_en),
        last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at
    `).run(
      businessId,
      userId,
      safeTab,
      nextLeadId,
      nextLeadName,
      nextLeadCode,
      nextActionType,
      nextActionAr,
      nextActionEn,
      nowIso,
      nowIso
    );
  } catch {
    // Ignore foreign key errors for ephemeral/missing user rows
  }

  const record: LivePresenceRecord = {
    businessId,
    userId,
    online: true,
    activeTab: safeTab,
    activeLeadId: nextLeadId,
    activeLeadName: nextLeadName,
    activeLeadCode: nextLeadCode,
    lastActionType: nextActionType,
    lastActionAr: nextActionAr,
    lastActionEn: nextActionEn,
    lastSeenAt: nowIso,
    updatedAt: nowIso,
  };
  pMap.set(userId, record);

  if (patch.broadcastToAdmins !== false) {
    broadcastToWorkspaceAdmins(businessId, 'presence_updated', {
      businessId,
      presence: record,
    });
  }

  return record;
}

export function recordMemberLiveAction(
  db: SqlDb,
  params: {
    businessId: string;
    actorUserId?: string | null;
    actorName?: string | null;
    actorUsername?: string | null;
    isActorOwnerOrAdmin?: boolean;
    activityType: string;
    descriptionAr: string;
    descriptionEn: string;
    leadId?: string | null;
    leadCode?: string | null;
    leadName?: string | null;
    activeTab?: string | null;
  }
) {
  const userId = params.actorUserId?.trim();
  if (!userId || params.isActorOwnerOrAdmin) return;

  const nowIso = new Date().toISOString();
  updateUserPresence(db, params.businessId, userId, {
    activeTab: params.activeTab || (params.leadId ? 'leads' : undefined),
    activeLeadId: params.leadId !== undefined ? params.leadId : undefined,
    activeLeadName: params.leadName !== undefined ? params.leadName : undefined,
    activeLeadCode: params.leadCode !== undefined ? params.leadCode : undefined,
    lastActionType: params.activityType,
    lastActionAr: params.descriptionAr,
    lastActionEn: params.descriptionEn,
    broadcastToAdmins: true,
  });

  const eventPayload: LiveActivityEvent = {
    id: crypto.randomUUID(),
    businessId: params.businessId,
    actorUserId: userId,
    actorName: params.actorName || params.actorUsername || 'Staff',
    actorUsername: params.actorUsername || null,
    activityType: params.activityType,
    descriptionAr: params.descriptionAr,
    descriptionEn: params.descriptionEn,
    leadId: params.leadId || null,
    leadCode: params.leadCode || null,
    leadName: params.leadName || null,
    createdAt: nowIso,
  };

  broadcastToWorkspaceAdmins(params.businessId, 'member_activity', {
    businessId: params.businessId,
    activity: eventPayload,
  });
}

export function getMonitoredAccountsSnapshot(db: SqlDb, businessId: string) {
  const members = db
    .prepare(`
      SELECT bm.id as membership_id,
             bm.user_id,
             bm.invited_email,
             bm.display_name,
             bm.account_slot,
             bm.role,
             bm.status,
             u.full_name,
             u.username,
             u.email as user_email
      FROM business_memberships bm
      LEFT JOIN users u ON u.id = bm.user_id
      WHERE bm.business_id = ?
        AND bm.status != 'inactive'
      ORDER BY bm.created_at ASC
    `)
    .all(businessId) as Array<any>;

  let presenceRows: any[] = [];
  try {
    presenceRows = db
      .prepare('SELECT * FROM user_presence WHERE business_id = ?')
      .all(businessId) as any[];
  } catch {
    presenceRows = [];
  }
  const dbPresenceByUser = new Map<string, any>();
  for (const row of presenceRows) {
    dbPresenceByUser.set(row.user_id, row);
  }

  const todayPrefix = new Date().toISOString().slice(0, 10);

  return members
    .filter((m) => {
      const emailLower = String(m.user_email || m.invited_email || '').toLowerCase();
      const unameLower = String(m.username || '').toLowerCase();
      const isOwner =
        m.user_id === 'clinic-owner-manager' ||
        unameLower === DEFAULT_ADMIN_USERNAME ||
        emailLower === MASTER_OWNER_EMAIL;
      // Only lower-privilege accounts (non-owner / moderator / employee / manager)
      const isLowerPrivilege =
        !isOwner &&
        (m.role === 'moderator' ||
          m.role === 'employee' ||
          m.role === 'manager' ||
          m.account_slot === 'moderator');
      return isLowerPrivilege && Boolean(m.user_id);
    })
    .map((m) => {
      const uid = String(m.user_id);
      const cached = livePresenceCache.get(businessId)?.get(uid);
      const dbP = dbPresenceByUser.get(uid);
      const online = isUserOnlineInWorkspace(businessId, uid);

      const todayActionsRow = db
        .prepare(
          `SELECT COUNT(*) as cnt FROM lead_activities WHERE business_id = ? AND actor_user_id = ? AND created_at LIKE ?`
        )
        .get(businessId, uid, `${todayPrefix}%`) as { cnt: number };

      return {
        membershipId: m.membership_id,
        userId: uid,
        fullName: m.full_name || m.display_name || m.username || m.invited_email,
        username: m.username || String(m.invited_email || '').split('@')[0],
        email: m.user_email || m.invited_email,
        role: m.role,
        accountSlot: m.account_slot || (m.role === 'moderator' ? 'moderator' : 'manager'),
        status: m.status,
        online,
        activeTab: cached?.activeTab || dbP?.active_tab || 'leads',
        activeLeadId: cached?.activeLeadId ?? dbP?.active_lead_id ?? null,
        activeLeadName: cached?.activeLeadName ?? dbP?.active_lead_name ?? null,
        activeLeadCode: cached?.activeLeadCode ?? dbP?.active_lead_code ?? null,
        lastActionType: cached?.lastActionType ?? dbP?.last_action_type ?? null,
        lastActionAr: cached?.lastActionAr ?? dbP?.last_action_ar ?? null,
        lastActionEn: cached?.lastActionEn ?? dbP?.last_action_en ?? null,
        lastSeenAt: cached?.lastSeenAt ?? dbP?.last_seen_at ?? null,
        todayActionsCount: todayActionsRow?.cnt || 0,
      };
    });
}
