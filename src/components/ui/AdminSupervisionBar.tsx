import React, { useEffect, useRef, useState } from 'react';
import {
  Eye,
  Radio,
  ArrowLeftRight,
  LogOut,
  Activity,
  X,
  MessageSquare,
  FileText,
  RefreshCw,
  UserCheck,
  Clock,
  ArrowUpRight,
  ChevronDown,
  ShieldCheck,
  CheckCircle2,
  CalendarClock,
} from 'lucide-react';
import {
  Language,
  MonitoredAccountFeedResponse,
  MonitoredAccountPresence,
  MonitoredActivityItem,
} from '../../types/crm';
import { formatCairoDateTime, formatCairoTimeOnly } from '../../lib/dateFormat';

export function formatTabDisplay(tab: string, isAr: boolean): string {
  switch (tab) {
    case 'dashboard':
      return isAr ? 'لوحة التحكم' : 'Dashboard';
    case 'leads':
      return isAr ? 'قائمة العملاء (الليدز)' : 'Leads List';
    case 'pipeline':
      return isAr ? 'لوحة المراحل (Pipeline)' : 'Pipeline Board';
    case 'followups':
      return isAr ? 'المتابعات والمواعيد' : 'Follow-Ups';
    case 'campaigns':
      return isAr ? 'الحملات الإعلانية' : 'Campaigns';
    default:
      return isAr ? 'قائمة العملاء' : 'Leads';
  }
}

export function formatRoleLabel(role: string, slot: string | undefined, isAr: boolean): string {
  if (role === 'moderator' || slot === 'moderator') {
    return isAr ? 'حساب موديراتور' : 'Moderator';
  }
  if (role === 'manager') {
    return isAr ? 'مدير مبيعات' : 'Sales Manager';
  }
  if (role === 'employee') {
    return isAr ? 'موظف متابعة' : 'Employee';
  }
  return isAr ? 'عضو فريق' : 'Team Member';
}

interface AdminAccountSwitcherProps {
  lang: Language;
  accounts: MonitoredAccountPresence[];
  activeMonitored: MonitoredAccountPresence | null;
  onStartMonitor: (account: MonitoredAccountPresence) => void;
  onStopMonitor: () => void;
  onRefreshAccounts: () => void;
}

export const AdminAccountSwitcher: React.FC<AdminAccountSwitcherProps> = ({
  lang,
  accounts,
  activeMonitored,
  onStartMonitor,
  onStopMonitor,
  onRefreshAccounts,
}) => {
  const isAr = lang === 'ar';
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const onlineCount = accounts.filter((a) => a.online).length;

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => {
          if (!open) onRefreshAccounts();
          setOpen((v) => !v);
        }}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 min-h-[38px] sm:min-h-0 text-xs font-semibold transition-colors whitespace-nowrap ${
          activeMonitored
            ? 'border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200'
            : 'border-indigo-200 dark:border-indigo-800/80 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-200 hover:bg-indigo-100/80 dark:hover:bg-indigo-900/50'
        }`}
        title={isAr ? 'مراقبة الحسابات والتبديل لواجهة الموديراتور لحظياً' : 'Monitor accounts & switch to Moderator interface live'}
      >
        <Eye className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden sm:inline">
          {activeMonitored
            ? isAr
              ? `مراقبة: ${activeMonitored.fullName}`
              : `Viewing: ${activeMonitored.fullName}`
            : isAr
              ? 'مراقبة الحسابات'
              : 'Monitor Staff'}
        </span>
        {onlineCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums">
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
            {onlineCount}
          </span>
        )}
        <ChevronDown className="h-3 w-3 opacity-70 shrink-0" />
      </button>

      {open && (
        <div className="fixed inset-x-3 top-16 sm:absolute sm:inset-x-auto sm:end-0 sm:top-auto sm:mt-2 sm:w-96 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl z-50 overflow-hidden crm-animate-enter">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-indigo-50/60 dark:bg-indigo-950/30 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <ShieldCheck className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                  {isAr ? 'رقابة الأدمن اللحظية على الحسابات' : 'Admin Live Account Supervision'}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {isAr ? 'حصرية لحساب المالك/الأدمن فقط' : 'Restricted strictly to Owner/Admin'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onRefreshAccounts}
              className="p-1.5 rounded-md text-slate-500 hover:bg-white dark:hover:bg-slate-800 hover:text-indigo-600 transition-colors"
              title={isAr ? 'تحديث الحالة اللحظية' : 'Refresh live status'}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {accounts.length === 0 ? (
              <div className="p-5 text-center space-y-1.5">
                <UserCheck className="h-6 w-6 mx-auto text-slate-300 dark:text-slate-600" />
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {isAr ? 'لا توجد حسابات موديراتور أو موظفين حالياً' : 'No Moderator or staff accounts yet'}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {isAr
                    ? 'أنشئ حساب موديراتور من تبويب «الفريق» لتتمكن من مراقبته والتبديل إلى واجهته لحظياً.'
                    : 'Create a Moderator account in the Team tab to monitor and switch to their view live.'}
                </div>
              </div>
            ) : (
              accounts.map((acc) => {
                const isSelected = activeMonitored?.userId === acc.userId;
                return (
                  <div
                    key={acc.userId}
                    className={`p-3.5 transition-colors ${
                      isSelected
                        ? 'bg-amber-50/70 dark:bg-amber-950/30'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                              acc.online ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-600'
                            }`}
                          />
                          <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                            {acc.fullName}
                          </span>
                          <span className="rounded bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 px-1.5 py-0.5 text-[10px] font-semibold text-[#0077B6] dark:text-cyan-300 shrink-0">
                            {formatRoleLabel(acc.role, acc.accountSlot, isAr)}
                          </span>
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          <span className="font-mono" dir="ltr">@{acc.username}</span>
                          <span>·</span>
                          <span className={acc.online ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : ''}>
                            {acc.online
                              ? isAr
                                ? 'متصل الآن'
                                : 'Online now'
                              : acc.lastSeenAt
                                ? isAr
                                  ? `آخر ظهور ${formatCairoTimeOnly(acc.lastSeenAt, lang)}`
                                  : `Last seen ${formatCairoTimeOnly(acc.lastSeenAt, lang)}`
                                : isAr
                                  ? 'لم يدخل بعد'
                                  : 'Not signed in yet'}
                          </span>
                        </div>

                        <div className="mt-1.5 text-[11px] text-slate-600 dark:text-slate-300 truncate">
                          {acc.activeLeadName ? (
                            <span>
                              {isAr ? 'يشاهد الآن:' : 'Viewing:'}{' '}
                              <strong className="text-slate-900 dark:text-white">
                                {acc.activeLeadName} {acc.activeLeadCode ? `(${acc.activeLeadCode})` : ''}
                              </strong>
                            </span>
                          ) : (
                            <span>
                              {isAr ? 'القسم الحالي:' : 'Current view:'}{' '}
                              <strong>{formatTabDisplay(acc.activeTab, isAr)}</strong>
                            </span>
                          )}
                        </div>

                        {(acc.lastActionAr || acc.lastActionEn) && (
                          <div className="mt-1 text-[11px] text-indigo-700 dark:text-indigo-300 line-clamp-1">
                            {isAr ? acc.lastActionAr : acc.lastActionEn}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          if (isSelected) {
                            onStopMonitor();
                          } else {
                            onStartMonitor(acc);
                          }
                        }}
                        className={`shrink-0 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                          isSelected
                            ? 'bg-amber-600 hover:bg-amber-700 text-white'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                        }`}
                      >
                        <ArrowLeftRight className="h-3 w-3" />
                        <span>
                          {isSelected
                            ? isAr
                              ? 'إنهاء'
                              : 'Exit'
                            : isAr
                              ? 'دخول للواجهة'
                              : 'Enter View'}
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {activeMonitored && (
            <div className="p-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onStopMonitor();
                }}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 py-2 text-xs font-bold hover:opacity-90 transition-opacity"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>{isAr ? 'العودة فوراً إلى واجهة الأدمن الكاملة' : 'Return to Full Admin Interface'}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface AdminSupervisionBannerProps {
  lang: Language;
  account: MonitoredAccountPresence;
  allAccounts: MonitoredAccountPresence[];
  followLive: boolean;
  onToggleFollowLive: () => void;
  onJumpToActiveScreen: () => void;
  onOpenActivityDrawer: () => void;
  onSwitchAccount: (account: MonitoredAccountPresence) => void;
  onExitMonitoring: () => void;
}

export const AdminSupervisionBanner: React.FC<AdminSupervisionBannerProps> = ({
  lang,
  account,
  allAccounts,
  followLive,
  onToggleFollowLive,
  onJumpToActiveScreen,
  onOpenActivityDrawer,
  onSwitchAccount,
  onExitMonitoring,
}) => {
  const isAr = lang === 'ar';

  return (
    <div className="sticky top-0 z-40 border-b border-amber-300 dark:border-amber-700/80 bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-950 text-white px-3 sm:px-5 py-2.5 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {/* Left: Monitored Account Identity & Real-Time Location */}
        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
          <div className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/20 border border-amber-400/40 px-2 py-1 text-[11px] font-bold text-amber-300 shrink-0">
            <Radio className={`h-3.5 w-3.5 ${account.online ? 'text-emerald-400 animate-pulse' : 'text-amber-300'}`} />
            <span>{isAr ? 'وضع رقابة الأدمن اللحظية' : 'Admin Live Supervision'}</span>
          </div>

          <div className="flex items-center gap-2 text-xs min-w-0">
            <span
              className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                account.online ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'
              }`}
            />
            <span className="font-bold truncate">{account.fullName}</span>
            <span className="text-[11px] text-indigo-200 font-mono" dir="ltr">
              @{account.username}
            </span>
            <span className="hidden sm:inline rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-200">
              {formatRoleLabel(account.role, account.accountSlot, isAr)}
            </span>
          </div>

          <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-200 bg-white/10 rounded-md px-2.5 py-1 max-w-md truncate">
            <Eye className="h-3.5 w-3.5 text-cyan-300 shrink-0" />
            {account.activeLeadName ? (
              <button
                type="button"
                onClick={onJumpToActiveScreen}
                className="truncate hover:underline text-start"
              >
                {isAr ? 'يتصفح الآن ملف:' : 'Viewing lead:'}{' '}
                <strong className="text-white">
                  {account.activeLeadName} {account.activeLeadCode ? `(${account.activeLeadCode})` : ''}
                </strong>
              </button>
            ) : (
              <button
                type="button"
                onClick={onJumpToActiveScreen}
                className="truncate hover:underline text-start"
              >
                {isAr ? 'داخل قسم:' : 'In section:'}{' '}
                <strong className="text-white">{formatTabDisplay(account.activeTab, isAr)}</strong>
              </button>
            )}
          </div>
        </div>

        {/* Right: Controls */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {allAccounts.length > 1 && (
            <select
              value={account.userId}
              onChange={(e) => {
                const next = allAccounts.find((a) => a.userId === e.target.value);
                if (next) onSwitchAccount(next);
              }}
              className="rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-[11px] font-semibold text-white focus:outline-none cursor-pointer"
              aria-label={isAr ? 'تبديل الحساب المراقب' : 'Switch monitored account'}
            >
              {allAccounts.map((a) => (
                <option key={a.userId} value={a.userId} className="bg-slate-900 text-white">
                  {a.online ? '🟢 ' : '⚪ '}
                  {a.fullName} (@{a.username})
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={onToggleFollowLive}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
              followLive
                ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
                : 'border-white/20 bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
            title={
              isAr
                ? 'تتبع شاشة الموديراتور تلقائياً عند تنقله بين العملاء والأقسام'
                : 'Automatically follow the Moderator as they switch screens and leads'
            }
          >
            <Radio className={`h-3.5 w-3.5 ${followLive ? 'animate-pulse text-emerald-400' : ''}`} />
            <span>{followLive ? (isAr ? 'تتبع لحظي: مفعل' : 'Follow Live: ON') : isAr ? 'تتبع لحظي: متوقف' : 'Follow Live: OFF'}</span>
          </button>

          <button
            type="button"
            onClick={onOpenActivityDrawer}
            className="inline-flex items-center gap-1.5 rounded-lg border border-sky-400/50 bg-sky-500/20 px-2.5 py-1.5 text-[11px] font-semibold text-sky-100 hover:bg-sky-500/30 transition-colors"
          >
            <Activity className="h-3.5 w-3.5" />
            <span>{isAr ? 'السجل اللحظي' : 'Live Activity'}</span>
          </button>

          <button
            type="button"
            onClick={onExitMonitoring}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 px-3 py-1.5 text-xs font-bold transition-colors shadow-xs"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>{isAr ? 'العودة لواجهة الأدمن' : 'Exit to Admin'}</span>
          </button>
        </div>
      </div>

      {/* Latest Live Action Ticker */}
      {(account.lastActionAr || account.lastActionEn) && (
        <div className="mt-1.5 pt-1.5 border-t border-white/10 flex items-center justify-between gap-2 text-[11px] text-indigo-100/90">
          <div className="flex items-center gap-1.5 min-w-0 truncate">
            <Activity className="h-3 w-3 text-amber-300 shrink-0" />
            <span className="font-semibold text-amber-200 shrink-0">
              {isAr ? 'آخر إجراء لحظي:' : 'Latest action:'}
            </span>
            <span className="truncate">{isAr ? account.lastActionAr : account.lastActionEn}</span>
          </div>
          {account.lastSeenAt && (
            <span className="font-mono text-[10px] text-slate-300 tabular-nums shrink-0" dir="ltr">
              {formatCairoTimeOnly(account.lastSeenAt, lang)}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

interface AdminLiveActivityDrawerProps {
  lang: Language;
  open: boolean;
  account: MonitoredAccountPresence | null;
  feed: MonitoredAccountFeedResponse | null;
  loading: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onOpenLead: (leadId: string) => void;
}

export const AdminLiveActivityDrawer: React.FC<AdminLiveActivityDrawerProps> = ({
  lang,
  open,
  account,
  feed,
  loading,
  onClose,
  onRefresh,
  onOpenLead,
}) => {
  const isAr = lang === 'ar';
  if (!open || !account) return null;

  const stats = feed?.statsToday || {
    totalActions: account.todayActionsCount || 0,
    whatsappContacts: 0,
    statusChanges: 0,
    notesAdded: 0,
    leadsOpened: 0,
  };
  const activities: MonitoredActivityItem[] = feed?.activities || [];

  const renderActivityIcon = (type: string) => {
    switch (type) {
      case 'whatsapp_opened':
        return <MessageSquare className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />;
      case 'status_changed':
        return <CheckCircle2 className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />;
      case 'note_added':
        return <FileText className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />;
      case 'follow_up_scheduled':
        return <CalendarClock className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />;
      default:
        return <Activity className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="flex-1 bg-slate-950/45 backdrop-blur-[1px]" onClick={onClose} />
      <aside className="w-full max-w-md bg-white dark:bg-slate-900 border-s border-slate-200 dark:border-slate-800 h-full flex flex-col shadow-2xl crm-drawer-enter">
        <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/80 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                  account.online ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                }`}
              />
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                {isAr ? `النشاط اللحظي — ${account.fullName}` : `Live Activity — ${account.fullName}`}
              </h3>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
              <span className="font-mono" dir="ltr">@{account.username}</span>
              <span>·</span>
              <span>{account.online ? (isAr ? 'متصل الآن' : 'Online now') : isAr ? 'غير متصل حالياً' : 'Offline'}</span>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onRefresh}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              title={isAr ? 'تحديث' : 'Refresh'}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Today's Real-Time Stats */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-2.5 bg-white dark:bg-slate-900">
          <div className="rounded-lg border border-emerald-200/80 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 p-2.5">
            <div className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">
              {isAr ? 'محادثات واتساب اليوم' : 'WhatsApp Chats Today'}
            </div>
            <div className="mt-1 text-lg font-bold text-emerald-900 dark:text-emerald-100 tabular-nums">
              {stats.whatsappContacts}
            </div>
          </div>
          <div className="rounded-lg border border-sky-200/80 dark:border-sky-900/50 bg-sky-50/50 dark:bg-sky-950/20 p-2.5">
            <div className="text-[11px] text-[#0077B6] dark:text-cyan-300 font-medium">
              {isAr ? 'تغييرات الحالة اليوم' : 'Status Updates Today'}
            </div>
            <div className="mt-1 text-lg font-bold text-slate-900 dark:text-white tabular-nums">
              {stats.statusChanges}
            </div>
          </div>
          <div className="rounded-lg border border-indigo-200/80 dark:border-indigo-900/50 bg-indigo-50/50 dark:bg-indigo-950/20 p-2.5">
            <div className="text-[11px] text-indigo-700 dark:text-indigo-300 font-medium">
              {isAr ? 'ليدز تم فتحها اليوم' : 'Leads Opened Today'}
            </div>
            <div className="mt-1 text-lg font-bold text-slate-900 dark:text-white tabular-nums">
              {stats.leadsOpened}
            </div>
          </div>
          <div className="rounded-lg border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 p-2.5">
            <div className="text-[11px] text-amber-800 dark:text-amber-300 font-medium">
              {isAr ? 'ملاحظات مضافة اليوم' : 'Notes Added Today'}
            </div>
            <div className="mt-1 text-lg font-bold text-slate-900 dark:text-white tabular-nums">
              {stats.notesAdded}
            </div>
          </div>
        </div>

        {/* Live Activity Feed */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>{isAr ? 'أحدث التحركات والإجراءات المسجلة' : 'Live Action Log'}</span>
            <span className="font-mono text-[11px] tabular-nums">{activities.length}</span>
          </div>

          {activities.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
              {isAr
                ? 'لم ينفذ هذا الحساب أي إجراءات بعد — سيظهر كل إجراء هنا لحظياً فور حدوثه.'
                : 'No recorded actions yet — every action will stream here live in real time.'}
            </div>
          ) : (
            activities.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 p-3 space-y-1.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <div className="mt-0.5 shrink-0">{renderActivityIcon(item.activityType)}</div>
                    <div className="text-xs font-medium text-slate-800 dark:text-slate-200 leading-relaxed">
                      {isAr ? item.descriptionAr : item.descriptionEn}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 pt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1 font-mono tabular-nums" dir="ltr">
                    <Clock className="h-3 w-3" />
                    {formatCairoDateTime(item.createdAt, lang)}
                  </span>
                  {item.leadId && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenLead(item.leadId!);
                        onClose();
                      }}
                      className="inline-flex items-center gap-1 font-semibold text-[#0077B6] dark:text-cyan-400 hover:underline"
                    >
                      <span>{item.leadName || item.leadCode || (isAr ? 'فتح العميل' : 'Open Lead')}</span>
                      <ArrowUpRight className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </aside>
    </div>
  );
};
