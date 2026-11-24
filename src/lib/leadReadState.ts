import { Lead } from '../types/crm';

const STORAGE_PREFIX = 'leadflow_opened_leads_v1:';
const MAX_STORED_KEYS = 2000;

export interface LeadReadIdentity {
  id?: string | null;
  lead_code?: string | null;
  external_row_id?: string | null;
}

function getStorageKey(businessId: string): string {
  return `${STORAGE_PREFIX}${businessId}`;
}

function extractKeys(leadOrId: LeadReadIdentity | string | null | undefined): string[] {
  if (!leadOrId) return [];
  if (typeof leadOrId === 'string') {
    const trimmed = leadOrId.trim();
    return trimmed ? [`id:${trimmed}`] : [];
  }
  const keys: string[] = [];
  if (leadOrId.id && String(leadOrId.id).trim()) {
    keys.push(`id:${String(leadOrId.id).trim()}`);
  }
  if (leadOrId.lead_code && String(leadOrId.lead_code).trim()) {
    keys.push(`code:${String(leadOrId.lead_code).trim().toUpperCase()}`);
  }
  if (leadOrId.external_row_id && String(leadOrId.external_row_id).trim()) {
    keys.push(`ext:${String(leadOrId.external_row_id).trim()}`);
  }
  return keys;
}

function readSet(businessId: string): Set<string> {
  if (!businessId || typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(getStorageKey(businessId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === 'string' && v.length > 0));
  } catch {
    return new Set();
  }
}

function writeSet(businessId: string, set: Set<string>): void {
  if (!businessId || typeof window === 'undefined') return;
  try {
    const arr = Array.from(set);
    const trimmed = arr.length > MAX_STORED_KEYS ? arr.slice(arr.length - MAX_STORED_KEYS) : arr;
    window.localStorage.setItem(getStorageKey(businessId), JSON.stringify(trimmed));
  } catch {
    // Ignore quota or storage restrictions
  }
}

export function markLeadReadLocally(
  businessId: string,
  leadOrId: LeadReadIdentity | string | null | undefined
): void {
  if (!businessId) return;
  const keys = extractKeys(leadOrId);
  if (keys.length === 0) return;
  const set = readSet(businessId);
  let changed = false;
  for (const k of keys) {
    if (!set.has(k)) {
      set.add(k);
      changed = true;
    }
  }
  if (changed) writeSet(businessId, set);
}

export function markLeadUnreadLocally(
  businessId: string,
  leadOrId: LeadReadIdentity | string | null | undefined
): void {
  if (!businessId) return;
  const keys = extractKeys(leadOrId);
  if (keys.length === 0) return;
  const set = readSet(businessId);
  let changed = false;
  for (const k of keys) {
    if (set.delete(k)) changed = true;
  }
  if (changed) writeSet(businessId, set);
}

export function markLeadsReadLocally(businessId: string, leads: LeadReadIdentity[]): void {
  if (!businessId || leads.length === 0) return;
  const set = readSet(businessId);
  let changed = false;
  for (const lead of leads) {
    for (const k of extractKeys(lead)) {
      if (!set.has(k)) {
        set.add(k);
        changed = true;
      }
    }
  }
  if (changed) writeSet(businessId, set);
}

export function markLeadsUnreadLocally(businessId: string, leads: LeadReadIdentity[]): void {
  if (!businessId || leads.length === 0) return;
  const set = readSet(businessId);
  let changed = false;
  for (const lead of leads) {
    for (const k of extractKeys(lead)) {
      if (set.delete(k)) changed = true;
    }
  }
  if (changed) writeSet(businessId, set);
}

export function isLeadMarkedReadLocally(businessId: string, lead: LeadReadIdentity | null | undefined): boolean {
  if (!businessId || !lead) return false;
  const set = readSet(businessId);
  if (set.size === 0) return false;
  return extractKeys(lead).some((k) => set.has(k));
}

export function reconcileLeadsReadState(
  businessId: string,
  leads: Lead[]
): { leads: Lead[]; unsyncedIds: string[]; reconciledCount: number } {
  if (!businessId || leads.length === 0) {
    return { leads, unsyncedIds: [], reconciledCount: 0 };
  }
  const set = readSet(businessId);
  if (set.size === 0) {
    return { leads, unsyncedIds: [], reconciledCount: 0 };
  }

  const unsyncedIds: string[] = [];
  let reconciledCount = 0;
  const nowIso = new Date().toISOString();

  const merged = leads.map((lead) => {
    if (lead.is_read) return lead;
    const matched = extractKeys(lead).some((k) => set.has(k));
    if (!matched) return lead;
    unsyncedIds.push(lead.id);
    reconciledCount += 1;
    return {
      ...lead,
      is_read: 1,
      read_at: lead.read_at || nowIso,
    };
  });

  return { leads: merged, unsyncedIds, reconciledCount };
}
