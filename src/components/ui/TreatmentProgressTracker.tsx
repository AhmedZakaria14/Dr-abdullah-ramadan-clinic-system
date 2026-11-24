import React from 'react';
import {
  Activity,
  Check,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Smile,
  Stethoscope,
} from 'lucide-react';
import { Language, TreatmentProgressMap, TreatmentStageKey } from '../../types/crm';
import { formatCairoDateTime } from '../../lib/dateFormat';

export interface TreatmentStageConfig {
  key: TreatmentStageKey;
  labelAr: string;
  labelEn: string;
  subtitleAr: string;
  subtitleEn: string;
  icon: React.ComponentType<{ className?: string }>;
  isFinal?: boolean;
}

export const TREATMENT_STAGES: TreatmentStageConfig[] = [
  {
    key: 'consultation',
    labelAr: 'الاستشارة والكشف',
    labelEn: 'Consultation',
    subtitleAr: 'الفحص والتشخيص',
    subtitleEn: 'Exam & Diagnosis',
    icon: Stethoscope,
  },
  {
    key: 'root_canal',
    labelAr: 'علاج الجذور',
    labelEn: 'Root Canal',
    subtitleAr: 'علاج وحشو العصب',
    subtitleEn: 'Endodontic Care',
    icon: Activity,
  },
  {
    key: 'orthodontics',
    labelAr: 'تقويم الأسنان',
    labelEn: 'Orthodontics',
    subtitleAr: 'التقويم والمتابعة',
    subtitleEn: 'Alignment & Braces',
    icon: Smile,
  },
  {
    key: 'completed',
    labelAr: 'مكتمل',
    labelEn: 'Completed',
    subtitleAr: 'انتهاء خطة العلاج',
    subtitleEn: 'Treatment Finished',
    icon: CheckCircle2,
    isFinal: true,
  },
];

interface TreatmentProgressTrackerProps {
  lang: Language;
  progress: TreatmentProgressMap;
  updatingKey: TreatmentStageKey | 'reset' | null;
  onToggleStage: (stageKey: TreatmentStageKey, nextCompleted: boolean) => void;
  onReset: () => void;
}

export const TreatmentProgressTracker: React.FC<TreatmentProgressTrackerProps> = ({
  lang,
  progress,
  updatingKey,
  onToggleStage,
  onReset,
}) => {
  const isAr = lang === 'ar';
  const totalCount = TREATMENT_STAGES.length;
  const completedCount = TREATMENT_STAGES.filter((s) => Boolean(progress[s.key]?.completed)).length;
  const isTreatmentCompleted = Boolean(progress.completed?.completed);
  const progressRatio = isTreatmentCompleted ? 1 : completedCount / totalCount;
  const progressPercent = Math.round(progressRatio * 100);

  // Determine how far the connected rail between step nodes should illuminate
  let furthestCompletedIdx = -1;
  TREATMENT_STAGES.forEach((stage, idx) => {
    if (progress[stage.key]?.completed) {
      furthestCompletedIdx = idx;
    }
  });
  const railRatio =
    furthestCompletedIdx <= 0 ? 0 : Math.min(1, furthestCompletedIdx / (totalCount - 1));

  return (
    <section
      aria-label={isAr ? 'مراحل تقدم العلاج' : 'Treatment Progress'}
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-950/40">
        <div className="flex items-center gap-2 min-w-0">
          <Stethoscope className="h-4 w-4 text-[#0077B6] dark:text-cyan-400 shrink-0" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
            {isAr ? 'مراحل تقدم العلاج' : 'Treatment Progress'}
          </h3>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 tabular-nums">
            <span
              className={`font-semibold ${
                isTreatmentCompleted
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : completedCount > 0
                    ? 'text-[#0077B6] dark:text-cyan-400'
                    : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              {isTreatmentCompleted
                ? isAr
                  ? 'اكتمل العلاج'
                  : 'Treatment Complete'
                : isAr
                  ? `${completedCount} من ${totalCount} مراحل`
                  : `${completedCount} / ${totalCount} stages`}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
              {progressPercent}%
            </span>
          </div>

          {completedCount > 0 && (
            <button
              type="button"
              disabled={updatingKey !== null}
              onClick={onReset}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors disabled:opacity-50 whitespace-nowrap"
              title={isAr ? 'إعادة تعيين جميع المراحل' : 'Reset all stages'}
            >
              {updatingKey === 'reset' ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RotateCcw className="h-3 w-3" />
              )}
              <span>{isAr ? 'إعادة تعيين' : 'Reset'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-5 space-y-5">
        {/* Top Progress Bar (compositor-only scaleX transform) */}
        <div className="space-y-1.5">
          <div
            role="progressbar"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={isAr ? 'نسبة تقدم العلاج' : 'Treatment completion percentage'}
            className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"
          >
            <div
              className={`h-full w-full rounded-full transition-transform duration-200 ease-out ${
                isAr ? 'origin-right' : 'origin-left'
              } ${
                isTreatmentCompleted
                  ? 'bg-emerald-600 dark:bg-emerald-500'
                  : 'bg-gradient-to-r from-[#0077B6] via-[#0095D9] to-[#00B5CC]'
              }`}
              style={{ transform: `scaleX(${progressRatio})` }}
            />
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {isAr
              ? 'اضغط على أي مرحلة لتفعيلها أو إلغاء تفعيلها — يتم الحفظ تلقائياً في سجل المريض.'
              : 'Click any stage below to toggle it — updates save automatically to the patient timeline.'}
          </p>
        </div>

        {/* Connected Visual Milestone Track (No nested bordered cards) */}
        <div className="relative">
          {/* Desktop Continuous Horizontal Connector Rail aligned with node centers (12px pt + 22px half circle = 34px) */}
          <div
            aria-hidden="true"
            className="hidden sm:block absolute top-[34px] inset-x-[12.5%] h-0.5 bg-slate-200 dark:bg-slate-800 pointer-events-none"
          />
          <div
            aria-hidden="true"
            className={`hidden sm:block absolute top-[34px] inset-x-[12.5%] h-0.5 pointer-events-none transition-transform duration-200 ease-out ${
              isAr ? 'origin-right' : 'origin-left'
            } ${
              isTreatmentCompleted
                ? 'bg-emerald-500 dark:bg-emerald-400'
                : 'bg-[#0095D9] dark:bg-cyan-400'
            }`}
            style={{ transform: `scaleX(${railRatio})` }}
          />

          <div className="grid grid-cols-1 sm:grid-cols-4 divide-y sm:divide-y-0 divide-slate-100 dark:divide-slate-800 sm:gap-2">
            {TREATMENT_STAGES.map((stage, idx) => {
              const stageState = progress[stage.key];
              const isDone = Boolean(stageState?.completed);
              const isBusy = updatingKey === stage.key;
              const StageIcon = stage.icon;
              const isFinalDone = Boolean(stage.isFinal && isDone);

              return (
                <button
                  key={stage.key}
                  type="button"
                  disabled={updatingKey !== null}
                  aria-pressed={isDone}
                  onClick={() => onToggleStage(stage.key, !isDone)}
                  className="group relative flex sm:flex-col items-center sm:text-center gap-3.5 sm:gap-2.5 rounded-lg px-2 py-3 sm:px-2 sm:py-3 min-h-[56px] text-start transition-colors duration-150 hover:bg-slate-50/90 dark:hover:bg-slate-800/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0095D9] disabled:cursor-wait"
                >
                  {/* Circular Milestone Node */}
                  <div
                    className={`relative z-10 h-11 w-11 rounded-full flex items-center justify-center shrink-0 border-2 transition-all duration-150 ${
                      isFinalDone
                        ? 'bg-emerald-600 border-emerald-600 text-white ring-4 ring-emerald-100/90 dark:ring-emerald-950/70'
                        : isDone
                          ? 'bg-[#0077B6] dark:bg-[#0096C7] border-[#0077B6] dark:border-[#0096C7] text-white ring-4 ring-sky-100/90 dark:ring-sky-950/70'
                          : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-400 dark:text-slate-500 group-hover:border-[#0095D9] group-hover:text-[#0077B6] dark:group-hover:text-cyan-400'
                    }`}
                  >
                    {isBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : isDone ? (
                      <Check className="h-4 w-4 stroke-[2.5]" />
                    ) : (
                      <StageIcon className="h-4 w-4" />
                    )}
                  </div>

                  {/* Stage Label, Subtitle & Explicit Text Status */}
                  <div className="min-w-0 flex-1 sm:flex-initial">
                    <div className="flex sm:justify-center items-center gap-1.5">
                      <span className="text-[11px] font-mono tabular-nums text-slate-400 dark:text-slate-500">
                        0{idx + 1}
                      </span>
                      <span
                        className={`text-xs font-semibold leading-snug truncate ${
                          isFinalDone
                            ? 'text-emerald-800 dark:text-emerald-300'
                            : isDone
                              ? 'text-slate-900 dark:text-slate-100'
                              : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {isAr ? stage.labelAr : stage.labelEn}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      {isAr ? stage.subtitleAr : stage.subtitleEn}
                    </div>

                    <div
                      className={`mt-1 text-[11px] font-medium ${
                        isFinalDone
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : isDone
                            ? 'text-[#0077B6] dark:text-cyan-400'
                            : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {isDone ? (
                        stageState?.updatedAt ? (
                          <span className="font-mono tabular-nums text-[10px]" dir="ltr">
                            {formatCairoDateTime(stageState.updatedAt, lang)}
                          </span>
                        ) : isAr ? (
                          'تم الإنجاز'
                        ) : (
                          'Done'
                        )
                      ) : isAr ? (
                        'قيد الانتظار'
                      ) : (
                        'Pending'
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
