import { useEffect, useState } from "react";

// عقد public/data/swaps.json: { requests: [...] } — يكتبه Action «swap-sync» فقط.
// نفس نمط useEvents.js: 404 أو فشل الشبكة = قائمة فارغة، لا خطأ.
export function useSwaps() {
  const [state, setState] = useState({ requests: [], loading: true });

  useEffect(() => {
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}data/swaps.json`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { requests: [] }))
      .then((data) => (Array.isArray(data?.requests) ? data.requests : []))
      .catch(() => [])
      .then((requests) => {
        if (!cancelled) setState({ requests, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
