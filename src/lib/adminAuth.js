// ⚠️ ملف مملوك لعضو 5 — عقد مُحسوم الآن (خطة الدفعة 4، المهمة 1).
// عضو 3 يبني AdminAuthGate.jsx ضد هذا الملف مباشرة، بلا انتظار.
//
// نفس GitHub Personal Access Token المُستخدم أصلاً بـ PublishPanel.jsx يُستخدم
// أيضاً كمفتاح دخول لوحة التحكم (قرار موحَّد، القسم أعلى خطة الدفعة 4).

const STORAGE_KEY = "admin_token";

// نفس الريبو المنشور فعلياً — مُحدَّث 2026-07-27 بعد انتقال المشروع لحساب
// جديد بالكامل (Omar-218). راجع أيضاً ملاحظة تصحيح DEFAULT_REPO بسجل عضو 5.
export const DEFAULT_OWNER = "al-helal0x";
export const DEFAULT_REPO = "swap-matcher";

/** يتحقق من صلاحية التوكن عبر GitHub API مباشرة (بلا أي خادم وسيط).
 * يتحقق من: (أ) التوكن صالح ويصل للريبو، (ب) صلاحية push/contents متوفرة. */
export async function validateToken(token, { owner = DEFAULT_OWNER, repo = DEFAULT_REPO } = {}) {
  if (!token || !token.trim()) {
    return { valid: false, error: "التوكن فارغ" };
  }

  let res;
  try {
    res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
  } catch (err) {
    return { valid: false, error: "تعذّر الاتصال بـ GitHub — تحقق من الشبكة" };
  }

  if (res.status === 401) {
    return { valid: false, error: "التوكن غير صالح أو منتهي" };
  }
  if (res.status === 404 || res.status === 403) {
    return { valid: false, error: "التوكن لا يملك صلاحية الوصول لهذا الريبو" };
  }
  if (!res.ok) {
    return { valid: false, error: `تعذّر التحقق من التوكن: ${res.status}` };
  }

  const data = await res.json();
  // GitHub يرجع permissions.push فقط لو التوكن ينتمي لمستخدم له صلاحية كتابة فعلية بالريبو
  if (data.permissions && data.permissions.push === false) {
    return { valid: false, error: "التوكن صالح لكن بلا صلاحية كتابة (push) على الريبو" };
  }

  return { valid: true };
}

/** يخزّن التوكن بـ sessionStorage فقط — يُمسح تلقائياً بإغلاق التبويب.
 * (أمان أفضل من localStorage لتوكن حساس بصلاحية كتابة على الريبو). */
export function storeToken(token) {
  try {
    sessionStorage.setItem(STORAGE_KEY, token);
  } catch {
    // بيئة بلا sessionStorage (نادر) — نتجاهل بصمت، سيُطلب التوكن يدوياً كل مرة
  }
}

export function getStoredToken() {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearToken() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // تجاهل
  }
}
