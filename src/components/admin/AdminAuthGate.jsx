import React, { useEffect, useState } from "react";
import { validateToken, storeToken, getStoredToken, clearToken } from "../../lib/adminAuth.js";

// ⚠️ ملف مملوك لعضو 3 — جديد (خطة الدفعة 4، المهمة 1).
// عقد الاستهلاك: يستهلك lib/adminAuth.js (عضو 5) فقط، بلا أي منطق تحقق خاص هنا.
// نفس GitHub Personal Access Token المُستخدم بـ PublishPanel.jsx يُستخدم كمفتاح
// دخول لوحة التحكم (قرار موحَّد بخطة الدفعة 4).
//
// الاستخدام (بواسطة المدير لاحقاً بـ App.jsx، لم ألمسه):
//   <AdminAuthGate>{...مسارات /admin...}</AdminAuthGate>

const STATUS = {
  CHECKING: "checking", // تحقق أولي من توكن محفوظ عند التحميل
  UNAUTHENTICATED: "unauthenticated",
  VALIDATING: "validating", // تحقق من توكن أُدخل للتو بالنموذج
  AUTHENTICATED: "authenticated",
};

export default function AdminAuthGate({ children }) {
  const [status, setStatus] = useState(STATUS.CHECKING);
  const [tokenInput, setTokenInput] = useState("");
  const [error, setError] = useState(null);

  // عند التحميل: لو فيه توكن محفوظ بالجلسة، تحقق منه بصمت قبل عرض أي شيء إداري.
  useEffect(() => {
    let cancelled = false;
    const stored = getStoredToken();
    if (!stored) {
      setStatus(STATUS.UNAUTHENTICATED);
      return;
    }
    validateToken(stored).then((result) => {
      if (cancelled) return;
      if (result.valid) {
        setStatus(STATUS.AUTHENTICATED);
      } else {
        clearToken();
        setError(result.error || "التوكن المحفوظ لم يعد صالحاً، سجّل دخول من جديد.");
        setStatus(STATUS.UNAUTHENTICATED);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setStatus(STATUS.VALIDATING);
    const result = await validateToken(tokenInput);
    if (result.valid) {
      storeToken(tokenInput);
      setTokenInput("");
      setStatus(STATUS.AUTHENTICATED);
    } else {
      setError(result.error || "توكن غير صالح");
      setStatus(STATUS.UNAUTHENTICATED);
    }
  }

  function handleLogout() {
    clearToken();
    setError(null);
    setStatus(STATUS.UNAUTHENTICATED);
  }

  if (status === STATUS.CHECKING) {
    return <div className="p-6 text-sm text-text-muted">...جارٍ التحقق من الدخول</div>;
  }

  if (status === STATUS.AUTHENTICATED) {
    return (
      <div>
        <div className="mb-4 flex items-center justify-end">
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-md border border-border px-3 py-1 text-xs text-text hover:bg-bg-elevated"
          >
            تسجيل خروج
          </button>
        </div>
        {children}
      </div>
    );
  }

  const validating = status === STATUS.VALIDATING;

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 rounded-lg border border-border bg-bg-subtle p-6">
      <div>
        <h1 className="text-lg font-bold text-text-h">دخول لوحة التحكم</h1>
        <p className="mt-1 text-sm text-text-muted">
          استخدم نفس GitHub Personal Access Token المستخدَم للنشر (صلاحية{" "}
          <code>contents</code> فقط على الريبو).
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm text-text">
          GitHub Token
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="github_pat_..."
            autoComplete="off"
            className="rounded-md border border-border bg-bg px-3 py-1.5 text-text"
          />
        </label>

        {error && <p className="text-xs text-danger-text">{error}</p>}

        <button
          type="submit"
          disabled={validating || !tokenInput.trim()}
          className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {validating ? "...جارٍ التحقق" : "دخول"}
        </button>
      </form>

      <p className="text-xs text-text-muted">
        يُخزَّن التوكن بذاكرة الجلسة (sessionStorage) فقط، ويُمسح تلقائياً بإغلاق التبويب.
      </p>
    </div>
  );
}
