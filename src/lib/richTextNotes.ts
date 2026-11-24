import { Language, NoteCategory } from '../types/crm';

export interface NoteCategoryMeta {
  key: NoteCategory;
  labelAr: string;
  labelEn: string;
  textClass: string;
  activeTabClass: string;
}

export const NOTE_CATEGORIES: NoteCategoryMeta[] = [
  {
    key: 'conversation',
    labelAr: 'محادثة ومتابعة',
    labelEn: 'Conversation',
    textClass: 'text-[#0077B6] dark:text-cyan-400',
    activeTabClass: 'bg-[#0077B6] dark:bg-[#0096C7] text-white border-transparent',
  },
  {
    key: 'medical',
    labelAr: 'ملاحظة طبية',
    labelEn: 'Medical Observation',
    textClass: 'text-rose-700 dark:text-rose-400',
    activeTabClass: 'bg-rose-600 dark:bg-rose-600 text-white border-transparent',
  },
  {
    key: 'treatment',
    labelAr: 'تحديث علاجي',
    labelEn: 'Treatment Update',
    textClass: 'text-emerald-700 dark:text-emerald-400',
    activeTabClass: 'bg-emerald-600 dark:bg-emerald-600 text-white border-transparent',
  },
  {
    key: 'general',
    labelAr: 'ملاحظة عامة',
    labelEn: 'General',
    textClass: 'text-slate-600 dark:text-slate-400',
    activeTabClass: 'bg-slate-800 dark:bg-slate-700 text-white border-transparent',
  },
];

export function getNoteCategoryMeta(category?: string | null): NoteCategoryMeta {
  return NOTE_CATEGORIES.find((c) => c.key === category) || NOTE_CATEGORIES[0];
}

export interface ClinicalNoteTemplate {
  id: string;
  category: NoteCategory;
  nameAr: string;
  nameEn: string;
  titleAr: string;
  titleEn: string;
  contentAr: string;
  contentEn: string;
}

export const CLINICAL_NOTE_TEMPLATES: ClinicalNoteTemplate[] = [
  {
    id: 'call_summary',
    category: 'conversation',
    nameAr: 'ملخص مكالمة / واتساب',
    nameEn: 'Call / WhatsApp Summary',
    titleAr: 'ملخص التواصل مع المريض',
    titleEn: 'Patient Conversation Summary',
    contentAr: [
      '### ملخص التواصل',
      '- **وسيلة التواصل:** مكالمة هاتفية / واتساب',
      '- **استفسار المريض:** ',
      '- **الرد والتوضيح المقدم:** ',
      '',
      '### الخطوة القادمة',
      '- [ ] إرسال صورة أشعة البانوراما للتقييم',
      '- [ ] تأكيد موعد الكشف / السفر لمصر',
    ].join('\n'),
    contentEn: [
      '### Conversation Summary',
      '- **Channel:** Phone call / WhatsApp',
      '- **Patient inquiry:** ',
      '- **Information shared:** ',
      '',
      '### Next Steps',
      '- [ ] Request panoramic X-ray for initial review',
      '- [ ] Confirm consultation / Egypt travel date',
    ].join('\n'),
  },
  {
    id: 'medical_observation',
    category: 'medical',
    nameAr: 'فحص وملاحظة طبية',
    nameEn: 'Medical & X-Ray Observation',
    titleAr: 'تقييم طبي وفحص أشعة البانوراما',
    titleEn: 'Clinical & Panoramic X-Ray Assessment',
    contentAr: [
      '### الشكوى والملاحظات السريرية',
      '- **الأسنان / الفك المصاب:** ',
      '- **حالة العظم واللثة (الأشعة):** ',
      '- **التاريخ المرضي / الحساسية:** لا يوجد أمراض مزمنة أو حساسية معروفة',
      '',
      '> **توصية الطبيب:** ',
    ].join('\n'),
    contentEn: [
      '### Clinical Observations',
      '- **Affected teeth / arch:** ',
      '- **Bone density & gum status (X-ray):** ',
      '- **Medical history / allergies:** None reported',
      '',
      '> **Doctor recommendation:** ',
    ].join('\n'),
  },
  {
    id: 'treatment_update',
    category: 'treatment',
    nameAr: 'تحديث خطة العلاج',
    nameEn: 'Treatment Plan Update',
    titleAr: 'تحديث خطة العلاج والزيارات',
    titleEn: 'Treatment Plan & Session Update',
    contentAr: [
      '### الإجراءات المتفق عليها',
      '1. الكشف الأولي وأشعة ثلاثية الأبعاد (CBCT)',
      '2. الإجراء الأساسي: **زراعة / علاج جذور / تقويم**',
      '3. المتابعة والتركيب النهائي',
      '',
      '### قائمة المراجعة',
      '- [ ] مشاركة التكلفة التقديرية مع المريض',
      '- [ ] تأكيد عدد الأيام المطلوبة للإقامة والعلاج',
    ].join('\n'),
    contentEn: [
      '### Agreed Procedures',
      '1. Initial consultation & 3D CBCT scan',
      '2. Primary procedure: **Implants / Root Canal / Orthodontics**',
      '3. Follow-up & final restoration',
      '',
      '### Action Checklist',
      '- [ ] Share estimated quote with patient',
      '- [ ] Confirm required stay duration & visits',
    ].join('\n'),
  },
];

export type RichFormatAction =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'heading'
  | 'bullet'
  | 'numbered'
  | 'checklist'
  | 'quote'
  | 'link';

export function applyRichFormat(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  action: RichFormatAction,
  lang: Language
): { nextValue: string; nextSelectionStart: number; nextSelectionEnd: number } {
  const isAr = lang === 'ar';
  const before = value.slice(0, selectionStart);
  const selected = value.slice(selectionStart, selectionEnd);
  const after = value.slice(selectionEnd);

  const wrapInline = (prefix: string, suffix: string, placeholder: string) => {
    const inner = selected || placeholder;
    const inserted = `${prefix}${inner}${suffix}`;
    const nextValue = `${before}${inserted}${after}`;
    const start = selectionStart + prefix.length;
    const end = start + inner.length;
    return { nextValue, nextSelectionStart: start, nextSelectionEnd: end };
  };

  const prefixLines = (prefixFactory: (idx: number) => string, placeholder: string) => {
    const needsLeadingNewline = before.length > 0 && !before.endsWith('\n');
    const lead = needsLeadingNewline ? '\n' : '';
    const source = selected || placeholder;
    const formatted = source
      .split('\n')
      .map((line, i) => `${prefixFactory(i)}${line}`)
      .join('\n');
    const nextValue = `${before}${lead}${formatted}${after}`;
    const start = before.length + lead.length;
    const end = start + formatted.length;
    return { nextValue, nextSelectionStart: start, nextSelectionEnd: end };
  };

  switch (action) {
    case 'bold':
      return wrapInline('**', '**', isAr ? 'نص عريض' : 'bold text');
    case 'italic':
      return wrapInline('*', '*', isAr ? 'نص مائل' : 'italic text');
    case 'underline':
      return wrapInline('__', '__', isAr ? 'نص تحته خط' : 'underlined text');
    case 'strike':
      return wrapInline('~~', '~~', isAr ? 'نص مشطوب' : 'strikethrough');
    case 'heading':
      return prefixLines(() => '### ', isAr ? 'عنوان فرعي' : 'Section Heading');
    case 'bullet':
      return prefixLines(() => '- ', isAr ? 'نقطة جديدة' : 'List item');
    case 'numbered':
      return prefixLines((i) => `${i + 1}. `, isAr ? 'خطوة جديدة' : 'Step item');
    case 'checklist':
      return prefixLines(() => '- [ ] ', isAr ? 'مهمة متابعة' : 'Action item');
    case 'quote':
      return prefixLines(() => '> ', isAr ? 'ملاحظة طبية هامة' : 'Important clinical note');
    case 'link': {
      const label = selected || (isAr ? 'رابط الأشعة أو الملف' : 'Link label');
      const urlPlaceholder = 'https://';
      const inserted = `[${label}](${urlPlaceholder})`;
      const nextValue = `${before}${inserted}${after}`;
      const urlStart = selectionStart + label.length + 3;
      return {
        nextValue,
        nextSelectionStart: urlStart,
        nextSelectionEnd: urlStart + urlPlaceholder.length,
      };
    }
  }
}

/**
 * Toggles a Markdown checklist line (`- [ ]` <-> `- [x]`) at the exact 0-based line index.
 */
export function toggleChecklistAtLine(content: string, targetLineIdx: number): string {
  const lines = content.split('\n');
  if (targetLineIdx < 0 || targetLineIdx >= lines.length) return content;
  const line = lines[targetLineIdx];
  if (/^\s*[-*+]\s+\[ \]\s+/.test(line)) {
    lines[targetLineIdx] = line.replace(/^(\s*[-*+]\s+)\[ \](\s+)/, '$1[x]$2');
  } else if (/^\s*[-*+]\s+\[[xX]\]\s+/.test(line)) {
    lines[targetLineIdx] = line.replace(/^(\s*[-*+]\s+)\[[xX]\](\s+)/, '$1[ ]$2');
  }
  return lines.join('\n');
}

/**
 * Validates that a URL uses strictly http: or https: (blocks javascript:, data:, vbscript:, etc.).
 */
export function parseSafeHttpUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function stripRichTextToPlain(content: string): string {
  return content
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s+/gm, '')
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1')
    .replace(/(\*\*|__|~~|\*|`)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
