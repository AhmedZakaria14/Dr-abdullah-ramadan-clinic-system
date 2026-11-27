import { Lead, PipelineStage } from '../types/crm';
import { apiRequest } from './api';

const STORAGE_PREFIX = 'leadflow_whatsapp_contacted_v1:';
const MAX_STORED_ENTRIES = 1000;

export interface LeadWhatsAppIdentity {
  id?: string | null;
  lead_code?: string | null;
  external_row_id?: string | null;
  phone?: string | null;
  phone_e164?: string | null;
}

interface StoredWhatsAppContact {
  id: string;
  leadCode?: string | null;
  externalRowId?: string | null;
  phone?: string | null;
  contactedAt: string;
  synced: boolean;
}

function getStorageKey(businessId: string): string {
  return `${STORAGE_PREFIX}${businessId}`;
}

function readEntries(businessId: string): StoredWhatsAppContact[] {
  if (!businessId || typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(getStorageKey(businessId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is StoredWhatsAppContact =>
        Boolean(item && typeof item === 'object' && typeof item.id === 'string' && item.id.trim().length > 0)
    );
  } catch {
    return [];
  }
}

function writeEntries(businessId: string, entries: StoredWhatsAppContact[]): void {
  if (!businessId || typeof window === 'undefined') return;
  try {
    const trimmed =
      entries.length > MAX_STORED_ENTRIES
        ? entries.slice(entries.length - MAX_STORED_ENTRIES)
        : entries;
    window.localStorage.setItem(getStorageKey(businessId), JSON.stringify(trimmed));
  } catch {
    // ignore storage quota/privacy restrictions
  }
}

function matchesIdentity(entry: StoredWhatsAppContact, target: LeadWhatsAppIdentity | string): boolean {
  if (typeof target === 'string') {
    const clean = target.trim();
    return Boolean(clean && entry.id === clean);
  }
  if (target.id && entry.id === String(target.id).trim()) return true;
  if (
    target.lead_code &&
    entry.leadCode &&
    entry.leadCode.toUpperCase() === String(target.lead_code).trim().toUpperCase()
  ) {
    return true;
  }
  if (
    target.external_row_id &&
    entry.externalRowId &&
    entry.externalRowId === String(target.external_row_id).trim()
  ) {
    return true;
  }
  return false;
}

export function findContactedStage(stages: PipelineStage[]): PipelineStage | undefined {
  return (
    stages.find((s) => s.key?.toLowerCase() === 'contacted') ||
    stages.find(
      (s) =>
        Boolean(s.name_ar && s.name_ar.includes('تم التواصل')) ||
        Boolean(s.name_en && s.name_en.toLowerCase().includes('contacted'))
    )
  );
}

export function markLeadWhatsAppContactedLocally(
  businessId: string,
  lead: LeadWhatsAppIdentity
): void {
  const id = lead.id ? String(lead.id).trim() : '';
  if (!businessId || !id) return;
  const nowIso = new Date().toISOString();
  const entries = readEntries(businessId);
  const idx = entries.findIndex((e) => matchesIdentity(e, lead));
  const nextItem: StoredWhatsAppContact = {
    id,
    leadCode: lead.lead_code ? String(lead.lead_code).trim() : null,
    externalRowId: lead.external_row_id ? String(lead.external_row_id).trim() : null,
    phone: (lead.phone_e164 || lead.phone) ? String(lead.phone_e164 || lead.phone).trim() : null,
    contactedAt: nowIso,
    synced: false,
  };
  if (idx >= 0) {
    entries[idx] = nextItem;
  } else {
    entries.push(nextItem);
  }
  writeEntries(businessId, entries);
}

export function markLeadWhatsAppSyncedLocally(
  businessId: string,
  lead: LeadWhatsAppIdentity | string
): void {
  if (!businessId) return;
  const entries = readEntries(businessId);
  let changed = false;
  for (const entry of entries) {
    if (matchesIdentity(entry, lead) && !entry.synced) {
      entry.synced = true;
      changed = true;
    }
  }
  if (changed) writeEntries(businessId, entries);
}

export function clearLeadWhatsAppContactedLocally(
  businessId: string,
  lead: LeadWhatsAppIdentity | string
): void {
  if (!businessId) return;
  const entries = readEntries(businessId);
  const filtered = entries.filter((e) => !matchesIdentity(e, lead));
  if (filtered.length !== entries.length) {
    writeEntries(businessId, filtered);
  }
}

function isPreContactedStatus(lead: Lead, contactedStage: PipelineStage): boolean {
  if (lead.status_id === contactedStage.id) return false;
  const key = (lead.status_key || '').toLowerCase();
  const nameAr = lead.status_name_ar || '';
  if (!lead.status_id || !key) return true;
  if (key === 'new' || key === 'contact_attempted') return true;
  if (nameAr.includes('جديد') || nameAr.includes('محاولة تواصل')) return true;
  return false;
}

export function applyContactedStageToLead(
  lead: Lead,
  contactedStage: PipelineStage,
  contactedAt?: string
): Lead {
  const ts = contactedAt || new Date().toISOString();
  return {
    ...lead,
    status_id: contactedStage.id,
    status_key: contactedStage.key,
    status_name_ar: contactedStage.name_ar,
    status_name_en: contactedStage.name_en,
    status_color: contactedStage.color,
    is_read: 1,
    read_at: lead.read_at || ts,
    last_contact_at: lead.last_contact_at || ts,
  };
}

export function reconcileLeadWhatsAppStatus(
  businessId: string,
  lead: Lead,
  stages: PipelineStage[]
): { lead: Lead; needsSync: boolean } {
  const contactedStage = findContactedStage(stages);
  if (!businessId || !contactedStage) return { lead, needsSync: false };

  const entries = readEntries(businessId);
  const match = entries.find((e) => matchesIdentity(e, lead));
  if (!match) return { lead, needsSync: false };

  // Server already moved this lead to Contacted (or progressed beyond it)
  if (lead.status_id === contactedStage.id) {
    if (!match.synced) markLeadWhatsAppSyncedLocally(businessId, lead);
    return { lead, needsSync: false };
  }

  if (!match.synced && isPreContactedStatus(lead, contactedStage)) {
    return {
      lead: {
        ...applyContactedStageToLead(lead, contactedStage, match.contactedAt),
        is_read: lead.is_read,
        read_at: lead.read_at,
      },
      needsSync: true,
    };
  }

  // Server has moved lead to a later stage manually (e.g. interested/qualified/converted/lost); honor server
  clearLeadWhatsAppContactedLocally(businessId, lead);
  return { lead, needsSync: false };
}

export function reconcileLeadsWhatsAppStatus(
  businessId: string,
  leads: Lead[],
  stages: PipelineStage[]
): { leads: Lead[]; unsyncedLeads: Lead[] } {
  const contactedStage = findContactedStage(stages);
  if (!businessId || !contactedStage || leads.length === 0) {
    return { leads, unsyncedLeads: [] };
  }
  const entries = readEntries(businessId);
  if (entries.length === 0) {
    return { leads, unsyncedLeads: [] };
  }

  const unsyncedLeads: Lead[] = [];
  const merged = leads.map((lead) => {
    const { lead: nextLead, needsSync } = reconcileLeadWhatsAppStatus(businessId, lead, stages);
    if (needsSync) unsyncedLeads.push(nextLead);
    return nextLead;
  });

  return { leads: merged, unsyncedLeads };
}

const inflightByLeadKey = new Map<string, Promise<{ lead?: Lead; statusChanged?: boolean } | null>>();

export function sendWhatsAppContactRequest(
  businessId: string,
  lead: LeadWhatsAppIdentity
): Promise<{ lead?: Lead; statusChanged?: boolean } | null> {
  const targetId = lead.id ? String(lead.id).trim() : '';
  if (!businessId || !targetId) return Promise.resolve(null);

  const dedupeKey = `${businessId}:${targetId}`;
  const existingPromise = inflightByLeadKey.get(dedupeKey);
  if (existingPromise) return existingPromise;

  const promise = apiRequest<{ lead?: Lead; statusChanged?: boolean }>(
    `/businesses/${businessId}/leads/${encodeURIComponent(targetId)}/whatsapp-contact`,
    {
      method: 'POST',
      keepalive: true,
      body: JSON.stringify({
        leadCode: lead.lead_code || undefined,
        externalRowId: lead.external_row_id || undefined,
        phone: lead.phone_e164 || lead.phone || undefined,
      }),
    }
  )
    .then((res) => {
      markLeadWhatsAppSyncedLocally(businessId, res?.lead || lead);
      return res;
    })
    .catch(() => null)
    .finally(() => {
      inflightByLeadKey.delete(dedupeKey);
    });

  inflightByLeadKey.set(dedupeKey, promise);
  return promise;
}

export async function flushPendingWhatsAppContacts(businessId: string): Promise<boolean> {
  if (!businessId) return false;
  const pending = readEntries(businessId).filter((e) => !e.synced);
  if (pending.length === 0) return false;

  let anySynced = false;
  for (const item of pending.slice(0, 10)) {
    const res = await sendWhatsAppContactRequest(businessId, {
      id: item.id,
      lead_code: item.leadCode,
      external_row_id: item.externalRowId,
      phone: item.phone,
    });
    if (res?.lead) anySynced = true;
  }
  return anySynced;
}
