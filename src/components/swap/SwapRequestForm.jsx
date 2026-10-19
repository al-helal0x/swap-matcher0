import React, { useState } from "react";
import { submitSwapRequest } from "../../lib/studentSubmission.js";
import { SLOT_COUNT, SECTION_NAMES, MAX_ENTRIES, resolveTargets } from "../../lib/swapMatching.js";

// 🔁 «مُطابِق تبديل الفئات» — نموذج الطالب: طلب واحد لمادة أو أكثر (وكل مادة بمحاضرتها وفئتها ونمطها).
// نوعان من البند:
//   open   : أريد الانتقال — أي فئة / أي فئة قبل فئتي / فئات أحددها (واحدة أو أكثر)
//   agreed : اتفقت مع طالب آخر على التبديل — أكتب اسمه ورقمه الجامعي وفئته
// بيانات الطالب (الاسم، الرقم، التواصل) تُكتب مرة واحدة وتُطبَّق على كل البنود.
// كل التواصل مع GitHub عبر studentSubmission.js حصراً (عزل التوكن).

const inputCls = "rounded-md border border-border bg-bg px-2 py-1.5 text-text";
const radioRow = "flex items-start gap-2";
const idOk = (v) => /^\d{5,12}$/.test(v.trim());

let uid = 0;
const newEntry = (subjectId = "") => ({
  key: ++uid,
  subjectId,
  section: "theory",
  fromSlot: "",
  kind: "open", // open | agreed
  mode: "any", // any | earlier | custom (kind=open)
  chosen: [],
  partnerSlot: "",
  partnerName: "",
  partnerId: "",
});

function entryTargets(e) {
  const from = Number(e.fromSlot) || 0;
  if (!from) return [];
  return e.kind === "agreed" ? resolveTargets("agreed", from, e.section, [e.partnerSlot]) : resolveTargets(e.mode, from, e.section, e.chosen);
}

function entryValid(e, studentId) {
  if (!e.subjectId || !e.fromSlot || entryTargets(e).length === 0) return false;
  if (e.kind !== "agreed") return true;
  return e.partnerName.trim().length >= 2 && idOk(e.partnerId) && e.partnerId.trim() !== studentId.trim();
}

function EntryFields({ index, total, entry: e, subjects, studentId, usedKeys, onChange, onRemove }) {
  const slots = Array.from({ length: SLOT_COUNT[e.section] }, (_, i) => i + 1);
  const from = Number(e.fromSlot) || 0;
  const targets = entryTargets(e);
  const partnerIdValid = idOk(e.partnerId) && e.partnerId.trim() !== studentId.trim();
  const duplicate = e.subjectId && usedKeys.filter((k) => k === `${e.subjectId}|${e.section}`).length > 1;
  const subjectName = subjects.find((s) => s.id === e.subjectId)?.name;
  const radioName = (n) => `${n}-${e.key}`;

  const set = (patch) => onChange({ ...e, ...patch });
  function changeSection(section) {
    set({ section, fromSlot: "", chosen: [], partnerSlot: "" });
  }
  function changeFrom(value) {
    set({
      fromSlot: value,
      chosen: e.chosen.filter((n) => String(n) !== value),
      partnerSlot: String(e.partnerSlot) === value ? "" : e.partnerSlot,
      mode: value === "1" && e.mode === "earlier" ? "any" : e.mode,
    });
  }
  const toggleChosen = (n) => set({ chosen: e.chosen.includes(n) ? e.chosen.filter((x) => x !== n) : [...e.chosen, n].sort((a, b) => a - b) });

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-bg p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold text-text-h">
          {total > 1 ? `${index + 1}. ` : ""}
          {subjects.length === 1 ? subjects[0].name : subjectName || "اختر المادة"}
        </p>
        {total > 1 && (
          <button type="button" onClick={onRemove} className="rounded-md border border-border px-2 py-0.5 text-xs text-text hover:bg-bg-elevated">
            حذف
          </button>
        )}
      </div>

      {subjects.length > 1 && (
        <label className="flex flex-col gap-1">
          <span className="text-text-muted">المادة</span>
          <select value={e.subjectId} onChange={(ev) => set({ subjectId: ev.target.value })} className={inputCls} required>
            <option value="">—</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-text-muted">المحاضرة</span>
          <select value={e.section} onChange={(ev) => changeSection(ev.target.value)} className={inputCls}>
            {Object.keys(SLOT_COUNT).map((s) => (
              <option key={s} value={s}>
                {SECTION_NAMES[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-text-muted">فئتي الحالية</span>
          <select value={e.fromSlot} onChange={(ev) => changeFrom(ev.target.value)} className={inputCls} required>
            <option value="">—</option>
            {slots.map((n) => (
              <option key={n} value={n}>
                الفئة {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      {duplicate && <p className="text-xs text-danger-text">هذه المادة بنفس النوع مكرَّرة بالطلب — غيّر النوع أو احذف أحد البندين.</p>}

      <fieldset className="flex flex-col gap-2 rounded-md border border-border p-3">
        <legend className="px-1 text-text-muted">نوع الطلب</legend>
        <label className={radioRow}>
          <input type="radio" name={radioName("kind")} checked={e.kind === "open"} onChange={() => set({ kind: "open" })} className="mt-1" />
          <span>أريد الانتقال إلى فئة أخرى</span>
        </label>
        <label className={radioRow}>
          <input type="radio" name={radioName("kind")} checked={e.kind === "agreed"} onChange={() => set({ kind: "agreed" })} className="mt-1" />
          <span>اتفقت مع طالب آخر على التبديل</span>
        </label>
      </fieldset>

      {e.kind === "open" && (
        <fieldset className="flex flex-col gap-2 rounded-md border border-border p-3">
          <legend className="px-1 text-text-muted">الفئات التي أقبل الانتقال إليها</legend>
          <label className={radioRow}>
            <input type="radio" name={radioName("mode")} checked={e.mode === "any"} onChange={() => set({ mode: "any" })} className="mt-1" />
            <span>أي فئة</span>
          </label>
          <label className={`${radioRow} ${from === 1 ? "opacity-50" : ""}`}>
            <input type="radio" name={radioName("mode")} checked={e.mode === "earlier"} disabled={from === 1} onChange={() => set({ mode: "earlier" })} className="mt-1" />
            <span>أي فئة قبل فئتي{from > 1 ? ` (الفئات ${resolveTargets("earlier", from, e.section).join("، ")})` : ""}</span>
          </label>
          <label className={radioRow}>
            <input type="radio" name={radioName("mode")} checked={e.mode === "custom"} onChange={() => set({ mode: "custom" })} className="mt-1" />
            <span>فئات أحددها بنفسي (يمكن اختيار أكثر من فئة)</span>
          </label>
          {e.mode === "custom" && (
            <div className="flex flex-wrap gap-3 pr-6">
              {slots
                .filter((n) => n !== from)
                .map((n) => (
                  <label key={n} className="flex items-center gap-1">
                    <input type="checkbox" checked={e.chosen.includes(n)} onChange={() => toggleChosen(n)} />
                    <span>الفئة {n}</span>
                  </label>
                ))}
            </div>
          )}
          {from > 0 && (
            <p className="text-xs text-text-muted">{targets.length > 0 ? `سيُسجَّل طلبك للفئات: ${targets.join("، ")}` : "اختر فئة واحدة على الأقل."}</p>
          )}
        </fieldset>
      )}

      {e.kind === "agreed" && (
        <fieldset className="flex flex-col gap-3 rounded-md border border-border p-3">
          <legend className="px-1 text-text-muted">بيانات الطالب الذي اتفقت معه</legend>
          <label className="flex flex-col gap-1">
            <span className="text-text-muted">فئته الحالية (الفئة التي ستنتقل إليها)</span>
            <select value={e.partnerSlot} onChange={(ev) => set({ partnerSlot: ev.target.value })} className={inputCls} required>
              <option value="">—</option>
              {slots
                .filter((n) => n !== from)
                .map((n) => (
                  <option key={n} value={n}>
                    الفئة {n}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-text-muted">اسمه</span>
            <input type="text" value={e.partnerName} onChange={(ev) => set({ partnerName: ev.target.value })} maxLength={60} className={inputCls} required />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-text-muted">رقمه الجامعي</span>
            <input
              type="text"
              inputMode="numeric"
              dir="ltr"
              value={e.partnerId}
              onChange={(ev) => set({ partnerId: ev.target.value.replace(/\D/g, "") })}
              maxLength={12}
              className={inputCls}
              required
            />
            {e.partnerId && !partnerIdValid && (
              <span className="text-xs text-danger-text">
                {e.partnerId.trim() === studentId.trim() ? "لا يمكن أن يكون رقمك أنت." : "الرقم الجامعي من 5 إلى 12 رقماً."}
              </span>
            )}
          </label>
          <p className="rounded-md bg-bg-subtle px-3 py-2 text-xs text-text-h">
            ⚠️ يجب أن يكون الطالب الآخر موافقاً على التبديل، وإلا فلن يتم. وتُؤكَّد موافقته بأن يقدّم هو أيضاً طلباً بخيار
            «اتفقت مع طالب آخر» يكتب فيه اسمك ورقمك الجامعي.
          </p>
        </fieldset>
      )}
    </div>
  );
}

export default function SwapRequestForm({ subjects }) {
  const single = subjects.length === 1 ? subjects[0].id : "";
  const [entries, setEntries] = useState(() => [newEntry(single)]);
  const [studentName, setStudentName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | done | error
  const [errorDetail, setErrorDetail] = useState("");

  const idValid = idOk(studentId);
  const usedKeys = entries.map((e) => `${e.subjectId}|${e.section}`);
  const noDuplicates = new Set(usedKeys).size === usedKeys.length;
  const canSubmit =
    status !== "sending" && studentName.trim().length >= 2 && idValid && noDuplicates && entries.every((e) => entryValid(e, studentId));

  const update = (key, next) => setEntries((list) => list.map((e) => (e.key === key ? next : e)));
  const remove = (key) => setEntries((list) => list.filter((e) => e.key !== key));
  const add = () => setEntries((list) => [...list, newEntry(single)]);

  async function handleSubmit(ev) {
    ev.preventDefault();
    if (!canSubmit) return;
    setStatus("sending");
    try {
      await submitSwapRequest({
        entries: entries.map((e) => {
          const from = Number(e.fromSlot);
          const mode = e.kind === "agreed" ? "agreed" : e.mode;
          return {
            subjectId: e.subjectId,
            subjectName: subjects.find((s) => s.id === e.subjectId)?.name,
            section: e.section,
            fromSlot: from,
            mode,
            toSlots: e.kind === "agreed" ? [Number(e.partnerSlot)] : e.chosen,
            partner: e.kind === "agreed" ? { name: e.partnerName, studentId: e.partnerId } : null,
          };
        }),
        studentName,
        studentId,
        contact,
      });
      setStatus("done");
    } catch (err) {
      console.error("submitSwapRequest failed:", err);
      setErrorDetail(err?.message || "");
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div className="rounded-md border border-border bg-bg-subtle px-4 py-3 text-sm">
        <p className="text-text-h">تم إرسال طلبك بنجاح ✅{entries.length > 1 ? ` (${entries.length} مواد)` : ""}</p>
        <p className="mt-1 text-text-muted">سُجّل وقت إرسالك وهو ما تُحسب به أسبقيتك.</p>
        {entries.some((e) => e.kind === "agreed") && (
          <p className="mt-2 text-text-muted">
            لا يُعتمد الاتفاق إلا بموافقة الطالب الآخر: يجب أن يقدّم هو أيضاً طلباً بخيار «اتفقت مع طالب آخر» يكتب فيه اسمك
            ورقمك الجامعي.
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-md border border-border bg-bg-subtle p-4 text-sm">
      {entries.map((e, i) => (
        <EntryFields
          key={e.key}
          index={i}
          total={entries.length}
          entry={e}
          subjects={subjects}
          studentId={studentId}
          usedKeys={usedKeys}
          onChange={(next) => update(e.key, next)}
          onRemove={() => remove(e.key)}
        />
      ))}

      <button
        type="button"
        onClick={add}
        disabled={entries.length >= MAX_ENTRIES}
        className="self-start rounded-md border border-border px-3 py-1.5 text-text hover:bg-bg-elevated disabled:opacity-50"
      >
        {subjects.length > 1 ? "＋ إضافة مادة أخرى لنفس الطلب" : "＋ إضافة محاضرة أخرى (نظري/عملي)"}
      </button>

      <label className="flex flex-col gap-1">
        <span className="text-text-muted">الاسم</span>
        <input type="text" value={studentName} onChange={(e) => setStudentName(e.target.value)} maxLength={60} className={inputCls} required />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-text-muted">الرقم الجامعي</span>
        <input
          type="text"
          inputMode="numeric"
          dir="ltr"
          value={studentId}
          onChange={(e) => setStudentId(e.target.value.replace(/\D/g, ""))}
          maxLength={12}
          className={inputCls}
          required
        />
        {studentId && !idValid && <span className="text-xs text-danger-text">الرقم الجامعي من 5 إلى 12 رقماً.</span>}
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-text-muted">وسيلة تواصل (اختياري)</span>
        <input type="text" value={contact} onChange={(e) => setContact(e.target.value)} maxLength={60} className={inputCls} placeholder="مثال: واتساب 07xxxxxxxx" />
      </label>

      {status === "error" && (
        <div>
          <p className="text-danger-text">صار خطأ أثناء الإرسال، حاول مرة ثانية.</p>
          {errorDetail && <p className="mt-1 text-xs text-text-muted">({errorDetail})</p>}
        </div>
      )}

      <button type="submit" disabled={!canSubmit} className="self-start rounded-md bg-accent px-3 py-1.5 text-white hover:bg-accent-hover disabled:opacity-50">
        {status === "sending" ? "...جارِ الإرسال" : entries.length > 1 ? `إرسال الطلب (${entries.length} مواد)` : "إرسال الطلب"}
      </button>
    </form>
  );
}
