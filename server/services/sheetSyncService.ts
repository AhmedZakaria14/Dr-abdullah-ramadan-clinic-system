import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { SqlDb, deterministicSheetLeadId, normalizePhoneE164 } from '../db.ts';
import { addSseClient, removeSseClient, broadcastWorkspaceEvent } from './realtimeService.ts';
import { createAndBroadcastNotification } from './notificationService.ts';

export { addSseClient, removeSseClient, broadcastWorkspaceEvent };

export const CLINIC_WORKSPACE_ID = 'dr-abdullah-ramadan-dental';
export const ALSAFA_WORKSPACE_ID = CLINIC_WORKSPACE_ID;
export const ATTACHED_SHEET_PATH = '';

export interface SheetSourceConfig {
  id: string;
  name: string;
  spreadsheetId: string;
  sheetUrl: string;
  publicCsvUrl: string;
  sheetTitle?: string | null;
  enabled?: boolean;
}

export interface PerSheetRuntimeStatus {
  id: string;
  name: string;
  spreadsheetId: string;
  sheetUrl: string;
  publicCsvUrl: string;
  status: 'connected' | 'error' | 'pending_config' | 'syncing';
  lastSyncAt: string | null;
  lastError: string | null;
  lastErrorStatus: number | null;
  rowCount: number;
  createdCount: number;
  updatedCount: number;
  deletedCount: number;
  syncDurationMs: number | null;
}

export const CLINIC_DEFAULT_SHEETS: SheetSourceConfig[] = [
  {
    id: 'clinic-sheet-1',
    name: 'شيت عملاء العيادة (1)',
    spreadsheetId: '1uDqBXt-WoBeyWCRvLqbMoWMTM-AIlyH7oCH0EB4ukk4',
    sheetUrl:
      'https://docs.google.com/spreadsheets/d/1uDqBXt-WoBeyWCRvLqbMoWMTM-AIlyH7oCH0EB4ukk4/edit?usp=drivesdk',
    publicCsvUrl:
      'https://docs.google.com/spreadsheets/d/1uDqBXt-WoBeyWCRvLqbMoWMTM-AIlyH7oCH0EB4ukk4/export?format=csv&gid=0',
    enabled: true,
  },
  {
    id: 'clinic-sheet-2',
    name: 'شيت عملاء العيادة (2)',
    spreadsheetId: '1rhg45WzL_43mU3JyrkAZb1-HZC6QBUww5HHsQiIhiIA',
    sheetUrl:
      'https://docs.google.com/spreadsheets/d/1rhg45WzL_43mU3JyrkAZb1-HZC6QBUww5HHsQiIhiIA/edit?usp=drivesdk',
    publicCsvUrl:
      'https://docs.google.com/spreadsheets/d/1rhg45WzL_43mU3JyrkAZb1-HZC6QBUww5HHsQiIhiIA/export?format=csv&gid=0',
    enabled: true,
  },
];

/**
 * RFC-4180 compliant UTF-8 CSV parser handling multiline quoted fields,
 * escaped quotes (""), and CRLF/LF line endings across all rows without row limits.
 */
export function parseCsvRows(rawContent: string): string[][] {
  const content = rawContent.replace(/^\uFEFF/, '');
  const firstLineEnd = content.indexOf('\n');
  const firstLine = firstLineEnd >= 0 ? content.slice(0, firstLineEnd) : content;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const delimiter = tabCount > commaCount ? '\t' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];

    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\r') {
      if (content[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

export function normalizeArabicDigits(input: string): string {
  return input
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

export function cleanSheetPhone(
  rawPhone?: string | null,
  whatsappFallback?: string | null,
  defaultCountryCode = '+20'
): { displayPhone: string | null; phoneE164: string | null; whatsappClean: string | null } {
  const cleanCandidate = (val?: string | null) => {
    if (!val) return '';
    let s = normalizeArabicDigits(String(val)).trim();
    if (!s || s.includes('<test lead:')) return '';
    s = s.replace(/^p:\s*/i, '').trim();
    return s;
  };

  const primary = cleanCandidate(rawPhone);
  const waRaw = cleanCandidate(whatsappFallback);
  const waDigits = waRaw.replace(/\D/g, '');
  const chosen = primary || (waDigits.length >= 8 ? waRaw : '');

  if (!chosen) {
    return { displayPhone: null, phoneE164: null, whatsappClean: waRaw || null };
  }

  const e164 = normalizePhoneE164(chosen, defaultCountryCode);
  return {
    displayPhone: e164 || chosen,
    phoneE164: e164 || null,
    whatsappClean: waRaw || null,
  };
}

export function formatProductSelection(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed || trimmed.includes('<test lead:')) return null;
  return trimmed
    .split('|')
    .map((part) => part.replace(/_/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' · ');
}

function resolveSheetStatusId(
  rawStatus: string | undefined,
  stages: Array<{ id: string; key: string; name_ar: string; name_en: string; is_default: number }>
): string | null {
  const byKey = new Map(stages.map((s) => [s.key.toLowerCase(), s.id]));
  const normalized = (rawStatus || '').trim().toUpperCase();

  if (normalized === 'CREATED' || normalized === 'NEW') return byKey.get('new') || null;
  if (normalized === 'CONTACT_ATTEMPTED' || normalized === 'ATTEMPTED') return byKey.get('contact_attempted') || null;
  if (normalized === 'CONTACTED') return byKey.get('contacted') || null;
  if (normalized === 'INTERESTED') return byKey.get('interested') || null;
  if (normalized === 'FOLLOW_UP' || normalized === 'FOLLOW_UP_REQUIRED') return byKey.get('follow_up_required') || null;
  if (normalized === 'QUALIFIED') return byKey.get('qualified') || null;
  if (normalized === 'CONVERTED' || normalized === 'WON' || normalized === 'CLOSED_WON') {
    return byKey.get('converted') || null;
  }
  if (normalized === 'LOST' || normalized === 'BAD' || normalized === 'DISQUALIFIED') {
    return byKey.get('lost') || null;
  }

  if (normalized) {
    const lower = normalized.toLowerCase();
    const matched = stages.find(
      (s) =>
        s.key.toLowerCase() === lower ||
        s.name_en.toLowerCase() === lower ||
        s.name_ar.trim() === (rawStatus || '').trim()
    );
    if (matched) return matched.id;
  }

  return stages.find((s) => s.is_default === 1)?.id || stages[0]?.id || null;
}

function mapSourceFromPlatform(platform?: string | null): string {
  const p = (platform || '').trim().toLowerCase();
  if (p === 'ig' || p === 'instagram') return 'instagram_lead_ads';
  if (p === 'fb' || p === 'facebook') return 'facebook_lead_ads';
  if (p === 'an') return 'meta_lead_ads';
  return 'google_sheets';
}

/**
 * Parses `created_time` from Google Sheets (supporting ISO-8601 with timezone offsets,
 * date-only strings like `2026-11-14` or `2026/11/14`, local space-separated datetimes,
 * DD/MM/YYYY with optional AM/PM or ص/م, Google Sheets serial numbers, and Arabic numerals)
 * into a normalized UTC ISO-8601 timestamp for accurate sorting.
 */
export function parseSheetTimestamp(raw?: string | null, defaultOffset = '+02:00'): string {
  if (!raw) return new Date().toISOString();
  const cleaned = normalizeArabicDigits(String(raw)).trim();
  if (!cleaned) return new Date().toISOString();

  // 0. Google Sheets numeric serial date (days since 1899-12-30, e.g., 45000 - 60000)
  if (/^\d{5}(?:\.\d+)?$/.test(cleaned)) {
    const serial = Number(cleaned);
    if (serial >= 35000 && serial <= 70000) {
      const utcMs = Math.round((serial - 25569) * 86400 * 1000);
      const serialDate = new Date(utcMs);
      if (!Number.isNaN(serialDate.getTime())) {
        return serialDate.toISOString();
      }
    }
  }

  // 1. Date-only YYYY-MM-DD or YYYY/MM/DD (e.g. "2026-11-14")
  const ymdOnly = cleaned.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (ymdOnly) {
    const yyyy = ymdOnly[1];
    const mm = ymdOnly[2].padStart(2, '0');
    const dd = ymdOnly[3].padStart(2, '0');
    const parsedDateOnly = new Date(`${yyyy}-${mm}-${dd}T08:00:00${defaultOffset}`);
    if (!Number.isNaN(parsedDateOnly.getTime())) {
      return parsedDateOnly.toISOString();
    }
  }

  // 2. ISO or space-separated YYYY[-/]MM[-/]DD[T ]HH:mm(:ss)? with optional AM/PM or ص/م and no explicit timezone offset
  const noTzIsoMatch = cleaned.match(
    /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})[T\s]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:\s*(AM|PM|am|pm|ص|م))?$/
  );
  if (noTzIsoMatch) {
    const yyyy = noTzIsoMatch[1];
    const mo = noTzIsoMatch[2].padStart(2, '0');
    const dd = noTzIsoMatch[3].padStart(2, '0');
    let hhNum = Number(noTzIsoMatch[4]);
    const mi = noTzIsoMatch[5].padStart(2, '0');
    const ss = (noTzIsoMatch[6] || '00').padStart(2, '0');
    const mer = (noTzIsoMatch[7] || '').toUpperCase();
    if ((mer === 'PM' || mer === 'م') && hhNum < 12) hhNum += 12;
    if ((mer === 'AM' || mer === 'ص') && hhNum === 12) hhNum = 0;
    const hh = String(hhNum).padStart(2, '0');
    const withOffset = new Date(`${yyyy}-${mo}-${dd}T${hh}:${mi}:${ss}${defaultOffset}`);
    if (!Number.isNaN(withOffset.getTime())) {
      return withOffset.toISOString();
    }
  }

  // 3. DD/MM/YYYY or D/M/YYYY with optional time and optional AM/PM or ص/م
  const dmyMatch = cleaned.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[T\s,]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM|am|pm|ص|م))?)?$/
  );
  if (dmyMatch) {
    const p1 = Number(dmyMatch[1]);
    const p2 = Number(dmyMatch[2]);
    const year = dmyMatch[3];
    // In Egypt/Arab world DD/MM/YYYY is standard unless 2nd part > 12
    const day = String(p2 > 12 ? p2 : p1).padStart(2, '0');
    const month = String(p2 > 12 ? p1 : p2).padStart(2, '0');
    let hhNum = Number(dmyMatch[4] ?? 8);
    const mm = String(dmyMatch[5] ?? '00').padStart(2, '0');
    const ss = String(dmyMatch[6] ?? '00').padStart(2, '0');
    const mer = (dmyMatch[7] || '').toUpperCase();
    if ((mer === 'PM' || mer === 'م') && hhNum < 12) hhNum += 12;
    if ((mer === 'AM' || mer === 'ص') && hhNum === 12) hhNum = 0;
    const hh = String(hhNum).padStart(2, '0');
    const dmyDate = new Date(`${year}-${month}-${day}T${hh}:${mm}:${ss}${defaultOffset}`);
    if (!Number.isNaN(dmyDate.getTime())) {
      return dmyDate.toISOString();
    }
  }

  // 4. Standard ISO-8601 with timezone offset (e.g., 2026-11-14T07:40:00+02:00 or 2026-11-14T18:58:07-05:00)
  const direct = new Date(cleaned);
  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString();
  }

  return new Date().toISOString();
}

function formatNotificationLeadTime(isoTimestamp: string, locale: 'ar' | 'en'): string {
  try {
    const dt = new Date(isoTimestamp);
    if (Number.isNaN(dt.getTime())) return isoTimestamp;
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      calendar: 'gregory',
      numberingSystem: 'latn',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).formatToParts(dt);

    const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
    const yyyy = get('year');
    const mm = get('month');
    const dd = get('day');
    const hh = get('hour');
    const min = get('minute');
    const rawPeriod = get('dayPeriod').toLowerCase();
    const isPm = rawPeriod.includes('p') || rawPeriod.includes('م');
    const periodLabel = locale === 'ar' ? (isPm ? 'م' : 'ص') : isPm ? 'PM' : 'AM';

    return `${yyyy}-${mm}-${dd} · ${hh}:${min} ${periodLabel}`;
  } catch {
    return isoTimestamp;
  }
}

export interface NewSheetLeadSummary {
  id: string;
  sheetLeadId: string;
  leadCode: string;
  fullName: string;
  phone: string | null;
  createdAt: string;
  interestedService: string | null;
  sheetRowNumber: number;
}

export interface SheetSyncResult {
  processedCount: number;
  createdCount: number;
  updatedCount: number;
  deletedCount: number;
  skippedCount: number;
  totalLeadsInBusiness: number;
  syncedAt: string;
  syncDurationMs: number;
  sourceMode: string;
  newLeads: NewSheetLeadSummary[];
  createdNotifications: any[];
  sheetResults?: PerSheetRuntimeStatus[];
}

export function syncSheetRowsToWorkspace(
  db: SqlDb,
  params: {
    businessId: string;
    rows: string[][];
    sourceLabel?: string;
    sourceSheetId?: string | null;
    sourceSheetName?: string | null;
    conflictPolicy?: 'sheet_wins' | 'crm_wins' | 'newest_wins';
    columnMapping?: Record<string, string>;
    actorUserId?: string | null;
    recordSyncLog?: boolean;
    emitNotificationOnChanges?: boolean;
    integrationProvider?: 'google_sheets' | 'meta';
    syncDurationMs?: number;
    reconcileMissingSheetRows?: boolean;
  }
): SheetSyncResult {
  const {
    businessId,
    rows,
    sourceLabel = 'attached_sheet',
    sourceSheetId = null,
    sourceSheetName = null,
    conflictPolicy = 'sheet_wins',
    columnMapping = {},
    actorUserId = null,
    recordSyncLog = true,
    emitNotificationOnChanges = true,
    integrationProvider = 'google_sheets',
    reconcileMissingSheetRows = false,
  } = params;

  const startMs = Date.now();
  const startedAt = new Date().toISOString();
  const biz = db
    .prepare('SELECT id, default_country_code, timezone, is_demo FROM businesses WHERE id = ?')
    .get(businessId) as { id: string; default_country_code: string; timezone?: string; is_demo: number } | undefined;
  if (!biz) {
    throw new Error('Business workspace not found');
  }

  if (!rows || rows.length < 2) {
    return {
      processedCount: 0,
      createdCount: 0,
      updatedCount: 0,
      deletedCount: 0,
      skippedCount: 0,
      totalLeadsInBusiness: (
        db.prepare('SELECT COUNT(*) as cnt FROM leads WHERE business_id = ?').get(businessId) as { cnt: number }
      ).cnt,
      syncedAt: startedAt,
      syncDurationMs: params.syncDurationMs ?? (Date.now() - startMs),
      sourceMode: sourceLabel,
      newLeads: [],
      createdNotifications: [],
    };
  }

  const headers = rows[0].map((h) => String(h || '').trim());
  const normalizedHeaders = headers.map((h) => h.toLowerCase().replace(/[\s_-]+/g, ' ').trim());
  const headerIndexMap = new Map<string, number>();
  const normalizedHeaderIndexMap = new Map<string, number>();
  headers.forEach((h, idx) => {
    if (h) {
      headerIndexMap.set(h, idx);
      normalizedHeaderIndexMap.set(normalizedHeaders[idx], idx);
    }
  });

  const findColIdx = (mappingKey: string, exactCandidates: string[], fuzzyPatterns: RegExp[] = []): number => {
    const mappedCol = columnMapping[mappingKey];
    if (mappedCol && headerIndexMap.has(mappedCol)) {
      return headerIndexMap.get(mappedCol)!;
    }
    for (const c of exactCandidates) {
      if (headerIndexMap.has(c)) return headerIndexMap.get(c)!;
      const norm = c.toLowerCase().replace(/[\s_-]+/g, ' ').trim();
      if (normalizedHeaderIndexMap.has(norm)) return normalizedHeaderIndexMap.get(norm)!;
    }
    if (fuzzyPatterns.length > 0) {
      for (let i = 0; i < headers.length; i++) {
        const h = headers[i];
        if (!h) continue;
        if (fuzzyPatterns.some((rx) => rx.test(h))) {
          return i;
        }
      }
    }
    return -1;
  };

  const idxId = findColIdx('id', ['id', 'crm_external_id', 'lead_id', 'leadgen_id']);
  const idxCreatedTime = findColIdx(
    'created_time',
    ['created_time', 'created_at', 'timestamp', 'date', 'submission_date', 'التاريخ', 'وقت التسجيل', 'تاريخ التسجيل'],
    [/created.?time|timestamp|تاريخ|الوقت/i]
  );
  const idxAdId = findColIdx('ad_id', ['ad_id']);
  const idxAdName = findColIdx('ad_name', ['ad_name', 'اسم الاعلان', 'اسم الإعلان']);
  const idxAdSetId = findColIdx('adset_id', ['adset_id', 'ad_set_id']);
  const idxAdSetName = findColIdx('adset_name', ['adset_name', 'ad_set_name', 'المجموعة الاعلانية']);
  const idxCampaignId = findColIdx('campaign_id', ['campaign_id']);
  const idxCampaignName = findColIdx('campaign_name', ['campaign_name', 'campaign', 'الحملة', 'اسم الحملة']);
  const idxFormId = findColIdx('form_id', ['form_id']);
  const idxFormName = findColIdx('form_name', ['form_name', 'النموذج', 'اسم النموذج']);
  const idxIsOrganic = findColIdx('is_organic', ['is_organic']);
  const idxPlatform = findColIdx('platform', ['platform', 'source', 'المنصة', 'المصدر']);
  const idxProducts = findColIdx(
    'interested_service',
    [
      'dental_service',
      'interested_service',
      'service',
      'treatment',
      'الخدمة',
      'الخدمة المطلوبة',
      'نوع الخدمة',
      'الخدمة الطبية',
      'التخصص',
      'اختر_المنتجات_المرغوبة',
      'product',
    ],
    [/خدم[ةه]|علاج|إجراء|اجراء|تخصص|زراع|تقويم|تجميل|dental|service|treatment|المنتج/i]
  );
  const idxBranch = findColIdx(
    'branch_location',
    ['branch_location', 'branch', 'location', 'clinic', 'city', 'governorate', 'الفرع', 'الفرع المفضل', 'العيادة', 'المحافظة', 'المنطقة', 'العنوان'],
    [/فرع|عياد[ةه]|منطق[ةه]|محافظ[ةه]|موقع|عنوان|branch|location|city/i]
  );
  const idxPreferredTime = findColIdx(
    'preferred_time',
    ['preferred_time', 'appointment', 'appointment_time', 'best_time', 'الموعد', 'الموعد المفضل', 'وقت التواصل', 'ميعاد'],
    [/موعد|ميعاد|وقت.?تواصل|appointment|preferred.?time/i]
  );
  const idxPatientAge = findColIdx(
    'patient_age',
    ['patient_age', 'age', 'العمر', 'السن'],
    [/^(ال)?عمر$|^(ال)?سن$|\bage\b/i]
  );
  const idxQuantity = findColIdx(
    'notes',
    [
      'medical_notes',
      'notes',
      'note',
      'complaint',
      'details',
      'message',
      'comment',
      'ملاحظات',
      'ملاحظة',
      'الشكوى',
      'تفاصيل',
      'استفسار',
      'اكتب_الكمية_أو_المقاسات_المطلوبة_إن_وجدت',
      'quantity',
    ],
    [/شكو[ىي]|ملاحظ|تفاصيل|استفسار|وصف|رسالة|notes|complaint|symptom|details|كمية|مقاس/i]
  );
  const idxWhatsapp = findColIdx(
    'whatsapp',
    ['whatsapp', 'whats_app', 'whatsapp_number', 'واتساب', 'رقم الواتساب', 'اكتب_رقم_الهاتف/الواتساب_لإرسال_عرض_السعر'],
    [/واتس|whatsapp/i]
  );
  const idxFullName = findColIdx(
    'full_name',
    ['full_name', 'name', 'customer_name', 'patient_name', 'الاسم الكامل', 'الاسم', 'اسم العميل', 'اسم المريض', 'اسم الحالة'],
    [/full.?name|patient.?name|customer.?name|الاسم|اسم.?العميل|اسم.?المريض/i]
  );
  const idxEmail = findColIdx('email', ['email', 'e-mail', 'البريد الإلكتروني', 'البريد الالكتروني', 'الايميل', 'ايميل'], [/email|بريد|ايميل/i]);
  const idxPhone = findColIdx(
    'phone',
    ['phone_number', 'phone', 'mobile', 'tel', 'رقم الهاتف', 'رقم التليفون', 'رقم الموبايل', 'الهاتف', 'الموبايل', 'تليفون', 'رقم التواصل'],
    [/phone|mobile|tel|هاتف|تليفون|موبايل|جوال|رقم.?تواصل/i]
  );
  const idxCompany = findColIdx('company_name', ['company_name', 'company', 'الشركة']);
  const idxJobTitle = findColIdx('job_title', ['job_title', 'المسمى الوظيفي']);
  const idxInboxUrl = findColIdx('inbox_url', ['inbox_url', 'رابط المحادثة']);
  const idxLeadStatus = findColIdx('status', ['lead_status', 'status', 'الحالة', 'حالة العميل', 'حالة التواصل']);

  const matchedStandardIndices = new Set(
    [
      idxId,
      idxCreatedTime,
      idxAdId,
      idxAdName,
      idxAdSetId,
      idxAdSetName,
      idxCampaignId,
      idxCampaignName,
      idxFormId,
      idxFormName,
      idxIsOrganic,
      idxPlatform,
      idxProducts,
      idxBranch,
      idxPreferredTime,
      idxPatientAge,
      idxQuantity,
      idxWhatsapp,
      idxFullName,
      idxEmail,
      idxPhone,
      idxCompany,
      idxJobTitle,
      idxInboxUrl,
      idxLeadStatus,
    ].filter((i) => i >= 0)
  );

  const stages = db
    .prepare('SELECT id, key, name_ar, name_en, is_default FROM lead_statuses WHERE business_id = ? ORDER BY sort_order ASC')
    .all(businessId) as Array<{ id: string; key: string; name_ar: string; name_en: string; is_default: number }>;

  const existingLeads = db
    .prepare(
      'SELECT id, lead_code, source, external_row_id, status_id, full_name, phone, email, interested_service, notes_summary, custom_values_json, created_at, updated_at FROM leads WHERE business_id = ?'
    )
    .all(businessId) as Array<{
    id: string;
    lead_code: string;
    source: string;
    external_row_id: string | null;
    status_id: string | null;
    full_name: string;
    phone: string | null;
    email: string | null;
    interested_service: string | null;
    notes_summary: string | null;
    custom_values_json: string;
    created_at: string;
    updated_at: string;
  }>;

  const existingByExtId = new Map<string, (typeof existingLeads)[number]>();
  for (const el of existingLeads) {
    if (el.external_row_id) {
      existingByExtId.set(el.external_row_id.trim(), el);
    }
  }

  // Load Known Lead IDs registry from persistent table
  const knownRows = db
    .prepare('SELECT sheet_lead_id, lead_id, row_hash, notified_at FROM known_sheet_leads WHERE business_id = ?')
    .all(businessId) as Array<{
    sheet_lead_id: string;
    lead_id: string;
    row_hash: string | null;
    notified_at: string | null;
  }>;
  const knownBySheetId = new Map<string, (typeof knownRows)[number]>();
  for (const kr of knownRows) {
    knownBySheetId.set(kr.sheet_lead_id.trim(), kr);
  }

  // Compute monotonic next lead code number
  const maxCodeRow = db
    .prepare("SELECT MAX(CAST(REPLACE(lead_code, 'LD-', '') AS INTEGER)) as maxNum FROM leads WHERE business_id = ? AND lead_code LIKE 'LD-%'")
    .get(businessId) as { maxNum: number | null };
  let nextLeadNum = Math.max(1001, (maxCodeRow?.maxNum || 1000) + 1);

  const insertLeadStmt = db.prepare(`
    INSERT INTO leads (
      id, lead_code, business_id, full_name, phone, phone_e164, email, interested_service,
      source, status_id, assigned_to_user_id, campaign_id, campaign_name, ad_set_id, ad_set_name,
      ad_id, ad_name, form_id, form_name, page_id, meta_leadgen_id, external_row_id,
      original_answers_json, custom_values_json, notes_summary, last_contact_at, next_follow_up_at,
      is_read, is_demo, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL, NULL, 0, ?, ?, ?)
  `);

  const insertActivityStmt = db.prepare(`
    INSERT INTO lead_activities (id, business_id, lead_id, actor_user_id, activity_type, description_ar, description_en, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const updateLeadStmt = db.prepare(`
    UPDATE leads
    SET full_name = ?,
        phone = ?,
        phone_e164 = ?,
        email = ?,
        interested_service = ?,
        source = ?,
        status_id = ?,
        campaign_id = ?,
        campaign_name = ?,
        ad_set_id = ?,
        ad_set_name = ?,
        ad_id = ?,
        ad_name = ?,
        form_id = ?,
        form_name = ?,
        original_answers_json = ?,
        custom_values_json = ?,
        notes_summary = COALESCE(NULLIF(?, ''), notes_summary),
        created_at = ?,
        updated_at = ?
    WHERE id = ? AND business_id = ?
  `);

  const upsertKnownStmt = db.prepare(`
    INSERT INTO known_sheet_leads (business_id, sheet_lead_id, lead_id, row_hash, first_seen_at, last_seen_at, notified_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(business_id, sheet_lead_id) DO UPDATE SET
      lead_id = excluded.lead_id,
      row_hash = excluded.row_hash,
      last_seen_at = excluded.last_seen_at,
      notified_at = COALESCE(known_sheet_leads.notified_at, excluded.notified_at)
  `);

  let createdCount = 0;
  let updatedCount = 0;
  let deletedCount = 0;
  let skippedCount = 0;
  let processedCount = 0;
  const createdLeadsSummary: NewSheetLeadSummary[] = [];
  const updatedLeadsSummary: Array<{ id: string; fullName: string }> = [];
  const createdNotifications: any[] = [];
  const nowIso = new Date().toISOString();
  const seenInCurrentPass = new Set<string>();

  // Step 1: Parse all rows across the entire sheet (never stopping at blank rows)
  interface ParsedRowCandidate {
    sheetRowNumber: number;
    externalRowId: string;
    rawId: string;
    rawName: string;
    displayPhone: string | null;
    phoneE164: string | null;
    rawEmail: string;
    productLabel: string | null;
    quantitySizes: string;
    source: string;
    mappedStatusId: string | null;
    campaignId: string | null;
    campaignName: string | null;
    adSetId: string | null;
    adSetName: string | null;
    adId: string | null;
    adName: string | null;
    formId: string | null;
    formName: string | null;
    originalAnswers: Record<string, string>;
    customValues: Record<string, unknown>;
    rowFingerprint: string;
    createdAt: string;
    sheetLeadStatus: string;
    platform: string;
  }

  const parsedCandidates: ParsedRowCandidate[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    // Never stop on blank rows; simply continue scanning all used rows in the sheet
    if (!row || row.every((c) => !String(c || '').trim() || String(c || '').trim() === '.')) {
      continue;
    }

    const cell = (idx: number) => (idx >= 0 && idx < row.length ? String(row[idx] ?? '').trim() : '');

    const rawId = cell(idxId).replace(/^["']+|["']+$/g, '').trim();
    const rawNameCell = idxFullName >= 0 ? cell(idxFullName) : cell(0);
    const rawEmail = cell(idxEmail);
    const rawPhone = cell(idxPhone);
    const rawWhatsapp = cell(idxWhatsapp);

    // Skip Meta dummy test lead rows or rows without any meaningful identity
    if (
      rawNameCell.includes('<test lead:') ||
      rawId.includes('<test lead:') ||
      rawEmail.toLowerCase() === 'test@meta.com'
    ) {
      skippedCount += 1;
      continue;
    }

    const cleanedName = rawNameCell === '.' ? '' : rawNameCell.trim();
    const hasContactOrId = Boolean(rawId || rawPhone || rawWhatsapp || rawEmail);
    if (!cleanedName && !hasContactOrId) {
      skippedCount += 1;
      continue;
    }

    const rawName = cleanedName || (rawId ? `عميل (${rawId})` : rawPhone || rawEmail);

    const { displayPhone, phoneE164, whatsappClean } = cleanSheetPhone(
      rawPhone,
      rawWhatsapp,
      biz.default_country_code || '+20'
    );

    const externalRowId =
      rawId ||
      crypto
        .createHash('sha1')
        .update(
          `sheet:${sourceSheetId || 'default'}:row:${rawName.toLowerCase()}:${phoneE164 || rawPhone}:${rawEmail.toLowerCase()}:${cell(idxCreatedTime)}:${r}`
        )
        .digest('hex')
        .slice(0, 20);

    // Deduplicate identical externalRowId within the same sheet read
    if (seenInCurrentPass.has(externalRowId)) {
      skippedCount += 1;
      continue;
    }
    seenInCurrentPass.add(externalRowId);

    processedCount += 1;

    const rawProducts = cell(idxProducts);
    let productLabel = formatProductSelection(rawProducts);
    let quantitySizes = cell(idxQuantity);
    const branchLocation = cell(idxBranch);
    const preferredTime = cell(idxPreferredTime);
    const patientAge = cell(idxPatientAge);
    const companyName = cell(idxCompany);
    const jobTitle = cell(idxJobTitle);
    const inboxUrl = cell(idxInboxUrl);
    const platform = cell(idxPlatform);
    const isOrganic = cell(idxIsOrganic);
    const sheetLeadStatus = cell(idxLeadStatus);

    const campaignId = cell(idxCampaignId) || null;
    const campaignName = cell(idxCampaignName) || null;
    const adSetId = cell(idxAdSetId) || null;
    const adSetName = cell(idxAdSetName) || null;
    const adId = cell(idxAdId) || null;
    const adName = cell(idxAdName) || null;
    const formId = cell(idxFormId) || null;
    const formName = cell(idxFormName) || null;

    const originalAnswers: Record<string, string> = {};
    const extraQaPairs: string[] = [];
    headers.forEach((h, idx) => {
      const val = row[idx] !== undefined ? String(row[idx]).trim() : '';
      if (h && val !== '') {
        originalAnswers[h] = val;
        if (!matchedStandardIndices.has(idx)) {
          extraQaPairs.push(`${h.replace(/_/g, ' ')}: ${val}`);
        }
      }
    });

    // If no standard service column matched, pull from extra form question answers so nothing is missed
    if (!productLabel && extraQaPairs.length > 0) {
      const firstExtraVal = extraQaPairs[0].split(': ').slice(1).join(': ').trim();
      if (firstExtraVal) productLabel = firstExtraVal.slice(0, 140);
    }
    if (extraQaPairs.length > 0) {
      const extraBlock = extraQaPairs.join('\n');
      quantitySizes = quantitySizes ? `${quantitySizes}\n${extraBlock}` : extraBlock;
    }

    const sheetRowNumber = r + 1;
    const createdAt = parseSheetTimestamp(cell(idxCreatedTime), '+02:00');

    const customValues: Record<string, unknown> = {
      dental_service: productLabel || '',
      product_selection: productLabel || '',
      medical_notes: quantitySizes || '',
      quantity_sizes: quantitySizes || '',
      branch_location: branchLocation || '',
      preferred_time: preferredTime || '',
      patient_age: patientAge || '',
      whatsapp_input: whatsappClean || '',
      company_name: companyName || '',
      job_title: jobTitle || '',
      inbox_url: inboxUrl || '',
      platform: platform || '',
      is_organic: isOrganic || '',
      sheet_lead_status: sheetLeadStatus || '',
      sheet_row_number: sheetRowNumber,
      source_sheet_id: sourceSheetId || '',
      source_sheet_name: sourceSheetName || '',
    };

    const rowFingerprint = crypto
      .createHash('sha1')
      .update(
        JSON.stringify({
          rawName,
          displayPhone,
          rawEmail,
          productLabel,
          quantitySizes,
          branchLocation,
          preferredTime,
          patientAge,
          companyName,
          jobTitle,
          inboxUrl,
          platform,
          sheetLeadStatus,
          campaignName,
          adSetName,
          adName,
          createdAt,
          originalAnswers,
          sourceSheetId,
        })
      )
      .digest('hex')
      .slice(0, 16);

    customValues._sheet_hash = rowFingerprint;

    const source = mapSourceFromPlatform(platform);
    const mappedStatusId = resolveSheetStatusId(sheetLeadStatus, stages);

    parsedCandidates.push({
      sheetRowNumber,
      externalRowId,
      rawId,
      rawName,
      displayPhone,
      phoneE164,
      rawEmail,
      productLabel,
      quantitySizes,
      source,
      mappedStatusId,
      campaignId,
      campaignName,
      adSetId,
      adSetName,
      adId,
      adName,
      formId,
      formName,
      originalAnswers,
      customValues,
      rowFingerprint,
      createdAt,
      sheetLeadStatus,
      platform,
    });
  }

  db.exec('BEGIN');
  try {
    for (const item of parsedCandidates) {
      const existing = existingByExtId.get(item.externalRowId);

      if (!existing) {
        const candidateId = deterministicSheetLeadId(businessId, item.externalRowId);
        const idTaken = db.prepare('SELECT 1 FROM leads WHERE id = ?').get(candidateId);
        const leadId = idTaken ? crypto.randomUUID() : candidateId;
        const leadCode = `LD-${nextLeadNum++}`;
        const metaLeadgenId = item.rawId.startsWith('l:') ? item.rawId : null;

        insertLeadStmt.run(
          leadId,
          leadCode,
          businessId,
          item.rawName,
          item.displayPhone,
          item.phoneE164,
          item.rawEmail || null,
          item.productLabel || (item.quantitySizes ? item.quantitySizes.slice(0, 120) : null),
          item.source,
          item.mappedStatusId,
          item.campaignId,
          item.campaignName,
          item.adSetId,
          item.adSetName,
          item.adId,
          item.adName,
          item.formId,
          item.formName,
          metaLeadgenId,
          item.externalRowId,
          JSON.stringify(item.originalAnswers),
          JSON.stringify(item.customValues),
          item.quantitySizes || null,
          biz.is_demo,
          item.createdAt,
          item.createdAt
        );

        insertActivityStmt.run(
          crypto.randomUUID(),
          businessId,
          leadId,
          actorUserId,
          'sheet_synced',
          `تم استيراد العميل تلقائياً من الشيت (${leadCode}) — صف ${item.sheetRowNumber}`,
          `Auto-synced lead from sheet (${leadCode}) — row ${item.sheetRowNumber}`,
          JSON.stringify({
            externalRowId: item.externalRowId,
            sheetRowNumber: item.sheetRowNumber,
            sourceLabel,
            platform: item.platform,
          }),
          item.createdAt
        );

        const initialNotifiedAt = emitNotificationOnChanges ? null : nowIso;
        upsertKnownStmt.run(
          businessId,
          item.externalRowId,
          leadId,
          item.rowFingerprint,
          nowIso,
          nowIso,
          initialNotifiedAt
        );

        existingByExtId.set(item.externalRowId, {
          id: leadId,
          lead_code: leadCode,
          source: item.source,
          external_row_id: item.externalRowId,
          status_id: item.mappedStatusId,
          full_name: item.rawName,
          phone: item.displayPhone,
          email: item.rawEmail || null,
          interested_service: item.productLabel,
          notes_summary: item.quantitySizes || null,
          custom_values_json: JSON.stringify(item.customValues),
          created_at: item.createdAt,
          updated_at: item.createdAt,
        });

        createdLeadsSummary.push({
          id: leadId,
          sheetLeadId: item.externalRowId,
          leadCode,
          fullName: item.rawName,
          phone: item.displayPhone || item.phoneE164,
          createdAt: item.createdAt,
          interestedService: item.productLabel || null,
          sheetRowNumber: item.sheetRowNumber,
        });
        createdCount += 1;
      } else {
        // Ensure existing lead is always registered in known_sheet_leads
        upsertKnownStmt.run(
          businessId,
          item.externalRowId,
          existing.id,
          item.rowFingerprint,
          existing.created_at || nowIso,
          nowIso,
          existing.created_at || nowIso
        );

        const prevCustom = JSON.parse(existing.custom_values_json || '{}');
        if (prevCustom._sheet_hash === item.rowFingerprint) {
          skippedCount += 1;
          continue;
        }

        if (conflictPolicy === 'crm_wins') {
          skippedCount += 1;
          continue;
        }

        const sheetStatusChanged =
          Boolean(item.sheetLeadStatus) && prevCustom.sheet_lead_status !== item.sheetLeadStatus;
        const nextStatusId = sheetStatusChanged && item.mappedStatusId ? item.mappedStatusId : existing.status_id;

        const mergedCustom = { ...prevCustom, ...item.customValues };

        updateLeadStmt.run(
          item.rawName,
          item.displayPhone,
          item.phoneE164,
          item.rawEmail || null,
          item.productLabel || existing.interested_service,
          item.source,
          nextStatusId,
          item.campaignId,
          item.campaignName,
          item.adSetId,
          item.adSetName,
          item.adId,
          item.adName,
          item.formId,
          item.formName,
          JSON.stringify(item.originalAnswers),
          JSON.stringify(mergedCustom),
          item.quantitySizes || '',
          item.createdAt || existing.created_at,
          nowIso,
          existing.id,
          businessId
        );

        updatedLeadsSummary.push({ id: existing.id, fullName: item.rawName });
        updatedCount += 1;
      }
    }

    // Reconcile rows removed from THIS live Google Sheet (never touching manual leads or leads from OTHER sheets)
    if (reconcileMissingSheetRows && parsedCandidates.length > 0) {
      const deleteLeadStmt = db.prepare('DELETE FROM leads WHERE id = ? AND business_id = ?');
      const deleteKnownStmt = db.prepare(
        'DELETE FROM known_sheet_leads WHERE business_id = ? AND (lead_id = ? OR sheet_lead_id = ?)'
      );
      const deleteLeadNotifsStmt = db.prepare(
        'DELETE FROM notifications WHERE business_id = ? AND link_path = ?'
      );

      for (const el of existingLeads) {
        const extId = (el.external_row_id || '').trim();
        if (!extId || el.source === 'manual') continue;
        if (sourceSheetId) {
          let elSheetId = '';
          try {
            const parsedCustom = JSON.parse(el.custom_values_json || '{}');
            elSheetId = String(parsedCustom.source_sheet_id || '');
          } catch {
            elSheetId = '';
          }
          // Only reconcile leads that belong to THIS specific sheet
          if (elSheetId !== sourceSheetId) continue;
        }
        if (!seenInCurrentPass.has(extId)) {
          deleteLeadNotifsStmt.run(businessId, `/leads/${el.id}`);
          deleteKnownStmt.run(businessId, el.id, extId);
          const delInfo = deleteLeadStmt.run(el.id, businessId);
          if (delInfo.changes > 0) {
            deletedCount += 1;
          }
        }
      }

      // Keep known_sheet_leads strictly aligned when single-sheet or scoped to deleted leads
      if (!sourceSheetId) {
        for (const kr of knownRows) {
          const sheetId = (kr.sheet_lead_id || '').trim();
          if (sheetId && !seenInCurrentPass.has(sheetId)) {
            const matchingLead = db
              .prepare('SELECT id, source FROM leads WHERE id = ? AND business_id = ?')
              .get(kr.lead_id, businessId) as { id: string; source: string } | undefined;
            if (!matchingLead || matchingLead.source !== 'manual') {
              db.prepare('DELETE FROM known_sheet_leads WHERE business_id = ? AND sheet_lead_id = ?').run(
                businessId,
                kr.sheet_lead_id
              );
            }
          }
        }
      }
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const finishedAt = new Date().toISOString();
  const syncDurationMs = params.syncDurationMs ?? (Date.now() - startMs);
  const totalLeadsInBusiness = (
    db.prepare('SELECT COUNT(*) as cnt FROM leads WHERE business_id = ?').get(businessId) as { cnt: number }
  ).cnt;

  const integ = db
    .prepare('SELECT id FROM integrations WHERE business_id = ? AND provider = ?')
    .get(businessId, integrationProvider) as { id: string } | undefined;

  if (integ) {
    db.prepare('UPDATE integrations SET status = ?, last_sync_at = ?, last_error = NULL, updated_at = ? WHERE id = ?').run(
      'connected',
      finishedAt,
      finishedAt,
      integ.id
    );

    if (recordSyncLog && (createdCount > 0 || updatedCount > 0 || deletedCount > 0)) {
      db.prepare(`
        INSERT INTO sync_logs (id, business_id, integration_id, direction, mode, status, processed_count, created_count, updated_count, skipped_count, details_json, started_at, finished_at)
        VALUES (?, ?, ?, 'inbound', ?, 'success', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        businessId,
        integ.id,
        sourceLabel,
        processedCount,
        createdCount,
        updatedCount,
        skippedCount,
        JSON.stringify({
          totalLeadsInBusiness,
          deletedCount,
          syncDurationMs,
          newLeadIds: createdLeadsSummary.map((l) => l.sheetLeadId),
        }),
        startedAt,
        finishedAt
      );
    }
  }

  // Emit exactly one notification per new Lead ID (never duplicating across restarts/polls)
  if (emitNotificationOnChanges && createdLeadsSummary.length > 0) {
    const checkExistingNotifStmt = db.prepare(
      "SELECT id FROM notifications WHERE business_id = ? AND type = 'new_lead' AND link_path = ? LIMIT 1"
    );
    const markNotifiedStmt = db.prepare(
      'UPDATE known_sheet_leads SET notified_at = ? WHERE business_id = ? AND sheet_lead_id = ?'
    );

    const directNotifs = createdLeadsSummary.slice(0, 10);
    for (const item of directNotifs) {
      const priorKnown = knownBySheetId.get(item.sheetLeadId);
      const existingNotif = checkExistingNotifStmt.get(businessId, `/leads/${item.id}`) as { id: string } | undefined;
      if (priorKnown?.notified_at || existingNotif) {
        markNotifiedStmt.run(finishedAt, businessId, item.sheetLeadId);
        continue;
      }

      const phoneAr = item.phone ? `الهاتف: ${item.phone}` : 'بدون رقم هاتف';
      const phoneEn = item.phone ? `Phone: ${item.phone}` : 'No phone';
      const timeAr = formatNotificationLeadTime(item.createdAt, 'ar');
      const timeEn = formatNotificationLeadTime(item.createdAt, 'en');
      const serviceSuffix = item.interestedService ? ` · ${item.interestedService}` : '';

      const notif = createAndBroadcastNotification(db, {
        businessId,
        userId: null,
        type: 'new_lead',
        titleAr: `عميل جديد من الشيت: ${item.fullName}`,
        titleEn: `New Lead from Sheet: ${item.fullName}`,
        messageAr: `${phoneAr} · وقت التسجيل: ${timeAr} · (${item.leadCode})${serviceSuffix}`,
        messageEn: `${phoneEn} · Registered: ${timeEn} · (${item.leadCode})${serviceSuffix}`,
        linkPath: `/leads/${item.id}`,
        leadId: item.id,
        createdAt: finishedAt,
      });

      markNotifiedStmt.run(finishedAt, businessId, item.sheetLeadId);
      createdNotifications.push(notif);
    }

    if (createdLeadsSummary.length > 10) {
      const batchNotif = createAndBroadcastNotification(db, {
        businessId,
        userId: null,
        type: 'sheet_synced',
        titleAr: `اكتشاف ${createdCount} ليدز جديدة من Google Sheets`,
        titleEn: `Detected ${createdCount} New Leads from Google Sheets`,
        messageAr: `تمت إضافة ${createdCount} عميل جديد وتحديث ${updatedCount} سجل خلال دورة المزامنة`,
        messageEn: `Added ${createdCount} new leads and updated ${updatedCount} rows during sync`,
        linkPath: '/leads',
        createdAt: finishedAt,
      });
      createdNotifications.push(batchNotif);
    }
  }

  if (createdCount > 0 || updatedCount > 0 || deletedCount > 0) {
    broadcastWorkspaceEvent(businessId, 'sheet_synced', {
      businessId,
      createdCount,
      updatedCount,
      deletedCount,
      skippedCount,
      totalLeadsInBusiness,
      latestLeadId: createdLeadsSummary[0]?.id || updatedLeadsSummary[0]?.id || null,
      newLeads: createdLeadsSummary,
      syncedAt: finishedAt,
      syncDurationMs,
      sourceLabel,
    });
  }

  return {
    processedCount,
    createdCount,
    updatedCount,
    deletedCount,
    skippedCount,
    totalLeadsInBusiness,
    syncedAt: finishedAt,
    syncDurationMs,
    sourceMode: sourceLabel,
    newLeads: createdLeadsSummary,
    createdNotifications,
  };
}

export function syncAttachedSheetToWorkspace(
  db: SqlDb,
  businessId = CLINIC_WORKSPACE_ID,
  filePath = ATTACHED_SHEET_PATH,
  options?: { emitNotificationOnChanges?: boolean }
): SheetSyncResult {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('No local CSV file configured for this workspace');
  }
  const csvText = fs.readFileSync(filePath, 'utf8');
  const rows = parseCsvRows(csvText);
  return syncSheetRowsToWorkspace(db, {
    businessId,
    rows,
    sourceLabel: 'attached_csv_live',
    conflictPolicy: 'sheet_wins',
    recordSyncLog: true,
    emitNotificationOnChanges: options?.emitNotificationOnChanges ?? true,
    integrationProvider: 'google_sheets',
  });
}

export function extractGoogleSheetCsvUrl(inputUrl: string): string | null {
  const trimmed = inputUrl.trim();
  if (!trimmed) return null;
  if (trimmed.includes('export?format=csv') || trimmed.includes('output=csv') || trimmed.includes('tqx=out:csv')) {
    return trimmed;
  }
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) return null;
  const spreadsheetId = match[1];
  const gidMatch = trimmed.match(/[?#&]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : '0';
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
}

export function extractSpreadsheetIdFromUrl(inputUrl?: string | null): string | null {
  if (!inputUrl) return null;
  const match = String(inputUrl).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

export interface WorkspaceSheetRuntimeState {
  isSyncing: boolean;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastLiveSyncAt: string | null;
  lastSyncDurationMs: number | null;
  lastError: string | null;
  lastErrorStatus: number | null;
  consecutiveFailures: number;
  nextAllowedRetryMs: number;
  lastCreatedCount: number;
  lastUpdatedCount: number;
  lastDeletedCount: number;
  lastNewLeads: NewSheetLeadSummary[];
  sheetStatuses: Record<string, PerSheetRuntimeStatus>;
}

const workspaceRuntimeMap = new Map<string, WorkspaceSheetRuntimeState>();
const inFlightWorkspaceSyncs = new Map<string, Promise<SheetSyncResult>>();

export function getWorkspaceSheetSyncRuntimeState(businessId: string): WorkspaceSheetRuntimeState {
  let st = workspaceRuntimeMap.get(businessId);
  if (!st) {
    st = {
      isSyncing: false,
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastLiveSyncAt: null,
      lastSyncDurationMs: null,
      lastError: null,
      lastErrorStatus: null,
      consecutiveFailures: 0,
      nextAllowedRetryMs: 0,
      lastCreatedCount: 0,
      lastUpdatedCount: 0,
      lastDeletedCount: 0,
      lastNewLeads: [],
      sheetStatuses: {},
    };
    workspaceRuntimeMap.set(businessId, st);
  }
  return st;
}

export function validateGoogleSheetUrl(inputUrl: string): {
  spreadsheetId: string;
  sheetUrl: string;
  publicCsvUrl: string;
} {
  const trimmed = String(inputUrl || '').trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Invalid Google Sheet URL');
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'docs.google.com') {
    throw new Error('Only https://docs.google.com/spreadsheets/... URLs are supported');
  }
  const spreadsheetId = extractSpreadsheetIdFromUrl(trimmed);
  const publicCsvUrl = extractGoogleSheetCsvUrl(trimmed);
  if (!spreadsheetId || !publicCsvUrl) {
    throw new Error('Could not extract Spreadsheet ID from the provided URL');
  }
  return { spreadsheetId, sheetUrl: trimmed, publicCsvUrl };
}

export function getConfiguredSheetSources(db: SqlDb, businessId: string): SheetSourceConfig[] {
  const integ = db
    .prepare("SELECT config_json FROM integrations WHERE business_id = ? AND provider = 'google_sheets'")
    .get(businessId) as { config_json: string } | undefined;
  const cfg = integ ? JSON.parse(integ.config_json || '{}') : {};

  if (Array.isArray(cfg.sheetSources) && cfg.sheetSources.length > 0) {
    return cfg.sheetSources
      .filter((s: any) => s && (s.spreadsheetId || s.sheetUrl || s.publicCsvUrl))
      .map((s: any, idx: number) => {
        const spreadsheetId = s.spreadsheetId || extractSpreadsheetIdFromUrl(s.sheetUrl || s.publicCsvUrl) || `sheet-${idx + 1}`;
        const sheetUrl = s.sheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit?usp=drivesdk`;
        const publicCsvUrl =
          s.publicCsvUrl ||
          extractGoogleSheetCsvUrl(sheetUrl) ||
          `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=0`;
        return {
          id: s.id || `sheet-${spreadsheetId.slice(0, 8)}`,
          name: s.name || `شيت عملاء العيادة (${idx + 1})`,
          spreadsheetId,
          sheetUrl,
          publicCsvUrl,
          sheetTitle: s.sheetTitle || null,
          enabled: s.enabled !== false,
        };
      });
  }

  // Legacy single-sheet config upgrade
  const legacyUrl = cfg.sheetUrl || cfg.publicCsvUrl || '';
  const legacyId = cfg.spreadsheetId || extractSpreadsheetIdFromUrl(legacyUrl);
  if (legacyId) {
    const sheetUrl = legacyUrl || `https://docs.google.com/spreadsheets/d/${legacyId}/edit?usp=drivesdk`;
    return [
      {
        id: `sheet-${legacyId.slice(0, 8)}`,
        name: cfg.spreadsheetName || cfg.attachedSheetName || 'شيت عملاء العيادة (1)',
        spreadsheetId: legacyId,
        sheetUrl,
        publicCsvUrl:
          cfg.publicCsvUrl ||
          extractGoogleSheetCsvUrl(sheetUrl) ||
          `https://docs.google.com/spreadsheets/d/${legacyId}/export?format=csv&gid=0`,
        sheetTitle: cfg.sheetTitle || null,
        enabled: true,
      },
    ];
  }

  if (businessId === CLINIC_WORKSPACE_ID && cfg.sheetSourcesCleared !== true) {
    return CLINIC_DEFAULT_SHEETS.map((s) => ({ ...s }));
  }

  return [];
}

export function upsertSheetSourceInConfig(
  db: SqlDb,
  businessId: string,
  sheetUrl: string,
  customName?: string
): { sources: SheetSourceConfig[]; target: SheetSourceConfig } {
  const { spreadsheetId, sheetUrl: validUrl, publicCsvUrl } = validateGoogleSheetUrl(sheetUrl);
  const existingInteg = db
    .prepare("SELECT id, config_json FROM integrations WHERE business_id = ? AND provider = 'google_sheets'")
    .get(businessId) as { id: string; config_json: string } | undefined;
  const prevCfg = existingInteg ? JSON.parse(existingInteg.config_json || '{}') : {};
  const currentSources = getConfiguredSheetSources(db, businessId);

  const existingIdx = currentSources.findIndex((s) => s.spreadsheetId === spreadsheetId);
  let target: SheetSourceConfig;
  if (existingIdx >= 0) {
    target = {
      ...currentSources[existingIdx],
      name: customName?.trim() || currentSources[existingIdx].name,
      sheetUrl: validUrl,
      publicCsvUrl,
      enabled: true,
    };
    currentSources[existingIdx] = target;
  } else {
    target = {
      id: `clinic-sheet-${currentSources.length + 1}-${spreadsheetId.slice(0, 6)}`,
      name: customName?.trim() || `شيت عملاء العيادة (${currentSources.length + 1})`,
      spreadsheetId,
      sheetUrl: validUrl,
      publicCsvUrl,
      enabled: true,
    };
    currentSources.push(target);
  }

  const now = new Date().toISOString();
  const integId = existingInteg?.id || crypto.randomUUID();
  const nextCfg = {
    ...prevCfg,
    sheetSources: currentSources,
    sheetSourcesCleared: false,
    spreadsheetId: currentSources[0]?.spreadsheetId || null,
    sheetUrl: currentSources[0]?.sheetUrl || null,
    publicCsvUrl: currentSources[0]?.publicCsvUrl || null,
    spreadsheetName:
      currentSources.length > 1
        ? `عيادات دكتور عبدالله رمضان للأسنان (${currentSources.length} شيتات)`
        : currentSources[0]?.name || 'عيادات دكتور عبدالله رمضان للأسنان',
    autoScheduled: prevCfg.autoScheduled !== false,
    syncIntervalSec: Number(prevCfg.syncIntervalSec || 15),
    conflictPolicy: prevCfg.conflictPolicy || 'sheet_wins',
  };

  db.prepare(`
    INSERT INTO integrations (id, business_id, provider, status, display_name, config_json, last_sync_at, last_error, created_at, updated_at)
    VALUES (?, ?, 'google_sheets', 'connected', ?, ?, NULL, NULL, ?, ?)
    ON CONFLICT(business_id, provider) DO UPDATE SET
      display_name = excluded.display_name,
      config_json = excluded.config_json,
      updated_at = excluded.updated_at
  `).run(
    integId,
    businessId,
    `عيادات دكتور عبدالله رمضان للأسنان (${currentSources.length} Google Sheets)`,
    JSON.stringify(nextCfg),
    now,
    now
  );

  return { sources: currentSources, target };
}

export function removeSheetSourceFromConfig(
  db: SqlDb,
  businessId: string,
  sheetIdOrSpreadsheetId: string
): SheetSourceConfig[] {
  const existingInteg = db
    .prepare("SELECT id, config_json FROM integrations WHERE business_id = ? AND provider = 'google_sheets'")
    .get(businessId) as { id: string; config_json: string } | undefined;
  const prevCfg = existingInteg ? JSON.parse(existingInteg.config_json || '{}') : {};
  const currentSources = getConfiguredSheetSources(db, businessId);
  const nextSources = currentSources.filter(
    (s) => s.id !== sheetIdOrSpreadsheetId && s.spreadsheetId !== sheetIdOrSpreadsheetId
  );

  const runtime = getWorkspaceSheetSyncRuntimeState(businessId);
  for (const s of currentSources) {
    if (s.id === sheetIdOrSpreadsheetId || s.spreadsheetId === sheetIdOrSpreadsheetId) {
      delete runtime.sheetStatuses[s.spreadsheetId];
    }
  }

  if (existingInteg) {
    const now = new Date().toISOString();
    const nextCfg = {
      ...prevCfg,
      sheetSources: nextSources,
      sheetSourcesCleared: nextSources.length === 0,
      spreadsheetId: nextSources[0]?.spreadsheetId || null,
      sheetUrl: nextSources[0]?.sheetUrl || null,
      publicCsvUrl: nextSources[0]?.publicCsvUrl || null,
      spreadsheetName:
        nextSources.length > 1
          ? `عيادات دكتور عبدالله رمضان للأسنان (${nextSources.length} شيتات)`
          : nextSources[0]?.name || null,
    };
    db.prepare(`
      UPDATE integrations
      SET config_json = ?, status = ?, last_error = NULL, updated_at = ?
      WHERE id = ?
    `).run(
      JSON.stringify(nextCfg),
      nextSources.length > 0 ? 'connected' : 'pending_config',
      now,
      existingInteg.id
    );
  }

  return nextSources;
}

/**
 * Fetches all rows from Google Sheets using either Google Sheets API v4 (if OAuth token or API key is configured)
 * or Google Sheets live CSV export / gviz endpoints with strict cache-busting headers.
 */
export async function fetchLiveGoogleSheetRows(params: {
  spreadsheetId?: string | null;
  publicCsvUrl?: string | null;
  sheetTitle?: string | null;
  googleAccessToken?: string | null;
  timeoutMs?: number;
}): Promise<{ rows: string[][]; sourceLabel: string }> {
  const {
    spreadsheetId: rawSpreadsheetId,
    publicCsvUrl: rawCsvUrl,
    sheetTitle,
    googleAccessToken,
    timeoutMs = 12_000,
  } = params;

  const spreadsheetId =
    rawSpreadsheetId ||
    extractSpreadsheetIdFromUrl(rawCsvUrl) ||
    '';

  const apiKey = process.env.GOOGLE_SHEETS_API_KEY?.trim() || '';

  // Method 1: Google Sheets API v4 (when OAuth Bearer token or GOOGLE_SHEETS_API_KEY is available)
  if ((googleAccessToken || apiKey) && spreadsheetId) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const range = sheetTitle ? `'${sheetTitle.replace(/'/g, "''")}'` : 'A:ZZ';
      const apiUrl = new URL(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`
      );
      apiUrl.searchParams.set('valueRenderOption', 'FORMATTED_VALUE');
      if (!googleAccessToken && apiKey) {
        apiUrl.searchParams.set('key', apiKey);
      }

      const headers: Record<string, string> = {
        'Cache-Control': 'no-cache, no-store, max-age=0',
        Pragma: 'no-cache',
      };
      if (googleAccessToken) {
        headers.Authorization = `Bearer ${googleAccessToken}`;
      }

      const res = await fetch(apiUrl.toString(), {
        headers,
        signal: controller.signal,
      });

      if (res.ok) {
        const data = (await res.json()) as any;
        if (Array.isArray(data?.values) && data.values.length >= 1) {
          return {
            rows: data.values.map((r: any[]) => (Array.isArray(r) ? r.map((c) => String(c ?? '')) : [])),
            sourceLabel: 'google_sheets_api_v4',
          };
        }
      } else if (res.status === 429 || res.status >= 500) {
        const err: any = new Error(`Google Sheets API HTTP ${res.status}`);
        err.status = res.status;
        throw err;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  // Method 2: Direct Google Sheets CSV Export + default first tab + gviz/tq fallback
  const baseCsvUrl =
    (rawCsvUrl && extractGoogleSheetCsvUrl(rawCsvUrl)) ||
    (spreadsheetId
      ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=0`
      : '');

  if (!baseCsvUrl) {
    throw new Error('No Google Sheet URL configured for this workspace');
  }

  const gidMatch = baseCsvUrl.match(/[?&]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : '0';

  const candidateUrls = Array.from(
    new Set(
      [
        baseCsvUrl,
        spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv` : '',
        spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&gid=${gid}` : '',
        spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv` : '',
      ].filter(Boolean)
    )
  );

  let lastErr: any = null;
  let sawAuthBlocked = false;
  for (const urlStr of candidateUrls) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const separator = urlStr.includes('?') ? '&' : '?';
      const cacheBustedUrl = `${urlStr}${separator}_cb=${Date.now()}`;
      const res = await fetch(cacheBustedUrl, {
        headers: {
          'Cache-Control': 'no-cache, no-store, max-age=0',
          Pragma: 'no-cache',
          Accept: 'text/csv,text/plain,*/*',
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          sawAuthBlocked = true;
          const err: any = new Error(
            'الشيت خاص (غير مشارك للعامة) — افتح مشاركة الشيت واختر "أي شخص لديه الرابط (عارض)" | Sheet is private (HTTP 401/403) — set sharing to "Anyone with the link (Viewer)"'
          );
          err.status = res.status;
          lastErr = err;
          break;
        }
        const err: any = new Error(`Google Sheets fetch failed (${res.status})`);
        err.status = res.status;
        lastErr = err;
        if (res.status === 429) throw err;
        continue;
      }

      const csvText = await res.text();
      if (!csvText || !csvText.trim() || csvText.trim().startsWith('<!DOCTYPE html') || csvText.trim().startsWith('<html')) {
        sawAuthBlocked = true;
        const err: any = new Error(
          'الشيت خاص (غير مشارك للعامة) — افتح مشاركة الشيت واختر "أي شخص لديه الرابط (عارض)" | Sheet requires link-sharing access ("Anyone with the link — Viewer")'
        );
        err.status = 401;
        lastErr = err;
        continue;
      }

      const rows = parseCsvRows(csvText);
      if (rows.length >= 1) {
        return { rows, sourceLabel: 'google_sheet_live_csv' };
      }
    } catch (err: any) {
      lastErr = err;
      if (err?.status === 429) throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  if (sawAuthBlocked && lastErr) {
    throw lastErr;
  }
  throw lastErr || new Error('Unable to fetch rows from Google Sheets');
}

/**
 * Synchronizes a workspace from ALL configured Google Sheets (supports 1 or multiple live sheets)
 * with in-flight deduplication, per-sheet status tracking, and exponential backoff on errors.
 */
export async function syncWorkspaceFromConfiguredSheet(
  db: SqlDb,
  businessId: string,
  options?: {
    sheetUrl?: string;
    sheetName?: string;
    sheetId?: string;
    csvText?: string;
    googleAccessToken?: string | null;
    actorUserId?: string | null;
    emitNotificationOnChanges?: boolean;
    force?: boolean;
    preferAttachedOnly?: boolean;
  }
): Promise<SheetSyncResult> {
  const existingInFlight = inFlightWorkspaceSyncs.get(businessId);
  if (existingInFlight && !options?.csvText && !options?.sheetUrl) {
    return existingInFlight;
  }

  const runtime = getWorkspaceSheetSyncRuntimeState(businessId);

  // Respect exponential backoff window on background polls unless forced manually
  if (!options?.force && !options?.csvText && !options?.sheetUrl && runtime.nextAllowedRetryMs > Date.now()) {
    const waitSec = Math.ceil((runtime.nextAllowedRetryMs - Date.now()) / 1000);
    throw new Error(`Sync backoff active — retrying in ${waitSec}s`);
  }

  const runPromise = (async (): Promise<SheetSyncResult> => {
    const startMs = Date.now();
    runtime.isSyncing = true;
    runtime.lastAttemptAt = new Date().toISOString();

    try {
      // 1. Direct CSV payload provided (manual CSV upload or unit test)
      if (typeof options?.csvText === 'string' && options.csvText.trim()) {
        const rows = parseCsvRows(options.csvText);
        const res = syncSheetRowsToWorkspace(db, {
          businessId,
          rows,
          sourceLabel: 'csv_upload_sync',
          sourceSheetName: options.sheetName || 'ملف CSV مرفوع',
          conflictPolicy: 'sheet_wins',
          actorUserId: options.actorUserId || null,
          recordSyncLog: true,
          emitNotificationOnChanges: options.emitNotificationOnChanges ?? true,
          syncDurationMs: Date.now() - startMs,
        });
        runtime.consecutiveFailures = 0;
        runtime.nextAllowedRetryMs = 0;
        runtime.lastError = null;
        runtime.lastErrorStatus = null;
        runtime.lastSuccessAt = res.syncedAt;
        runtime.lastSyncDurationMs = res.syncDurationMs;
        runtime.lastCreatedCount = res.createdCount;
        runtime.lastUpdatedCount = res.updatedCount;
        runtime.lastDeletedCount = res.deletedCount;
        if (res.newLeads.length > 0) runtime.lastNewLeads = res.newLeads;
        return res;
      }

      // 2. If caller passed a new sheetUrl, add/update it in sheetSources without wiping existing sheets
      if (options?.sheetUrl?.trim()) {
        upsertSheetSourceInConfig(db, businessId, options.sheetUrl.trim(), options.sheetName);
      }

      const existingInteg = db
        .prepare("SELECT id, config_json FROM integrations WHERE business_id = ? AND provider = 'google_sheets'")
        .get(businessId) as { id: string; config_json: string } | undefined;
      const prevCfg = existingInteg ? JSON.parse(existingInteg.config_json || '{}') : {};
      const allSources = getConfiguredSheetSources(db, businessId).filter((s) => s.enabled !== false);

      if (allSources.length === 0) {
        const totalRow = db
          .prepare('SELECT COUNT(*) as cnt FROM leads WHERE business_id = ?')
          .get(businessId) as { cnt: number } | undefined;
        const nowIso = new Date().toISOString();
        runtime.consecutiveFailures = 0;
        runtime.nextAllowedRetryMs = 0;
        runtime.lastError = null;
        runtime.lastErrorStatus = null;
        return {
          processedCount: 0,
          createdCount: 0,
          updatedCount: 0,
          deletedCount: 0,
          skippedCount: 0,
          totalLeadsInBusiness: totalRow?.cnt || 0,
          syncedAt: nowIso,
          syncDurationMs: Date.now() - startMs,
          sourceMode: 'pending_config',
          newLeads: [],
          createdNotifications: [],
          sheetResults: [],
        };
      }

      // Filter to one sheet if sheetId specified, otherwise sync ALL configured sheets
      const targetSources = options?.sheetId
        ? allSources.filter((s) => s.id === options.sheetId || s.spreadsheetId === options.sheetId)
        : allSources;

      let totalProcessed = 0;
      let totalCreated = 0;
      let totalUpdated = 0;
      let totalDeleted = 0;
      let totalSkipped = 0;
      const allNewLeads: NewSheetLeadSummary[] = [];
      const allCreatedNotifs: any[] = [];
      const sheetResults: PerSheetRuntimeStatus[] = [];
      let succeededCount = 0;
      let firstError: any = null;

      for (const sheet of targetSources) {
        const sheetStart = Date.now();
        const prevSheetStatus = runtime.sheetStatuses[sheet.spreadsheetId];
        runtime.sheetStatuses[sheet.spreadsheetId] = {
          id: sheet.id,
          name: sheet.name,
          spreadsheetId: sheet.spreadsheetId,
          sheetUrl: sheet.sheetUrl,
          publicCsvUrl: sheet.publicCsvUrl,
          status: 'syncing',
          lastSyncAt: prevSheetStatus?.lastSyncAt || null,
          lastError: prevSheetStatus?.lastError || null,
          lastErrorStatus: prevSheetStatus?.lastErrorStatus || null,
          rowCount: prevSheetStatus?.rowCount || 0,
          createdCount: prevSheetStatus?.createdCount || 0,
          updatedCount: prevSheetStatus?.updatedCount || 0,
          deletedCount: prevSheetStatus?.deletedCount || 0,
          syncDurationMs: prevSheetStatus?.syncDurationMs || null,
        };

        try {
          const { rows, sourceLabel } = await fetchLiveGoogleSheetRows({
            spreadsheetId: sheet.spreadsheetId,
            publicCsvUrl: sheet.publicCsvUrl,
            sheetTitle: sheet.sheetTitle || null,
            googleAccessToken: options?.googleAccessToken || null,
          });

          const res = syncSheetRowsToWorkspace(db, {
            businessId,
            rows,
            sourceLabel,
            sourceSheetId: sheet.spreadsheetId,
            sourceSheetName: sheet.name,
            conflictPolicy: prevCfg.conflictPolicy || 'sheet_wins',
            columnMapping: prevCfg.columnMapping || {},
            actorUserId: options?.actorUserId || null,
            recordSyncLog: true,
            emitNotificationOnChanges: options?.emitNotificationOnChanges ?? true,
            syncDurationMs: Date.now() - sheetStart,
            reconcileMissingSheetRows:
              sourceLabel === 'google_sheet_live_csv' || sourceLabel === 'google_sheets_api_v4',
          });

          totalProcessed += res.processedCount;
          totalCreated += res.createdCount;
          totalUpdated += res.updatedCount;
          totalDeleted += res.deletedCount;
          totalSkipped += res.skippedCount;
          allNewLeads.push(...res.newLeads);
          allCreatedNotifs.push(...res.createdNotifications);
          succeededCount += 1;

          const statusObj: PerSheetRuntimeStatus = {
            id: sheet.id,
            name: sheet.name,
            spreadsheetId: sheet.spreadsheetId,
            sheetUrl: sheet.sheetUrl,
            publicCsvUrl: sheet.publicCsvUrl,
            status: 'connected',
            lastSyncAt: res.syncedAt,
            lastError: null,
            lastErrorStatus: null,
            rowCount: res.processedCount,
            createdCount: res.createdCount,
            updatedCount: res.updatedCount,
            deletedCount: res.deletedCount,
            syncDurationMs: Date.now() - sheetStart,
          };
          runtime.sheetStatuses[sheet.spreadsheetId] = statusObj;
          sheetResults.push(statusObj);
        } catch (sheetErr: any) {
          if (!firstError) firstError = sheetErr;
          const statusObj: PerSheetRuntimeStatus = {
            id: sheet.id,
            name: sheet.name,
            spreadsheetId: sheet.spreadsheetId,
            sheetUrl: sheet.sheetUrl,
            publicCsvUrl: sheet.publicCsvUrl,
            status: 'error',
            lastSyncAt: prevSheetStatus?.lastSyncAt || null,
            lastError: sheetErr?.message || 'Google Sheet sync failed',
            lastErrorStatus: typeof sheetErr?.status === 'number' ? sheetErr.status : null,
            rowCount: prevSheetStatus?.rowCount || 0,
            createdCount: 0,
            updatedCount: 0,
            deletedCount: 0,
            syncDurationMs: Date.now() - sheetStart,
          };
          runtime.sheetStatuses[sheet.spreadsheetId] = statusObj;
          sheetResults.push(statusObj);
        }
      }

      const totalLeadsRow = db
        .prepare('SELECT COUNT(*) as cnt FROM leads WHERE business_id = ?')
        .get(businessId) as { cnt: number };
      const nowIso = new Date().toISOString();
      const totalDurationMs = Date.now() - startMs;

      // Persist latest config & status
      const integId = existingInteg?.id || crypto.randomUUID();
      const nextCfg = {
        ...prevCfg,
        sheetSources: allSources,
        spreadsheetId: allSources[0]?.spreadsheetId || null,
        sheetUrl: allSources[0]?.sheetUrl || null,
        publicCsvUrl: allSources[0]?.publicCsvUrl || null,
        spreadsheetName:
          allSources.length > 1
            ? `عيادات دكتور عبدالله رمضان للأسنان (${allSources.length} شيتات)`
            : allSources[0]?.name || 'عيادات دكتور عبدالله رمضان للأسنان',
        autoScheduled: prevCfg.autoScheduled !== false,
        syncIntervalSec: Number(prevCfg.syncIntervalSec || 15),
        conflictPolicy: prevCfg.conflictPolicy || 'sheet_wins',
      };

      if (succeededCount === 0 && firstError) {
        runtime.consecutiveFailures += 1;
        runtime.lastError = firstError?.message || 'Google Sheets sync failed';
        runtime.lastErrorStatus = typeof firstError?.status === 'number' ? firstError.status : null;
        // For 401/403 private sheets, poll gently every 30s so as soon as user flips sharing to public it auto-connects!
        const isAuthErr = runtime.lastErrorStatus === 401 || runtime.lastErrorStatus === 403;
        const backoffMs = isAuthErr
          ? 30_000
          : Math.min(120_000, 15_000 * Math.pow(2, Math.min(3, runtime.consecutiveFailures - 1)));
        runtime.nextAllowedRetryMs = Date.now() + backoffMs;

        db.prepare(`
          INSERT INTO integrations (id, business_id, provider, status, display_name, config_json, last_sync_at, last_error, created_at, updated_at)
          VALUES (?, ?, 'google_sheets', 'error', ?, ?, NULL, ?, ?, ?)
          ON CONFLICT(business_id, provider) DO UPDATE SET
            status = 'error',
            display_name = excluded.display_name,
            config_json = excluded.config_json,
            last_error = excluded.last_error,
            updated_at = excluded.updated_at
        `).run(
          integId,
          businessId,
          `عيادات دكتور عبدالله رمضان للأسنان (${allSources.length} Google Sheets)`,
          JSON.stringify(nextCfg),
          runtime.lastError,
          nowIso,
          nowIso
        );

        throw firstError;
      }

      // At least one sheet succeeded!
      const partialErr =
        firstError
          ? `${sheetResults.filter((s) => s.status === 'error').map((s) => s.name).join('، ')}: ${firstError.message}`
          : null;

      runtime.consecutiveFailures = 0;
      runtime.nextAllowedRetryMs = 0;
      runtime.lastError = partialErr;
      runtime.lastErrorStatus = partialErr && typeof firstError?.status === 'number' ? firstError.status : null;
      runtime.lastSuccessAt = nowIso;
      runtime.lastLiveSyncAt = nowIso;
      runtime.lastSyncDurationMs = totalDurationMs;
      runtime.lastCreatedCount = totalCreated;
      runtime.lastUpdatedCount = totalUpdated;
      runtime.lastDeletedCount = totalDeleted;
      if (allNewLeads.length > 0) runtime.lastNewLeads = allNewLeads;

      db.prepare(`
        INSERT INTO integrations (id, business_id, provider, status, display_name, config_json, last_sync_at, last_error, created_at, updated_at)
        VALUES (?, ?, 'google_sheets', ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(business_id, provider) DO UPDATE SET
          status = excluded.status,
          display_name = excluded.display_name,
          config_json = excluded.config_json,
          last_sync_at = excluded.last_sync_at,
          last_error = excluded.last_error,
          updated_at = excluded.updated_at
      `).run(
        integId,
        businessId,
        partialErr ? 'error' : 'connected',
        `عيادات دكتور عبدالله رمضان للأسنان (${allSources.length} Google Sheets)`,
        JSON.stringify(nextCfg),
        nowIso,
        partialErr,
        nowIso,
        nowIso
      );

      return {
        processedCount: totalProcessed,
        createdCount: totalCreated,
        updatedCount: totalUpdated,
        deletedCount: totalDeleted,
        skippedCount: totalSkipped,
        totalLeadsInBusiness: totalLeadsRow.cnt,
        syncedAt: nowIso,
        syncDurationMs: totalDurationMs,
        sourceMode: allSources.length > 1 ? 'multi_google_sheet_live' : 'google_sheet_live_csv',
        newLeads: allNewLeads,
        createdNotifications: allCreatedNotifs,
        sheetResults,
      };
    } catch (err: any) {
      throw err;
    } finally {
      runtime.isSyncing = false;
      inFlightWorkspaceSyncs.delete(businessId);
    }
  })();

  inFlightWorkspaceSyncs.set(businessId, runPromise);
  return runPromise;
}

/**
 * Ensures the workspace has completed a recent live Google Sheet sync before serving
 * analytics, leads, or status endpoints. Shares in-flight requests so concurrent calls only hit Google Sheets once.
 */
export async function ensureWorkspaceLiveSynced(
  db: SqlDb,
  businessId: string,
  options?: { maxAgeMs?: number; timeoutMs?: number; forceInTest?: boolean }
): Promise<SheetSyncResult | null> {
  if (process.env.NODE_ENV === 'test' && !options?.forceInTest) {
    return null;
  }

  const runtime = getWorkspaceSheetSyncRuntimeState(businessId);
  const existingInFlight = inFlightWorkspaceSyncs.get(businessId);
  const maxAgeMs = options?.maxAgeMs ?? 15_000;
  const lastLiveMs = runtime.lastLiveSyncAt ? Date.parse(runtime.lastLiveSyncAt) : 0;
  const isFresh = lastLiveMs > 0 && Date.now() - lastLiveMs < maxAgeMs;

  if (isFresh && !existingInFlight) {
    return null;
  }

  if (!existingInFlight && runtime.nextAllowedRetryMs > Date.now()) {
    return null;
  }

  const sources = getConfiguredSheetSources(db, businessId).filter((s) => s.enabled !== false);
  if (sources.length === 0) {
    return null;
  }

  const integ = db
    .prepare("SELECT config_json FROM integrations WHERE business_id = ? AND provider = 'google_sheets'")
    .get(businessId) as { config_json: string } | undefined;
  const cfg = integ ? JSON.parse(integ.config_json || '{}') : {};
  if (cfg.autoScheduled === false && lastLiveMs > 0) {
    return null;
  }

  const timeoutMs = options?.timeoutMs ?? 8000;
  const syncPromise =
    existingInFlight ||
    syncWorkspaceFromConfiguredSheet(db, businessId, {
      emitNotificationOnChanges: runtime.lastLiveSyncAt !== null,
    });

  let timer: NodeJS.Timeout | undefined;
  try {
    const result = await Promise.race([
      syncPromise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
        timer.unref?.();
      }),
    ]);
    return result;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const activeWatchers = new Set<string>();

/**
 * Runs background 15-second adaptive Google Sheets polling across all configured sheets
 * for the workspace.
 */
export function startAttachedSheetWatcher(
  db: SqlDb,
  businessId = CLINIC_WORKSPACE_ID,
  _filePath?: string
) {
  const watcherKey = `${businessId}:remote`;
  if (activeWatchers.has(watcherKey)) return;
  activeWatchers.add(watcherKey);

  const hasConfiguredSheet = () => {
    try {
      const integ = db
        .prepare("SELECT config_json FROM integrations WHERE business_id = ? AND provider = 'google_sheets'")
        .get(businessId) as { config_json: string } | undefined;
      if (integ) {
        const cfg = JSON.parse(integ.config_json || '{}');
        if (cfg.autoScheduled === false) return false;
      }
      return getConfiguredSheetSources(db, businessId).some((s) => s.enabled !== false);
    } catch {
      return false;
    }
  };

  // Trigger initial live Google Sheet sync on server start
  if (process.env.NODE_ENV !== 'test') {
    setTimeout(() => {
      if (!hasConfiguredSheet()) return;
      syncWorkspaceFromConfiguredSheet(db, businessId, {
        emitNotificationOnChanges: false,
      }).catch(() => {
        // silent background fallback; error & retry window recorded in runtime state
      });
    }, 50);
  }

  // Adaptive 15-second background polling across all configured Google Sheets
  const remotePollTimer = setInterval(async () => {
    if (process.env.NODE_ENV === 'test') return;
    if (!hasConfiguredSheet()) return;
    try {
      await syncWorkspaceFromConfiguredSheet(db, businessId, {
        emitNotificationOnChanges: true,
      });
    } catch {
      // Backoff is recorded in workspaceRuntimeMap and integrations.last_error
    }
  }, 15_000);
  remotePollTimer.unref?.();
}
