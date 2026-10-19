// 🔁 «مُطابِق تبديل الفئات» — عقد إعدادات الاستقبال (public/data/swap-settings.json).
// الصيغة الحالية: { openSubjects: [{ id, name }, ...], updatedAt }  (مادة أو أكثر أو فصل كامل)
// الصيغة القديمة { openSubjectId, openSubjectName } تُقرأ كمادة واحدة، ونكتب الحقلين القديمين
// (أول مادة) للتوافق مع أي نسخة قديمة من الواجهة أو المعالج.

export function normalizeSettings(data) {
  const list = [];
  const seen = new Set();
  const push = (id, name) => {
    if (typeof id !== "string" || !id || seen.has(id)) return;
    seen.add(id);
    list.push({ id, name: typeof name === "string" && name ? name : id });
  };
  if (Array.isArray(data?.openSubjects)) data.openSubjects.forEach((s) => push(s?.id, s?.name));
  else if (data?.openSubjectId) push(data.openSubjectId, data.openSubjectName);
  return { openSubjects: list, updatedAt: data?.updatedAt || null };
}

export function serializeSettings(subjects, updatedAt = new Date().toISOString()) {
  const openSubjects = normalizeSettings({ openSubjects: subjects }).openSubjects;
  return {
    openSubjects,
    openSubjectId: openSubjects[0]?.id || null, // توافق مع الصيغة القديمة
    openSubjectName: openSubjects[0]?.name || null,
    updatedAt,
  };
}

export const openSubjectIds = (settings) => normalizeSettings(settings).openSubjects.map((s) => s.id);
export const openSubjectsLabel = (settings) =>
  normalizeSettings(settings).openSubjects.map((s) => s.name).join("، ");
