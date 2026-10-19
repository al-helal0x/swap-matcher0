// 🔁 «مُطابِق تبديل الفئات» — إرسال طلب الطالب.
// توكن مقيَّد (Contents: Write + Pull requests: Write على هذا الريبو فقط) يفتح فرعاً +
// ملف JSON + PR، بلا أي دمج. المعالجة والتحقق (بما فيه رفض أي مادة غير المفتوحة
// حالياً) يتمان في .github/workflows/swap-sync.yml بـ GITHUB_TOKEN.

import { SLOT_COUNT, MODES, MAX_ENTRIES, resolveTargets } from "./swapMatching.js";

const STUDENT_TOKEN = import.meta.env.VITE_UPLOAD_TOKEN || "";
const OWNER = "al-helal0x";
const REPO = "swap-matcher";
const BASE_BRANCH = "main";

function ghHeaders() {
  return {
    Authorization: `Bearer ${STUDENT_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

const textToBase64 = (text) => btoa(unescape(encodeURIComponent(text)));
const makeId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

async function createRequestBranch(branchName) {
  const refRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/ref/heads/${BASE_BRANCH}`, { headers: ghHeaders() });
  if (!refRes.ok) throw new Error(`تعذّر قراءة الفرع الأساسي: ${refRes.status}`);
  const baseSha = (await refRes.json()).object.sha;
  const createRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/refs`, {
    method: "POST",
    headers: { ...ghHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: baseSha }),
  });
  if (!createRes.ok) throw new Error(`تعذّر إنشاء فرع الطلب: ${createRes.status} ${await createRes.text()}`);
}

async function putRequestFile(path, branch, message, base64Content) {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path.split("/").map(encodeURIComponent).join("/")}`, {
    method: "PUT",
    headers: { ...ghHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ message, content: base64Content, branch }),
  });
  if (!res.ok) throw new Error(`فشل رفع ${path}: ${res.status} ${await res.text()}`);
}

async function openRequestPR(branch, title, body) {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/pulls`, {
    method: "POST",
    headers: { ...ghHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ title, head: branch, base: BASE_BRANCH, body }),
  });
  if (!res.ok) throw new Error(`تم إنشاء الفرع لكن فشل فتح طلب الدمج: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return { prUrl: data.html_url, prNumber: data.number, branch };
}

const ID_RE_NUM = /^\d{5,12}$/;

/** يتحقق من بند واحد (مادة + محاضرة) ويعيده منقّى. */
function cleanEntry(e, studentId, n) {
  const tag = n ? ` (المادة ${n})` : "";
  const max = SLOT_COUNT[e.section];
  if (!/^[a-z0-9-]{1,80}$/.test(String(e.subjectId || "")) || !max) throw new Error(`المادة أو النوع غير صالح${tag}`);
  const from = Number(e.fromSlot);
  if (!Number.isInteger(from) || from < 1 || from > max) throw new Error(`فئتك الحالية غير صالحة${tag}`);
  if (!MODES.includes(e.mode)) throw new Error(`نمط الطلب غير صالح${tag}`);
  const targets = resolveTargets(e.mode, from, e.section, e.toSlots || []);
  if (targets.length === 0) throw new Error(`اختر فئة واحدة على الأقل${tag}`);
  if (e.mode === "agreed" && targets.length !== 1) throw new Error(`اختر فئة الطالب الآخر${tag}`);
  let partner = null;
  if (e.mode === "agreed") {
    partner = { name: String(e.partner?.name || "").trim(), studentId: String(e.partner?.studentId || "").trim() };
    if (partner.name.length < 2) throw new Error(`اسم الطالب الآخر مطلوب${tag}`);
    if (!ID_RE_NUM.test(partner.studentId)) throw new Error(`الرقم الجامعي للطالب الآخر غير صالح${tag}`);
    if (partner.studentId === studentId) throw new Error(`لا يمكن أن يكون الطالب الآخر أنت${tag}`);
  }
  return {
    subjectId: e.subjectId,
    subjectName: e.subjectName || e.subjectId,
    section: e.section,
    fromSlot: from,
    mode: e.mode,
    toSlots: targets,
    ...(partner ? { partner } : {}),
  };
}

/** يقدّم طلب تبديل فئة لمادة أو أكثر في PR واحد. يرجع { prUrl, prNumber, branch, id }.
 * entries: [{ subjectId, subjectName, section, fromSlot, mode, toSlots, partner }]
 *   mode: any | earlier | custom | agreed (راجع swapMatching.js).
 *   toSlots: لـ custom (واحدة أو أكثر) ولـ agreed (فئة واحدة = فئة الطالب الآخر).
 *   partner: { name, studentId } لـ agreed فقط.
 * بيانات الطالب (الاسم، الرقم، التواصل) مشتركة بين كل البنود. */
export async function submitSwapRequest({ entries, studentName, studentId, contact = "" }) {
  if (!STUDENT_TOKEN) {
    throw new Error("توكن الطلبات غير مُهيَّأ (VITE_UPLOAD_TOKEN) — أضفه كـ Secret ثم أعد النشر");
  }
  if (!Array.isArray(entries) || entries.length === 0) throw new Error("اختر مادة واحدة على الأقل");
  if (entries.length > MAX_ENTRIES) throw new Error(`الحد الأقصى ${MAX_ENTRIES} بنود بطلب واحد`);
  if (String(studentName || "").trim().length < 2) throw new Error("الاسم مطلوب");
  const sid = String(studentId || "").trim();
  if (!ID_RE_NUM.test(sid)) throw new Error("الرقم الجامعي غير صالح");
  const clean = entries.map((e, i) => cleanEntry(e, sid, entries.length > 1 ? i + 1 : 0));
  const keys = new Set(clean.map((e) => `${e.subjectId}|${e.section}`));
  if (keys.size !== clean.length) throw new Error("لا يمكن تكرار نفس المادة والنوع بالطلب");

  const id = makeId("swp");
  const branch = `swap-request/${clean.length > 1 ? "multi" : clean[0].subjectId}-${Date.now()}`;
  await createRequestBranch(branch);

  const requestData = {
    id,
    entries: clean,
    studentName: String(studentName).trim(),
    studentId: sid,
    contact: String(contact || "").trim(),
    createdAt: new Date().toISOString(),
  };
  const title =
    clean.length === 1
      ? `[swap] ${clean[0].subjectName} — ${clean[0].section} — ${clean[0].mode === "agreed" ? `${clean[0].fromSlot}⇄${clean[0].toSlots[0]} (اتفاق)` : `${clean[0].fromSlot}→${clean[0].toSlots.join(",")}`}`
      : `[swap] ${clean.length} مواد — ${clean.map((e) => e.subjectName).join("، ")}`.slice(0, 200);
  await putRequestFile(`public/data/_pending/swaps/${id}.json`, branch, title.replace("[swap] ", "طلب تبديل فئة — "), textToBase64(JSON.stringify(requestData)));
  const pr = await openRequestPR(branch, title, "طلب تبديل فئة — يعالجه swap-sync تلقائياً.");
  return { ...pr, id };
}
