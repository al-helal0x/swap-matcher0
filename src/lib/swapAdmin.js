// 🔁 «مُطابِق تبديل الفئات» — عمليات الأدمن (بتوكن الأدمن الكامل المخزَّن بالجلسة).
// القراءة والكتابة عبر GitHub Contents API مباشرة على main (نسخة طازجة، لا كاش).
// ملفات الطلبات خارج public/ عمداً: swap-data/swaps.json لا يُنشَر مع الموقع.

import { serializeSettings, normalizeSettings } from "./swapSettings.js";
import { getStoredToken, DEFAULT_OWNER as OWNER, DEFAULT_REPO as REPO } from "./adminAuth.js";

export const SWAPS_PATH = "swap-data/swaps.json";
export const SETTINGS_PATH = "public/data/swap-settings.json";

function headers() {
  const token = getStoredToken();
  if (!token) throw new Error("لا يوجد توكن أدمن — سجّل الدخول من جديد");
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

const encPath = (p) => p.split("/").map(encodeURIComponent).join("/");
const b64ToText = (b64) => decodeURIComponent(escape(atob(b64.replace(/\n/g, ""))));
const textToB64 = (t) => btoa(unescape(encodeURIComponent(t)));

async function readJsonFile(path, fallback) {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${encPath(path)}?ref=main&_=${Date.now()}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (res.status === 404) return { data: fallback, sha: null };
  if (!res.ok) throw new Error(`تعذّر قراءة ${path}: ${res.status}`);
  const file = await res.json();
  return { data: JSON.parse(b64ToText(file.content)), sha: file.sha };
}

async function writeJsonFile(path, data, sha, message) {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${encPath(path)}`, {
    method: "PUT",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      branch: "main",
      content: textToB64(JSON.stringify(data, null, 2) + "\n"),
      ...(sha ? { sha } : {}),
    }),
  });
  if (res.status === 409 || res.status === 422) {
    const err = new Error("conflict");
    err.conflict = true;
    throw err;
  }
  if (!res.ok) throw new Error(`فشل حفظ ${path}: ${res.status} ${await res.text()}`);
}

export async function fetchSwapRequests() {
  const { data } = await readJsonFile(SWAPS_PATH, { requests: [] });
  return Array.isArray(data?.requests) ? data.requests : [];
}

export async function fetchSwapSettings() {
  const { data } = await readJsonFile(SETTINGS_PATH, {});
  return normalizeSettings(data);
}

/** يعيّن المواد المفتوحة لاستقبال الطلبات: مصفوفة {id,name} (فارغة = إيقاف الاستقبال). */
export async function saveSwapSettings(subjects) {
  const { sha } = await readJsonFile(SETTINGS_PATH, {});
  const next = serializeSettings(subjects);
  const names = next.openSubjects.map((s) => s.name).join("، ");
  await writeJsonFile(
    SETTINGS_PATH,
    next,
    sha,
    next.openSubjects.length ? `🔁 فتح استقبال تبديل الفئات (${next.openSubjects.length}): ${names}`.slice(0, 200) : "🔁 إيقاف استقبال تبديل الفئات"
  );
  return normalizeSettings(next);
}

/** يحذف طلباً (مثلاً بعد إتمام التبديل). يعيد القراءة قبل الكتابة، ويعيد المحاولة
 * لو كتب الـ Action بالتزامن (تعارض sha). */
export async function deleteSwapRequest(id) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, sha } = await readJsonFile(SWAPS_PATH, { requests: [] });
    const requests = (data?.requests ?? []).filter((r) => r.id !== id);
    try {
      await writeJsonFile(SWAPS_PATH, { requests }, sha, `🔁 حذف طلب تبديل ${id}`);
      return requests;
    } catch (err) {
      if (!err.conflict || attempt === 2) throw new Error(err.conflict ? "تعذّر الحذف بسبب تعارض متكرر، حاول ثانية" : err.message);
    }
  }
  return [];
}

/** طلبات [swap] ما زالت PRs مفتوحة (لم يعالجها الـ Action بعد). */
export async function fetchOpenSwapPRs() {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/pulls?state=open&per_page=100`, { headers: headers() });
  if (!res.ok) throw new Error(`تعذّر جلب الـ PRs: ${res.status}`);
  const all = await res.json();
  return all
    .filter((pr) => typeof pr.title === "string" && pr.title.startsWith("[swap]"))
    .map((pr) => ({ number: pr.number, url: pr.html_url, title: pr.title, createdAt: pr.created_at }));
}

export function prUrl(number) {
  return `https://github.com/${OWNER}/${REPO}/pull/${number}`;
}
