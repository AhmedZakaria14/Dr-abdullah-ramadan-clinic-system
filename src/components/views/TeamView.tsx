import React, { useState } from 'react';
import {
  UserPlus,
  RefreshCw,
  ShieldCheck,
  Crown,
  Database,
  Trash2,
  CheckCircle2,
  KeyRound,
  Lock,
  UserCheck,
  ShieldAlert,
  X,
  Eye,
  EyeOff,
  Copy,
  Radio,
  ArrowLeftRight,
} from 'lucide-react';
import {
  AccountSlot,
  Business,
  Language,
  MonitoredAccountPresence,
  Role,
  TeamMember,
  UserProfile,
} from '../../types/crm';
import { getT } from '../../i18n/translations';
import { apiRequest } from '../../lib/api';
import { DEFAULT_ADMIN_USERNAME, MASTER_OWNER_EMAIL } from '../../lib/constants';
import {
  removeAuthorizedAccountFromFirestore,
  syncAuthorizedAccountToFirestore,
} from '../../lib/firebase';

interface TeamViewProps {
  lang: Language;
  business: Business;
  userRole: Role;
  currentUser: UserProfile;
  members: TeamMember[];
  monitoredAccounts?: MonitoredAccountPresence[];
  onMonitorMember?: (account: MonitoredAccountPresence) => void;
  onRefresh: () => void;
  onNotify: (msg: string, variant?: 'success' | 'error' | 'info') => void;
}

export const TeamView: React.FC<TeamViewProps> = ({
  lang,
  business,
  userRole,
  currentUser,
  members,
  monitoredAccounts = [],
  onMonitorMember,
  onRefresh,
  onNotify,
}) => {
  const t = getT(lang);
  const isAr = lang === 'ar';
  const isAdmin = userRole === 'business_admin' || userRole === 'super_admin';
  const isCurrentOwner =
    Boolean(currentUser.isOwner) ||
    currentUser.username?.toLowerCase() === DEFAULT_ADMIN_USERNAME ||
    currentUser.email?.toLowerCase() === MASTER_OWNER_EMAIL;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [accountSlot, setAccountSlot] = useState<AccountSlot>('moderator');
  const [submitting, setSubmitting] = useState(false);
  const [lastCreatedAccount, setLastCreatedAccount] = useState<{
    username: string;
    email: string;
    slot: AccountSlot;
  } | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const [resetMemberId, setResetMemberId] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [savingReset, setSavingReset] = useState(false);

  const normalizeUsernameInput = (raw: string) => {
    const asciiDigits = raw
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
    const trimmed = asciiDigits.trim().toLowerCase();
    return trimmed.startsWith('@') && !trimmed.slice(1).includes('@') ? trimmed.slice(1).trim() : trimmed;
  };

  const resolveMemberSlot = (member: TeamMember, isOwnerRow: boolean): AccountSlot => {
    if (isOwnerRow) return 'manager';
    if (member.account_slot === 'moderator' || member.role === 'moderator') return 'moderator';
    return 'manager';
  };

  const resolveMonitorTarget = (
    member: TeamMember,
    isOwnerRow: boolean,
    slot: AccountSlot
  ): MonitoredAccountPresence | null => {
    if (!isAdmin || !onMonitorMember || isOwnerRow) return null;
    const isLowerPrivilege =
      slot === 'moderator' ||
      member.role === 'moderator' ||
      member.role === 'employee' ||
      member.role === 'manager';
    if (!isLowerPrivilege || !member.user_id) return null;

    const existing = monitoredAccounts.find(
      (a) => a.userId === member.user_id || a.membershipId === member.id
    );
    if (existing) return existing;

    return {
      userId: member.user_id,
      membershipId: member.id,
      username: member.username || member.invited_email.split('@')[0],
      fullName: member.full_name || member.display_name || member.username || member.invited_email,
      email: member.invited_email,
      role: member.role,
      accountSlot: slot,
      status: member.status,
      online: false,
      activeTab: 'leads',
      activeLeadId: null,
      activeLeadName: null,
      activeLeadCode: null,
      lastActionType: null,
      lastActionAr: null,
      lastActionEn: null,
      lastSeenAt: null,
      todayActionsCount: 0,
    };
  };

  const handleCreateOrUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = normalizeUsernameInput(username);
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanUsername && !cleanEmail) return;
    if (cleanUsername && !/^[a-z0-9._-]{3,32}$/.test(cleanUsername)) {
      onNotify(
        isAr
          ? 'اسم المستخدم يجب أن يكون 3 إلى 32 حرفاً باللغة الإنجليزية أو أرقام بدون مسافات'
          : 'Username must be 3-32 characters (letters, numbers, ., _, -)',
        'error'
      );
      return;
    }
    if (password.length < 6) {
      onNotify(
        isAr ? 'يجب أن تكون كلمة المرور 6 أحرف على الأقل' : 'Password must be at least 6 characters',
        'error'
      );
      return;
    }

    const targetRole: Role = accountSlot === 'moderator' ? 'moderator' : 'business_admin';
    const resolvedEmail = cleanEmail || `${cleanUsername}@drabdullahramadan.local`;

    setSubmitting(true);
    try {
      const res = await apiRequest<{ member?: TeamMember }>(`/businesses/${business.id}/members/invite`, {
        method: 'POST',
        body: JSON.stringify({
          username: cleanUsername || undefined,
          password,
          email: cleanEmail || undefined,
          displayName: displayName.trim(),
          accountSlot,
          role: targetRole,
        }),
      });

      const savedUsername = res?.member?.username || cleanUsername || resolvedEmail.split('@')[0];
      const savedEmail = res?.member?.invited_email || resolvedEmail;

      void syncAuthorizedAccountToFirestore({
        email: savedEmail,
        displayName: displayName.trim() || savedUsername,
        accountType: accountSlot,
        status: 'active',
      });

      setLastCreatedAccount({
        username: savedUsername,
        email: savedEmail,
        slot: accountSlot,
      });
      setUsername('');
      setPassword('');
      setShowCreatePassword(false);
      setEmail('');
      setDisplayName('');
      onNotify(
        isAr
          ? accountSlot === 'moderator'
            ? `تم إنشاء حساب الموديراتور (${savedUsername}) بنجاح وجاهز لتسجيل الدخول فوراً`
            : `تم حفظ حساب المدير (${savedUsername}) بنجاح وجاهز لتسجيل الدخول فوراً`
          : accountSlot === 'moderator'
            ? `Moderator account (${savedUsername}) created and ready to sign in`
            : `Manager account (${savedUsername}) saved and ready to sign in`,
        'success'
      );
      onRefresh();
    } catch (err: any) {
      onNotify(err.message || 'Failed to save account', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateMember = async (
    member: TeamMember,
    patch: { accountSlot?: AccountSlot; status?: string; displayName?: string; password?: string }
  ) => {
    const nextSlot = patch.accountSlot;
    const nextRole: Role | undefined =
      nextSlot === 'moderator' ? 'moderator' : nextSlot === 'manager' ? 'business_admin' : undefined;
    try {
      await apiRequest(`/businesses/${business.id}/members/${member.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...patch,
          ...(nextRole ? { role: nextRole } : {}),
        }),
      });

      const resolvedSlot: AccountSlot =
        nextSlot || (member.account_slot === 'moderator' || member.role === 'moderator' ? 'moderator' : 'manager');
      void syncAuthorizedAccountToFirestore({
        email: member.invited_email,
        displayName: patch.displayName || member.full_name || member.display_name || undefined,
        accountType: resolvedSlot,
        status: (patch.status || member.status) === 'inactive' ? 'inactive' : 'active',
      });

      onNotify(isAr ? 'تم تحديث بيانات الحساب والصلاحيات في قاعدة البيانات' : 'Account updated', 'success');
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, 'error');
    }
  };

  const handleConfirmResetPassword = async (member: TeamMember) => {
    if (resetPasswordValue.length < 6) {
      onNotify(
        isAr ? 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل' : 'Password must be at least 6 characters',
        'error'
      );
      return;
    }
    setSavingReset(true);
    try {
      await handleUpdateMember(member, { password: resetPasswordValue });
      setResetMemberId(null);
      setResetPasswordValue('');
    } finally {
      setSavingReset(false);
    }
  };

  const handleRemoveMember = async (member: TeamMember) => {
    const isProtected =
      Boolean(member.is_owner) ||
      member.username?.toLowerCase() === DEFAULT_ADMIN_USERNAME ||
      member.invited_email.toLowerCase() === MASTER_OWNER_EMAIL;
    if (isProtected) return;
    try {
      await apiRequest(`/businesses/${business.id}/members/${member.id}`, {
        method: 'DELETE',
      });
      void removeAuthorizedAccountFromFirestore(member.invited_email);
      onNotify(
        isAr
          ? `تم حذف الحساب ${member.username || member.invited_email} وسحب صلاحياته من قاعدة البيانات`
          : `Deleted account ${member.username || member.invited_email}`,
        'info'
      );
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, 'error');
    }
  };

  const handleChangeMyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      onNotify(
        isAr ? 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل' : 'New password must be at least 6 characters',
        'error'
      );
      return;
    }
    setChangingPassword(true);
    try {
      await apiRequest('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });
      setCurrentPassword('');
      setNewPassword('');
      onNotify(isAr ? 'تم تحديث كلمة المرور بنجاح' : 'Password updated successfully', 'success');
    } catch (err: any) {
      onNotify(err.message || 'Failed to update password', 'error');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleToggleRoundRobin = async () => {
    try {
      await apiRequest(`/businesses/${business.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ roundRobinEnabled: !business.round_robin_enabled }),
      });
      onNotify(isAr ? 'تم تحديث إعداد التوزيع التلقائي' : 'Round-robin setting updated', 'success');
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, 'error');
    }
  };

  const managerCount = members.filter(
    (m) => m.account_slot !== 'moderator' && m.role !== 'moderator'
  ).length;
  const moderatorCount = members.filter(
    (m) => m.account_slot === 'moderator' || m.role === 'moderator'
  ).length;

  return (
    <div className="space-y-6">
      {/* System Accounts Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/20 p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-bold text-amber-950 dark:text-amber-200">
              <Crown className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span>{isAr ? 'حساب المدير الرئيسي' : 'Primary Manager Account'}</span>
            </div>
            <span className="rounded-md bg-amber-100 dark:bg-amber-900/50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:text-amber-200">
              {isAr ? 'صلاحية كاملة' : 'Full Access'}
            </span>
          </div>
          <div className="mt-2.5 flex items-center gap-2 text-xs">
            <span className="text-slate-500 dark:text-slate-400">{t.usernameLabel}:</span>
            <span className="font-mono font-bold text-slate-900 dark:text-slate-100" dir="ltr">
              {DEFAULT_ADMIN_USERNAME}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {isAr
              ? 'حساب الإدارة الرئيسي بجميع صلاحيات لوحة التحكم وإدارة حسابات الموديراتور والتكاملات والإعدادات.'
              : 'Primary admin account with full control over moderator accounts, integrations, and clinic settings.'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <ShieldCheck className="h-4 w-4 text-[#0077B6] dark:text-cyan-400" />
              <span>{isAr ? 'حسابات النظام المفعلة' : 'Active System Accounts'}</span>
            </div>
            <span className="rounded-md bg-sky-50 dark:bg-sky-950/40 px-2 py-0.5 text-[11px] font-semibold text-[#0077B6] dark:text-cyan-300 tabular-nums">
              {members.length}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2.5 text-xs">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
              <div className="text-slate-500 dark:text-slate-400">{isAr ? 'حساب المدير' : 'Manager'}</div>
              <div className="mt-1 text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {managerCount}
              </div>
              <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                {isAr ? 'صلاحية كاملة 100%' : '100% Full Access'}
              </div>
            </div>
            <div className="rounded-lg border border-sky-200/80 dark:border-sky-900/60 bg-sky-50/50 dark:bg-sky-950/20 p-3">
              <div className="text-slate-600 dark:text-slate-300">{isAr ? 'الموديراتور' : 'Moderators'}</div>
              <div className="mt-1 text-base font-bold text-[#0077B6] dark:text-cyan-300 tabular-nums">
                {moderatorCount}
              </div>
              <div className="text-[11px] text-[#0077B6] dark:text-cyan-400 font-medium">
                {isAr ? 'متابعة الليدز فقط' : 'Lead Follow-Up'}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span>{isAr ? 'المصادقة وقواعد البيانات' : 'Database Authentication'}</span>
              </div>
              <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-3 w-3" />
                <span>{isAr ? 'متزامن ومؤمّن' : 'Synced'}</span>
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {isAr
                ? 'تُحفظ حسابات المدير والموديراتور بكلمات مرور مشفرة في قاعدة البيانات مع تطبيق صلاحيات كل دور على الخادم وقواعد Firestore.'
                : 'Manager and Moderator accounts are hashed with scrypt, persisted in the database, and enforced across API & Firestore rules.'}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              <span>{t.roundRobinLabel}</span>
            </span>
            {isAdmin && (
              <button
                type="button"
                onClick={handleToggleRoundRobin}
                className={`rounded-md px-2.5 py-1 text-xs font-medium text-white transition-colors ${
                  business.round_robin_enabled
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-slate-700 hover:bg-slate-800'
                }`}
              >
                {business.round_robin_enabled ? (isAr ? 'مفعل' : 'Enabled') : isAr ? 'معطل' : 'Disabled'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Add Moderator / Manager Account */}
      {isAdmin && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <UserPlus className="h-4 w-4 text-[#0077B6] dark:text-cyan-400" />
              <span>
                {isAr
                  ? 'إضافة حساب موديراتور لمتابعة الليدز أو حساب مدير'
                  : 'Create Moderator (Lead Follow-Up) or Manager Account'}
              </span>
            </div>
            {isCurrentOwner && (
              <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                {isAr ? 'صلاحية المدير الرئيسي مفعلة' : 'Owner permissions active'}
              </span>
            )}
          </div>

          <form onSubmit={handleCreateOrUpdateAccount} autoComplete="off" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <input
              type="text"
              required
              dir="ltr"
              name="new_staff_username"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={isAr ? 'اسم المستخدم (مثال: mod1)' : 'Username (e.g. mod1)'}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 min-h-[44px] sm:min-h-0 text-base sm:text-sm"
            />
            <div className="relative">
              <input
                type={showCreatePassword ? 'text' : 'password'}
                required
                minLength={6}
                dir="ltr"
                name="new_staff_password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isAr ? 'كلمة المرور (6+ أحرف)' : 'Password (6+ chars)'}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 ps-3 pe-9 py-2 min-h-[44px] sm:min-h-0 text-base sm:text-sm"
              />
              <button
                type="button"
                onClick={() => setShowCreatePassword((v) => !v)}
                className="absolute top-1/2 -translate-y-1/2 end-1.5 p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                aria-label={showCreatePassword ? 'Hide password' : 'Show password'}
              >
                {showCreatePassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            <input
              type="text"
              name="new_staff_display_name"
              autoComplete="off"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={isAr ? 'الاسم المعروض (مثال: سارة - موديراتور)' : 'Display name'}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 min-h-[44px] sm:min-h-0 text-base sm:text-sm"
            />
            <input
              type="email"
              dir="ltr"
              name="new_staff_email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={isAr ? 'البريد (اختياري)' : 'Email (optional)'}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 min-h-[44px] sm:min-h-0 text-base sm:text-sm"
            />
            <select
              value={accountSlot}
              onChange={(e) => setAccountSlot(e.target.value as AccountSlot)}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 min-h-[44px] sm:min-h-0 text-base sm:text-sm font-medium"
            >
              <option value="moderator">
                {isAr ? 'موديراتور (متابعة الليدز)' : 'Moderator (Lead Follow-Up)'}
              </option>
              <option value="manager">
                {isAr ? 'حساب مدير (صلاحية كاملة)' : 'Manager (Full Access)'}
              </option>
            </select>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-[#0077B6] hover:bg-[#006299] dark:bg-[#0096C7] px-4 min-h-[44px] sm:min-h-0 sm:py-2 text-xs font-semibold text-white whitespace-nowrap disabled:opacity-50 transition-colors"
            >
              {submitting
                ? isAr
                  ? 'جاري الحفظ...'
                  : 'Saving...'
                : accountSlot === 'moderator'
                  ? isAr
                    ? 'إضافة حساب موديراتور'
                    : 'Add Moderator'
                  : isAr
                    ? 'إضافة حساب مدير'
                    : 'Add Manager'}
            </button>
          </form>

          {lastCreatedAccount && (
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/25 px-3.5 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 text-emerald-900 dark:text-emerald-200">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>
                  {isAr ? 'تم حفظ الحساب بنجاح — اسم المستخدم للدخول:' : 'Account saved — login username:'}
                </span>
                <code className="rounded bg-white dark:bg-slate-900 px-2 py-0.5 font-mono font-bold text-slate-900 dark:text-white border border-emerald-200 dark:border-emerald-800" dir="ltr">
                  {lastCreatedAccount.username}
                </code>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(lastCreatedAccount.username).catch(() => {});
                    onNotify(isAr ? 'تم نسخ اسم المستخدم' : 'Username copied', 'info');
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-900 px-2 py-1 text-[11px] font-medium text-emerald-800 dark:text-emerald-200 hover:bg-emerald-50"
                >
                  <Copy className="h-3 w-3" />
                  <span>{isAr ? 'نسخ' : 'Copy'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLastCreatedAccount(null)}
                  className="p-1 text-emerald-700/70 hover:text-emerald-900 dark:text-emerald-300"
                  aria-label="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Dynamic Role Permissions Preview */}
          {accountSlot === 'moderator' ? (
            <div className="rounded-lg border border-sky-200/80 dark:border-sky-900/60 bg-sky-50/60 dark:bg-sky-950/20 p-3.5 text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-[#0077B6] dark:text-cyan-300">
                <UserCheck className="h-4 w-4 shrink-0" />
                <span>{isAr ? 'نطاق صلاحيات حساب الموديراتور' : 'Moderator Permission Scope'}</span>
              </div>
              <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                {isAr
                  ? 'مسموح له: عرض ومتابعة جميع الليدز والمرضى، إضافة وتحديث حالة العميل ومراحل العلاج، كتابة الملاحظات وجدولة المتابعات، التواصل عبر واتساب والهاتف، مزامنة الشيت يدوياً، وتصدير التقارير.'
                  : 'Allowed: View & follow up on all leads, add/update patient status & treatment progress, write clinical notes & schedule follow-ups, contact via WhatsApp/phone, sync leads, and export reports.'}
              </p>
              <p className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 leading-relaxed">
                <ShieldAlert className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>
                  {isAr
                    ? 'محظور عليه: إدارة الحسابات، تعديل إعدادات العيادة أو الحقول المخصصة، تعديل أو حذف تكاملات الشيت وميتا، حذف المراحل، أو تحميل النسخ الاحتياطية.'
                    : 'Restricted: Cannot manage accounts, modify clinic settings/custom fields, configure or remove integrations, delete stages, or download backups.'}
                </span>
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-amber-200/80 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20 p-3.5 text-xs flex items-center gap-2 text-amber-900 dark:text-amber-200">
              <Crown className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>
                {isAr
                  ? 'حساب المدير يحصل على صلاحية إدارية كاملة 100% على جميع الأقسام والحسابات والتكاملات والإعدادات.'
                  : 'Manager accounts receive 100% full administrative access across all modules, accounts, integrations, and settings.'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Accounts Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{t.navTeam}</h3>
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            <span>
              {isAr
                ? 'صلاحيات دقيقة حسب نوع الحساب · محفوظة ومربوطة بقواعد البيانات'
                : 'Role-Based Permissions · Persisted & Synced Across Databases'}
            </span>
          </span>
        </div>

        {/* Mobile Account Cards */}
        <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
          {members.map((m) => {
            const emailLower = m.invited_email.toLowerCase();
            const isOwnerRow =
              Boolean(m.is_owner) ||
              m.username?.toLowerCase() === DEFAULT_ADMIN_USERNAME ||
              emailLower === MASTER_OWNER_EMAIL;
            const slot = resolveMemberSlot(m, isOwnerRow);
            const isModRow = slot === 'moderator';
            const monitorTarget = resolveMonitorTarget(m, isOwnerRow, slot);

            return (
              <div key={m.id} className="p-4 space-y-2.5 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-slate-100">
                      {monitorTarget && (
                        <span
                          className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                            monitorTarget.online ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-600'
                          }`}
                          title={monitorTarget.online ? (isAr ? 'متصل الآن' : 'Online now') : isAr ? 'غير متصل' : 'Offline'}
                        />
                      )}
                      <span className="truncate">{m.full_name || m.display_name || '—'}</span>
                      {isOwnerRow && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-200 shrink-0">
                          <Crown className="h-3 w-3" />
                          <span>{isAr ? 'الرئيسي' : 'Owner'}</span>
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 font-mono text-slate-600 dark:text-slate-300" dir="ltr">
                      @{m.username || emailLower.split('@')[0]} · {m.invited_email}
                    </div>
                  </div>
                  {isModRow ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 dark:bg-sky-950/40 px-2 py-1 text-[11px] font-semibold text-[#0077B6] dark:text-cyan-300 shrink-0">
                      <UserCheck className="h-3 w-3" />
                      <span>{isAr ? 'متابعة الليدز' : 'Moderator'}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 shrink-0">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>{isAr ? 'صلاحية كاملة' : 'Full'}</span>
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {isAdmin && !isOwnerRow ? (
                    <>
                      {monitorTarget && onMonitorMember && (
                        <button
                          type="button"
                          onClick={() => onMonitorMember(monitorTarget)}
                          className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-3 min-h-[38px] text-xs font-semibold text-white transition-colors"
                        >
                          <Radio className={`h-3.5 w-3.5 ${monitorTarget.online ? 'animate-pulse text-emerald-300' : ''}`} />
                          <span>
                            {isAr
                              ? `دخول واجهة الحساب والمراقبة اللحظية${monitorTarget.online ? ' (متصل الآن)' : ''}`
                              : `Enter Account Interface & Monitor Live${monitorTarget.online ? ' (Online)' : ''}`}
                          </span>
                        </button>
                      )}
                      <select
                        value={slot}
                        onChange={(e) => handleUpdateMember(m, { accountSlot: e.target.value as AccountSlot })}
                        className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 min-h-[38px] text-xs font-medium"
                      >
                        <option value="moderator">{isAr ? 'حساب موديراتور' : 'Moderator'}</option>
                        <option value="manager">{isAr ? 'حساب مدير' : 'Manager'}</option>
                      </select>
                      <select
                        value={m.status}
                        onChange={(e) => handleUpdateMember(m, { status: e.target.value })}
                        className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 min-h-[38px] text-xs"
                      >
                        <option value="active">{t.active}</option>
                        <option value="inactive">{t.inactive}</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          setResetMemberId(resetMemberId === m.id ? null : m.id);
                          setResetPasswordValue('');
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 min-h-[38px] text-xs font-medium text-slate-700 dark:text-slate-200"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                        <span>{isAr ? 'كلمة المرور' : 'Reset PW'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(m)}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 dark:border-red-900/60 px-3 min-h-[38px] text-xs font-medium text-red-600 dark:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>{isAr ? 'حذف' : 'Delete'}</span>
                      </button>
                    </>
                  ) : (
                    <span className="text-[11px] text-slate-400">
                      {isModRow ? (isAr ? 'حساب موديراتور' : 'Moderator') : isAr ? 'حساب المدير' : 'Manager'} · {t.active}
                    </span>
                  )}
                </div>

                {resetMemberId === m.id && isAdmin && !isOwnerRow && (
                  <div className="pt-2 flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showResetPassword ? 'text' : 'password'}
                        dir="ltr"
                        minLength={6}
                        autoComplete="new-password"
                        value={resetPasswordValue}
                        onChange={(e) => setResetPasswordValue(e.target.value)}
                        placeholder={isAr ? 'كلمة المرور الجديدة (6+)' : 'New password (6+)'}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 ps-2.5 pe-8 min-h-[38px] text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setShowResetPassword((v) => !v)}
                        className="absolute top-1/2 -translate-y-1/2 end-1.5 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                        aria-label={showResetPassword ? 'Hide password' : 'Show password'}
                      >
                        {showResetPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={savingReset}
                      onClick={() => handleConfirmResetPassword(m)}
                      className="rounded-lg bg-[#0077B6] px-3 min-h-[38px] text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {isAr ? 'حفظ' : 'Save'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-start border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 font-semibold">
                <th className="py-3 px-4 text-start">{t.customerName}</th>
                <th className="py-3 px-4 text-start">{t.usernameLabel}</th>
                <th className="py-3 px-4 text-start">{t.email}</th>
                <th className="py-3 px-4 text-start">{isAr ? 'نوع الحساب' : 'Account Type'}</th>
                <th className="py-3 px-4 text-start">{isAr ? 'مستوى الصلاحية' : 'Access Level'}</th>
                <th className="py-3 px-4 text-start">{t.status}</th>
                <th className="py-3 px-4 text-end">{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {members.map((m) => {
                const emailLower = m.invited_email.toLowerCase();
                const isOwnerRow =
                  Boolean(m.is_owner) ||
                  m.username?.toLowerCase() === DEFAULT_ADMIN_USERNAME ||
                  emailLower === MASTER_OWNER_EMAIL;
                const slot = resolveMemberSlot(m, isOwnerRow);
                const isModRow = slot === 'moderator';
                const monitorTarget = resolveMonitorTarget(m, isOwnerRow, slot);

                return (
                  <React.Fragment key={m.id}>
                    <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                        <div className="flex items-center gap-2">
                          {monitorTarget && (
                            <span
                              className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                                monitorTarget.online ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-600'
                              }`}
                              title={monitorTarget.online ? (isAr ? 'متصل الآن' : 'Online now') : isAr ? 'غير متصل' : 'Offline'}
                            />
                          )}
                          <span>{m.full_name || m.display_name || '—'}</span>
                          {isOwnerRow && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-200">
                              <Crown className="h-3 w-3" />
                              <span>{isAr ? 'الرئيسي' : 'Owner'}</span>
                            </span>
                          )}
                          {monitorTarget?.online && (
                            <span className="rounded bg-emerald-100 dark:bg-emerald-950/60 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                              {isAr ? 'متصل الآن' : 'Online'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-slate-800 dark:text-slate-200" dir="ltr">
                        {m.username || emailLower.split('@')[0]}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500 dark:text-slate-400" dir="ltr">
                        {m.invited_email}
                      </td>
                      <td className="py-3 px-4">
                        {isAdmin && !isOwnerRow ? (
                          <select
                            value={slot}
                            onChange={(e) =>
                              handleUpdateMember(m, { accountSlot: e.target.value as AccountSlot })
                            }
                            className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-xs font-medium"
                          >
                            <option value="moderator">{isAr ? 'حساب موديراتور' : 'Moderator Account'}</option>
                            <option value="manager">{isAr ? 'حساب مدير' : 'Manager Account'}</option>
                          </select>
                        ) : (
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {isModRow
                              ? isAr
                                ? 'حساب موديراتور'
                                : 'Moderator Account'
                              : isAr
                                ? 'حساب المدير'
                                : 'Manager Account'}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {isModRow ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 dark:bg-sky-950/40 px-2 py-0.5 text-[11px] font-semibold text-[#0077B6] dark:text-cyan-300">
                            <UserCheck className="h-3 w-3" />
                            <span>{isAr ? 'صلاحيات الموديراتور (متابعة الليدز)' : 'Moderator (Lead Follow-Up)'}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>{isAr ? 'صلاحية كاملة' : 'Full Access'}</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {isAdmin && !isOwnerRow ? (
                          <select
                            value={m.status}
                            onChange={(e) => handleUpdateMember(m, { status: e.target.value })}
                            className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-xs"
                          >
                            <option value="active">{t.active}</option>
                            <option value="inactive">{t.inactive}</option>
                          </select>
                        ) : (
                          <span className="font-medium text-emerald-600 dark:text-emerald-400">
                            {t.active}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-end">
                        {!isOwnerRow && isAdmin ? (
                          <div className="inline-flex items-center gap-1.5">
                            {monitorTarget && onMonitorMember && (
                              <button
                                type="button"
                                onClick={() => onMonitorMember(monitorTarget)}
                                className="inline-flex items-center gap-1 rounded-md bg-indigo-600 hover:bg-indigo-700 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors"
                                title={
                                  isAr
                                    ? 'التحويل لواجهة هذا الحساب ومراقبة نشاطه لحظياً (حصرية للأدمن)'
                                    : 'Switch into this account interface and monitor live (Admin only)'
                                }
                              >
                                <ArrowLeftRight className="h-3 w-3" />
                                <span>{isAr ? 'مراقبة لحظية' : 'Monitor Live'}</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setResetMemberId(resetMemberId === m.id ? null : m.id);
                                setResetPasswordValue('');
                              }}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                              title={isAr ? 'تغيير كلمة المرور' : 'Reset password'}
                            >
                              <KeyRound className="h-3 w-3" />
                              <span>{isAr ? 'كلمة المرور' : 'Password'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveMember(m)}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 text-[11px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                              title={isAr ? 'حذف / سحب الصلاحية' : 'Revoke access'}
                            >
                              <Trash2 className="h-3 w-3" />
                              <span>{isAr ? 'حذف' : 'Delete'}</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">
                            {isAr ? 'حساب محمي' : 'Protected'}
                          </span>
                        )}
                      </td>
                    </tr>

                    {resetMemberId === m.id && isAdmin && !isOwnerRow && (
                      <tr className="bg-sky-50/40 dark:bg-sky-950/20">
                        <td colSpan={7} className="py-2.5 px-4">
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-xs text-slate-600 dark:text-slate-300">
                              {isAr
                                ? `تعيين كلمة مرور جديدة للحساب (${m.username || m.invited_email}):`
                                : `Set new password for (${m.username || m.invited_email}):`}
                            </span>
                            <div className="relative">
                              <input
                                type={showResetPassword ? 'text' : 'password'}
                                dir="ltr"
                                minLength={6}
                                autoComplete="new-password"
                                value={resetPasswordValue}
                                onChange={(e) => setResetPasswordValue(e.target.value)}
                                placeholder={isAr ? 'كلمة المرور الجديدة (6+ أحرف)' : 'New password (6+ chars)'}
                                className="w-56 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 ps-2.5 pe-8 py-1 text-xs"
                              />
                              <button
                                type="button"
                                onClick={() => setShowResetPassword((v) => !v)}
                                className="absolute top-1/2 -translate-y-1/2 end-1.5 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                aria-label={showResetPassword ? 'Hide password' : 'Show password'}
                              >
                                {showResetPassword ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                              </button>
                            </div>
                            <button
                              type="button"
                              disabled={savingReset}
                              onClick={() => handleConfirmResetPassword(m)}
                              className="rounded-md bg-[#0077B6] hover:bg-[#006299] px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                            >
                              {savingReset ? t.loading : isAr ? 'تحديث' : 'Update'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setResetMemberId(null);
                                setResetPasswordValue('');
                              }}
                              className="rounded-md border border-slate-200 dark:border-slate-700 p-1 text-slate-500 hover:text-slate-700"
                              aria-label="Cancel"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Change Current User Password */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
            <KeyRound className="h-4 w-4 text-[#0077B6] dark:text-cyan-400" />
            <span>
              {isAr
                ? `تغيير كلمة المرور للحساب الحالي (${currentUser.username || currentUser.email})`
                : `Change Password (${currentUser.username || currentUser.email})`}
            </span>
          </div>
        </div>
        <form onSubmit={handleChangeMyPassword} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="password"
            dir="ltr"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder={isAr ? 'كلمة المرور الحالية' : 'Current password'}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 min-h-[44px] sm:min-h-0 text-base sm:text-sm"
          />
          <input
            type="password"
            dir="ltr"
            required
            minLength={6}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={isAr ? 'كلمة المرور الجديدة (6+ أحرف)' : 'New password (6+ chars)'}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 min-h-[44px] sm:min-h-0 text-base sm:text-sm"
          />
          <button
            type="submit"
            disabled={changingPassword}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#0077B6] hover:bg-[#006299] dark:bg-[#0096C7] px-4 min-h-[44px] sm:min-h-0 sm:py-2 text-xs font-semibold text-white disabled:opacity-50 transition-colors"
          >
            <Lock className="h-3.5 w-3.5" />
            <span>{changingPassword ? t.loading : isAr ? 'تحديث كلمة المرور' : 'Update Password'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
