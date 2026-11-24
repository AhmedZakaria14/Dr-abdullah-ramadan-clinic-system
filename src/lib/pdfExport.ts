import { CustomField, Language, Lead } from '../types/crm';
import { BRAND_LOGO_URL, BRAND_NAME_AR, BRAND_NAME_EN, BRAND_SUBTITLE_EN } from './constants';
import { formatCairoDateTime } from './dateFormat';

export interface ExportLeadsPdfOptions {
  leads: Lead[];
  totalMatching: number;
  lang: Language;
  visibleCols: Record<string, boolean>;
  extraCustomCols: CustomField[];
  filterSummary: string[];
  isSelectionOnly?: boolean;
}

interface PdfColumnDef {
  key: string;
  label: string;
  width: string;
  dir?: 'ltr' | 'rtl';
  mono?: boolean;
}

function safeParseJson(jsonStr?: string | null): Record<string, any> {
  if (!jsonStr) return {};
  try {
    return JSON.parse(jsonStr);
  } catch {
    return {};
  }
}

function formatSourceLabel(source: string, isAr: boolean): string {
  if (source === 'facebook_lead_ads') return 'Facebook';
  if (source === 'instagram_lead_ads') return 'Instagram';
  if (source === 'meta_lead_ads') return 'Meta Ads';
  if (source === 'google_sheets') return 'Google Sheets';
  if (source === 'manual') return isAr ? 'إدخال يدوي' : 'Manual';
  return source || '—';
}

function truncateText(val: string, maxLen: number): string {
  const cleaned = (val || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '—';
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, maxLen - 1)}…`;
}

async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  styles?: Partial<CSSStyleDeclaration>,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (styles) {
    Object.assign(node.style, styles);
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function buildColumns(
  visibleCols: Record<string, boolean>,
  extraCustomCols: CustomField[],
  isAr: boolean
): PdfColumnDef[] {
  const cols: PdfColumnDef[] = [];
  if (visibleCols.lead_code !== false) {
    cols.push({
      key: 'lead_code',
      label: isAr ? 'المعرف' : 'Lead ID',
      width: '78px',
      dir: 'ltr',
      mono: true,
    });
  }
  if (visibleCols.full_name !== false) {
    cols.push({
      key: 'full_name',
      label: isAr ? 'اسم العميل' : 'Customer Name',
      width: '170px',
    });
  }
  if (visibleCols.phone !== false) {
    cols.push({
      key: 'phone',
      label: isAr ? 'بيانات التواصل' : 'Contact',
      width: '140px',
      dir: 'ltr',
      mono: true,
    });
  }
  if (visibleCols.interested_service !== false) {
    cols.push({
      key: 'interested_service',
      label: isAr ? 'الخدمة الطبية والتفاصيل' : 'Dental Service & Details',
      width: '195px',
    });
  }
  if (visibleCols.status !== false) {
    cols.push({
      key: 'status',
      label: isAr ? 'الحالة' : 'Status',
      width: '105px',
    });
  }
  if (visibleCols.assigned !== false) {
    cols.push({
      key: 'assigned',
      label: isAr ? 'المسؤول' : 'Assigned',
      width: '96px',
    });
  }
  if (visibleCols.source !== false) {
    cols.push({
      key: 'source',
      label: isAr ? 'المصدر' : 'Source',
      width: '86px',
    });
  }
  if (visibleCols.campaign !== false) {
    cols.push({
      key: 'campaign',
      label: isAr ? 'الحملة' : 'Campaign',
      width: '112px',
    });
  }
  for (const cf of extraCustomCols) {
    cols.push({
      key: `custom:${cf.field_key}`,
      label: isAr ? cf.label_ar : cf.label_en,
      width: '92px',
    });
  }
  if (visibleCols.created_at !== false) {
    cols.push({
      key: 'created_at',
      label: isAr ? 'تاريخ الإنشاء' : 'Created',
      width: '116px',
      dir: 'ltr',
      mono: true,
    });
  }

  // Fallback to core columns if user hid all columns
  if (cols.length === 0) {
    cols.push(
      { key: 'lead_code', label: isAr ? 'المعرف' : 'Lead ID', width: '90px', dir: 'ltr', mono: true },
      { key: 'full_name', label: isAr ? 'اسم العميل' : 'Customer Name', width: '240px' },
      { key: 'phone', label: isAr ? 'الهاتف' : 'Phone', width: '160px', dir: 'ltr', mono: true },
      { key: 'status', label: isAr ? 'الحالة' : 'Status', width: '140px' }
    );
  }
  return cols;
}

function buildCellContent(
  lead: Lead,
  col: PdfColumnDef,
  lang: Language,
  isAr: boolean
): HTMLElement {
  const customVals = safeParseJson(lead.custom_values_json);
  const primaryPhone = lead.phone_e164 || lead.phone || '';
  const companyName = typeof customVals.company_name === 'string' ? customVals.company_name.trim() : '';
  const specsPreview =
    (typeof customVals.medical_notes === 'string' && customVals.medical_notes.trim()) ||
    (typeof customVals.quantity_sizes === 'string' && customVals.quantity_sizes.trim()) ||
    lead.notes_summary ||
    '';
  const isUnread = !lead.is_read;

  const td = el('td', {
    padding: '7px 8px',
    verticalAlign: 'top',
    borderBottom: '1px solid #e2e8f0',
    fontSize: '10.5px',
    lineHeight: '1.38',
    color: '#0f172a',
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
  });

  if (col.key === 'lead_code') {
    const code = el(
      'span',
      {
        fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
        fontSize: '10px',
        fontWeight: '600',
        color: '#334155',
        direction: 'ltr',
        unicodeBidi: 'embed',
        display: 'inline-block',
      },
      lead.lead_code || '—'
    );
    td.appendChild(code);
    return td;
  }

  if (col.key === 'full_name') {
    const nameRow = el('div', {
      fontWeight: '700',
      color: '#0f172a',
      fontSize: '11px',
    });
    nameRow.textContent = truncateText(lead.full_name || '—', 44);
    td.appendChild(nameRow);

    const metaParts: string[] = [];
    metaParts.push(isUnread ? (isAr ? 'جديد' : 'New') : isAr ? 'مقروء' : 'Read');
    if (companyName) metaParts.push(truncateText(companyName, 28));

    const metaRow = el(
      'div',
      {
        marginTop: '2px',
        fontSize: '9.5px',
        fontWeight: isUnread ? '700' : '500',
        color: isUnread ? '#b91c1c' : '#64748b',
      },
      metaParts.join(' · ')
    );
    td.appendChild(metaRow);
    return td;
  }

  if (col.key === 'phone') {
    const phoneDiv = el(
      'div',
      {
        fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
        fontWeight: '600',
        fontSize: '10px',
        color: '#0f172a',
        direction: 'ltr',
        textAlign: isAr ? 'right' : 'left',
      },
      primaryPhone || '—'
    );
    td.appendChild(phoneDiv);
    if (lead.email) {
      const emailDiv = el(
        'div',
        {
          marginTop: '2px',
          fontSize: '9.5px',
          color: '#64748b',
          direction: 'ltr',
          textAlign: isAr ? 'right' : 'left',
        },
        truncateText(lead.email, 26)
      );
      td.appendChild(emailDiv);
    }
    return td;
  }

  if (col.key === 'interested_service') {
    const svc = el(
      'div',
      {
        fontWeight: '600',
        color: '#0f172a',
        fontSize: '10.5px',
      },
      truncateText(lead.interested_service || '—', 52)
    );
    td.appendChild(svc);
    if (specsPreview) {
      const notes = el(
        'div',
        {
          marginTop: '2px',
          fontSize: '9.5px',
          color: '#475569',
        },
        truncateText(specsPreview, 72)
      );
      td.appendChild(notes);
    }
    return td;
  }

  if (col.key === 'status') {
    const stageColor = lead.status_color || '#0077B6';
    const stageLabel = (isAr ? lead.status_name_ar : lead.status_name_en) || lead.status_key || '—';
    const wrap = el('div', {
      display: 'flex',
      alignItems: 'center',
      gap: '5px',
    });
    const dot = el('span', {
      width: '7px',
      height: '7px',
      borderRadius: '2px',
      backgroundColor: stageColor,
      flexShrink: '0',
      display: 'inline-block',
    });
    const label = el(
      'span',
      {
        fontWeight: '700',
        fontSize: '10px',
        color: stageColor,
      },
      stageLabel
    );
    wrap.appendChild(dot);
    wrap.appendChild(label);
    td.appendChild(wrap);
    return td;
  }

  if (col.key === 'assigned') {
    td.textContent = truncateText(
      lead.assigned_employee_name || (isAr ? 'غير معين' : 'Unassigned'),
      26
    );
    td.style.color = lead.assigned_employee_name ? '#1e293b' : '#94a3b8';
    return td;
  }

  if (col.key === 'source') {
    td.textContent = formatSourceLabel(lead.source, isAr);
    td.style.fontWeight = '600';
    td.style.color = '#0077B6';
    return td;
  }

  if (col.key === 'campaign') {
    const camp = el(
      'div',
      { color: '#1e293b', fontWeight: '500' },
      truncateText(lead.campaign_name || '—', 32)
    );
    td.appendChild(camp);
    if (lead.ad_name) {
      const ad = el(
        'div',
        { marginTop: '2px', fontSize: '9.5px', color: '#64748b' },
        truncateText(lead.ad_name, 30)
      );
      td.appendChild(ad);
    }
    return td;
  }

  if (col.key === 'created_at') {
    const dt = el(
      'span',
      {
        fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
        fontSize: '9.5px',
        color: '#475569',
        direction: 'ltr',
        unicodeBidi: 'embed',
        display: 'inline-block',
      },
      lead.created_at ? formatCairoDateTime(lead.created_at, lang) : '—'
    );
    td.appendChild(dt);
    return td;
  }

  if (col.key.startsWith('custom:')) {
    const cfKey = col.key.slice('custom:'.length);
    const raw = customVals[cfKey];
    let formatted = '—';
    if (typeof raw === 'boolean') {
      formatted = raw ? (isAr ? 'نعم' : 'Yes') : isAr ? 'لا' : 'No';
    } else if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
      formatted = truncateText(String(raw), 36);
    }
    td.textContent = formatted;
    td.style.color = '#334155';
    return td;
  }

  td.textContent = '—';
  return td;
}

function buildPrintablePage(params: {
  pageLeads: Lead[];
  pageIndex: number;
  totalPages: number;
  allExportedCount: number;
  totalMatching: number;
  unreadInExport: number;
  columns: PdfColumnDef[];
  lang: Language;
  logoDataUrl: string | null;
  generatedAt: string;
  filterSummary: string[];
  isSelectionOnly?: boolean;
}): HTMLElement {
  const {
    pageLeads,
    pageIndex,
    totalPages,
    allExportedCount,
    totalMatching,
    unreadInExport,
    columns,
    lang,
    logoDataUrl,
    generatedAt,
    filterSummary,
    isSelectionOnly,
  } = params;

  const isAr = lang === 'ar';
  const isFirstPage = pageIndex === 0;
  const fontFamily = isAr
    ? '"IBM Plex Sans Arabic", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif'
    : '"Plus Jakarta Sans", "IBM Plex Sans Arabic", system-ui, -apple-system, sans-serif';

  // Fixed A4 Landscape aspect ratio canvas (297mm x 210mm => 1122px x 794px at 96dpi)
  const page = el('div', {
    width: '1122px',
    height: '794px',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    fontFamily,
    direction: isAr ? 'rtl' : 'ltr',
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
    overflow: 'hidden',
    position: 'relative',
  });

  // Brand top gradient accent bar
  const topBar = el('div', {
    height: isFirstPage ? '6px' : '4px',
    width: '100%',
    background: 'linear-gradient(90deg, #0077B6 0%, #0095D9 52%, #00B5CC 100%)',
    flexShrink: '0',
  });
  page.appendChild(topBar);

  const inner = el('div', {
    flex: '1',
    display: 'flex',
    flexDirection: 'column',
    padding: isFirstPage ? '18px 28px 16px 28px' : '14px 28px 16px 28px',
    boxSizing: 'border-box',
    minHeight: '0',
  });
  page.appendChild(inner);

  if (isFirstPage) {
    // Full Branded Clinic Header
    const header = el('div', {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '16px',
      paddingBottom: '12px',
      borderBottom: '1px solid #cbd5e1',
      flexShrink: '0',
    });

    const brandGroup = el('div', {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
    });

    if (logoDataUrl) {
      const logoImg = document.createElement('img');
      logoImg.src = logoDataUrl;
      logoImg.alt = BRAND_NAME_AR;
      Object.assign(logoImg.style, {
        width: '52px',
        height: '52px',
        borderRadius: '10px',
        objectFit: 'cover',
        border: '1px solid #e2e8f0',
        flexShrink: '0',
      });
      brandGroup.appendChild(logoImg);
    }

    const titleWrap = el('div');
    titleWrap.appendChild(
      el(
        'div',
        {
          fontSize: '17px',
          fontWeight: '700',
          color: '#0f172a',
          lineHeight: '1.25',
        },
        isAr ? BRAND_NAME_AR : BRAND_NAME_EN
      )
    );
    titleWrap.appendChild(
      el(
        'div',
        {
          fontSize: '11px',
          fontWeight: '600',
          color: '#0077B6',
          marginTop: '2px',
        },
        isAr ? `تقرير قائمة العملاء المحتملين · ${BRAND_SUBTITLE_EN}` : `Leads Directory Report · ${BRAND_SUBTITLE_EN}`
      )
    );
    brandGroup.appendChild(titleWrap);
    header.appendChild(brandGroup);

    const metaWrap = el('div', {
      textAlign: isAr ? 'left' : 'right',
      fontSize: '10.5px',
      color: '#475569',
      lineHeight: '1.5',
    });
    const countText = isSelectionOnly
      ? isAr
        ? `السجلات المحددة: ${allExportedCount}`
        : `Selected Records: ${allExportedCount}`
      : allExportedCount < totalMatching
        ? isAr
          ? `السجلات المصدرة: ${allExportedCount} من ${totalMatching}`
          : `Exported Records: ${allExportedCount} of ${totalMatching}`
        : isAr
          ? `إجمالي السجلات: ${allExportedCount}`
          : `Total Records: ${allExportedCount}`;

    metaWrap.appendChild(
      el(
        'div',
        { fontWeight: '700', color: '#0f172a', fontSize: '11.5px' },
        countText
      )
    );
    metaWrap.appendChild(
      el(
        'div',
        { fontSize: '10px', color: '#64748b' },
        isAr
          ? `جديد (غير مقروء): ${unreadInExport} · مقروء: ${allExportedCount - unreadInExport}`
          : `New (Unread): ${unreadInExport} · Read: ${allExportedCount - unreadInExport}`
      )
    );
    metaWrap.appendChild(
      el(
        'div',
        {
          fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
          fontSize: '9.5px',
          color: '#64748b',
          direction: 'ltr',
          unicodeBidi: 'embed',
        },
        generatedAt
      )
    );
    header.appendChild(metaWrap);
    inner.appendChild(header);

    // Clean unboxed active filter metadata strip
    if (filterSummary.length > 0) {
      const filterLine = el(
        'div',
        {
          padding: '7px 0',
          fontSize: '10px',
          color: '#475569',
          borderBottom: '1px solid #f1f5f9',
          flexShrink: '0',
        },
        `${isAr ? 'الفلاتر المطبقة: ' : 'Active Filters: '}${filterSummary.join(' · ')}`
      );
      inner.appendChild(filterLine);
    }
  } else {
    // Compact continuation header on pages 2..N
    const contHeader = el('div', {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: '8px',
      marginBottom: '6px',
      borderBottom: '1px solid #e2e8f0',
      fontSize: '10.5px',
      color: '#475569',
      flexShrink: '0',
    });
    contHeader.appendChild(
      el(
        'span',
        { fontWeight: '700', color: '#0f172a' },
        isAr
          ? `${BRAND_NAME_AR} — تقرير قائمة العملاء المحتملين`
          : `${BRAND_NAME_EN} — Leads Directory Report`
      )
    );
    contHeader.appendChild(
      el(
        'span',
        {
          fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
          fontSize: '9.5px',
          color: '#64748b',
          direction: 'ltr',
          unicodeBidi: 'embed',
        },
        generatedAt
      )
    );
    inner.appendChild(contHeader);
  }

  // Printable Table Container
  const tableWrap = el('div', {
    flex: '1',
    marginTop: isFirstPage ? '10px' : '4px',
    overflow: 'hidden',
  });

  const table = el('table', {
    width: '100%',
    borderCollapse: 'collapse',
    tableLayout: 'fixed',
  });

  const thead = document.createElement('thead');
  const headRow = el('tr', {
    backgroundColor: '#f1f5f9',
    borderTop: '1px solid #cbd5e1',
    borderBottom: '1.5px solid #94a3b8',
  });

  for (const col of columns) {
    const th = el(
      'th',
      {
        padding: '7px 8px',
        textAlign: isAr ? 'right' : 'left',
        fontSize: '10px',
        fontWeight: '700',
        color: '#334155',
        width: col.width,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      },
      col.label
    );
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  pageLeads.forEach((lead, idx) => {
    const tr = el('tr', {
      backgroundColor: !lead.is_read ? '#fff7f7' : idx % 2 === 1 ? '#f8fafc' : '#ffffff',
    });
    for (const col of columns) {
      tr.appendChild(buildCellContent(lead, col, lang, isAr));
    }
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  inner.appendChild(tableWrap);

  // Crisp Page Footer
  const footer = el('div', {
    marginTop: '8px',
    paddingTop: '8px',
    borderTop: '1px solid #e2e8f0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '9.5px',
    color: '#64748b',
    flexShrink: '0',
  });
  footer.appendChild(
    el(
      'span',
      undefined,
      isAr
        ? `${BRAND_NAME_AR} · مستند قابل للطباعة (A4)`
        : `${BRAND_NAME_EN} · Printable Directory (A4)`
    )
  );
  footer.appendChild(
    el(
      'span',
      {
        fontWeight: '600',
        color: '#334155',
        fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
      },
      isAr
        ? `صفحة ${pageIndex + 1} من ${totalPages}`
        : `Page ${pageIndex + 1} of ${totalPages}`
    )
  );
  inner.appendChild(footer);

  return page;
}

export async function exportLeadsToPdf(options: ExportLeadsPdfOptions): Promise<{
  filename: string;
  exportedCount: number;
  pageCount: number;
}> {
  const { leads, totalMatching, lang, visibleCols, extraCustomCols, filterSummary, isSelectionOnly } = options;
  if (!leads || leads.length === 0) {
    throw new Error(lang === 'ar' ? 'لا يوجد عملاء لتصديرهم إلى PDF' : 'No leads available to export to PDF');
  }

  const isAr = lang === 'ar';
  const [{ jsPDF }, { default: html2canvas }, logoDataUrl] = await Promise.all([
    import('jspdf'),
    import('html2canvas-pro'),
    loadImageAsDataUrl(BRAND_LOGO_URL),
  ]);

  if (typeof document !== 'undefined' && 'fonts' in document) {
    try {
      await document.fonts.ready;
    } catch {
      // ignore font loading timeout
    }
  }

  const columns = buildColumns(visibleCols, extraCustomCols, isAr);
  const generatedAt = formatCairoDateTime(new Date().toISOString(), lang);
  const unreadInExport = leads.filter((l) => !l.is_read).length;

  // Deterministic row chunking so rows are never sliced across page breaks
  const firstPageRows = filterSummary.length > 0 ? 10 : 11;
  const nextPageRows = 13;
  const chunks: Lead[][] = [];
  if (leads.length <= firstPageRows) {
    chunks.push(leads);
  } else {
    chunks.push(leads.slice(0, firstPageRows));
    for (let i = firstPageRows; i < leads.length; i += nextPageRows) {
      chunks.push(leads.slice(i, i + nextPageRows));
    }
  }

  const host = el('div', {
    position: 'fixed',
    left: '-12000px',
    top: '0',
    width: '1122px',
    backgroundColor: '#ffffff',
    zIndex: '-1',
    pointerEvents: 'none',
  });
  document.body.appendChild(host);

  try {
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    for (let i = 0; i < chunks.length; i++) {
      const pageNode = buildPrintablePage({
        pageLeads: chunks[i],
        pageIndex: i,
        totalPages: chunks.length,
        allExportedCount: leads.length,
        totalMatching,
        unreadInExport,
        columns,
        lang,
        logoDataUrl,
        generatedAt,
        filterSummary,
        isSelectionOnly,
      });

      host.innerHTML = '';
      host.appendChild(pageNode);

      const canvas = await html2canvas(pageNode, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: 1122,
        height: 794,
        windowWidth: 1122,
        windowHeight: 794,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.94);
      if (i > 0) {
        pdf.addPage('a4', 'landscape');
      }
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
    }

    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `dr-abdullah-ramadan-leads-${dateStamp}.pdf`;
    pdf.save(filename);

    return {
      filename,
      exportedCount: leads.length,
      pageCount: chunks.length,
    };
  } finally {
    if (host.parentNode) {
      host.parentNode.removeChild(host);
    }
  }
}
