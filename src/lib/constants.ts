export const MASTER_OWNER_EMAIL = 'azeco77@gmail.com';
export const DEFAULT_ADMIN_USERNAME = 'admin';
export const CLINIC_WORKSPACE_ID = 'dr-abdullah-ramadan-dental';
export const ALSAFA_WORKSPACE_ID = CLINIC_WORKSPACE_ID;

export const BRAND_LOGO_URL =
  '/assets/aistudio/272032127_685928466148297_4172930338981379191_n__6__eb01fdd9.jpg';
export const BRAND_ICON_URL = '/favicon.png?v=4';
export const BRAND_NOTIFICATION_ICON_URL = '/icon-512.png?v=4';
export const BRAND_PRIMARY = '#0077B6';
export const BRAND_ACCENT = '#00B5CC';
export const BRAND_NAME_AR = 'عيادات دكتور عبدالله رمضان للأسنان';
export const BRAND_NAME_EN = 'Dr. Abdullah Ramadan Dental Clinics';
export const BRAND_SUBTITLE_EN = 'Abdallah Ramadan · Dental Specialist';

export function isMasterOwnerEmail(email?: string | null): boolean {
  return Boolean(email && email.trim().toLowerCase() === MASTER_OWNER_EMAIL);
}
