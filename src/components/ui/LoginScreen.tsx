import React, { useState } from 'react';
import { Eye, EyeOff, Languages, Lock, Moon, ShieldCheck, Sun, User } from 'lucide-react';
import { Business, Language, ThemeMode, UserProfile } from '../../types/crm';
import { getT } from '../../i18n/translations';
import { apiRequest, setAuthToken } from '../../lib/api';
import { BRAND_LOGO_URL, BRAND_NAME_AR, BRAND_NAME_EN, BRAND_SUBTITLE_EN } from '../../lib/constants';

interface LoginResponse {
  token: string;
  user: UserProfile;
  businesses: Business[];
  demoBusinesses: Business[];
}

interface LoginScreenProps {
  lang: Language;
  theme: ThemeMode;
  onToggleLang: () => void;
  onToggleTheme: () => void;
  onLoginSuccess: (data: LoginResponse) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  lang,
  theme,
  onToggleLang,
  onToggleTheme,
  onLoginSuccess,
}) => {
  const t = getT(lang);
  const isAr = lang === 'ar';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMsg(
        isAr ? 'يرجى إدخال اسم المستخدم وكلمة المرور' : 'Please enter both username and password'
      );
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    setAuthToken(null);
    try {
      const res = await apiRequest<LoginResponse>('/auth/login', {
        method: 'POST',
        skipAuthRedirect: true,
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });
      if (!res?.token || typeof res.token !== 'string') {
        throw new Error(isAr ? 'تعذر إنشاء جلسة الدخول — يرجى المحاولة مرة أخرى' : 'Unable to create session token');
      }
      setAuthToken(res.token);
      onLoginSuccess(res);
    } catch (err: any) {
      const raw = String(err?.message || '');
      const lower = raw.toLowerCase();
      if (lower.includes('invalid username')) {
        setErrorMsg(
          isAr ? 'اسم المستخدم أو كلمة المرور غير صحيحة' : 'Invalid username or password'
        );
      } else if (lower.includes('deactivated')) {
        setErrorMsg(
          isAr ? 'تم تعطيل هذا الحساب — تواصل مع المدير' : 'This account has been deactivated'
        );
      } else if (lower.includes('active workspace access')) {
        setErrorMsg(
          isAr ? 'هذا الحساب لا يملك صلاحية نشطة على مساحة العمل — تواصل مع المدير' : 'This account does not have active workspace access'
        );
      } else {
        setErrorMsg(raw || (isAr ? 'تعذر تسجيل الدخول' : 'Sign in failed'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col justify-between bg-gradient-to-b from-sky-50/60 via-slate-50 to-slate-50 dark:from-[#071526] dark:via-[#090E1A] dark:to-[#090E1A] text-slate-900 dark:text-slate-100 px-4 py-5 pt-safe pb-safe">
      <div className="max-w-md w-full mx-auto flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onToggleLang}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 min-h-[44px] text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <Languages className="h-3.5 w-3.5" />
          <span>{lang === 'ar' ? 'EN' : 'العربية'}</span>
        </button>
        <button
          type="button"
          onClick={onToggleTheme}
          className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="Toggle theme"
        >
          {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </button>
      </div>

      <div className="max-w-md w-full mx-auto my-auto py-4 sm:py-8">
        <div className="rounded-2xl border border-sky-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl shadow-sky-900/5 dark:shadow-none overflow-hidden crm-animate-enter">
          <div className="h-1.5 w-full bg-gradient-to-r from-[#0077B6] via-[#0095D9] to-[#00B5CC]" />
          <div className="bg-gradient-to-b from-sky-50/70 via-cyan-50/30 to-white dark:from-[#0B1E33] dark:via-slate-900 dark:to-slate-900 px-5 sm:px-6 py-6 border-b border-slate-200/80 dark:border-slate-800">
            <div className="flex flex-col items-center text-center">
              <img
                src={BRAND_LOGO_URL}
                alt={BRAND_NAME_AR}
                referrerPolicy="no-referrer"
                className="h-24 w-24 sm:h-28 sm:w-28 rounded-2xl object-cover select-none shadow-lg shadow-[#0077B6]/25 ring-2 ring-white dark:ring-[#0095D9]/35"
              />
              <h1 className="mt-4 text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                {isAr ? BRAND_NAME_AR : BRAND_NAME_EN}
              </h1>
              <p className="mt-0.5 text-[11px] font-medium text-[#0077B6] dark:text-cyan-400" dir="ltr">
                {BRAND_SUBTITLE_EN}
              </p>
              <p className="mt-2.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-xs">
                {t.loginSubtitle}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
            {errorMsg && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 dark:border-red-900/70 bg-red-50 dark:bg-red-950/30 px-3.5 py-2.5 text-xs font-medium text-red-700 dark:text-red-300"
              >
                {errorMsg}
              </div>
            )}

            <div>
              <label
                htmlFor="login-username"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                {t.usernameLabel}
              </label>
              <div className="relative">
                <User className="h-4 w-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
                <input
                  id="login-username"
                  type="text"
                  dir="ltr"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 ps-9 pe-3.5 py-2.5 min-h-[44px] text-base sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0095D9] focus:bg-white dark:focus:bg-slate-950"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                {t.passwordLabel}
              </label>
              <div className="relative">
                <Lock className="h-4 w-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  dir="ltr"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 ps-9 pe-11 py-2.5 min-h-[44px] text-base sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0095D9] focus:bg-white dark:focus:bg-slate-950"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute top-1/2 -translate-y-1/2 end-1.5 min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-gradient-to-r from-[#0077B6] to-[#0096C7] hover:from-[#006299] hover:to-[#0077B6] py-3 px-4 min-h-[46px] text-sm font-semibold text-white shadow-sm shadow-sky-600/20 transition-all disabled:opacity-60"
            >
              {submitting ? t.signingIn : t.signIn}
            </button>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 text-center">
              <ShieldCheck className="h-3.5 w-3.5 text-[#0096C7] shrink-0" />
              <span>
                {isAr
                  ? 'دخول مؤمّن ومرتبط مباشرة بقاعدة البيانات ومساحة عمل عيادات دكتور عبدالله رمضان للأسنان'
                  : 'Secured login linked directly to Dr. Abdullah Ramadan Dental Clinics workspace'}
              </span>
            </div>
          </form>
        </div>
      </div>

      <div className="text-center text-[11px] text-slate-400 pb-1">
        {isAr
          ? 'عيادات دكتور عبدالله رمضان للأسنان — نظام إدارة المرضى والعملاء'
          : 'Dr. Abdullah Ramadan Dental Clinics — CRM Platform'}
      </div>
    </div>
  );
};
