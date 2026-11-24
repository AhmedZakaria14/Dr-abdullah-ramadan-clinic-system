import { Lead } from '../types/crm';

export type DialectCode =
  | 'JO'
  | 'EG'
  | 'SA'
  | 'AE'
  | 'KW'
  | 'QA'
  | 'BH'
  | 'OM'
  | 'PS'
  | 'LB'
  | 'SY'
  | 'IQ'
  | 'YE'
  | 'LY'
  | 'SD'
  | 'MA'
  | 'DZ'
  | 'TN'
  | 'AR_INTL'
  | 'EN_INTL';

export interface DialectMeta {
  code: DialectCode;
  countryAr: string;
  countryEn: string;
  dialectLabelAr: string;
  dialectLabelEn: string;
  flag: string;
}

export const DIALECT_OPTIONS: DialectMeta[] = [
  { code: 'JO', countryAr: 'الأردن', countryEn: 'Jordan', dialectLabelAr: 'اللهجة الأردنية', dialectLabelEn: 'Jordanian Dialect', flag: '🇯🇴' },
  { code: 'EG', countryAr: 'مصر', countryEn: 'Egypt', dialectLabelAr: 'اللهجة المصرية', dialectLabelEn: 'Egyptian Dialect', flag: '🇪🇬' },
  { code: 'SA', countryAr: 'السعودية', countryEn: 'Saudi Arabia', dialectLabelAr: 'اللهجة السعودية', dialectLabelEn: 'Saudi Dialect', flag: '🇸🇦' },
  { code: 'AE', countryAr: 'الإمارات', countryEn: 'UAE', dialectLabelAr: 'اللهجة الإماراتية', dialectLabelEn: 'Emirati Dialect', flag: '🇦🇪' },
  { code: 'KW', countryAr: 'الكويت', countryEn: 'Kuwait', dialectLabelAr: 'اللهجة الكويتية', dialectLabelEn: 'Kuwaiti Dialect', flag: '🇰🇼' },
  { code: 'QA', countryAr: 'قطر', countryEn: 'Qatar', dialectLabelAr: 'اللهجة القطرية', dialectLabelEn: 'Qatari Dialect', flag: '🇶🇦' },
  { code: 'BH', countryAr: 'البحرين', countryEn: 'Bahrain', dialectLabelAr: 'اللهجة البحرينية', dialectLabelEn: 'Bahraini Dialect', flag: '🇧🇭' },
  { code: 'OM', countryAr: 'عُمان', countryEn: 'Oman', dialectLabelAr: 'اللهجة العُمانية', dialectLabelEn: 'Omani Dialect', flag: '🇴🇲' },
  { code: 'PS', countryAr: 'فلسطين', countryEn: 'Palestine', dialectLabelAr: 'اللهجة الفلسطينية', dialectLabelEn: 'Palestinian Dialect', flag: '🇵🇸' },
  { code: 'LB', countryAr: 'لبنان', countryEn: 'Lebanon', dialectLabelAr: 'اللهجة اللبنانية', dialectLabelEn: 'Lebanese Dialect', flag: '🇱🇧' },
  { code: 'SY', countryAr: 'سوريا', countryEn: 'Syria', dialectLabelAr: 'اللهجة السورية', dialectLabelEn: 'Syrian Dialect', flag: '🇸🇾' },
  { code: 'IQ', countryAr: 'العراق', countryEn: 'Iraq', dialectLabelAr: 'اللهجة العراقية', dialectLabelEn: 'Iraqi Dialect', flag: '🇮🇶' },
  { code: 'YE', countryAr: 'اليمن', countryEn: 'Yemen', dialectLabelAr: 'اللهجة اليمنية', dialectLabelEn: 'Yemeni Dialect', flag: '🇾🇪' },
  { code: 'LY', countryAr: 'ليبيا', countryEn: 'Libya', dialectLabelAr: 'اللهجة الليبية', dialectLabelEn: 'Libyan Dialect', flag: '🇱🇾' },
  { code: 'SD', countryAr: 'السودان', countryEn: 'Sudan', dialectLabelAr: 'اللهجة السودانية', dialectLabelEn: 'Sudanese Dialect', flag: '🇸🇩' },
  { code: 'MA', countryAr: 'المغرب', countryEn: 'Morocco', dialectLabelAr: 'اللهجة المغربية', dialectLabelEn: 'Moroccan Dialect', flag: '🇲🇦' },
  { code: 'DZ', countryAr: 'الجزائر', countryEn: 'Algeria', dialectLabelAr: 'اللهجة الجزائرية', dialectLabelEn: 'Algerian Dialect', flag: '🇩🇿' },
  { code: 'TN', countryAr: 'تونس', countryEn: 'Tunisia', dialectLabelAr: 'اللهجة التونسية', dialectLabelEn: 'Tunisian Dialect', flag: '🇹🇳' },
  { code: 'AR_INTL', countryAr: 'دولي (عربي)', countryEn: 'International (Arabic)', dialectLabelAr: 'العربية الراقية', dialectLabelEn: 'Formal Warm Arabic', flag: '🌍' },
  { code: 'EN_INTL', countryAr: 'دولي (إنجليزي)', countryEn: 'International (English)', dialectLabelAr: 'الإنجليزية', dialectLabelEn: 'English', flag: '🌐' },
];

const DIALECT_BY_CODE: Record<DialectCode, DialectMeta> = Object.fromEntries(
  DIALECT_OPTIONS.map((d) => [d.code, d])
) as Record<DialectCode, DialectMeta>;

const DIAL_CODE_TO_DIALECT: Array<{ prefix: string; code: DialectCode }> = [
  { prefix: '962', code: 'JO' },
  { prefix: '966', code: 'SA' },
  { prefix: '971', code: 'AE' },
  { prefix: '965', code: 'KW' },
  { prefix: '974', code: 'QA' },
  { prefix: '973', code: 'BH' },
  { prefix: '968', code: 'OM' },
  { prefix: '970', code: 'PS' },
  { prefix: '972', code: 'PS' },
  { prefix: '961', code: 'LB' },
  { prefix: '963', code: 'SY' },
  { prefix: '964', code: 'IQ' },
  { prefix: '967', code: 'YE' },
  { prefix: '218', code: 'LY' },
  { prefix: '249', code: 'SD' },
  { prefix: '212', code: 'MA' },
  { prefix: '213', code: 'DZ' },
  { prefix: '216', code: 'TN' },
  { prefix: '20', code: 'EG' },
];

const TEXT_HINTS_TO_DIALECT: Array<{ code: DialectCode; pattern: RegExp }> = [
  {
    code: 'JO',
    pattern: /jordan|الأردن|الاردن|أردن|اردن|دينار\s*أردني|amman|عمّان|عمان\b|irbid|إربد|اربد|zarqa|الزرقاء|ajlun|عجلون|aqaba|العقبة|karak|الكرك|madaba|مأدبا|salt|السلط|jerash|جرش/i,
  },
  {
    code: 'SA',
    pattern: /saudi|السعودية|السعوديه|ريال\s*سعودي|riyadh|الرياض|jeddah|جدة|جده|dammam|الدمام|makkah|mecca|مكة|المدينة|khobar|الخبر|abha|أبها|taif|الطائف/i,
  },
  {
    code: 'AE',
    pattern: /\buae\b|emirates|الإمارات|الامارات|درهم\s*إماراتي|dubai|دبي|abu\s*dhabi|أبوظبي|ابوظبي|sharjah|الشارقة|ajman|عجمان|al\s*ain|العين/i,
  },
  {
    code: 'KW',
    pattern: /kuwait|الكويت|دينار\s*كويتي|hawalli|حولي|salmiya|السالمية|jahra|الجهراء/i,
  },
  {
    code: 'QA',
    pattern: /qatar|قطر|ريال\s*قطري|doha|الدوحة|الدوحه|al\s*wakrah|الوكرة/i,
  },
  {
    code: 'BH',
    pattern: /bahrain|البحرين|manama|المنامة|المنامه|muharraq|المحرق/i,
  },
  {
    code: 'OM',
    pattern: /oman|سلطنة\s*عمان|عُمان|مسقط|muscat|salalah|صلالة|sohar|صحار/i,
  },
  {
    code: 'PS',
    pattern: /palestine|فلسطين|ramallah|رام\s*الله|nablus|نابلس|hebron|الخليل|gaza|غزة|jerusalem|القدس|bethlehem|بيت\s*لحم|jenin|جنين/i,
  },
  {
    code: 'LB',
    pattern: /lebanon|لبنان|beirut|بيروت|tripoli\s*lebanon|صيدا|جونية|طرابلس\s*لبنان/i,
  },
  {
    code: 'SY',
    pattern: /syria|سوريا|سورية|damascus|دمشق|aleppo|حلب|homs|حمص|latakia|اللاذقية/i,
  },
  {
    code: 'IQ',
    pattern: /iraq|العراق|baghdad|بغداد|erbil|أربيل|اربيل|basra|البصرة|mosul|الموصل|najaf|النجف|karbala|كربلاء/i,
  },
  {
    code: 'YE',
    pattern: /yemen|اليمن|sanaa|صنعاء|aden|عدن|taiz|تعز|mukalla|المكلا/i,
  },
  {
    code: 'LY',
    pattern: /libya|ليبيا|benghazi|بنغازي|misrata|مصراتة|طرابلس\s*ليبيا/i,
  },
  {
    code: 'SD',
    pattern: /sudan|السودان|khartoum|الخرطوم|omdurman|أم\s*درمان/i,
  },
  {
    code: 'MA',
    pattern: /morocco|المغرب|casablanca|الدار\s*البيضاء|rabat|الرباط|marrakech|مراكش|tangier|طنجة|fes|فاس/i,
  },
  {
    code: 'DZ',
    pattern: /algeria|الجزائر|algiers|oran|وهران|constantine|قسنطينة/i,
  },
  {
    code: 'TN',
    pattern: /tunisia|تونس|sfax|صفاقس|sousse|سوسة/i,
  },
  {
    code: 'EG',
    pattern: /\begypt\b|مصر|القاهرة|القاهره|cairo|alexandria|الإسكندرية|الاسكندرية|اسكندرية|giza|الجيزة|الجيزه|mansoura|المنصورة|tanta|طنطا|nasr\s*city|مدينة\s*نصر|maadi|المعادي|october|أكتوبر|التجمع|الشيخ\s*زايد/i,
  },
];

function safeParseJson(raw?: string | null): Record<string, any> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function normalizeArabicDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

function cleanHumanText(value?: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripDialDigits(raw?: string | null): string {
  if (!raw) return '';
  const normalized = normalizeArabicDigits(raw.trim()).replace(/^p:/i, '');
  const digits = normalized.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) {
    return digits.slice(2);
  }
  return digits;
}

function extractKnownDialPrefix(digits: string): string | null {
  for (const entry of DIAL_CODE_TO_DIALECT) {
    if (digits.startsWith(entry.prefix) && digits.length >= entry.prefix.length + 7) {
      return entry.prefix;
    }
  }
  return null;
}

/**
 * Resolves the cleanest international digits string for `https://wa.me/<digits>`.
 * Respects explicit `whatsapp_input` when provided, automatically attaching the lead's
 * international country code if the customer typed a local number starting with `0`.
 */
export function resolveLeadWhatsAppNumber(lead: Pick<Lead, 'phone' | 'phone_e164' | 'custom_values_json'>): string {
  const customValues = safeParseJson(lead.custom_values_json);
  const primaryDigits = stripDialDigits(lead.phone_e164 || lead.phone || '');
  const primaryPrefix = extractKnownDialPrefix(primaryDigits);

  const rawWaInput = typeof customValues.whatsapp_input === 'string' ? customValues.whatsapp_input : '';
  const waInputDigits = stripDialDigits(rawWaInput);

  if (waInputDigits.length >= 8) {
    // Already includes a valid international dial code
    if (extractKnownDialPrefix(waInputDigits)) {
      return waInputDigits;
    }
    // Local number (e.g., 0790252644) while primary phone has known country dial code (e.g., 962)
    if (primaryPrefix) {
      const localWithoutZero = waInputDigits.replace(/^0+/, '');
      if (localWithoutZero.length >= 7 && localWithoutZero.length <= 10) {
        return `${primaryPrefix}${localWithoutZero}`;
      }
    }
  }

  return primaryDigits || waInputDigits;
}

export interface LeadMessageContext {
  customerName: string;
  service: string;
  preferredTime: string;
  notes: string;
  city: string;
}

export function extractLeadMessageContext(
  lead: Pick<
    Lead,
    | 'full_name'
    | 'interested_service'
    | 'notes_summary'
    | 'custom_values_json'
    | 'original_answers_json'
  >
): LeadMessageContext {
  const customValues = safeParseJson(lead.custom_values_json);
  const originalAnswers = safeParseJson(lead.original_answers_json);

  const customerName = cleanHumanText(lead.full_name);

  let service =
    cleanHumanText(customValues.dental_service) ||
    cleanHumanText(customValues.product_selection) ||
    cleanHumanText(lead.interested_service);

  if (!service) {
    for (const [k, v] of Object.entries(originalAnswers)) {
      if (/خدم[ةه]|زراع|علاج|تجميل|تقويم|service|treatment|dental/i.test(k) && typeof v === 'string' && v.trim()) {
        service = cleanHumanText(v);
        break;
      }
    }
  }

  let preferredTime = cleanHumanText(customValues.preferred_time);
  if (!preferredTime) {
    for (const [k, v] of Object.entries(originalAnswers)) {
      if (/موعد|ميعاد|سفر|الحجز|appointment|preferred_time/i.test(k) && typeof v === 'string' && v.trim()) {
        preferredTime = cleanHumanText(v);
        break;
      }
    }
  }

  const rawNotes =
    cleanHumanText(customValues.medical_notes) ||
    cleanHumanText(customValues.quantity_sizes) ||
    cleanHumanText(lead.notes_summary);

  const notes =
    rawNotes && rawNotes !== service && rawNotes !== preferredTime ? rawNotes : '';

  const city =
    cleanHumanText(originalAnswers.city) ||
    cleanHumanText(customValues.branch_location);

  return { customerName, service, preferredTime, notes, city };
}

export function detectLeadDialect(
  lead: Pick<
    Lead,
    | 'full_name'
    | 'phone'
    | 'phone_e164'
    | 'interested_service'
    | 'campaign_name'
    | 'form_name'
    | 'custom_values_json'
    | 'original_answers_json'
  >
): DialectMeta {
  const customValues = safeParseJson(lead.custom_values_json);
  const originalAnswers = safeParseJson(lead.original_answers_json);

  // 1. Highest priority: International phone country dial code
  const phoneCandidates = [
    stripDialDigits(lead.phone_e164),
    stripDialDigits(lead.phone),
    stripDialDigits(typeof customValues.whatsapp_input === 'string' ? customValues.whatsapp_input : ''),
  ].filter(Boolean);

  for (const digits of phoneCandidates) {
    for (const entry of DIAL_CODE_TO_DIALECT) {
      if (digits.startsWith(entry.prefix) && digits.length >= entry.prefix.length + 7) {
        return DIALECT_BY_CODE[entry.code];
      }
    }
  }

  // 2. Next priority: City, branch, form name, campaign name, or service text cues
  const combinedHints = [
    originalAnswers.city,
    customValues.branch_location,
    lead.form_name,
    lead.campaign_name,
    lead.interested_service,
    customValues.dental_service,
  ]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .join(' | ');

  // Check non-Egypt country hints first (because dental tourism forms mention "السفر إلى مصر")
  for (const hint of TEXT_HINTS_TO_DIALECT) {
    if (hint.code === 'EG') continue;
    if (hint.pattern.test(combinedHints)) {
      return DIALECT_BY_CODE[hint.code];
    }
  }

  // Check Egypt hints explicitly in city/branch/form/campaign (not inside "السفر إلى مصر")
  const egyptCheckText = [
    originalAnswers.city,
    customValues.branch_location,
    lead.form_name,
    lead.campaign_name,
  ]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .join(' | ');

  const egHint = TEXT_HINTS_TO_DIALECT.find((h) => h.code === 'EG');
  if (egHint && egHint.pattern.test(egyptCheckText)) {
    return DIALECT_BY_CODE.EG;
  }

  // 3. Fallback: If any Arabic characters exist in the lead profile/answers, use warm Arabic; otherwise English
  const sampleText = `${lead.full_name || ''} ${lead.interested_service || ''} ${lead.form_name || ''} ${JSON.stringify(originalAnswers)}`;
  if (/[\u0600-\u06FF]/.test(sampleText)) {
    return DIALECT_BY_CODE.AR_INTL;
  }

  return DIALECT_BY_CODE.EN_INTL;
}

export function getDialectMeta(code: DialectCode): DialectMeta {
  return DIALECT_BY_CODE[code] || DIALECT_BY_CODE.AR_INTL;
}

function buildDetailsBlockAr(ctx: LeadMessageContext, isEgyptLocal: boolean): string {
  const lines: string[] = [];
  const serviceLabel = ctx.service || 'استشارة وعلاج الأسنان';
  lines.push(`🔹 *الخدمة المطلوبة:* ${serviceLabel}`);
  if (ctx.preferredTime) {
    const timeTitle = isEgyptLocal ? 'الموعد المفضل' : 'الموعد المقترح للحجز / السفر لمصر';
    lines.push(`🔹 *${timeTitle}:* ${ctx.preferredTime}`);
  }
  if (ctx.notes) {
    lines.push(`🔹 *تفاصيل وملاحظات إضافية:* ${ctx.notes}`);
  }
  return lines.join('\n');
}

function buildDetailsBlockEn(ctx: LeadMessageContext): string {
  const lines: string[] = [];
  const serviceLabel = ctx.service || 'Dental Consultation & Treatment';
  lines.push(`🔹 *Requested Service:* ${serviceLabel}`);
  if (ctx.preferredTime) {
    lines.push(`🔹 *Preferred Date / Travel to Egypt:* ${ctx.preferredTime}`);
  }
  if (ctx.notes) {
    lines.push(`🔹 *Additional Notes:* ${ctx.notes}`);
  }
  return lines.join('\n');
}

/**
 * Generates a warm, polished, personalized WhatsApp message tailored to the customer's
 * name, exact form inquiry/requested service, Dr. Abdullah Ramadan Dental Clinics in Egypt,
 * and the authentic dialect of the customer's country.
 */
export function buildLeadWhatsAppMessage(
  lead: Pick<
    Lead,
    | 'full_name'
    | 'phone'
    | 'phone_e164'
    | 'interested_service'
    | 'notes_summary'
    | 'campaign_name'
    | 'form_name'
    | 'custom_values_json'
    | 'original_answers_json'
  >,
  dialectOverride?: DialectCode
): { message: string; dialect: DialectMeta } {
  const dialect = dialectOverride ? getDialectMeta(dialectOverride) : detectLeadDialect(lead);
  const ctx = extractLeadMessageContext(lead);
  const namePart = ctx.customerName ? `*${ctx.customerName}*` : 'عميلنا الكريم';
  const detailsAr = buildDetailsBlockAr(ctx, dialect.code === 'EG');

  let message = '';

  switch (dialect.code) {
    case 'JO':
      message = [
        `السلام عليكم ورحمة الله وبركاته، يا هلا ومرحباً ${namePart} 🌿`,
        `يسعد أوقاتك بكل خير، بنتواصل معك من *عيادات دكتور عبدالله رمضان للأسنان في مصر* 🇪🇬🦷`,
        ``,
        `وصلنا استفسارك والنموذج اللي عبّيته معنا بخصوص:`,
        detailsAr,
        ``,
        `أهلاً وسهلاً فيك وميّة مرحبا بكل أهلنا في الأردن 🇯🇴✨`,
        `إحنا جاهزين نخدمك ونرتبلك كل تفاصيل الكشف والخطة العلاجية الكاملة خلال زيارتك لمصر بأفضل رعاية طبية وبأعلى جودة.`,
        ``,
        `إذا بتحب نكمل التنسيق الآن أو عندك أي استفسار أو أشعة بانوراما حابب تبعثلنا إياها للتقييم المبدئي مع د. عبدالله رمضان، إحنا بخدمتك وبانتظار ردك 🌸`,
      ].join('\n');
      break;

    case 'EG':
      message = [
        `السلام عليكم ورحمة الله وبركاته، أهلاً وسهلاً بحضرتك ${namePart} 🌿`,
        `بنتواصل مع حضرتك من *عيادات دكتور عبدالله رمضان للأسنان في مصر* 🇪🇬🦷`,
        ``,
        `وصلنا استفسار حضرتك والنموذج اللي سجلته معانا بخصوص:`,
        detailsAr,
        ``,
        `يشرفنا جداً نساعد حضرتك ونوضح لك كافة التفاصيل وخطة العلاج والأسعار ونرتب لك أنسب ميعاد للكشف مع د. عبدالله رمضان.`,
        ``,
        `لو حابب نبدأ التنسيق دلوقتي أو عند حضرتك أي استفسار أو أشعة حابب تبعتها للتقييم المبدئي، تحت أمرك في أي وقت 🌸`,
      ].join('\n');
      break;

    case 'SA':
      message = [
        `السلام عليكم ورحمة الله وبركاته، يا هلا وحياك الله ${namePart} 🌿`,
        `نتواصل معك من *عيادات دكتور عبدالله رمضان للأسنان في مصر* 🇪🇬🦷`,
        ``,
        `وصلنا استفسارك والنموذج اللي سجلته معنا بخصوص:`,
        detailsAr,
        ``,
        `يا مرحباً بك وبأهلنا في السعودية 🇸🇦✨ يسعدنا نخدمك ونرتب لك كامل تفاصيل الكشف والخطة العلاجية خلال زيارتك لمصر بأعلى معايير الجودة والراحة.`,
        ``,
        `أبشر باللي يطيب خاطرك، لو حابب نوضح لك التفاصيل الآن أو ترسل لنا أشعة البانوراما للتقييم المبدئي مع د. عبدالله رمضان، حنا بالخدمة وبانتظار ردك 🌸`,
      ].join('\n');
      break;

    case 'AE':
      message = [
        `السلام عليكم ورحمة الله وبركاته، يا هلا ومرحبا الساع ${namePart} 🌿`,
        `نتواصل وياك من *عيادات دكتور عبدالله رمضان للأسنان في مصر* 🇪🇬🦷`,
        ``,
        `وصلنا استفسارك والنموذج اللي عبيته ويانا بخصوص:`,
        detailsAr,
        ``,
        `حياك الله ونوّرتنا، وكل الترحيب بأهلنا في الإمارات 🇦🇪✨ يسعدنا ننسق وياك كل تفاصيل الخطة العلاجية والزيارة لمصر بأرقى مستوى طبي.`,
        ``,
        `فالك طيب، إذا حابب نكمل التنسيق الحين أو تطرش لنا أشعة البانوراما للتقييم المبدئي مع د. عبدالله رمضان، حاضرين بالخدمة وبانتظار ردك 🌸`,
      ].join('\n');
      break;

    case 'KW':
      message = [
        `السلام عليكم ورحمة الله وبركاته، يا هلا وغلا ${namePart} 🌿`,
        `نتواصل وياك من *عيادات دكتور عبدالله رمضان للأسنان في مصر* 🇪🇬🦷`,
        ``,
        `وصلنا استفسارك والنموذج اللي سجلته عندنا بخصوص:`,
        detailsAr,
        ``,
        `حياك الله ويا هلا بأهلنا في الكويت 🇰🇼✨ جاهزين نرتب لك كل تفاصيل الخطة العلاجية والمواعيد خلال زيارتك لمصر بأفضل رعاية طبية.`,
        ``,
        `إذا حابب نبدأ التنسيق الحين أو تدز لنا أشعة البانوراما للتقييم المبدئي مع د. عبدالله رمضان، إحنا حاضرين وبالخدمة 🌸`,
      ].join('\n');
      break;

    case 'QA':
      message = [
        `السلام عليكم ورحمة الله وبركاته، يا هلا ومرحبا ${namePart} 🌿`,
        `نتواصل معك من *عيادات دكتور عبدالله رمضان للأسنان في مصر* 🇪🇬🦷`,
        ``,
        `وصلنا استفسارك والنموذج اللي عبيته معنا بخصوص:`,
        detailsAr,
        ``,
        `حياك الله وبأهلنا في قطر 🇶🇦✨ يسعدنا نرتب لك كل تفاصيل الكشف والخطة العلاجية لزيارتك لمصر بأعلى جودة طبية.`,
        ``,
        `أبشر بالخير، إذا حابب نبدأ التنسيق الحين أو ترسل لنا أشعة البانوراما للتقييم المبدئي مع د. عبدالله رمضان، إحنا حاضرين وبانتظار ردك 🌸`,
      ].join('\n');
      break;

    case 'BH':
      message = [
        `السلام عليكم ورحمة الله وبركاته، يا هلا ومرحبا ${namePart} 🌿`,
        `نتواصل وياك من *عيادات دكتور عبدالله رمضان للأسنان في مصر* 🇪🇬🦷`,
        ``,
        `وصلنا استفسارك والنموذج اللي سجلته ويانا بخصوص:`,
        detailsAr,
        ``,
        `حياك الله ويا هلا بأهلنا في البحرين 🇧🇭✨ يسعدنا نرتب لك كل تفاصيل العلاج والمواعيد خلال زيارتك لمصر بأفضل رعاية طبية.`,
        ``,
        `إذا حابب نكمل التنسيق الحين أو تطرش لنا أشعة البانوراما للتقييم المبدئي مع د. عبدالله رمضان، حاضرين وبالخدمة 🌸`,
      ].join('\n');
      break;

    case 'OM':
      message = [
        `السلام عليكم ورحمة الله وبركاته، حياك الله ويا مرحباً ${namePart} 🌿`,
        `نتواصل معك من *عيادات دكتور عبدالله رمضان للأسنان في مصر* 🇪🇬🦷`,
        ``,
        `وصلنا استفسارك والنموذج اللي سجلته معنا بخصوص:`,
        detailsAr,
        ``,
        `تشرفنا بك وبأهلنا في سلطنة عُمان 🇴🇲✨ يسعدنا ننسق معك كافة تفاصيل الفحص والخطة العلاجية خلال زيارتك لمصر بأعلى مستوى من الرعاية.`,
        ``,
        `إذا تحب نبدأ التنسيق الآن أو ترسل لنا أشعة البانوراما للتقييم المبدئي مع د. عبدالله رمضان، إحنا بالخدمة وبانتظار ردك 🌸`,
      ].join('\n');
      break;

    case 'PS':
      message = [
        `السلام عليكم ورحمة الله وبركاته، يسعد أوقاتك ويا هلا فيك ${namePart} 🌿`,
        `بنتواصل معك من *عيادات دكتور عبدالله رمضان للأسنان في مصر* 🇪🇬🦷`,
        ``,
        `وصلنا استفسارك والنموذج اللي عبّيته معنا بخصوص:`,
        detailsAr,
        ``,
        `أهلاً وسهلاً فيك وميّة مرحبا بكل أهلنا في فلسطين 🇵🇸✨ جاهزين نساعدك ونرتبلك كل تفاصيل الكشف والخطة العلاجية في مصر بأفضل رعاية طبية.`,
        ``,
        `إذا بتحب نكمل التنسيق هلق أو تبعثلنا أشعة البانوراما للتقييم المبدئي مع د. عبدالله رمضان، إحنا بخدمتك وبانتظار ردك 🌸`,
      ].join('\n');
      break;

    case 'LB':
      message = [
        `مرحباً ${namePart}، يعطيك العافية ويسعد أوقاتك 🌿`,
        `عم نتواصل معك من *عيادات دكتور عبدالله رمضان للأسنان في مصر* 🇪🇬🦷`,
        ``,
        `وصلنا استفسارك والفورم اللي عبّيته معنا بخصوص:`,
        detailsAr,
        ``,
        `أهلاً وسهلاً فيك وبكل أهلنا بلبنان 🇱🇧✨ جاهزين نرتّبلك كل تفاصيل الكشف والخطة العلاجية خلال زيارتك لمصر بأعلى مستوى طبي.`,
        ``,
        `إذا بتحب نكمّل التنسيق هلّق أو تبعتلنا صورة البانوراما للتقييم المبدئي مع د. عبدالله رمضان، نحنا بالخدمة وبانتظار ردك 🌸`,
      ].join('\n');
      break;

    case 'SY':
      message = [
        `السلام عليكم ورحمة الله وبركاته، يسعد أوقاتك ويا أهلاً وسهلاً ${namePart} 🌿`,
        `عم نتواصل معك من *عيادات دكتور عبدالله رمضان للأسنان في مصر* 🇪🇬🦷`,
        ``,
        `وصلنا استفسارك والنموذج اللي عبّيته معنا بخصوص:`,
        detailsAr,
        ``,
        `مية أهلاً وسهلاً فيك وبأهلنا بسوريا 🇸🇾✨ جاهزين نساعدك ونرتبلك كل تفاصيل الفحص والخطة العلاجية خلال زيارتك لمصر بأفضل رعاية طبية.`,
        ``,
        `إذا بتحب نبلّش التنسيق هلأ أو تبعتلنا أشعة البانوراما للتقييم المبدئي مع د. عبدالله رمضان، نحنا بالخدمة وبانتظار ردك 🌸`,
      ].join('\n');
      break;

    case 'IQ':
      message = [
        `السلام عليكم ورحمة الله وبركاته، يا هلا ومرحبا ${namePart} 🌿`,
        `نتواصل وياك من *عيادات دكتور عبدالله رمضان للأسنان في مصر* 🇪🇬🦷`,
        ``,
        `وصلنا استفسارك والاستمارة اللي مليتها ويانا بخصوص:`,
        detailsAr,
        ``,
        `كل الهلا بيك وبأهلنا بالعراق 🇮🇶✨ حاضرين نرتبلك كل تفاصيل الكشف والخطة العلاجية لزيارتك لمصر بأفضل رعاية طبية وبأعلى جودة.`,
        ``,
        `إذا تحب نكمل التنسيق هسة أو تدزلنا أشعة البانوراما للتقييم المبدئي وية د. عبدالله رمضان، إحنا بالخدمة وبانتظار ردك 🌸`,
      ].join('\n');
      break;

    case 'YE':
      message = [
        `السلام عليكم ورحمة الله وبركاته، حياك الله ويا مرحباً ${namePart} 🌿`,
        `نتواصل معك من *عيادات دكتور عبدالله رمضان للأسنان في مصر* 🇪🇬🦷`,
        ``,
        `وصلنا استفسارك والنموذج اللي سجلته معنا بخصوص:`,
        detailsAr,
        ``,
        `أهلاً وسهلاً بك وبأهلنا في اليمن 🇾🇪✨ يسعدنا نخدمك ونرتب لك كافة تفاصيل الفحص والخطة العلاجية لزيارتك لمصر بأفضل رعاية طبية.`,
        ``,
        `إذا تحب نبدأ التنسيق الآن أو ترسل لنا أشعة البانوراما للتقييم المبدئي مع د. عبدالله رمضان، إحنا بالخدمة وبانتظار ردك 🌸`,
      ].join('\n');
      break;

    case 'LY':
      message = [
        `السلام عليكم ورحمة الله وبركاته، أهلاً وسهلاً ومرحبتين ${namePart} 🌿`,
        `نتواصلوا معاك من *عيادات دكتور عبدالله رمضان للأسنان في مصر* 🇪🇬🦷`,
        ``,
        `وصلنا استفسارك والنموذج اللي عبيته معانا بخصوص:`,
        detailsAr,
        ``,
        `مرحبتين بيك وبأهلنا في ليبيا 🇱🇾✨ جاهزين نرتبوا معاك كل تفاصيل الكشف والخطة العلاجية لزيارتك لمصر بأفضل جودة ورعاية طبية.`,
        ``,
        `لو تحب نكملوا التنسيق توا أو تبعثلنا أشعة البانوراما للتقييم المبدئي مع د. عبدالله رمضان، إحنا في الخدمة وبانتظار ردك 🌸`,
      ].join('\n');
      break;

    case 'SD':
      message = [
        `السلام عليكم ورحمة الله وبركاته، حبابك وأهلاً وسهلاً ${namePart} 🌿`,
        `بنتواصل معاك من *عيادات دكتور عبدالله رمضان للأسنان في مصر* 🇪🇬🦷`,
        ``,
        `وصلنا استفسارك والنموذج اللي سجلته معانا بخصوص:`,
        detailsAr,
        ``,
        `نورتنا وأهلاً بأهلنا في السودان 🇸🇩✨ جاهزين نساعدك ونرتب ليك كل تفاصيل الكشف والخطة العلاجية في مصر بأفضل رعاية طبية.`,
        ``,
        `لو حابب نبدأ التنسيق هسي أو ترسل لينا أشعة البانوراما للتقييم المبدئي مع د. عبدالله رمضان، إحنا في الخدمة وبانتظار ردك 🌸`,
      ].join('\n');
      break;

    case 'MA':
      message = [
        `السلام عليكم ورحمة الله وبركاته، مرحباً بك ${namePart} 🌿`,
        `كنتواصلو معاك من *عيادات دكتور عبدالله رمضان للأسنان في مصر* 🇪🇬🦷`,
        ``,
        `وصلنا الاستفسار ديالك والنموذج اللي عمّرتيه معانا بخصوص:`,
        detailsAr,
        ``,
        `ألف مرحباً بك وبأهلنا في المغرب 🇲🇦✨ مستعدين ننسقو معاك كل تفاصيل الفحص وخطة العلاج خلال زيارتك لمصر بأفضل جودة ورعاية طبية.`,
        ``,
        `إلا بغيتي نكملو التنسيق دابا أو تصيفط لينا أشعة البانوراما للتقييم الأولي مع د. عبدالله رمضان، حنا رهن الإشارة وبانتظار ردك 🌸`,
      ].join('\n');
      break;

    case 'DZ':
      message = [
        `السلام عليكم ورحمة الله وبركاته، مرحباً بك ${namePart} 🌿`,
        `رانا نتواصلو معاك من *عيادات دكتور عبدالله رمضان للأسنان في مصر* 🇪🇬🦷`,
        ``,
        `وصلنا الاستفسار تاعك والنموذج اللي عمّرتو معانا بخصوص:`,
        detailsAr,
        ``,
        `مرحباً بك وبأهلنا في الجزائر 🇩🇿✨ واجدين نرتبو معاك كامل تفاصيل الفحص وخطة العلاج خلال زيارتك لمصر بأحسن رعاية طبية.`,
        ``,
        `إلا حبيت نكملو التنسيق درك ولا تبعثلنا أشعة البانوراما للتقييم الأولي مع د. عبدالله رمضان، رانا في الخدمة وبانتظار ردك 🌸`,
      ].join('\n');
      break;

    case 'TN':
      message = [
        `السلام عليكم ورحمة الله وبركاته، أهلاً ومرحباً بك ${namePart} 🌿`,
        `نتواصلو معاك من *عيادات دكتور عبدالله رمضان للأسنان في مصر* 🇪🇬🦷`,
        ``,
        `وصلنا استفسارك والنموذج اللي عمّرتو معانا بخصوص:`,
        detailsAr,
        ``,
        `مرحباً بك وبأهلنا في تونس 🇹🇳✨ حاضرين ننسقو معاك كل تفاصيل الكشف وخطة العلاج خلال زيارتك لمصر بأفضل رعاية طبية.`,
        ``,
        `إذا تحب نكملو التنسيق توة ولا تبعثلنا أشعة البانوراما للتقييم الأولي مع د. عبدالله رمضان، إحنا في الخدمة وبانتظار ردك 🌸`,
      ].join('\n');
      break;

    case 'EN_INTL': {
      const enName = ctx.customerName ? `*${ctx.customerName}*` : 'Valued Patient';
      const detailsEn = buildDetailsBlockEn(ctx);
      message = [
        `Hello ${enName} 🌿`,
        `We are reaching out to you from *Dr. Abdullah Ramadan Dental Clinics in Egypt* 🇪🇬🦷`,
        ``,
        `We received your inquiry and the form you submitted regarding:`,
        detailsEn,
        ``,
        `We would be delighted to assist you with all details, your personalized treatment plan, and coordinating your visit to our clinic in Egypt with the highest medical standards.`,
        ``,
        `Please let us know if you would like to proceed now or share a panoramic X-ray for an initial evaluation with Dr. Abdullah Ramadan. We look forward to hearing from you 🌸`,
      ].join('\n');
      break;
    }

    case 'AR_INTL':
    default:
      message = [
        `السلام عليكم ورحمة الله وبركاته، أهلاً وسهلاً بك ${namePart} 🌿`,
        `نتواصل معك من *عيادات دكتور عبدالله رمضان للأسنان في مصر* 🇪🇬🦷`,
        ``,
        `وصلنا استفسارك والنموذج الذي قمت بتعبئته معنا بخصوص:`,
        detailsAr,
        ``,
        `يسعدنا جداً خدمتك وتنسيق كافة تفاصيل الكشف والخطة العلاجية الكاملة خلال زيارتك لمصر بأعلى معايير الجودة والرعاية الطبية.`,
        ``,
        `إذا رغبت في استكمال التنسيق الآن أو إرسال أشعة البانوراما للتقييم المبدئي مع د. عبدالله رمضان، نحن في خدمتك وبانتظار ردك الكريم 🌸`,
      ].join('\n');
      break;
  }

  return { message, dialect };
}

/**
 * Builds the complete `https://wa.me/<digits>?text=<encoded>` link ready to open in WhatsApp.
 */
export function buildLeadWhatsAppUrl(
  lead: Pick<
    Lead,
    | 'full_name'
    | 'phone'
    | 'phone_e164'
    | 'interested_service'
    | 'notes_summary'
    | 'campaign_name'
    | 'form_name'
    | 'custom_values_json'
    | 'original_answers_json'
  >,
  options?: { dialectOverride?: DialectCode; customMessage?: string }
): string {
  const digits = resolveLeadWhatsAppNumber(lead);
  if (!digits) return '';
  const text =
    options?.customMessage !== undefined
      ? options.customMessage
      : buildLeadWhatsAppMessage(lead, options?.dialectOverride).message;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
