// يحفظ رموز الإلغاء على جهاز الطالب نفسه فقط (localStorage) — لا تُرسَل لأي مكان.
const KEY = "swap-cancel-codes";

export function getSavedCodes() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveCode(requestId, code) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...getSavedCodes(), [requestId]: code }));
  } catch {
    /* التخزين غير متاح — الطالب يحتفظ بالرمز يدوياً */
  }
}
