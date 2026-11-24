import React, { useMemo, useRef, useState } from 'react';
import {
  Bold,
  Check,
  CheckSquare,
  Edit3,
  Eye,
  FilePlus2,
  Heading,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  MessageCircle,
  NotebookPen,
  Pin,
  PinOff,
  Quote,
  Search,
  Send,
  Square,
  Stethoscope,
  Strikethrough,
  Trash2,
  Underline,
  ClipboardCheck,
  FileText,
  X,
} from 'lucide-react';
import { Language, LeadNote, NoteCategory } from '../../types/crm';
import { formatCairoDateTime } from '../../lib/dateFormat';
import {
  applyRichFormat,
  CLINICAL_NOTE_TEMPLATES,
  getNoteCategoryMeta,
  NOTE_CATEGORIES,
  parseSafeHttpUrl,
  RichFormatAction,
  stripRichTextToPlain,
  toggleChecklistAtLine,
} from '../../lib/richTextNotes';

function renderCategoryIcon(category?: string | null, className = 'h-3.5 w-3.5') {
  switch (category) {
    case 'medical':
      return <Stethoscope className={className} />;
    case 'treatment':
      return <ClipboardCheck className={className} />;
    case 'general':
      return <FileText className={className} />;
    case 'conversation':
    default:
      return <MessageCircle className={className} />;
  }
}

/**
 * Pure React inline rich-text parser (zero innerHTML / zero dangerouslySetInnerHTML).
 * Supports **bold**, *italic*, __underline__, ~~strike~~, `code`, [label](https://...), and bare http(s) URLs.
 */
function renderInlineTokens(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const tokenRegex =
    /(\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|~~([^~\n]+)~~|\*([^*\n]+)\*|`([^`\n]+)`|(https?:\/\/[^\s<>"']+))/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let tokenIdx = 0;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const tokenKey = `${keyPrefix}-t${tokenIdx++}`;
    if (match[2] !== undefined && match[3] !== undefined) {
      const safeUrl = parseSafeHttpUrl(match[3]);
      if (safeUrl) {
        nodes.push(
          <a
            key={tokenKey}
            href={safeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#0077B6] dark:text-cyan-400 underline underline-offset-2 hover:opacity-80 break-all"
          >
            {match[2]}
          </a>
        );
      } else {
        nodes.push(match[2]);
      }
    } else if (match[4] !== undefined) {
      nodes.push(
        <strong key={tokenKey} className="font-semibold text-slate-950 dark:text-white">
          {match[4]}
        </strong>
      );
    } else if (match[5] !== undefined) {
      nodes.push(
        <u key={tokenKey} className="underline decoration-slate-400 dark:decoration-slate-500 underline-offset-2">
          {match[5]}
        </u>
      );
    } else if (match[6] !== undefined) {
      nodes.push(
        <del key={tokenKey} className="line-through text-slate-400 dark:text-slate-500">
          {match[6]}
        </del>
      );
    } else if (match[7] !== undefined) {
      nodes.push(
        <em key={tokenKey} className="italic">
          {match[7]}
        </em>
      );
    } else if (match[8] !== undefined) {
      nodes.push(
        <code
          key={tokenKey}
          className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
        >
          {match[8]}
        </code>
      );
    } else if (match[9] !== undefined) {
      const safeUrl = parseSafeHttpUrl(match[9]);
      if (safeUrl) {
        nodes.push(
          <a
            key={tokenKey}
            href={safeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#0077B6] dark:text-cyan-400 underline underline-offset-2 hover:opacity-80 break-all"
          >
            {match[9]}
          </a>
        );
      } else {
        nodes.push(match[9]);
      }
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

interface RichNoteContentProps {
  content: string;
  onToggleChecklistLine?: (lineIndex: number) => void;
  disabledChecklist?: boolean;
}

export const RichNoteContent: React.FC<RichNoteContentProps> = ({
  content,
  onToggleChecklistLine,
  disabledChecklist = false,
}) => {
  const lines = content.split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // Heading (# / ## / ###)
    const headingMatch = trimmed.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) {
      blocks.push(
        <h5
          key={`h-${i}`}
          className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 pt-1.5 first:pt-0"
        >
          {renderInlineTokens(headingMatch[1], `h-${i}`)}
        </h5>
      );
      i += 1;
      continue;
    }

    // Callout / Blockquote (> ...)
    if (/^>\s?/.test(trimmed)) {
      const quoteLines: Array<{ idx: number; text: string }> = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quoteLines.push({ idx: i, text: lines[i].trim().replace(/^>\s?/, '') });
        i += 1;
      }
      blocks.push(
        <blockquote
          key={`q-${quoteLines[0].idx}`}
          className="rounded-lg border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-950/70 px-3.5 py-2.5 text-xs text-slate-700 dark:text-slate-300 space-y-1"
        >
          {quoteLines.map((ql) => (
            <p key={ql.idx} className="leading-relaxed">
              {renderInlineTokens(ql.text, `q-${ql.idx}`)}
            </p>
          ))}
        </blockquote>
      );
      continue;
    }

    // Interactive Checklist (- [ ] / - [x])
    if (/^\s*[-*+]\s+\[[ xX]\]\s+/.test(line)) {
      const items: Array<{ idx: number; checked: boolean; text: string }> = [];
      while (i < lines.length) {
        const m = lines[i].match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/);
        if (!m) break;
        items.push({ idx: i, checked: m[1].toLowerCase() === 'x', text: m[2] });
        i += 1;
      }
      blocks.push(
        <ul key={`cl-${items[0].idx}`} className="space-y-1.5">
          {items.map((item) => (
            <li key={item.idx} className="flex items-start gap-2 text-xs leading-relaxed">
              {onToggleChecklistLine ? (
                <button
                  type="button"
                  disabled={disabledChecklist}
                  onClick={() => onToggleChecklistLine(item.idx)}
                  aria-pressed={item.checked}
                  className={`mt-0.5 shrink-0 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0095D9] disabled:opacity-50 ${
                    item.checked
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-400 hover:text-[#0077B6] dark:hover:text-cyan-400'
                  }`}
                >
                  {item.checked ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                </button>
              ) : (
                <span className={`mt-0.5 shrink-0 ${item.checked ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {item.checked ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                </span>
              )}
              <span
                className={
                  item.checked
                    ? 'line-through text-slate-400 dark:text-slate-500'
                    : 'text-slate-800 dark:text-slate-200'
                }
              >
                {renderInlineTokens(item.text, `cl-${item.idx}`)}
              </span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Bullet List (- / * / +)
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: Array<{ idx: number; text: string }> = [];
      while (i < lines.length) {
        if (/^\s*[-*+]\s+\[[ xX]\]\s+/.test(lines[i])) break;
        const m = lines[i].match(/^\s*[-*+]\s+(.*)$/);
        if (!m) break;
        items.push({ idx: i, text: m[1] });
        i += 1;
      }
      blocks.push(
        <ul key={`ul-${items[0].idx}`} className="list-disc ps-5 space-y-1 text-xs text-slate-800 dark:text-slate-200">
          {items.map((item) => (
            <li key={item.idx} className="leading-relaxed">
              {renderInlineTokens(item.text, `ul-${item.idx}`)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered List (1. / 2. / ...)
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: Array<{ idx: number; text: string }> = [];
      while (i < lines.length) {
        const m = lines[i].match(/^\s*\d+\.\s+(.*)$/);
        if (!m) break;
        items.push({ idx: i, text: m[1] });
        i += 1;
      }
      blocks.push(
        <ol
          key={`ol-${items[0].idx}`}
          className="list-decimal ps-5 space-y-1 text-xs text-slate-800 dark:text-slate-200 marker:tabular-nums marker:text-slate-400"
        >
          {items.map((item) => (
            <li key={item.idx} className="leading-relaxed">
              {renderInlineTokens(item.text, `ol-${item.idx}`)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Regular paragraph line(s)
    const paraLines: Array<{ idx: number; text: string }> = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^#{1,3}\s+/.test(lines[i].trim()) &&
      !/^>\s?/.test(lines[i].trim()) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      paraLines.push({ idx: i, text: lines[i] });
      i += 1;
    }
    blocks.push(
      <p key={`p-${paraLines[0].idx}`} className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap break-words">
        {paraLines.map((pl, pIdx) => (
          <React.Fragment key={pl.idx}>
            {pIdx > 0 && <br />}
            {renderInlineTokens(pl.text, `p-${pl.idx}`)}
          </React.Fragment>
        ))}
      </p>
    );
  }

  return (
    <div dir="auto" className="space-y-2">
      {blocks}
    </div>
  );
};

interface RichNoteEditorProps {
  lang: Language;
  initialTitle?: string;
  initialCategory?: NoteCategory;
  initialContent?: string;
  initialPinned?: boolean;
  submitting: boolean;
  submitLabel: string;
  onSubmit: (payload: {
    title: string;
    category: NoteCategory;
    content: string;
    isPinned: boolean;
  }) => Promise<boolean> | boolean;
  onCancel?: () => void;
  compact?: boolean;
}

const RichNoteEditor: React.FC<RichNoteEditorProps> = ({
  lang,
  initialTitle = '',
  initialCategory = 'conversation',
  initialContent = '',
  initialPinned = false,
  submitting,
  submitLabel,
  onSubmit,
  onCancel,
  compact = false,
}) => {
  const isAr = lang === 'ar';
  const [title, setTitle] = useState(initialTitle);
  const [category, setCategory] = useState<NoteCategory>(initialCategory);
  const [content, setContent] = useState(initialContent);
  const [isPinned, setIsPinned] = useState(initialPinned);
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleFormat = (action: RichFormatAction) => {
    const el = textareaRef.current;
    const start = el ? el.selectionStart : content.length;
    const end = el ? el.selectionEnd : content.length;
    const result = applyRichFormat(content, start, end, action, lang);
    setContent(result.nextValue);
    setMode('write');
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(result.nextSelectionStart, result.nextSelectionEnd);
      }
    });
  };

  const handleApplyTemplate = (templateId: string) => {
    const tpl = CLINICAL_NOTE_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return;
    setCategory(tpl.category);
    if (!title.trim()) {
      setTitle(isAr ? tpl.titleAr : tpl.titleEn);
    }
    const tplText = isAr ? tpl.contentAr : tpl.contentEn;
    setContent((prev) => (prev.trim() ? `${prev.trim()}\n\n${tplText}` : tplText));
    setMode('write');
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const handleFormSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!content.trim() || submitting) return;
    const ok = await onSubmit({
      title: title.trim(),
      category,
      content: content.trim(),
      isPinned,
    });
    if (ok && !onCancel) {
      setTitle('');
      setContent('');
      setIsPinned(false);
      setMode('write');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      handleFormat('bold');
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      handleFormat('italic');
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'u') {
      e.preventDefault();
      handleFormat('underline');
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void handleFormSubmit();
    }
  };

  const toolbarButtons: Array<{
    action: RichFormatAction;
    icon: React.ReactNode;
    label: string;
  }> = [
    { action: 'bold', icon: <Bold className="h-3.5 w-3.5" />, label: isAr ? 'عريض (Ctrl+B)' : 'Bold (Ctrl+B)' },
    { action: 'italic', icon: <Italic className="h-3.5 w-3.5" />, label: isAr ? 'مائل (Ctrl+I)' : 'Italic (Ctrl+I)' },
    { action: 'underline', icon: <Underline className="h-3.5 w-3.5" />, label: isAr ? 'تحته خط (Ctrl+U)' : 'Underline (Ctrl+U)' },
    { action: 'strike', icon: <Strikethrough className="h-3.5 w-3.5" />, label: isAr ? 'يتوسطه خط' : 'Strikethrough' },
    { action: 'heading', icon: <Heading className="h-3.5 w-3.5" />, label: isAr ? 'عنوان فرعي' : 'Heading' },
    { action: 'bullet', icon: <List className="h-3.5 w-3.5" />, label: isAr ? 'قائمة نقطية' : 'Bullet List' },
    { action: 'numbered', icon: <ListOrdered className="h-3.5 w-3.5" />, label: isAr ? 'قائمة مرقمة' : 'Numbered List' },
    { action: 'checklist', icon: <CheckSquare className="h-3.5 w-3.5" />, label: isAr ? 'قائمة مهام' : 'Checklist' },
    { action: 'quote', icon: <Quote className="h-3.5 w-3.5" />, label: isAr ? 'ملاحظة مميزة / اقتباس' : 'Clinical Callout' },
    { action: 'link', icon: <Link2 className="h-3.5 w-3.5" />, label: isAr ? 'إدراج رابط' : 'Insert Link' },
  ];

  return (
    <form onSubmit={handleFormSubmit} className="space-y-3">
      {/* Category Selector & Quick Clinical Templates */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="group"
          aria-label={isAr ? 'تصنيف الملاحظة' : 'Note category'}
          className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/90"
        >
          {NOTE_CATEGORIES.map((cat) => {
            const isSelected = category === cat.key;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => setCategory(cat.key)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  isSelected
                    ? cat.activeTabClass
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {renderCategoryIcon(cat.key, 'h-3 w-3')}
                <span>{isAr ? cat.labelAr : cat.labelEn}</span>
              </button>
            );
          })}
        </div>

        {!compact && (
          <div className="flex items-center gap-1.5">
            <FilePlus2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <select
              aria-label={isAr ? 'قالب طبي جاهز' : 'Insert clinical template'}
              value=""
              onChange={(e) => {
                if (e.target.value) handleApplyTemplate(e.target.value);
              }}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0095D9]"
            >
              <option value="">{isAr ? '+ إدراج قالب جاهز...' : '+ Insert template...'}</option>
              {CLINICAL_NOTE_TEMPLATES.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {isAr ? tpl.nameAr : tpl.nameEn}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Optional Note Title */}
      <input
        type="text"
        value={title}
        maxLength={160}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={
          isAr
            ? 'عنوان مختصر للملاحظة (اختياري، مثل: تقييم أشعة البانوراما أو ملخص مكالمة الحجز)...'
            : 'Short note title (optional, e.g., Panoramic X-ray review or Booking call summary)...'
        }
        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950 px-3.5 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0095D9]"
      />

      {/* Rich Text Surface (Toolbar + Editor / Preview) */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 overflow-hidden focus-within:ring-2 focus-within:ring-[#0095D9] transition-shadow">
        {/* Formatting Toolbar */}
        <div className="px-2.5 py-1.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-0.5">
            {toolbarButtons.map((btn) => (
              <button
                key={btn.action}
                type="button"
                onClick={() => handleFormat(btn.action)}
                title={btn.label}
                aria-label={btn.label}
                className="p-1.5 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 hover:text-slate-950 dark:hover:text-white transition-colors"
              >
                {btn.icon}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 p-0.5 rounded-md bg-slate-200/70 dark:bg-slate-800 text-[11px]">
            <button
              type="button"
              onClick={() => setMode('write')}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium transition-colors ${
                mode === 'write'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Edit3 className="h-3 w-3" />
              <span>{isAr ? 'كتابة' : 'Write'}</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('preview')}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium transition-colors ${
                mode === 'preview'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Eye className="h-3 w-3" />
              <span>{isAr ? 'معاينة' : 'Preview'}</span>
            </button>
          </div>
        </div>

        {mode === 'write' ? (
          <textarea
            ref={textareaRef}
            rows={compact ? 4 : 5}
            dir="auto"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isAr
                ? 'اكتب تفاصيل المحادثة، الملاحظات الطبية، أو تحديثات خطة العلاج... يمكنك استخدام أدوات التنسيق أعلاه أو اختصارات Ctrl+B / Ctrl+I.'
                : 'Record conversation details, medical observations, or treatment plan updates... Use the formatting toolbar above or Ctrl+B / Ctrl+I.'
            }
            className="w-full bg-transparent px-3.5 py-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none resize-y leading-relaxed"
          />
        ) : (
          <div className="min-h-[120px] px-3.5 py-3 bg-white dark:bg-slate-950">
            {content.trim() ? (
              <RichNoteContent content={content} />
            ) : (
              <p className="text-xs text-slate-400">
                {isAr ? 'لا يوجد نص للمعاينة بعد.' : 'Nothing to preview yet.'}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <label className="inline-flex items-center gap-1.5 cursor-pointer select-none hover:text-slate-800 dark:hover:text-slate-200">
            <input
              type="checkbox"
              checked={isPinned}
              onChange={(e) => setIsPinned(e.target.checked)}
              className="rounded border-slate-300 dark:border-slate-700 text-[#0077B6] focus:ring-[#0095D9]"
            />
            <Pin className="h-3.5 w-3.5" />
            <span>{isAr ? 'تثبيت في الأعلى' : 'Pin to top'}</span>
          </label>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums text-[11px]">
            {content.length.toLocaleString()} / 20,000
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onCancel && (
            <button
              type="button"
              disabled={submitting}
              onClick={onCancel}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              <span>{isAr ? 'إلغاء' : 'Cancel'}</span>
            </button>
          )}
          <button
            type="submit"
            disabled={submitting || !content.trim()}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#0077B6] hover:bg-[#006299] dark:bg-[#0096C7] dark:hover:bg-[#0077B6] px-4 min-h-[40px] sm:min-h-[36px] text-xs font-semibold text-white transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            <span>{submitLabel}</span>
          </button>
        </div>
      </div>
    </form>
  );
};

interface RichNotesSectionProps {
  lang: Language;
  notes: LeadNote[];
  onCreateNote: (payload: {
    title: string;
    category: NoteCategory;
    content: string;
    isPinned: boolean;
  }) => Promise<boolean>;
  onUpdateNote: (
    noteId: string,
    payload: {
      title?: string;
      category?: NoteCategory;
      content?: string;
      isPinned?: boolean;
    }
  ) => Promise<boolean>;
  onDeleteNote: (noteId: string) => Promise<boolean>;
}

export const RichNotesSection: React.FC<RichNotesSectionProps> = ({
  lang,
  notes,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
}) => {
  const isAr = lang === 'ar';
  const [filterCategory, setFilterCategory] = useState<'all' | NoteCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [busyNoteId, setBusyNoteId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: notes.length };
    for (const cat of NOTE_CATEGORIES) counts[cat.key] = 0;
    for (const n of notes) {
      const key = n.category && counts[n.category] !== undefined ? n.category : 'conversation';
      counts[key] += 1;
    }
    return counts;
  }, [notes]);

  const filteredNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return notes.filter((n) => {
      const cat = n.category || 'conversation';
      if (filterCategory !== 'all' && cat !== filterCategory) return false;
      if (!q) return true;
      const haystack = `${n.title || ''} ${stripRichTextToPlain(n.content)} ${n.author_name || ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [notes, filterCategory, searchQuery]);

  const handleCreate = async (payload: {
    title: string;
    category: NoteCategory;
    content: string;
    isPinned: boolean;
  }) => {
    setCreating(true);
    try {
      return await onCreateNote(payload);
    } finally {
      setCreating(false);
    }
  };

  const handleSaveEdit = async (
    noteId: string,
    payload: {
      title: string;
      category: NoteCategory;
      content: string;
      isPinned: boolean;
    }
  ) => {
    setBusyNoteId(noteId);
    try {
      const ok = await onUpdateNote(noteId, payload);
      if (ok) setEditingNoteId(null);
      return ok;
    } finally {
      setBusyNoteId(null);
    }
  };

  const handleTogglePin = async (note: LeadNote) => {
    setBusyNoteId(note.id);
    try {
      await onUpdateNote(note.id, { isPinned: !note.is_pinned });
    } finally {
      setBusyNoteId(null);
    }
  };

  const handleToggleChecklist = async (note: LeadNote, lineIndex: number) => {
    const nextContent = toggleChecklistAtLine(note.content, lineIndex);
    if (nextContent === note.content) return;
    setBusyNoteId(note.id);
    try {
      await onUpdateNote(note.id, { content: nextContent });
    } finally {
      setBusyNoteId(null);
    }
  };

  const handleConfirmDelete = async (noteId: string) => {
    setBusyNoteId(noteId);
    try {
      const ok = await onDeleteNote(noteId);
      if (ok) setConfirmDeleteId(null);
    } finally {
      setBusyNoteId(null);
    }
  };

  return (
    <section
      aria-label={isAr ? 'ملاحظات ومتابعات المريض' : 'Patient Notes & Clinical Observations'}
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-950/40">
        <div className="flex items-center gap-2 min-w-0">
          <NotebookPen className="h-4 w-4 text-[#0077B6] dark:text-cyan-400 shrink-0" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
            {isAr ? 'سجل الملاحظات والمحادثات الطبية' : 'Patient Notes & Clinical Log'}
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            · {notes.length}
          </span>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <button
            type="button"
            onClick={() => setFilterCategory('all')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap ${
              filterCategory === 'all'
                ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {isAr ? 'الكل' : 'All'}{' '}
            <span className="tabular-nums opacity-75">({categoryCounts.all})</span>
          </button>
          {NOTE_CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              type="button"
              onClick={() => setFilterCategory(cat.key)}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap ${
                filterCategory === cat.key
                  ? cat.activeTabClass
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {isAr ? cat.labelAr : cat.labelEn}
              {categoryCounts[cat.key] > 0 && (
                <span className="ms-1 tabular-nums opacity-75">({categoryCounts[cat.key]})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Rich Composer */}
      <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800">
        <RichNoteEditor
          lang={lang}
          submitting={creating}
          submitLabel={isAr ? 'حفظ الملاحظة' : 'Save Note'}
          onSubmit={handleCreate}
        />
      </div>

      {/* Search Bar when notes exist */}
      {notes.length > 2 && (
        <div className="px-4 sm:px-5 py-2.5 border-b border-slate-100 dark:border-slate-800/90 bg-slate-50/40 dark:bg-slate-950/30">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                isAr ? 'بحث داخل ملاحظات هذا المريض...' : 'Search within this patient’s notes...'
              }
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 ps-8 pe-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0095D9]"
            />
          </div>
        </div>
      )}

      {/* Notes Timeline List (Flat hairline dividers, zero nested bordered cards) */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {filteredNotes.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-slate-400 dark:text-slate-500">
            {notes.length === 0
              ? isAr
                ? 'لا توجد ملاحظات مسجلة لهذا المريض بعد — ابدأ بتدوين أول محادثة أو ملاحظة طبية أعلاه.'
                : 'No notes recorded for this patient yet — start logging a conversation, medical observation, or treatment update above.'
              : isAr
                ? 'لا توجد ملاحظات مطابقة للتصفية أو البحث الحالي.'
                : 'No notes match the current filter or search.'}
          </div>
        ) : (
          filteredNotes.map((note) => {
            const catMeta = getNoteCategoryMeta(note.category);
            const isEditing = editingNoteId === note.id;
            const isBusy = busyNoteId === note.id;
            const isPinned = Boolean(note.is_pinned);
            const wasEdited = Boolean(note.updated_at && note.updated_at !== note.created_at);

            return (
              <article
                key={note.id}
                className={`px-4 sm:px-5 py-4 transition-colors ${
                  isPinned ? 'bg-sky-50/40 dark:bg-sky-950/15' : ''
                }`}
              >
                {isEditing ? (
                  <RichNoteEditor
                    lang={lang}
                    compact
                    initialTitle={note.title || ''}
                    initialCategory={(note.category as NoteCategory) || 'conversation'}
                    initialContent={note.content}
                    initialPinned={isPinned}
                    submitting={isBusy}
                    submitLabel={isAr ? 'تحديث الملاحظة' : 'Update Note'}
                    onSubmit={(payload) => handleSaveEdit(note.id, payload)}
                    onCancel={() => setEditingNoteId(null)}
                  />
                ) : (
                  <div className="space-y-2.5">
                    {/* Unboxed Metadata Row + Actions */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                        {isPinned && (
                          <>
                            <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400">
                              <Pin className="h-3 w-3" />
                              <span>{isAr ? 'مثبّتة' : 'Pinned'}</span>
                            </span>
                            <span aria-hidden="true">·</span>
                          </>
                        )}
                        <span className={`inline-flex items-center gap-1 font-semibold ${catMeta.textClass}`}>
                          {renderCategoryIcon(catMeta.key, 'h-3 w-3')}
                          <span>{isAr ? catMeta.labelAr : catMeta.labelEn}</span>
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {note.author_name || (isAr ? 'فريق العيادة' : 'Clinic Staff')}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums" dir="ltr">
                          {formatCairoDateTime(note.created_at, lang)}
                        </span>
                        {wasEdited && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-slate-400 dark:text-slate-500">
                              {isAr ? 'معدّلة' : 'Edited'}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Note Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleTogglePin(note)}
                          title={isPinned ? (isAr ? 'إلغاء التثبيت' : 'Unpin note') : isAr ? 'تثبيت الملاحظة' : 'Pin note'}
                          className={`p-1.5 rounded-md transition-colors disabled:opacity-50 ${
                            isPinned
                              ? 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                              : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => {
                            setConfirmDeleteId(null);
                            setEditingNoteId(note.id);
                          }}
                          title={isAr ? 'تعديل الملاحظة' : 'Edit note'}
                          className="p-1.5 rounded-md text-slate-400 hover:text-[#0077B6] dark:hover:text-cyan-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>

                        {confirmDeleteId === note.id ? (
                          <div className="inline-flex items-center gap-1 ms-1">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleConfirmDelete(note.id)}
                              className="inline-flex items-center gap-1 rounded-md bg-red-600 hover:bg-red-700 text-white px-2 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50"
                            >
                              {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                              <span>{isAr ? 'حذف' : 'Delete'}</span>
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => setConfirmDeleteId(null)}
                              className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                              aria-label={isAr ? 'إلغاء' : 'Cancel'}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setConfirmDeleteId(note.id)}
                            title={isAr ? 'حذف الملاحظة' : 'Delete note'}
                            className="p-1.5 rounded-md text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Optional Note Title */}
                    {note.title && (
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                        {note.title}
                      </h4>
                    )}

                    {/* Formatted Safe Rich Text Body */}
                    <RichNoteContent
                      content={note.content}
                      disabledChecklist={isBusy}
                      onToggleChecklistLine={(lineIdx) => handleToggleChecklist(note, lineIdx)}
                    />
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
};
