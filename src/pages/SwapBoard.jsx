import React, { useMemo, useState } from "react";
import { useSwaps } from "../hooks/useSwaps.js";
import { buildGroups, SECTION_NAMES } from "../lib/swapMatching.js";
import { getSavedCodes } from "../lib/swapLocal.js";
import { submitSwapCancel } from "../lib/studentSubmission.js";
import SwapRequestForm from "../components/swap/SwapRequestForm.jsx";

// 🔁 «مُطابِق تبديل الفئات» — لوحة عامة: من يريد التبديل من أي فئة إلى أي فئة.
// الأسبقية: ترتيب الطلبات حسب وقت الإرسال (الأقدم أحق).
// غيّر القيمة أدناه إلى false لإخفاء الرقم الجامعي عن اللوحة العامة.
const SHOW_STUDENT_ID = true;

function CancelControl({ request }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(() => getSavedCodes()[request.id] || "");
  const [status, setStatus] = useState("idle"); // idle | sending | done | error
  const [detail, setDetail] = useState("");

  async function handleCancel() {
    setStatus("sending");
    try {
      await submitSwapCancel({ id: request.id, code });
      setStatus("done");
    } catch (err) {
      setDetail(err?.message || "");
      setStatus("error");
    }
  }

  if (status === "done") {
    return <p className="mt-2 text-xs text-text-muted">تم إرسال الإلغاء — يختفي الطلب خلال دقائق.</p>;
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 text-xs text-text-muted hover:text-text">
        إلغاء الطلب / تم التبديل
      </button>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input
        dir="ltr"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="رمز الإلغاء"
        className="w-52 rounded-md border border-border bg-bg px-2 py-1 font-mono text-xs text-text"
      />
      <button
        type="button"
        onClick={handleCancel}
        disabled={!code.trim() || status === "sending"}
        className="rounded-md bg-accent px-2 py-1 text-xs text-white hover:bg-accent-hover disabled:opacity-50"
      >
        {status === "sending" ? "..." : "تأكيد الإلغاء"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-text-muted hover:text-text">
        تراجع
      </button>
      {status === "error" && (
        <span className="text-xs text-danger-text">فشل الإرسال{detail ? ` (${detail})` : ""}</span>
      )}
    </div>
  );
}

function RequestRow({ r }) {
  return (
    <li className={`rounded-md border bg-bg-subtle px-4 py-3 text-sm ${r.match ? "border-accent" : "border-border"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-text-h">
          <span className="text-text-muted">#{r.order}</span> {r.studentName}
          {SHOW_STUDENT_ID && (
            <span dir="ltr" className="mr-2 text-xs text-text-muted">
              {r.studentId}
            </span>
          )}
        </p>
        <p className="font-bold text-text-h">
          الفئة {r.fromSlot} ← الفئة {r.toSlot}
        </p>
      </div>
      <p className="mt-1 text-xs text-text-muted">
        أسبقيته بين من يريدون الفئة {r.toSlot}: رقم {r.queueRank}
        {" · "}
        {new Date(r.createdAt).toLocaleString("ar")}
        {r.contact ? ` · ${r.contact}` : ""}
      </p>
      {r.match && (
        <p className="mt-2 rounded-md bg-bg px-3 py-2 text-xs text-text-h">
          🔁 يوجد تطابق ممكن مع: {r.match.map((m) => `${m.studentName} (الفئة ${m.fromSlot}→${m.toSlot})`).join("، ")}
        </p>
      )}
      <CancelControl request={r} />
    </li>
  );
}

export default function SwapBoard() {
  const { requests, loading } = useSwaps();
  const [showForm, setShowForm] = useState(false);
  const [subjectFilter, setSubjectFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");

  const groups = useMemo(() => buildGroups(requests), [requests]);
  const subjects = useMemo(() => {
    const map = new Map();
    groups.forEach((g) => map.set(g.subjectId, g.subjectName));
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [groups]);

  const visible = groups.filter(
    (g) => (!subjectFilter || g.subjectId === subjectFilter) && (!sectionFilter || g.section === sectionFilter)
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-text-h">🔁 تبديل الفئات</h1>
        <p className="mt-1 text-sm text-text-muted">
          سجّل رغبتك بالانتقال من فئة إلى أخرى وشاهد من يرغب بنفس التبديل. الأسبقية لمن سبق بالطلب: عند توفر مكان في فئة
          معيّنة يكون الأحق به أقدم من طلبه. الموقع يعرّفك بالطلاب فقط؛ التبديل الفعلي يتم بالتنسيق بينكم ووفق إجراءات الجامعة.
        </p>
      </div>

      {showForm ? (
        <SwapRequestForm onCancel={() => setShowForm(false)} />
      ) : (
        <button type="button" onClick={() => setShowForm(true)} className="self-start rounded-md bg-accent px-3 py-1.5 text-sm text-white hover:bg-accent-hover">
          ➕ طلب تبديل جديد
        </button>
      )}

      {groups.length > 0 && (
        <div className="flex flex-wrap gap-3 text-sm">
          <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} className="rounded-md border border-border bg-bg px-2 py-1.5 text-text">
            <option value="">كل المواد</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)} className="rounded-md border border-border bg-bg px-2 py-1.5 text-text">
            <option value="">نظري + عملي</option>
            <option value="theory">نظري</option>
            <option value="lab">عملي</option>
          </select>
        </div>
      )}

      {loading && <p className="text-text-muted">...جارِ التحميل</p>}
      {!loading && groups.length === 0 && <p className="text-sm text-text-muted">لا توجد طلبات تبديل حالياً.</p>}

      {visible.map((g) => (
        <section key={g.key} className="flex flex-col gap-2">
          <h2 className="text-base font-bold text-text-h">
            {g.subjectName} — {SECTION_NAMES[g.section]}{" "}
            <span className="text-xs font-normal text-text-muted">
              ({g.items.length} طلب{g.matchCount ? ` · ${g.matchCount} تطابق` : ""})
            </span>
          </h2>
          <ul className="flex flex-col gap-2">
            {g.items.map((r) => (
              <RequestRow key={r.id} r={r} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
