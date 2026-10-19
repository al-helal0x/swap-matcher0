import { useEffect, useState } from "react";
import { normalizeSettings } from "../lib/swapSettings.js";

// عقد public/data/swap-settings.json (يكتبه الأدمن من /admin/swaps):
// { openSubjects: [{id,name}], updatedAt } — مادة أو أكثر (أو فصل كامل) مفتوحة لاستقبال الطلبات.
// فشل الجلب أو قائمة فارغة = لا استقبال (settings: null).
export function useSwapSettings() {
  const [state, setState] = useState({ settings: null, loading: true });

  useEffect(() => {
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}data/swap-settings.json?_=${Date.now()}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)
      .then((data) => {
        if (cancelled) return;
        const settings = data ? normalizeSettings(data) : null;
        setState({ settings: settings && settings.openSubjects.length ? settings : null, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
