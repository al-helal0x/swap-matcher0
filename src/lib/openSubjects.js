// 🔁 «مُطابِق تبديل الفئات» — المواد المفتوحة هذا الفصل + فلترة حسب الفصل الدراسي (المستوى) وفق مخطط الدراسة.
//   public/data/open-subjects.json : المواد المفتوحة (من الجدول الأسبوعي) مربوطة بمعرّفات المخطط.
//   public/data/study-plan.json    : مخطط الدراسة (courses + levels: المستوى/السنة/الفصل).
// الأدمن لا يرى إلا المواد الموجودة بالقائمتين معاً.

export const NO_LEVEL = "none"; // مواد مفتوحة لكنها ليست ضمن مستوى محدد بالمخطط (اختيارية/جامعة…)

const YEARS = ["", "الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة"];

export function levelLabel(l) {
  return `المستوى ${l.level} — السنة ${YEARS[l.year] ?? l.year}، الفصل ${l.semester === 1 ? "الأول" : "الثاني"}`;
}

// المستويات 1–6: مصفوفة معرّفات. المستويات 7–10: كائن مسارات (track → معرّفات + عناصر اختيارية ككائنات تُهمَل).
function idsIn(v) {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
  if (v && typeof v === "object") return Object.values(v).flatMap(idsIn);
  return [];
}

export function buildCatalog(plan, open) {
  const levelsOf = new Map();
  for (const l of plan.levels ?? []) {
    for (const id of new Set(idsIn(l.courses ?? l.tracks))) {
      levelsOf.set(id, [...new Set([...(levelsOf.get(id) ?? []), l.level])].sort((a, b) => a - b));
    }
  }
  const byId = new Map((plan.courses ?? []).map((c) => [c.id, c]));
  const subjects = (open.courses ?? [])
    .map((o) => {
      const c = byId.get(o.id);
      return c ? { id: c.id, name: c.name, levels: levelsOf.get(c.id) ?? [], scheduleNames: o.scheduleNames ?? [] } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.levels[0] ?? 99) - (b.levels[0] ?? 99) || a.name.localeCompare(b.name, "ar"));
  const levels = (plan.levels ?? [])
    .filter((l) => subjects.some((s) => s.levels.includes(l.level)))
    .map((l) => ({ key: String(l.level), label: levelLabel(l) }));
  if (subjects.some((s) => s.levels.length === 0)) levels.push({ key: NO_LEVEL, label: "اختياري / بدون مستوى محدد" });
  return { subjects, levels };
}

/** هل تنتمي المادة للفصل المختار؟ key فارغ = الكل. */
export function inLevel(subject, key) {
  if (!key) return true;
  if (!subject) return false;
  return key === NO_LEVEL ? subject.levels.length === 0 : subject.levels.includes(Number(key));
}

export const filterByLevel = (subjects, key) => subjects.filter((s) => inLevel(s, key));

async function getJson(path) {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${path}?_=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`تعذّر تحميل ${path} (${res.status})`);
  return res.json();
}

export async function fetchCatalog() {
  const [plan, open] = await Promise.all([getJson("study-plan.json"), getJson("open-subjects.json")]);
  return buildCatalog(plan, open);
}
