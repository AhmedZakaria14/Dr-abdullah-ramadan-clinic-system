import crypto from 'node:crypto';
import { SqlDb, createDefaultStagesForBusiness } from './db.ts';
import {
  DEFAULT_ADMIN_USERNAME,
  MASTER_OWNER_EMAIL,
  hashPassword,
  syncSystemAccountsToFirestore,
} from './auth.ts';
import { CLINIC_DEFAULT_SHEETS, CLINIC_WORKSPACE_ID } from './services/sheetSyncService.ts';

const LEGACY_NON_CLINIC_BIZ_IDS = [
  'demo-biz-atlas',
  'demo-biz-careline',
  'demo-biz-horizon',
  'alsafa-steel-workspace',
];

const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_DEFAULT_PASSWORD || 'DentalClinic2026';
const CLINIC_BRAND_NAME = 'عيادات دكتور عبدالله رمضان للأسنان';
const CLINIC_BRAND_INDUSTRY = 'طب وجراحة وتجميل الأسنان | Dental Specialist & Clinics';
const CLINIC_BRAND_LOGO_URL =
  '/assets/aistudio/272032127_685928466148297_4172930338981379191_n__6__eb01fdd9.jpg';

const SYSTEM_ACCOUNTS = [
  {
    id: 'clinic-owner-manager',
    username: DEFAULT_ADMIN_USERNAME,
    email: MASTER_OWNER_EMAIL,
    full_name: 'حساب المدير (المالك الرئيسي) | Manager (Owner)',
    account_slot: 'manager' as const,
    role: 'business_admin' as const,
    is_platform_super_admin: 1,
    defaultPassword: DEFAULT_ADMIN_PASSWORD,
  },
  {
    id: 'clinic-accountant',
    username: 'accountant',
    email: 'accountant@drabdullahramadan.local',
    full_name: 'حساب الاستقبال والمحاسبة (صلاحية كاملة) | Reception & Accountant',
    account_slot: 'accountant' as const,
    role: 'business_admin' as const,
    is_platform_super_admin: 0,
    defaultPassword: DEFAULT_ADMIN_PASSWORD,
  },
];

function ensureClinicSystemAccounts(db: SqlDb) {
  const now = new Date().toISOString();

  for (const acct of SYSTEM_ACCOUNTS) {
    const existingByUsername = db
      .prepare('SELECT id, firebase_uid, password_hash, username FROM users WHERE LOWER(username) = ?')
      .get(acct.username.toLowerCase()) as
      | { id: string; firebase_uid: string | null; password_hash: string | null; username: string | null }
      | undefined;

    const existingByEmail = !existingByUsername
      ? (db
          .prepare('SELECT id, firebase_uid, password_hash, username FROM users WHERE LOWER(email) = ?')
          .get(acct.email.toLowerCase()) as
          | { id: string; firebase_uid: string | null; password_hash: string | null; username: string | null }
          | undefined)
      : undefined;

    const existingById = !existingByUsername && !existingByEmail
      ? (db
          .prepare('SELECT id, firebase_uid, password_hash, username FROM users WHERE id = ?')
          .get(acct.id) as
          | { id: string; firebase_uid: string | null; password_hash: string | null; username: string | null }
          | undefined)
      : undefined;

    const existingUser = existingByUsername || existingByEmail || existingById;
    const userId = existingUser?.id || acct.id;

    if (!existingUser) {
      db.prepare(`
        INSERT INTO users (id, firebase_uid, username, password_hash, email, full_name, default_language, theme, is_platform_super_admin, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'ar', 'light', ?, ?, ?)
      `).run(
        userId,
        `seed-uid-${acct.id}`,
        acct.username,
        hashPassword(acct.defaultPassword),
        acct.email,
        acct.full_name,
        acct.is_platform_super_admin,
        now,
        now
      );
    } else {
      const nextPasswordHash =
        existingUser.password_hash && existingUser.password_hash.startsWith('scrypt:')
          ? existingUser.password_hash
          : hashPassword(acct.defaultPassword);
      const nextUsername = existingUser.username || acct.username;
      const superFlag = acct.is_platform_super_admin === 1 ? 1 : undefined;
      db.prepare(`
        UPDATE users
        SET username = ?,
            password_hash = ?,
            is_platform_super_admin = COALESCE(?, is_platform_super_admin),
            updated_at = ?
        WHERE id = ?
      `).run(nextUsername, nextPasswordHash, superFlag ?? null, now, userId);
    }

    const existingMembership = db
      .prepare('SELECT id, user_id, role, status, account_slot FROM business_memberships WHERE business_id = ? AND (user_id = ? OR LOWER(invited_email) = ?)')
      .get(CLINIC_WORKSPACE_ID, userId, acct.email.toLowerCase()) as any;

    if (!existingMembership) {
      if (acct.account_slot === 'accountant') {
        const hasAnyAccountant = db
          .prepare("SELECT id FROM business_memberships WHERE business_id = ? AND account_slot = 'accountant'")
          .get(CLINIC_WORKSPACE_ID);
        if (hasAnyAccountant) continue;
      }

      db.prepare(`
        INSERT INTO business_memberships (id, business_id, user_id, invited_email, display_name, account_slot, role, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
      `).run(
        crypto.randomUUID(),
        CLINIC_WORKSPACE_ID,
        userId,
        acct.email,
        acct.full_name,
        acct.account_slot,
        acct.role,
        now,
        now
      );
    } else if (acct.username === DEFAULT_ADMIN_USERNAME || acct.email === MASTER_OWNER_EMAIL) {
      db.prepare(`
        UPDATE business_memberships
        SET user_id = ?, account_slot = 'manager', role = 'business_admin', status = 'active', updated_at = ?
        WHERE id = ?
      `).run(userId, now, existingMembership.id);
    }
  }

  void syncSystemAccountsToFirestore(db);
}

function ensureClinicGoogleSheetsIntegration(db: SqlDb) {
  const now = new Date().toISOString();
  const existing = db
    .prepare("SELECT id, config_json FROM integrations WHERE business_id = ? AND provider = 'google_sheets'")
    .get(CLINIC_WORKSPACE_ID) as { id: string; config_json: string } | undefined;

  const defaultConfig = {
    mode: 'A',
    conflictPolicy: 'sheet_wins',
    autoScheduled: true,
    syncIntervalSec: 15,
    attachedSheetName: CLINIC_BRAND_NAME,
    spreadsheetName: `${CLINIC_BRAND_NAME} (${CLINIC_DEFAULT_SHEETS.length} شيتات)`,
    spreadsheetId: CLINIC_DEFAULT_SHEETS[0].spreadsheetId,
    sheetUrl: CLINIC_DEFAULT_SHEETS[0].sheetUrl,
    publicCsvUrl: CLINIC_DEFAULT_SHEETS[0].publicCsvUrl,
    sheetSources: CLINIC_DEFAULT_SHEETS,
    syncNotes: true,
  };

  if (!existing) {
    db.prepare(`
      INSERT INTO integrations (id, business_id, provider, status, display_name, config_json, last_sync_at, last_error, created_at, updated_at)
      VALUES (?, ?, 'google_sheets', 'connected', ?, ?, NULL, NULL, ?, ?)
    `).run(
      crypto.randomUUID(),
      CLINIC_WORKSPACE_ID,
      `${CLINIC_BRAND_NAME} (${CLINIC_DEFAULT_SHEETS.length} Google Sheets)`,
      JSON.stringify(defaultConfig),
      now,
      now
    );
  } else {
    const prevCfg = JSON.parse(existing.config_json || '{}');
    if ((!Array.isArray(prevCfg.sheetSources) || prevCfg.sheetSources.length === 0) && prevCfg.sheetSourcesCleared !== true) {
      const upgradedCfg = {
        ...prevCfg,
        ...defaultConfig,
      };
      db.prepare(`
        UPDATE integrations
        SET status = 'connected',
            display_name = ?,
            config_json = ?,
            updated_at = ?
        WHERE id = ?
      `).run(
        `${CLINIC_BRAND_NAME} (${CLINIC_DEFAULT_SHEETS.length} Google Sheets)`,
        JSON.stringify(upgradedCfg),
        now,
        existing.id
      );
    }
  }

  // Ensure source_sheet_name custom field exists on existing DBs too
  const hasSheetField = db
    .prepare("SELECT id FROM lead_custom_fields WHERE business_id = ? AND field_key = 'source_sheet_name'")
    .get(CLINIC_WORKSPACE_ID);
  if (!hasSheetField) {
    db.prepare(`
      INSERT INTO lead_custom_fields (id, business_id, field_key, label_ar, label_en, field_type, options_json, is_required, sort_order, created_at)
      VALUES (?, ?, 'source_sheet_name', 'مصدر الشيت', 'Source Sheet', 'text', '[]', 0, 9, ?)
    `).run(crypto.randomUUID(), CLINIC_WORKSPACE_ID, now);
  }
}

export function ensureDemoData(db: SqlDb) {
  // Remove any legacy non-clinic workspaces if present
  for (const legacyId of LEGACY_NON_CLINIC_BIZ_IDS) {
    db.prepare('DELETE FROM businesses WHERE id = ?').run(legacyId);
  }

  const existing = db
    .prepare('SELECT id FROM businesses WHERE id = ?')
    .get(CLINIC_WORKSPACE_ID) as { id: string } | undefined;

  if (!existing) {
    seedClinicWorkspace(db);
  } else {
    ensureClinicSystemAccounts(db);
    ensureClinicGoogleSheetsIntegration(db);
  }
}

export function resetDemoData(db: SqlDb) {
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM businesses WHERE id = ?').run(CLINIC_WORKSPACE_ID);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  seedClinicWorkspace(db);
}

function seedClinicWorkspace(db: SqlDb) {
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO businesses (id, name, industry, logo_url, phone, email, website, timezone, default_country_code, is_demo, round_robin_enabled, round_robin_index, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, NULL, NULL, NULL, 'Africa/Cairo', '+20', 0, 0, 0, NULL, ?, ?)
  `).run(
    CLINIC_WORKSPACE_ID,
    CLINIC_BRAND_NAME,
    CLINIC_BRAND_INDUSTRY,
    CLINIC_BRAND_LOGO_URL,
    now,
    now
  );

  ensureClinicSystemAccounts(db);
  createDefaultStagesForBusiness(db, CLINIC_WORKSPACE_ID);

  // Dental clinic custom fields tailored for Dr. Abdullah Ramadan Dental Clinics
  const customFields: Array<{
    key: string;
    ar: string;
    en: string;
    type: string;
    options?: string[];
  }> = [
    {
      key: 'dental_service',
      ar: 'الخدمة الطبية المطلوبة',
      en: 'Requested Dental Service',
      type: 'dropdown',
      options: [
        'زراعة الأسنان',
        'تقويم الأسنان',
        'تبييض وتجميل (هوليوود سمايل)',
        'تركيبات ثابتة ومتحركة',
        'علاج جذور وعصب',
        'تنظيف وإزالة جير',
        'أسنان أطفال',
        'كشف واستشارة',
      ],
    },
    { key: 'branch_location', ar: 'الفرع المفضل', en: 'Preferred Branch', type: 'text' },
    { key: 'preferred_time', ar: 'الموعد المفضل للتواصل أو الكشف', en: 'Preferred Appointment Time', type: 'text' },
    { key: 'patient_age', ar: 'عمر المريض', en: 'Patient Age', type: 'number' },
    { key: 'whatsapp_input', ar: 'رقم الواتساب', en: 'WhatsApp Number', type: 'phone' },
    { key: 'medical_notes', ar: 'الشكوى والملاحظات الطبية', en: 'Patient Notes & Symptoms', type: 'long_text' },
    { key: 'platform', ar: 'المنصة الإعلانية', en: 'Ad Platform', type: 'text' },
    { key: 'inbox_url', ar: 'رابط المحادثة (Meta Inbox)', en: 'Meta Inbox URL', type: 'text' },
  ];

  const insertField = db.prepare(`
    INSERT INTO lead_custom_fields (id, business_id, field_key, label_ar, label_en, field_type, options_json, is_required, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `);
  customFields.forEach((f, idx) => {
    insertField.run(
      crypto.randomUUID(),
      CLINIC_WORKSPACE_ID,
      f.key,
      f.ar,
      f.en,
      f.type,
      JSON.stringify(f.options || []),
      idx + 1,
      now
    );
  });

  // Clean integration placeholders (NOT linked to Al-Safa Steel's sheet)
  ensureClinicGoogleSheetsIntegration(db);

  db.prepare(`
    INSERT INTO integrations (id, business_id, provider, status, display_name, config_json, last_sync_at, last_error, created_at, updated_at)
    VALUES (?, ?, 'meta', 'pending_config', 'Meta Lead Ads (Webhook / Graph API)', ?, NULL, NULL, ?, ?)
  `).run(
    crypto.randomUUID(),
    CLINIC_WORKSPACE_ID,
    JSON.stringify({ note: 'Connect Meta Lead Ads Graph Token for instant dental campaign lead capture' }),
    now,
    now
  );
}
