import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { buildGroups, SECTION_NAMES, MODE_LABELS, STATUS_LABELS, requestStatus, slotMovement } from "../../lib/swapMatching.js";
import {
  fetchSwapRequests,
  fetchSwapSettings,
  saveSwapSettings,
  deleteSwapRequest,
  fetchOpenSwapPRs,
  prUrl,
} from "../../lib/swapAdmin.js";
import { downloadSwapsExcel } from "../../lib/swapExport.js";
import { fetchCatalog, filterByLevel, inLevel } from "../../lib/openSubjects.js";

// 🔁 «مُطابِق تبديل الفئات» — لوحة الأدمن:
//  1) مؤشرات سريعة (تُنقَر للتصفية) + تعيين المادة الوحيدة المفتوحة لاستقبال الطلبات.
//  2) جداول مضغوطة لكل مادة/نوع مع حركة الفئات، وصفوف قابلة للتوسيع بكل التفاصيل
//     ووقت الإرسال الدقيق (وقت فتح الـ PR على GitHub، أساس الأسبقية).
//  3) تصدير Excel منسَّق حسب فلتر المادة والنوع.

const LOCALE = "ar-u-nu-latn"; // أرقام لاتينية: تتسق مع الأرقام الجامعية
const fmtShort = (iso) => new Date(iso).toLocaleString(LOCALE, { dateStyle: "short", timeStyle: "medium" });
const fmtFull = (iso) => new Date(iso).toLocaleString(LOCALE, { dateStyle: "full", timeStyle: "medium" });

const STATUS_STYLE = {
  match: "border-sky-500/50 bg-sky-500/15",
  "agreed-confirmed": "border-emerald-500/50 bg-emerald-500/15",
  "agreed-awaiting": "border-amber-500/50 bg-amber-500/15",
  "agreed-conflict": "border-red-500/50 bg-red-500/15",
  waiting: "border-border bg-bg",
};
const STATUS_ICON = { match: "🔁", "agreed-confirmed": "✅", "agreed-awaiting": "⏳", "agreed-conflict": "⚠️", waiting: "•" };

const selectCls = "rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-text";

const targetsText = (r) => (r.mode === "agreed" ? `${r.toSlots[0]}` : r.toSlots.join("، "));
const ranksText = (r) => (r.ranks ? Object.entries(r.ranks).map(([slot, n]) => `ف${slot}: #${n}`).join("  ") : "—");

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs text-text-h ${STATUS_STYLE[status]}`}>
      <span aria-hidden>{STATUS_ICON[status]}</span>
      {STATUS_LABELS[status]}
    </span>
  );
}

function StatCard({ label, value, hint, active, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`flex flex-col gap-0.5 rounded-md border bg-bg-subtle px-4 py-3 text-start ${
        active ? "border-accent" : "border-border"
      } ${onClick ? "cursor-pointer hover:bg-bg-elevated" : ""}`}
    >
      <span className="text-2xl font-bold text-text-h">{value}</span>
      <span className="text-xs text-text-muted">{label}</span>
      {hint && <span className="text-[11px] text-text-muted">{hint}</span>}
    </Tag>
  );
}

function SlotChips({ items, section }) {
  const rows = slotMovement(items, section).filter((m) => m.leaving + m.entering > 0);
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {rows.map((m) => (
        <span key={m.slot} className="rounded-md border border-border bg-bg px-2 py-1 text-text-muted">
          <b className="text-text-h">ف{m.slot}</b> · خروج {m.leaving} · دخول {m.entering}
        </span>
      ))}
    </div>
  );
}

function Detail({ label, children }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] text-text-muted">{label}</dt>
      <dd className="text-sm text-text">{children}</dd>
    </div>
  );
}

function RequestDetails({ r, busy, onDelete }) {
  const status = requestStatus(r);
  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        <Detail label="وقت الإرسال الدقيق">
          {fmtFull(r.createdAt)}
          <span dir="ltr" className="block text-[11px] text-text-muted">{r.createdAt}</span>
        </Detail>
        <Detail label="الفئات المطلوبة">
          {r.mode === "agreed" ? `الفئة ${r.toSlots[0]} (فئة الطرف المتفق معه)` : `الفئات ${r.toSlots.join("، ")}`}
        </Detail>
        {r.mode !== "agreed" && <Detail label="أسبقيته بين الراغبين بكل فئة مطلوبة">{ranksText(r)}</Detail>}
        <Detail label="وسيلة التواصل">{r.contact || "—"}</Detail>
        <Detail label="الطلب على GitHub">
          {r.prNumber ? (
            <a href={prUrl(r.prNumber)} target="_blank" rel="noreferrer" className="underline">
              PR #{r.prNumber}
            </a>
          ) : (
            "—"
          )}
        </Detail>
        <Detail label="المعرّف">
          <span dir="ltr" className="text-xs text-text-muted">{r.id}</span>
        </Detail>
      </dl>

      {r.mode === "agreed" && r.partner && (
        <div className={`rounded-md border px-3 py-2 text-sm text-text-h ${STATUS_STYLE[status]}`}>
          🤝 اتفاق مع <b>{r.partner.name}</b> <span dir="ltr" className="text-xs">({r.partner.studentId})</span> — {STATUS_LABELS[status]}
          {r.agreed?.status === "awaiting" && <span className="block text-xs text-text-muted">لم يقدّم الطرف الآخر طلب اتفاق مقابلاً بعد.</span>}
          {r.agreed?.status === "conflict" && <span className="block text-xs text-text-muted">طلب الطرف الآخر لا يطابق هذا الطلب (الفئات أو الاسم الآخر).</span>}
        </div>
      )}

      {r.match && (
        <div className={`rounded-md border px-3 py-2 text-sm text-text-h ${STATUS_STYLE.match}`}>
          🔁 ينتقل هذا الطالب إلى <b>الفئة {r.match.movesTo}</b>، ويتبادل مع:
          <ul className="mt-1 list-disc pr-5 text-xs">
            {r.match.others.map((m) => (
              <li key={m.id}>
                {m.studentName} <span dir="ltr">({m.studentId})</span> — من الفئة {m.fromSlot} إلى {m.movesTo}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <button type="button" onClick={onDelete} disabled={busy} className="text-xs text-danger-text hover:underline disabled:opacity-50">
          {busy ? "...جارِ الحذف" : "🗑 حذف الطلب"}
        </button>
      </div>
    </div>
  );
}

export default function AdminSwaps() {
  const [state, setState] = useState({ loading: true, error: "", requests: [], settings: null, catalog: { subjects: [], levels: [] }, pendingPRs: [], loadedAt: null });
  const [chosen, setChosen] = useState(() => new Set()); // معرّفات المواد المختارة للاستقبال
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saving | done | error
  const [saveError, setSaveError] = useState("");
  const [settingsLevel, setSettingsLevel] = useState(""); // فلتر الفصل داخل بطاقة الاستقبال
  const [levelFilter, setLevelFilter] = useState(""); // فلتر الفصل لعرض الطلبات
  const [subjectFilter, setSubjectFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortKey, setSortKey] = useState("priority"); // priority | newest
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  const [busyId, setBusyId] = useState("");
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const [requests, settings, catalog, pendingPRs] = await Promise.all([
        fetchSwapRequests(),
        fetchSwapSettings(),
        fetchCatalog(),
        fetchOpenSwapPRs().catch(() => []),
      ]);
      setChosen(new Set(settings.openSubjects.map((s) => s.id)));
      setState({ loading: false, error: "", requests, settings, catalog, pendingPRs, loadedAt: new Date() });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err?.message || "تعذّر التحميل" }));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const groups = useMemo(() => buildGroups(state.requests), [state.requests]);
  const catalogById = useMemo(() => new Map(state.catalog.subjects.map((s) => [s.id, s])), [state.catalog]);
  const subjects = useMemo(() => {
    const map = new Map();
    groups.filter((g) => inLevel(catalogById.get(g.subjectId), levelFilter)).forEach((g) => map.set(g.subjectId, g.subjectName));
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [groups, catalogById, levelFilter]);

  // مواد قائمة الاستقبال: المفتوحة هذا الفصل فقط (ضمن الفصل المختار).
  // المواد المفعّلة حالياً أو المختارة تبقى ظاهرة دائماً (حتى لو خارج الفصل المعروض أو خارج القائمة).
  const settingsOptions = useMemo(() => {
    const all = state.catalog.subjects;
    const list = filterByLevel(all, settingsLevel);
    const active = state.settings?.openSubjects ?? [];
    const extra = [];
    for (const id of new Set([...chosen, ...active.map((s) => s.id)])) {
      if (list.some((s) => s.id === id)) continue;
      const known = all.find((s) => s.id === id);
      if (known) extra.push({ ...known, outside: true });
      else extra.push({ id, name: `${active.find((s) => s.id === id)?.name || id} (خارج قائمة المفتوحة)`, levels: [] });
    }
    return { list, extra };
  }, [state.catalog, state.settings, settingsLevel, chosen]);

  const allItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const countStatus = (key) => allItems.filter((r) => requestStatus(r) === key).length;
  const totalMatches = groups.reduce((n, g) => n + g.matchCount, 0);
  const totalAgreed = groups.reduce((n, g) => n + g.agreedConfirmed, 0);

  // التصدير يتبع فلتر الفصل والمادة والنوع فقط (البحث والحالة للعرض على الشاشة).
  const exportGroups = useMemo(
    () =>
      groups.filter(
        (g) =>
          (!subjectFilter || g.subjectId === subjectFilter) &&
          (!sectionFilter || g.section === sectionFilter) &&
          inLevel(catalogById.get(g.subjectId), levelFilter)
      ),
    [groups, subjectFilter, sectionFilter, levelFilter, catalogById]
  );

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      exportGroups
        .map((g) => {
          let items = g.items.filter(
            (r) =>
              (!statusFilter || requestStatus(r) === statusFilter) &&
              (!q || r.studentName.toLowerCase().includes(q) || r.studentId.includes(q) || (r.partner?.name || "").toLowerCase().includes(q))
          );
          if (sortKey === "newest") items = [...items].reverse();
          return { ...g, shown: items };
        })
        .filter((g) => g.shown.length > 0),
    [exportGroups, statusFilter, q, sortKey]
  );
  const shownCount = visible.reduce((n, g) => n + g.shown.length, 0);
  const filtersActive = Boolean(levelFilter || subjectFilter || sectionFilter || statusFilter || q);

  function toggle(setter, id) {
    setter((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function clearFilters() {
    setLevelFilter("");
    setSubjectFilter("");
    setSectionFilter("");
    setStatusFilter("");
    setQuery("");
  }

  async function handleSave() {
    setSaveStatus("saving");
    setSaveError("");
    try {
      const known = new Map([...state.catalog.subjects, ...(state.settings?.openSubjects ?? [])].map((s) => [s.id, s]));
      const picked = [...chosen].map((id) => known.get(id)).filter(Boolean).map((s) => ({ id: s.id, name: s.name }));
      const settings = await saveSwapSettings(picked);
      setState((s) => ({ ...s, settings }));
      setSaveStatus("done");
    } catch (err) {
      setSaveError(err?.message || "");
      setSaveStatus("error");
    }
  }

  async function handleDelete(r) {
    if (!window.confirm(`حذف طلب ${r.studentName} (${r.studentId})؟ لا يمكن التراجع.`)) return;
    setBusyId(r.id);
    try {
      const requests = await deleteSwapRequest(r.id);
      setState((s) => ({ ...s, requests }));
    } catch (err) {
      window.alert(err?.message || "تعذّر الحذف");
    } finally {
      setBusyId("");
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const parts = [];
      if (levelFilter) parts.push(`الفصل: ${state.catalog.levels.find((l) => l.key === levelFilter)?.label || levelFilter}`);
      if (subjectFilter) parts.push(`المادة: ${subjects.find((s) => s.id === subjectFilter)?.name || subjectFilter}`);
      if (sectionFilter) parts.push(`النوع: ${SECTION_NAMES[sectionFilter]}`);
      await downloadSwapsExcel({
        groups: exportGroups,
        settings: state.settings,
        filterDesc: parts.length ? parts.join(" — ") : "كل المواد — نظري وعملي",
      });
    } catch (err) {
      console.error("export failed:", err);
      window.alert(`تعذّر إنشاء ملف Excel: ${err?.message || ""}`);
    } finally {
      setExporting(false);
    }
  }

  const { settings } = state;
  const activeIds = new Set((settings?.openSubjects ?? []).map((s) => s.id));
  const dirty = settings && (chosen.size !== activeIds.size || [...chosen].some((id) => !activeIds.has(id)));
  const visibleIds = settingsOptions.list.map((s) => s.id);
  const allVisibleChosen = visibleIds.length > 0 && visibleIds.every((id) => chosen.has(id));
  function setVisible(on) {
    setChosen((prev) => {
      const next = new Set(prev);
      visibleIds.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });
    setSaveStatus("idle");
  }
  function toggleChosen(id) {
    setChosen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setSaveStatus("idle");
  }
  const clock = state.loadedAt?.toLocaleTimeString(LOCALE, { timeStyle: "short" });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      {/* ─── العنوان والأزرار ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-h">🔁 لوحة تبديل الفئات</h1>
          {clock && <p className="text-xs text-text-muted">آخر تحديث للبيانات: {clock}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || exportGroups.length === 0}
            title="يصدّر حسب فلتر الفصل والمادة والنوع المختار"
            className="rounded-md bg-accent px-3 py-1.5 text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {exporting ? "...جارِ الإنشاء" : "⭳ تصدير Excel"}
          </button>
          <button type="button" onClick={load} disabled={state.loading} className="rounded-md border border-border px-3 py-1.5 text-text hover:bg-bg-elevated disabled:opacity-50">
            ⟳ تحديث
          </button>
          <Link to="/" className="rounded-md border border-border px-3 py-1.5 text-text hover:bg-bg-elevated">
            صفحة الطلاب
          </Link>
        </div>
      </div>

      {state.error && <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-danger-text">{state.error}</p>}

      {/* ─── المؤشرات ─── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="إجمالي الطلبات" value={allItems.length} active={!statusFilter} onClick={() => setStatusFilter("")} />
        <StatCard label="تطابقات ممكنة" value={totalMatches} hint={`${countStatus("match")} طلب`} active={statusFilter === "match"} onClick={() => setStatusFilter(statusFilter === "match" ? "" : "match")} />
        <StatCard label="اتفاقات مؤكدة" value={totalAgreed} hint="أزواج" active={statusFilter === "agreed-confirmed"} onClick={() => setStatusFilter(statusFilter === "agreed-confirmed" ? "" : "agreed-confirmed")} />
        <StatCard label="بانتظار تأكيد الطرف الآخر" value={countStatus("agreed-awaiting")} active={statusFilter === "agreed-awaiting"} onClick={() => setStatusFilter(statusFilter === "agreed-awaiting" ? "" : "agreed-awaiting")} />
        <StatCard
          label="قيد المعالجة"
          value={state.pendingPRs.length}
          hint={state.pendingPRs.length ? "طلبات لم يعالجها المعالج بعد" : "لا شيء معلّق"}
        />
      </div>

      {/* ─── استقبال الطلبات ─── */}
      <section className="flex flex-col gap-3 rounded-md border border-border bg-bg-subtle p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-text-h">استقبال الطلبات</h2>
          {settings?.openSubjects?.length ? (
            <span className="rounded-full border border-emerald-500/50 bg-emerald-500/15 px-3 py-0.5 text-xs text-text-h">
              مفتوح: {settings.openSubjects.length} {settings.openSubjects.length === 1 ? `(${settings.openSubjects[0].name})` : "مواد"}
            </span>
          ) : (
            <span className="rounded-full border border-border bg-bg px-3 py-0.5 text-xs text-text-muted">متوقف</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={settingsLevel} onChange={(e) => setSettingsLevel(e.target.value)} className={selectCls} aria-label="الفصل الدراسي">
            <option value="">كل الفصول</option>
            {state.catalog.levels.map((l) => (
              <option key={l.key} value={l.key}>
                {l.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setVisible(!allVisibleChosen)}
            disabled={visibleIds.length === 0}
            className="rounded-md border border-border px-3 py-1.5 text-text hover:bg-bg-elevated disabled:opacity-50"
          >
            {allVisibleChosen ? "إلغاء تحديد المعروض" : settingsLevel ? "تحديد كل مواد هذا الفصل" : "تحديد كل المواد"}
          </button>
          <button
            type="button"
            onClick={() => {
              setChosen(new Set());
              setSaveStatus("idle");
            }}
            disabled={chosen.size === 0}
            className="rounded-md border border-border px-3 py-1.5 text-text hover:bg-bg-elevated disabled:opacity-50"
          >
            مسح الكل (إيقاف الاستقبال)
          </button>
        </div>
        <div className="grid max-h-72 grid-cols-1 gap-x-4 gap-y-1 overflow-y-auto rounded-md border border-border bg-bg p-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...settingsOptions.list, ...settingsOptions.extra].map((c) => (
            <label key={c.id} className="flex items-start gap-2">
              <input type="checkbox" checked={chosen.has(c.id)} onChange={() => toggleChosen(c.id)} className="mt-1" />
              <span className={c.outside ? "text-text-muted" : ""}>
                {c.name}
                {c.outside ? " (من فصل آخر)" : ""}
              </span>
            </label>
          ))}
          {settingsOptions.list.length === 0 && settingsOptions.extra.length === 0 && <span className="text-text-muted">لا توجد مواد.</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-text-muted">المحدد: {chosen.size} مادة</span>
          <button type="button" onClick={handleSave} disabled={!dirty || saveStatus === "saving"} className="rounded-md bg-accent px-3 py-1.5 text-white hover:bg-accent-hover disabled:opacity-50">
            {saveStatus === "saving" ? "...جارِ الحفظ" : "حفظ"}
          </button>
          {saveStatus === "done" && <span className="text-text-muted">تم الحفظ ✅</span>}
          {saveStatus === "error" && <span className="text-danger-text">فشل الحفظ{saveError ? ` (${saveError})` : ""}</span>}
        </div>
        <p className="text-xs text-text-muted">
          القائمة تضم المواد المفتوحة هذا الفصل فقط ({state.catalog.subjects.length} مادة). اختر مادة أو أكثر، أو فصلاً كاملاً بزر «تحديد كل مواد هذا الفصل».{settings?.updatedAt ? ` آخر تغيير: ${fmtShort(settings.updatedAt)}.` : ""} تظهر للطلاب خلال دقيقة إلى دقيقتين بعد إعادة نشر الموقع، والمعالج يرفض فوراً أي طلب لمادة غير مفتوحة.
        </p>
      </section>

      {/* ─── الفلاتر ─── */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg-subtle p-3">
        <select
          value={levelFilter}
          onChange={(e) => {
            setLevelFilter(e.target.value);
            setSubjectFilter("");
          }}
          className={selectCls}
          aria-label="الفصل الدراسي"
        >
          <option value="">كل الفصول</option>
          {state.catalog.levels.map((l) => (
            <option key={l.key} value={l.key}>
              {l.label}
            </option>
          ))}
        </select>
        <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} className={selectCls} aria-label="المادة">
          <option value="">كل المواد</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)} className={selectCls} aria-label="النوع">
          <option value="">نظري + عملي</option>
          <option value="theory">نظري</option>
          <option value="lab">عملي</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectCls} aria-label="الحالة">
          <option value="">كل الحالات</option>
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className={selectCls} aria-label="الترتيب">
          <option value="priority">الترتيب: الأسبقية (الأقدم أولاً)</option>
          <option value="newest">الترتيب: الأحدث أولاً</option>
        </select>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="بحث بالاسم أو الرقم الجامعي"
          className={`${selectCls} min-w-52 flex-1`}
        />
        {filtersActive && (
          <button type="button" onClick={clearFilters} className="text-sm text-text-muted hover:text-text">
            مسح الفلاتر
          </button>
        )}
      </div>
      {!state.loading && allItems.length > 0 && (
        <p className="-mt-3 text-xs text-text-muted">
          يُعرض {shownCount} من {allItems.length} طلب
          {exportGroups.length < groups.length || levelFilter || subjectFilter || sectionFilter ? " · التصدير يشمل فلتر الفصل والمادة والنوع" : ""}
        </p>
      )}

      {state.loading && <p className="text-text-muted">...جارِ التحميل</p>}
      {!state.loading && allItems.length === 0 && (
        <p className="rounded-md border border-border bg-bg-subtle px-4 py-6 text-center text-sm text-text-muted">لا توجد طلبات بعد.</p>
      )}
      {!state.loading && allItems.length > 0 && visible.length === 0 && (
        <p className="rounded-md border border-border bg-bg-subtle px-4 py-6 text-center text-sm text-text-muted">لا توجد طلبات تطابق الفلاتر الحالية.</p>
      )}

      {/* ─── الجداول ─── */}
      {visible.map((g) => {
        const collapsed = collapsedGroups.has(g.key);
        return (
          <section key={g.key} className="flex flex-col gap-2 rounded-md border border-border bg-bg-subtle">
            <button
              type="button"
              onClick={() => toggle(setCollapsedGroups, g.key)}
              aria-expanded={!collapsed}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-start"
            >
              <h2 className="text-base font-bold text-text-h">
                {g.subjectName} <span className="rounded-md bg-bg px-2 py-0.5 text-xs font-normal text-text-muted">{SECTION_NAMES[g.section]}</span>
              </h2>
              <span className="text-xs text-text-muted">
                {g.shown.length} طلب
                {g.matchCount ? ` · ${g.matchCount} تطابق` : ""}
                {g.agreedConfirmed ? ` · ${g.agreedConfirmed} اتفاق مؤكد` : ""} {collapsed ? "▾" : "▴"}
              </span>
            </button>
            {!collapsed && (
              <>
                <div className="px-4">
                  <SlotChips items={g.items} section={g.section} />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse text-sm">
                    <thead>
                      <tr className="border-y border-border bg-bg text-xs text-text-muted">
                        <th className="px-3 py-2 text-start font-normal">#</th>
                        <th className="px-3 py-2 text-start font-normal">الطالب</th>
                        <th className="px-3 py-2 text-start font-normal">الحركة</th>
                        <th className="px-3 py-2 text-start font-normal">النمط</th>
                        <th className="px-3 py-2 text-start font-normal">الحالة</th>
                        <th className="px-3 py-2 text-start font-normal">وقت الإرسال</th>
                        <th className="w-10 px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {g.shown.map((r) => {
                        const open = expanded.has(r.id);
                        const status = requestStatus(r);
                        return (
                          <React.Fragment key={r.id}>
                            <tr
                              onClick={() => toggle(setExpanded, r.id)}
                              className={`cursor-pointer border-b border-border hover:bg-bg-elevated ${open ? "bg-bg-elevated" : ""}`}
                            >
                              <td className="px-3 py-2 text-text-muted">{r.order}</td>
                              <td className="px-3 py-2">
                                <div className="text-text-h">{r.studentName}</div>
                                <div dir="ltr" className="text-start text-xs text-text-muted">{r.studentId}</div>
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 font-bold text-text-h">
                                {r.fromSlot} {r.mode === "agreed" ? "⇄" : "←"} {targetsText(r)}
                              </td>
                              <td className="px-3 py-2 text-xs text-text-muted">{MODE_LABELS[r.mode] || r.mode}</td>
                              <td className="px-3 py-2">
                                <StatusBadge status={status} />
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-xs text-text-muted">{fmtShort(r.createdAt)}</td>
                              <td className="px-3 py-2 text-center">
                                <button
                                  type="button"
                                  aria-expanded={open}
                                  aria-label={open ? "إخفاء التفاصيل" : "عرض التفاصيل"}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggle(setExpanded, r.id);
                                  }}
                                  className="text-text-muted hover:text-text"
                                >
                                  {open ? "▴" : "▾"}
                                </button>
                              </td>
                            </tr>
                            {open && (
                              <tr className="border-b border-border bg-bg">
                                <td colSpan={7}>
                                  <RequestDetails r={r} busy={busyId === r.id} onDelete={() => handleDelete(r)} />
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
