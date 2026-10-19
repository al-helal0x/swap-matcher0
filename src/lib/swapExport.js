// 🔁 «مُطابِق تبديل الفئات» — تصدير الطلبات إلى ملف Excel حقيقي (.xlsx) منسَّق.
// الأوراق: الملخص · كل الطلبات · حركة الفئات · التطابقات · الاتفاقات.
// ExcelJS يُحمَّل عند الضغط على زر التصدير فقط (import ديناميكي) فلا يثقّل الصفحة.

import { SECTION_NAMES, MODE_LABELS, STATUS_LABELS, requestStatus, slotMovement } from "./swapMatching.js";
import { prUrl } from "./swapAdmin.js";
import { openSubjectsLabel } from "./swapSettings.js";

const FONT = "Arial";
const C = {
  header: "FF1F3A5F",
  headerText: "FFFFFFFF",
  zebra: "FFF4F6FA",
  border: "FFD0D7E2",
  muted: "FF5A6478",
  link: "FF0563C1",
  status: {
    match: "FFDDEBF7",
    "agreed-confirmed": "FFE2EFDA",
    "agreed-awaiting": "FFFFF2CC",
    "agreed-conflict": "FFF8CBAD",
    waiting: null,
  },
  bands: ["FFE8F1FB", "FFFDF3E1"],
};

async function loadExcelJS() {
  const mod = await import("exceljs/dist/exceljs.min.js");
  return mod.default ?? mod;
}

const solid = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const thin = () => {
  const s = { style: "thin", color: { argb: C.border } };
  return { top: s, left: s, bottom: s, right: s };
};

/** يعرض الوقت المحلي للمتصفح كما هو داخل Excel (Excel لا يخزّن منطقة زمنية). */
const localDate = (iso) => new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000);

function styleHeaderRow(row) {
  row.height = 26;
  row.eachCell((cell) => {
    cell.font = { name: FONT, bold: true, size: 11, color: { argb: C.headerText } };
    cell.fill = solid(C.header);
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = thin();
  });
}

/**
 * يبني ورقة جدول: رأس ملوّن مجمَّد، فلتر تلقائي، تظليل تبادلي، RTL، وإعداد طباعة أفقي.
 * columns: [{ header, key, width, type?: "text"|"id"|"number"|"datetime"|"link", align?: "right"|"center" }]
 * opts.rowFill(rowData, index) / opts.cellFill(rowData, key): لون خلفية اختياري (ARGB).
 */
function addTableSheet(wb, name, columns, rows, opts = {}) {
  const { tabColor = C.header, rowFill, cellFill, emptyMessage } = opts;
  const ws = wb.addWorksheet(name, {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
    properties: { tabColor: { argb: tabColor } },
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  styleHeaderRow(ws.getRow(1));
  ws.pageSetup.printTitlesRow = "1:1";

  if (rows.length === 0) {
    const row = ws.addRow([emptyMessage || "لا توجد بيانات"]);
    ws.mergeCells(2, 1, 2, columns.length);
    row.getCell(1).font = { name: FONT, size: 11, italic: true, color: { argb: C.muted } };
    row.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    row.height = 28;
    return ws;
  }

  rows.forEach((data, i) => {
    const row = ws.addRow(data);
    const base = rowFill ? rowFill(data, i) : i % 2 ? C.zebra : null;
    columns.forEach((col, ci) => {
      const cell = row.getCell(ci + 1);
      const type = col.type || "text";
      cell.font = { name: FONT, size: 11, ...(type === "link" ? { color: { argb: C.link }, underline: true } : {}) };
      cell.alignment = { vertical: "middle", horizontal: col.align || "center", wrapText: true };
      cell.border = thin();
      if (type === "id") cell.numFmt = "@";
      if (type === "datetime") cell.numFmt = "yyyy-mm-dd  hh:mm:ss";
      const fill = (cellFill && cellFill(data, col.key)) || base;
      if (fill) cell.fill = solid(fill);
    });
  });

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: rows.length + 1, column: columns.length } };
  return ws;
}

function matchKey(r) {
  return [r.id, ...r.match.others.map((o) => o.id)].sort().join("|");
}

/** يبني المصنَّف ويرجع ArrayBuffer جاهزاً للحفظ. */
export async function buildSwapWorkbook({ groups, settings, filterDesc = "الكل", generatedAt = new Date() }) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = "swap-matcher";
  wb.created = generatedAt;

  const entries = groups.flatMap((g) => g.items.map((r) => ({ g, r })));
  const statusOf = (r) => requestStatus(r);
  const count = (key) => entries.filter(({ r }) => statusOf(r) === key).length;

  // ─── 1) الملخص ───────────────────────────────────────────────
  const sum = wb.addWorksheet("الملخص", {
    views: [{ rightToLeft: true, showGridLines: false }],
    properties: { tabColor: { argb: "FF2E7D32" } },
    pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  sum.columns = [{ width: 36 }, { width: 24 }, { width: 16 }, { width: 18 }, { width: 18 }];
  sum.mergeCells("A1:E1");
  const title = sum.getCell("A1");
  title.value = "تقرير طلبات تبديل الفئات";
  title.font = { name: FONT, bold: true, size: 18, color: { argb: C.headerText } };
  title.fill = solid(C.header);
  title.alignment = { horizontal: "center", vertical: "middle" };
  sum.getRow(1).height = 40;

  const info = [
    ["تاريخ التصدير", localDate(generatedAt.toISOString())],
    ["المواد المفتوحة للاستقبال حالياً", openSubjectsLabel(settings) || "الاستقبال متوقف"],
    ["نطاق التصدير", filterDesc],
  ];
  info.forEach(([label, value], i) => {
    const r = sum.getRow(3 + i);
    r.getCell(1).value = label;
    r.getCell(2).value = value;
    r.getCell(1).font = { name: FONT, bold: true, size: 11 };
    r.getCell(2).font = { name: FONT, size: 11 };
    r.getCell(1).alignment = { horizontal: "right", vertical: "middle" };
    r.getCell(2).alignment = { horizontal: "right", vertical: "middle" };
    if (value instanceof Date) r.getCell(2).numFmt = "yyyy-mm-dd  hh:mm:ss";
    sum.mergeCells(3 + i, 2, 3 + i, 5);
  });

  const stats = [
    ["إجمالي الطلبات", entries.length],
    ["طلبات النظري", entries.filter(({ g }) => g.section === "theory").length],
    ["طلبات العملي", entries.filter(({ g }) => g.section === "lab").length],
    ["تطابقات ممكنة (مجموعات تبديل)", groups.reduce((n, g) => n + g.matchCount, 0)],
    ["اتفاقات مؤكدة من الطرفين (أزواج)", groups.reduce((n, g) => n + g.agreedConfirmed, 0)],
    ["اتفاقات بانتظار تأكيد الطرف الآخر (طلبات)", count("agreed-awaiting")],
    ["اتفاقات متعارضة (طلبات)", count("agreed-conflict")],
    ["طلبات بانتظار شريك", count("waiting")],
  ];
  let rowNo = 7;
  const head1 = sum.getRow(rowNo++);
  head1.getCell(1).value = "المؤشر";
  head1.getCell(2).value = "القيمة";
  styleHeaderRow(head1);
  head1.getCell(3).value = null;
  [3, 4, 5].forEach((c) => (head1.getCell(c).style = {}));
  stats.forEach(([label, value], i) => {
    const r = sum.getRow(rowNo++);
    r.getCell(1).value = label;
    r.getCell(2).value = value;
    [1, 2].forEach((c) => {
      const cell = r.getCell(c);
      cell.font = { name: FONT, size: 11, bold: c === 2 };
      cell.alignment = { vertical: "middle", horizontal: c === 1 ? "right" : "center" };
      cell.border = thin();
      if (i % 2) cell.fill = solid(C.zebra);
    });
  });

  rowNo += 1;
  const head2 = sum.getRow(rowNo++);
  ["المادة", "النوع", "عدد الطلبات", "تطابقات ممكنة", "اتفاقات مؤكدة"].forEach((h, i) => (head2.getCell(i + 1).value = h));
  styleHeaderRow(head2);
  groups.forEach((g, i) => {
    const r = sum.getRow(rowNo++);
    [g.subjectName, SECTION_NAMES[g.section], g.items.length, g.matchCount, g.agreedConfirmed].forEach((v, ci) => {
      const cell = r.getCell(ci + 1);
      cell.value = v;
      cell.font = { name: FONT, size: 11 };
      cell.alignment = { vertical: "middle", horizontal: ci === 0 ? "right" : "center" };
      cell.border = thin();
      if (i % 2) cell.fill = solid(C.zebra);
    });
  });

  // ─── 2) كل الطلبات ───────────────────────────────────────────
  const reqColumns = [
    { header: "م", key: "n", width: 6, type: "number" },
    { header: "المادة", key: "subject", width: 26, align: "right" },
    { header: "النوع", key: "section", width: 9 },
    { header: "الأسبقية", key: "order", width: 10, type: "number" },
    { header: "الاسم", key: "name", width: 28, align: "right" },
    { header: "الرقم الجامعي", key: "sid", width: 16, type: "id" },
    { header: "من فئة", key: "from", width: 9, type: "number" },
    { header: "الفئات المطلوبة", key: "to", width: 16 },
    { header: "نمط الطلب", key: "mode", width: 22 },
    { header: "الأسبقية بالفئات المطلوبة", key: "ranks", width: 26 },
    { header: "الحالة", key: "status", width: 24 },
    { header: "تفاصيل الحالة", key: "detail", width: 46, align: "right" },
    { header: "وسيلة التواصل", key: "contact", width: 22 },
    { header: "وقت الإرسال (توقيتك المحلي)", key: "time", width: 24, type: "datetime" },
    { header: "وقت الإرسال (UTC)", key: "utc", width: 24 },
    { header: "الطلب على GitHub", key: "pr", width: 16, type: "link" },
  ];
  const reqRows = entries.map(({ g, r }, i) => {
    const st = statusOf(r);
    let detail = "";
    if (st === "match") {
      detail = `ينتقل إلى الفئة ${r.match.movesTo} مع: ${r.match.others.map((o) => `${o.studentName} (${o.studentId} · من ${o.fromSlot} إلى ${o.movesTo})`).join("، ")}`;
    } else if (r.agreed) {
      detail = `اتفاق مع ${r.partner?.name || ""} (${r.partner?.studentId || ""}) على التبديل مع الفئة ${r.toSlots[0]}`;
    }
    return {
      n: i + 1,
      subject: g.subjectName,
      section: SECTION_NAMES[g.section],
      order: r.order,
      name: r.studentName,
      sid: String(r.studentId),
      from: r.fromSlot,
      to: r.toSlots.join("، "),
      mode: MODE_LABELS[r.mode] || r.mode,
      ranks: r.ranks ? Object.entries(r.ranks).map(([s, n]) => `ف${s}: #${n}`).join("  ") : "—",
      status: STATUS_LABELS[st],
      statusKey: st,
      detail,
      contact: r.contact || "",
      time: localDate(r.createdAt),
      utc: r.createdAt,
      pr: r.prNumber ? { text: `PR #${r.prNumber}`, hyperlink: prUrl(r.prNumber) } : "",
    };
  });
  addTableSheet(wb, "كل الطلبات", reqColumns, reqRows, {
    tabColor: "FF1F3A5F",
    cellFill: (d, key) => (key === "status" ? C.status[d.statusKey] : null),
    emptyMessage: "لا توجد طلبات ضمن نطاق التصدير",
  });

  // ─── 3) حركة الفئات ──────────────────────────────────────────
  const moveRows = groups.flatMap((g) =>
    slotMovement(g.items, g.section).map((m) => ({
      subject: g.subjectName,
      section: SECTION_NAMES[g.section],
      slot: m.slot,
      leaving: m.leaving,
      entering: m.entering,
      net: m.entering - m.leaving,
    }))
  );
  addTableSheet(
    wb,
    "حركة الفئات",
    [
      { header: "المادة", key: "subject", width: 28, align: "right" },
      { header: "النوع", key: "section", width: 10 },
      { header: "الفئة", key: "slot", width: 9, type: "number" },
      { header: "راغبون بالخروج منها", key: "leaving", width: 20, type: "number" },
      { header: "راغبون بالدخول إليها", key: "entering", width: 20, type: "number" },
      { header: "الصافي (دخول − خروج)", key: "net", width: 22, type: "number" },
    ],
    moveRows,
    {
      tabColor: "FF8E6BBF",
      cellFill: (d, key) => (key === "net" ? (d.net > 0 ? "FFFFF2CC" : d.net < 0 ? "FFDDEBF7" : null) : null),
      emptyMessage: "لا توجد بيانات",
    }
  );

  // ─── 4) التطابقات ────────────────────────────────────────────
  const matchRows = [];
  let matchNo = 0;
  for (const g of groups) {
    const seen = new Map();
    for (const r of g.items.filter((x) => x.match)) {
      const key = matchKey(r);
      if (!seen.has(key)) seen.set(key, ++matchNo);
      matchRows.push({
        no: seen.get(key),
        subject: g.subjectName,
        section: SECTION_NAMES[g.section],
        name: r.studentName,
        sid: String(r.studentId),
        from: r.fromSlot,
        to: r.match.movesTo,
        with: r.match.others.map((o) => o.studentName).join("، "),
        order: r.order,
        time: localDate(r.createdAt),
      });
    }
  }
  matchRows.sort((a, b) => a.no - b.no || a.order - b.order);
  addTableSheet(
    wb,
    "التطابقات",
    [
      { header: "رقم التطابق", key: "no", width: 12, type: "number" },
      { header: "المادة", key: "subject", width: 26, align: "right" },
      { header: "النوع", key: "section", width: 9 },
      { header: "الاسم", key: "name", width: 28, align: "right" },
      { header: "الرقم الجامعي", key: "sid", width: 16, type: "id" },
      { header: "من فئة", key: "from", width: 9, type: "number" },
      { header: "ينتقل إلى فئة", key: "to", width: 14, type: "number" },
      { header: "يتبادل مع", key: "with", width: 36, align: "right" },
      { header: "الأسبقية", key: "order", width: 10, type: "number" },
      { header: "وقت الإرسال (توقيتك المحلي)", key: "time", width: 24, type: "datetime" },
    ],
    matchRows,
    { tabColor: "FF2F75B5", rowFill: (d) => C.bands[d.no % 2], emptyMessage: "لا توجد تطابقات ممكنة حالياً" }
  );

  // ─── 5) الاتفاقات ────────────────────────────────────────────
  const agreedRows = entries
    .filter(({ r }) => r.agreed)
    .map(({ g, r }) => ({
      subject: g.subjectName,
      section: SECTION_NAMES[g.section],
      name: r.studentName,
      sid: String(r.studentId),
      from: r.fromSlot,
      toSlot: r.toSlots[0],
      pname: r.partner?.name || "",
      psid: String(r.partner?.studentId || ""),
      status: STATUS_LABELS[statusOf(r)],
      statusKey: statusOf(r),
      time: localDate(r.createdAt),
    }));
  addTableSheet(
    wb,
    "الاتفاقات",
    [
      { header: "المادة", key: "subject", width: 26, align: "right" },
      { header: "النوع", key: "section", width: 9 },
      { header: "الطالب", key: "name", width: 28, align: "right" },
      { header: "رقمه الجامعي", key: "sid", width: 16, type: "id" },
      { header: "فئته", key: "from", width: 9, type: "number" },
      { header: "فئة الطرف الآخر", key: "toSlot", width: 16, type: "number" },
      { header: "الطرف الآخر", key: "pname", width: 28, align: "right" },
      { header: "رقمه الجامعي", key: "psid", width: 16, type: "id" },
      { header: "الحالة", key: "status", width: 24 },
      { header: "وقت الإرسال (توقيتك المحلي)", key: "time", width: 24, type: "datetime" },
    ],
    agreedRows,
    {
      tabColor: "FFED7D31",
      rowFill: (d) => C.status[d.statusKey],
      emptyMessage: "لا توجد طلبات اتفاق مسبق",
    }
  );

  return wb.xlsx.writeBuffer();
}

const pad = (n) => String(n).padStart(2, "0");

/** يبني الملف ويُنزّله من المتصفح. */
export async function downloadSwapsExcel(opts) {
  const generatedAt = new Date();
  const buffer = await buildSwapWorkbook({ ...opts, generatedAt });
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `swap-requests-${generatedAt.getFullYear()}-${pad(generatedAt.getMonth() + 1)}-${pad(generatedAt.getDate())}-${pad(generatedAt.getHours())}${pad(generatedAt.getMinutes())}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
