// 🔁 «مُطابِق تبديل الفئات» — معالج الطلبات.
//   node sync-swaps.mjs          → يقرأ PRs المفتوحة، يحدّث swap-data/swaps.json، ويكتب النتائج
//   node sync-swaps.mjs --close  → يعلّق على كل PR معالَج ويغلقه ويحذف فرعه
//
// الأسبقية: createdAt = وقت فتح الـ PR من GitHub (لا قيمة يرسلها الطالب).
// المعالجة بترتيب فتح الـ PRs (الأقدم أولاً).

import fs from "node:fs";
import crypto from "node:crypto";
import { openSubjectIds } from "../../src/lib/swapSettings.js";
import { SLOT_COUNT, MODES, MAX_ENTRIES, resolveTargets } from "../../src/lib/swapMatching.js"; // نفس مصدر الواجهة

const TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPOSITORY;
const API = "https://api.github.com";
const SWAPS_FILE = "swap-data/swaps.json"; // خارج public/ عمداً: لا يُنشَر مع الموقع
const SETTINGS_FILE = "public/data/swap-settings.json";
const PLAN_FILE = "public/data/study-plan.json";
const PENDING_DIR = "public/data/_pending/swaps/";
const RESULTS_FILE = "/tmp/swap-results.json";

const SECTION_NAMES_AR = { theory: "نظري", lab: "عملي" };
const ID_RE = /^swp_\d{10,}_[a-z0-9]{4}$/;

async function gh(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!res.ok) throw new Error(`${opts.method || "GET"} ${path} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function listOpenPRs() {
  const all = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await gh(`/repos/${REPO}/pulls?state=open&per_page=100&page=${page}`);
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function cleanText(value, max) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

const sha256 = (text) => crypto.createHash("sha256").update(text).digest("hex");

/** يقرأ ملف JSON الوحيد المسموح من الـ PR (يرفض أي PR فيه غيره). */
async function readPRPayload(pr, expectedPrefix) {
  const files = await gh(`/repos/${REPO}/pulls/${pr.number}/files?per_page=100`);
  if (files.length !== 1) throw new Error("يجب أن يحتوي الطلب على ملف واحد فقط");
  const f = files[0];
  if (f.status !== "added" || !f.filename.startsWith(PENDING_DIR + expectedPrefix) || !f.filename.endsWith(".json")) {
    throw new Error("مسار الملف غير مسموح");
  }
  const content = await gh(`/repos/${REPO}/contents/${f.filename.split("/").map(encodeURIComponent).join("/")}?ref=${pr.head.sha}`);
  const text = Buffer.from(content.content, "base64").toString("utf8");
  if (text.length > 30000) throw new Error("حجم الملف كبير");
  return { data: JSON.parse(text), filename: f.filename };
}

/** يتحقق من بند واحد (مادة + محاضرة) ويعيد سجلّه المنقّى. studentId يأتي من الطلب المشترك. */
function validateEntry(e, studentId, plan, settings) {
  const course = plan.find((c) => c.id === e?.subjectId);
  if (!course) throw new Error("المادة غير موجودة");
  if (!openSubjectIds(settings).includes(e.subjectId)) {
    throw new Error("هذه المادة غير مفتوحة لاستقبال طلبات التبديل حالياً");
  }
  const max = SLOT_COUNT[e.section];
  if (!max) throw new Error("نوع المحاضرة غير صالح");
  const from = Number(e.fromSlot);
  if (!Number.isInteger(from) || from < 1 || from > max) throw new Error("فئتك الحالية غير صالحة");

  const mode = e.mode;
  if (!MODES.includes(mode)) throw new Error("نمط الطلب غير صالح");
  const chosen = Array.isArray(e.toSlots) ? e.toSlots.map(Number) : [];
  if (chosen.length > max || chosen.some((n) => !Number.isInteger(n))) throw new Error("الفئات المطلوبة غير صالحة");
  // any / earlier تُحسب من جديد هنا (لا نثق بما أرسله المتصفح)؛ custom / agreed تُقبل فقط لو كلها صالحة.
  const toSlots = resolveTargets(mode, from, e.section, chosen);
  if (toSlots.length === 0) throw new Error("لا توجد فئة مطلوبة صالحة");
  if ((mode === "custom" || mode === "agreed") && toSlots.length !== new Set(chosen).size) throw new Error("فئة مطلوبة غير صالحة");

  let partner = null;
  if (mode === "agreed") {
    if (toSlots.length !== 1) throw new Error("الاتفاق يتطلب فئة واحدة هي فئة الطالب الآخر");
    partner = { name: cleanText(e.partner?.name, 60), studentId: String(e.partner?.studentId ?? "").trim() };
    if (partner.name.length < 2) throw new Error("اسم الطالب الآخر غير صالح");
    if (!/^\d{5,12}$/.test(partner.studentId)) throw new Error("الرقم الجامعي للطالب الآخر غير صالح");
    if (partner.studentId === studentId) throw new Error("لا يمكن أن يكون الطالب الآخر أنت");
  }

  return {
    subjectId: course.id,
    subjectName: course.name, // من الخطة الدراسية، لا من الطالب
    section: e.section,
    fromSlot: from,
    mode,
    toSlots,
    ...(partner ? { partner } : {}),
  };
}

/** يفكّك الطلب (بنود entries، أو الشكل القديم ببند واحد مسطّح) إلى بنود + البيانات المشتركة. */
function validateRequest(data, filename) {
  if (!ID_RE.test(data.id) || filename !== `${PENDING_DIR}${data.id}.json`) throw new Error("معرّف الطلب غير صالح");
  const studentName = cleanText(data.studentName, 60);
  if (studentName.length < 2) throw new Error("الاسم غير صالح");
  const studentId = String(data.studentId ?? "").trim();
  if (!/^\d{5,12}$/.test(studentId)) throw new Error("الرقم الجامعي غير صالح");
  const entries = Array.isArray(data.entries) ? data.entries : [data]; // توافق مع الطلبات القديمة
  if (entries.length === 0 || entries.length > MAX_ENTRIES) throw new Error(`عدد المواد بالطلب غير صالح (الحد الأقصى ${MAX_ENTRIES})`);
  return { id: data.id, studentName, studentId, contact: cleanText(data.contact, 60), entries };
}

async function processAll() {
  const swaps = readJson(SWAPS_FILE, { requests: [] });
  if (!Array.isArray(swaps.requests)) swaps.requests = [];
  // ترحيل الطلبات القديمة (toSlot واحدة) إلى الشكل الجديد (toSlots + mode)
  swaps.requests = swaps.requests.map((r) => {
    if (Array.isArray(r.toSlots)) return r;
    const { toSlot, ...rest } = r;
    return { ...rest, mode: "custom", toSlots: [Number(toSlot)] };
  });
  const plan = readJson(PLAN_FILE, { courses: [] }).courses ?? [];
  const settings = readJson(SETTINGS_FILE, { openSubjects: [] });

  const prs = (await listOpenPRs())
    .filter((pr) => pr.title.startsWith("[swap]"))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const results = [];
  for (const pr of prs) {
    const base = { number: pr.number, branch: pr.head.ref, sameRepo: pr.head.repo?.full_name === REPO };
    try {
      if (!base.sameRepo) throw new Error("الطلبات من forks غير مقبولة");

      const { data, filename } = await readPRPayload(pr, "swp_");
      const req = validateRequest(data, filename);
      if (swaps.requests.some((r) => r.id === req.id || r.id.startsWith(`${req.id}_`))) throw new Error("طلب مكرَّر");

      // كل بند يُقبل أو يُرفض منفرداً، وكل بند مقبول يصير سجلاً مستقلاً (نفس وقت الـ PR = نفس الأسبقية).
      const accepted = [];
      const rejected = [];
      req.entries.forEach((entry, i) => {
        let label = String(entry?.subjectId ?? `#${i + 1}`);
        try {
          const rec = validateEntry(entry, req.studentId, plan, settings);
          label = rec.subjectName;
          if (swaps.requests.some((r) => r.studentId === req.studentId && r.subjectId === rec.subjectId && r.section === rec.section)) {
            throw new Error("لديك طلب قائم لنفس المادة والنوع");
          }
          swaps.requests.push({
            ...rec,
            id: i === 0 ? req.id : `${req.id}_${i + 1}`,
            studentName: req.studentName,
            studentId: req.studentId,
            contact: req.contact,
            createdAt: pr.created_at,
            prNumber: pr.number,
          });
          accepted.push(`${rec.subjectName} (${SECTION_NAMES_AR[rec.section]})`);
        } catch (err) {
          rejected.push(`${label}: ${err.message}`);
        }
      });
      if (accepted.length === 0) throw new Error(rejected.join(" | "));
      const note = rejected.length ? `\n⚠️ رُفضت بنود: ${rejected.join(" | ")}` : "";
      results.push({ ...base, ok: true, message: `✅ سُجّل طلبك (${accepted.length}): ${accepted.join("، ")}. أسبقيتك محسوبة من وقت إرساله.${note}` });
    } catch (err) {
      results.push({ ...base, ok: false, message: `❌ رُفض الطلب: ${err.message}` });
    }
  }

  swaps.requests.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  fs.mkdirSync("swap-data", { recursive: true });
  fs.writeFileSync(SWAPS_FILE, JSON.stringify(swaps, null, 2) + "\n");
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results));
  console.log(`عولج ${results.length} طلب(ات)؛ المقبول: ${results.filter((r) => r.ok).length}`);
}

async function closeProcessed() {
  const results = readJson(RESULTS_FILE, []);
  for (const r of results) {
    try {
      await gh(`/repos/${REPO}/issues/${r.number}/comments`, { method: "POST", body: JSON.stringify({ body: r.message }) });
      await gh(`/repos/${REPO}/pulls/${r.number}`, { method: "PATCH", body: JSON.stringify({ state: "closed" }) });
      if (r.sameRepo) {
        await gh(`/repos/${REPO}/git/refs/heads/${r.branch.split("/").map(encodeURIComponent).join("/")}`, { method: "DELETE" });
      }
    } catch (err) {
      console.error(`تعذّر إغلاق PR #${r.number}: ${err.message}`);
    }
  }
}

(process.argv.includes("--close") ? closeProcessed() : processAll()).catch((err) => {
  console.error(err);
  process.exit(1);
});
