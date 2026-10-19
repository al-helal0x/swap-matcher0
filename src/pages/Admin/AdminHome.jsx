import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PublishPanel from "../../components/admin/PublishPanel.jsx";
import StudyPlanEditor from "../../components/admin/StudyPlanEditor.jsx";
import { usePendingRequestsCount } from "../../hooks/usePendingRequestsCount.js";
import { useLastPublishDate } from "../../hooks/useLastPublishDate.js";

// ⚠️ ملف مملوك لعضو 3 (لوحة التحكم — الواجهة).
//
// ملاحظة مصدر البيانات (ليست بالعقود الأصلية، قرار عضو 3):
// لا يوجد "فهرس" ثابت لكل المواد بهذا المشروع، فقط public/data/study-plan.json
// و public/data/subjects/{slug}/subject.json المتفرقة. بانتظار وجود endpoint/فهرس
// مخصص، استخدمت study-plan.json كمصدر لقائمة المواد بلوحة التحكم لأنه أنسب
// مصدر موجود فعلاً من اليوم الأول (يحوي id/name/code/hidden لكل مادة).
// إن أنشأ المدير أو عضو 4 فهرساً مخصصاً لاحقاً، هذا الملف فقط من يحتاج تعديل
// نقطة الجلب أدناه (fetchSubjects) وبقية الصفحة تبقى كما هي.
//
// ⚠️ إصلاح (تقرير عضو 6، 2026-07-19: "المواد المضافة لا تظهر بصفحة المواد" —
// تكرّر رغم إصلاح buildSubjectPackage السابق): تأكّدت فعلياً من الريبو المنشور
// أن مادة "1110501" منشورة (subject.json + lectures موجودان) لكنها غائبة كلياً
// عن study-plan.json. السبب: `fetch()` العادي لملف ثابت كهذا قابل لأن يرجع نسخة
// مخزَّنة مؤقتاً (كاش المتصفح أو GitHub Pages/CDN) بدل أحدث نسخة فعلية على main.
// أي شاشة بلوحة التحكم تقرأ study-plan.json **كأساس لدمج/كتابة** لاحقة (هنا
// وبـ AdminSubjectEditor.jsx وAdminSectionsManager.jsx) يجب أن تقرأ نسخة طازجة
// دائماً، وإلا فأي إضافة سابقة غير موجودة بالنسخة المخزَّنة تُفقَد عند أول نشر
// لاحق يُعيد كتابة الملف كاملاً بناءً عليها. لذلك أضفت `cache: "no-store"` +
// معامل رابط لكسر أي كاش وسيط (CDN) لا يحترم رؤوس الطلب نفسها.
//
// ⚠️ تحديث (2026-07-20، معتمَد بخطة المدير): حذف مادة مباشر من هذي الشاشة، بدل
// الاضطرار للدخول لصفحة تعديل المادة، + تبويب جديد "تحرير خطة المواد"
// (StudyPlanEditor.jsx، ملفي أيضاً) لتعديلات القائمة الوصفية (اسم/رمز/ترتيب/
// إخفاء/إضافة أو إزالة سطر) بمعزل عن محتوى المادة الفعلي.
//
// ⚠️ عقد مؤقت (mock) بانتظار تسليم عضو 5 (معتمَد بخطة المدير 2026-07-20):
// buildSubjectDeletion(slug, { existingSubject, existingStudyPlan }) → pkg —
// يحذف subject.json + كل lectures*.json المرتبطة (بحسب professorVariants) +
// مجلد public/pdf/{slug} بالكامل، ويزيل سطر المادة من study-plan.json — بنفس
// الـ PR (بلا دمج تلقائي أبداً لعمليات الحذف، بحسب قرار المدير الأمني الصريح).
// عند التسليم الفعلي، استبدل الاستيراد أدناه بـ:
//   import { buildSubjectDeletion } from "../../lib/githubPublisher.js";
// واحذف mockBuildSubjectDeletion كاملاً — بقية هذا الملف لا يحتاج أي تعديل آخر.

// ✅ تم التبديل — 2026-07-22: عضو 5 سلَّم buildSubjectDeletion فعلياً بـ
// githubPublisher.js (تحقّقت من التطابق الحرفي مع العقد الموثَّق أعلاه: نفس
// شكل pkg، نفس filesToDelete/pdfDir/studyPlanJson). استبدلت mockBuildSubjectDeletion
// بالاستيراد الحقيقي كما أوصى التعليق أعلاه بالضبط — بقية الملف لم تحتج أي تعديل
// إضافي (فرع else بعرض pkg الحقيقي عبر PublishPanel كان جاهزاً مسبقاً وينتظر هذا
// فقط).
import { buildSubjectDeletion, buildStudyPlanUpdate } from "../../lib/githubPublisher.js";
import { exportFullBackupZip } from "../../lib/fullBackup.js";
import { fetchScheduledQueue, buildScheduleEntry } from "../../lib/scheduledPublish.js";
import { fetchFlatCurriculum } from "../../lib/curriculum.js";

// ⚠️ تحديث (2026-08-02، طلب مباشر من المستخدم — اقتراح #4 من مراجعة خبير
// للوحة التحكم: "إجراءات جماعية"): تحديد عدة مواد بـ checkbox (فوق القائمة
// المفلترة/المبحوثة أصلاً باقتراح #1 — التحديد يعمل فقط على ما هو ظاهر
// حالياً بالقائمة) ثم "إخفاء المحدد"/"إظهار المحدد" ببناء *حزمة نشر حقيقية
// واحدة* (buildStudyPlanUpdate على كامل subjects بعد تعديل حقل hidden لكل
// معرّف محدَّد فقط) — بخلاف toggleLocalHidden أعلاه (معاينة محلية بحتة تحتاج
// فتح كل مادة يدوياً لتُنشَر)، هذا فعلي: يعرض PublishPanel مباشرة بعد
// الضغط، ونشر ناجح واحد يحدّث كل المواد المحدَّدة معاً بنفس commit/PR.
// لا علاقة له بالحذف (deleteState) ولا بمعاينة toggleLocalHidden — حالة
// منفصلة تماماً (bulkPkg) تُغلَق فور الإلغاء أو النشر الناجح.

// ⚠️ تحديث (2026-08-02، طلب مباشر من المستخدم — اقتراحات #1 و#3 من مراجعة
// خبير للوحة التحكم):
//   #3 شارة عدد الطلبات المعلَّقة بجانب رابط "طلبات الطلاب" — usePendingRequestsCount
//      (جديد، src/hooks/) يعدّ PRs المفتوحة بعنوان [event]/[upload] عبر GitHub API
//      مباشرة (نفس ما AdminRequestsQueue.jsx يفعله أصلاً، هنا فقط عدّ بلا تفاصيل).
//      null (بلا توكن أو فشل الجلب) = لا تُعرَض أي شارة إطلاقاً، لا صفر مضلِّل.
//   #1 بحث بالاسم/الرمز/الرقم + فلترة (الكل/ظاهر/مخفي) فوق قائمة المواد — محلي
//      بالكامل (بلا أي طلب شبكة إضافي)، على `subjects` بعد جلبها أصلاً.
//
// ⚠️ تحديث ثانٍ (2026-08-02، الموجة الثانية من نفس المراجعة — اقتراحات #8 و#9):
//   #8 زر "⭳ نسخة احتياطية كاملة (ZIP)" بجانب "طلبات الطلاب" — يستدعي
//      exportFullBackupZip (جديد، src/lib/fullBackup.js) مباشرة، بلا أي حالة
//      إضافية بهذا الملف عدا مؤشر "جارِ التجهيز" بسيط.
//   #9 شريط إحصائيات صغير (إجمالي/ظاهر/مخفي) أعلى قائمة المواد — من subjects
//      نفسها، بلا أي طلب شبكة إضافي.
// رابط "🔍 فاحص الروابط" (اقتراح #7) صفحة منفصلة كاملة (AdminLinkChecker.jsx)،
// فقط رابط تنقّل هنا لا منطق.

async function fetchStudyPlan() {
  const res = await fetch(`${import.meta.env.BASE_URL}data/study-plan.json?_=${Date.now()}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("تعذّر تحميل قائمة المواد");
  return res.json();
}

async function fetchSubjectDetail(id) {
  const res = await fetch(`${import.meta.env.BASE_URL}data/subjects/${id}/subject.json?_=${Date.now()}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

const TABS = {
  LIST: "list",
  STUDY_PLAN: "studyplan",
};

export default function AdminHome() {
  const [tab, setTab] = useState(TABS.LIST);
  const [studyPlan, setStudyPlan] = useState({ courses: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // إخفاء هنا محلي فقط بواجهة العرض (معاينة) — التطبيق الفعلي يمر عبر محرر
  // المادة (checkbox "إخفاء") ← PublishPanel، لأن الموقع Static بلا خادم.
  const [localOverrides, setLocalOverrides] = useState({});

  // تدفّق الحذف: id → "confirming" | "building" | pkg الناتج
  const [deleteState, setDeleteState] = useState({});

  // ⚠️ جديد (2026-08-02، اقتراح #1): بحث/فلترة محليان بالكامل — لا يؤثران على
  // studyPlan/subjects نفسها، فقط على ما يُعرَض بالقائمة أدناه.
  const [searchQuery, setSearchQuery] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState("all"); // "all" | "visible" | "hidden"

  // ⚠️ جديد: تصفّح/تعديل مواد فصل دراسي محدد على حدة. المصدر: curriculum.json
  // (نفس مصدر ترتيب SubjectList)، بلا أي تغيير بشكل study-plan.json أو
  // subject.json. القيم: "all" | "unlinked" (غير مرتبطة بالخطة) | "elective" |
  // رقم المستوى كنص ("1".."8"). الفلتر محلي بالكامل ويتكامل مع البحث/الظهور
  // والتحديد الجماعي (يعمل على المعروض فقط).
  const [semesterFilter, setSemesterFilter] = useState("all");
  const [curriculumMap, setCurriculumMap] = useState(null); // Map<id, {year, level, semesterLabel}> | null

  // ⚠️ جديد (2026-08-02، اقتراح #3)
  const { count: pendingCount } = usePendingRequestsCount();

  // ⚠️ جديد (2026-08-02) — يكمل اقتراح #9 بعد تنفيذ #5 بهذي الجلسة (راجع
  // توثيق useLastPublishDate.js).
  const { date: lastPublishDate } = useLastPublishDate();

  // ⚠️ جديد (2026-08-02، اقتراح #4): تحديد جماعي + حزمة نشر جماعية جاهزة
  // (buildStudyPlanUpdate) — null يعني لا يوجد إجراء جماعي معروض حالياً.
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkPkg, setBulkPkg] = useState(null);
  // ⚠️ جديد (اقتراح #10 — جدولة نشر): مسودة جدولة (لقطة courses بعد التغيير
  // المطلوب، بانتظار موعد/وصف من الأدمن قبل بناء pkg الفعلي).
  const [scheduleDraft, setScheduleDraft] = useState(null); // { hidden, updatedCourses } | null
  const [scheduleAt, setScheduleAt] = useState("");
  const [scheduleDesc, setScheduleDesc] = useState("");
  const [schedulePkg, setSchedulePkg] = useState(null);
  const [scheduleError, setScheduleError] = useState("");

  // ⚠️ جديد (2026-08-02، اقتراح #8)
  const [backupStatus, setBackupStatus] = useState("idle"); // idle | zipping | error
  const [backupError, setBackupError] = useState(null);

  async function handleFullBackup() {
    setBackupStatus("zipping");
    setBackupError(null);
    try {
      await exportFullBackupZip();
      setBackupStatus("idle");
    } catch (err) {
      setBackupError(err.message || "فشل تجهيز النسخة الاحتياطية");
      setBackupStatus("error");
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetchStudyPlan()
      .then((plan) => {
        if (!cancelled) setStudyPlan(plan);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchFlatCurriculum().then((flat) => {
      if (cancelled) return;
      setCurriculumMap(
        new Map(
          flat.map((c) => [c.id, { year: c.year, level: c.level, semesterLabel: c.semesterLabel }])
        )
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // ⚠️ إصلاح (2026-08-03، مراجعة مستقلة للمدير): بعد أي نشر ناجح فعلي (حذف
  // مادة أو تحديث ظهور جماعي)، studyPlan لم تكن تُعاد جلبها إطلاقاً — القائمة
  // تبقى بحالة قديمة صامتة حتى يُعيد الأدمن تحميل الصفحة يدوياً بنفسه، رغم أن
  // النشر تم فعلياً على GitHub. لا نستخدم cancelled/AbortController هنا (خلافاً
  // للتحميل الأولي أعلاه) لأنها استدعاء لحظي واحد بعد حدث نجاح صريح من المستخدم،
  // لا تأثير سباق محتمل بتغيير مسار/إلغاء تركيب بهذي اللحظة تحديداً.
  async function refreshSubjects() {
    try {
      const plan = await fetchStudyPlan();
      setStudyPlan(plan);
    } catch {
      // فشل إعادة الجلب بعد نشر ناجح فعلاً (نادر: انقطاع نت لحظي) — لا نكسر
      // الواجهة بخطأ؛ القائمة تبقى بآخر حالة معروفة، والأدمن يقدر يحدّث يدوياً.
    }
  }

  const subjects = studyPlan.courses ?? [];

  // ⚠️ جديد (2026-08-02، اقتراح #1): يُطبَّق فوق subjects مباشرة — hiddenNow
  // (التعديل المحلي للمعاينة) يبقى محسوباً كما هو بداخل map أدناه بلا تغيير،
  // فقط نستخدم نفس منطق "hidden الأصلي أو localOverrides" هنا أيضاً حتى تعكس
  // الفلترة أي تعديل معاينة محلي فوري.
  const normalizedQuery = searchQuery.trim().toLowerCase();
  // مفتاح فصل المادة: رقم المستوى كنص | "elective" | "unlinked"
  function semesterKeyOf(id) {
    const info = curriculumMap?.get(id);
    if (!info) return "unlinked";
    return info.level == null ? "elective" : String(info.level);
  }

  const semesterCounts = new Map();
  if (curriculumMap) {
    for (const s of subjects) {
      const k = semesterKeyOf(s.id);
      semesterCounts.set(k, (semesterCounts.get(k) ?? 0) + 1);
    }
  }
  const semesterOptions = curriculumMap
    ? [
        ...Array.from({ length: 8 }, (_, i) => {
          const level = String(i + 1);
          return {
            key: level,
            label: `${i % 2 === 0 ? "الفصل الأول" : "الفصل الثاني"} · م${level}`,
            year: Math.floor(i / 2) + 1,
          };
        }),
        { key: "elective", label: "اختيارية", year: null },
        { key: "unlinked", label: "غير مرتبطة بالخطة", year: null },
      ].filter((o) => (semesterCounts.get(o.key) ?? 0) > 0)
    : [];

  const filteredSubjects = subjects.filter((s) => {
    if (semesterFilter !== "all" && semesterKeyOf(s.id) !== semesterFilter) return false;
    const hiddenNow = localOverrides[s.id] ?? s.hidden;
    if (visibilityFilter === "visible" && hiddenNow) return false;
    if (visibilityFilter === "hidden" && !hiddenNow) return false;
    if (!normalizedQuery) return true;
    const haystack = `${s.name ?? ""} ${s.code ?? ""} ${s.id ?? ""}`.toLowerCase();
    return haystack.includes(normalizedQuery);
  });

  function toggleLocalHidden(id) {
    setLocalOverrides((prev) => ({
      ...prev,
      [id]: !(prev[id] ?? subjects.find((s) => s.id === id)?.hidden ?? false),
    }));
  }

  // ⚠️ جديد (اقتراح #4) — التحديد يعمل فقط على المعرّفات الظاهرة فعلياً
  // بالقائمة المفلترة/المبحوثة حالياً (filteredSubjects محسوبة أدناه بنفس
  // مكانها السابق تماماً)، لا كل subjects — سلوك متوقَّع لو كان الطالب/الأدمن
  // مصفٍّ بحثاً بالتو ولا يقصد التأثير على مواد غير ظاهرة أمامه.
  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllFiltered(ids) {
    setSelectedIds((prev) => {
      const allSelected = ids.length > 0 && ids.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(ids);
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  // hidden: القيمة الجديدة المطلوبة (true = إخفاء المحدَّد، false = إظهاره)
  // — تُطبَّق فقط على المعرّفات المحدَّدة، بقية subjects كما هي بلا تغيير.
  function buildBulkVisibility(hidden) {
    const updatedCourses = subjects.map((s) =>
      selectedIds.has(s.id) ? { ...s, hidden } : s
    );
    setBulkPkg(buildStudyPlanUpdate(updatedCourses));
  }

  function cancelBulk() {
    setBulkPkg(null);
  }

  // ⚠️ جديد (اقتراح #10 — جدولة نشر): بدل نشر فوري، تفتح نموذج موعد/وصف
  // مضمَّناً (نفس لقطة courses اللي تبنيها buildBulkVisibility بالضبط —
  // إعادة استخدام كاملة، الفرق فقط بمصير النتيجة: قائمة انتظار لا نشر فوري).
  function openScheduleDraft(hidden) {
    const updatedCourses = subjects.map((s) =>
      selectedIds.has(s.id) ? { ...s, hidden } : s
    );
    setScheduleDraft({ hidden, updatedCourses });
    setScheduleError("");
  }

  function cancelScheduleDraft() {
    setScheduleDraft(null);
    setSchedulePkg(null);
    setScheduleAt("");
    setScheduleDesc("");
    setScheduleError("");
  }

  async function confirmScheduleDraft() {
    setScheduleError("");
    if (!scheduleAt) {
      setScheduleError("اختر تاريخاً ووقتاً للتنفيذ أولاً");
      return;
    }
    const publishAt = new Date(scheduleAt);
    if (Number.isNaN(publishAt.getTime()) || publishAt.getTime() <= Date.now()) {
      setScheduleError("الموعد يجب أن يكون بالمستقبل");
      return;
    }
    const existingQueue = await fetchScheduledQueue();
    const pkg = buildScheduleEntry({
      existingQueue,
      publishAt: publishAt.toISOString(),
      description:
        scheduleDesc.trim() ||
        (scheduleDraft.hidden ? "إخفاء مواد محدَّدة (مجدوَل)" : "إظهار مواد محدَّدة (مجدوَل)"),
      courses: scheduleDraft.updatedCourses,
    });
    setSchedulePkg(pkg);
  }

  function handleSchedulePublishSuccess() {
    // ⚠️ لا refreshSubjects()/تنظيف localOverrides هنا خلافاً لـ
    // handleBulkPublishSuccess أدناه — هذا commit لقائمة الانتظار فقط، لا
    // يغيّر study-plan.json الفعلي إطلاقاً، فحالة القائمة المعروضة الآن
    // صحيحة تماماً كما هي، بلا حاجة أي تحديث.
    cancelScheduleDraft();
    clearSelection();
  }

  function handleBulkPublishSuccess() {
    // ⚠️ (2026-08-03، نفس مراجعة الإصلاح أعلاه): أي localOverrides قديمة
    // لمعرّفات نُشرت للتو يجب مسحها — وإلا معاينة محلية سابقة (toggleLocalHidden)
    // تطغى بصمت على حالة الخادم الحقيقية الجديدة بعد refreshSubjects أدناه.
    setLocalOverrides((prev) => {
      const next = { ...prev };
      for (const id of selectedIds) delete next[id];
      return next;
    });
    setBulkPkg(null);
    clearSelection();
    refreshSubjects();
  }

  function askDelete(id) {
    setDeleteState((prev) => ({ ...prev, [id]: "confirming" }));
  }

  function cancelDelete(id) {
    setDeleteState((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function confirmDelete(id) {
    setDeleteState((prev) => ({ ...prev, [id]: "building" }));
    const existingSubject = await fetchSubjectDetail(id);
    const pkg = buildSubjectDeletion(id, { existingSubject, existingStudyPlan: studyPlan });
    setDeleteState((prev) => ({ ...prev, [id]: pkg }));
  }

  if (loading) return <div className="text-text-muted">...جارِ التحميل</div>;
  if (error) return <div className="text-danger-text">{error}</div>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-h">لوحة التحكم</h1>
        <div className="flex items-center gap-2">
          <Link
            to="/admin/requests"
            className="relative rounded-md border border-border px-3 py-1.5 text-sm text-text hover:bg-bg-elevated"
          >
            طلبات الطلاب
            {Boolean(pendingCount) && (
              <span className="ms-1.5 rounded-full bg-danger-border px-1.5 py-0.5 text-[11px] font-medium text-white">
                {pendingCount}
              </span>
            )}
          </Link>
          <Link
            to="/admin/swaps"
            className="rounded-md border border-border px-3 py-1.5 text-sm text-text hover:bg-bg-elevated"
          >
            🔁 تبديل الفئات
          </Link>
          <Link
            to="/admin/events-log"
            className="rounded-md border border-border px-3 py-1.5 text-sm text-text hover:bg-bg-elevated"
          >
            سجل الأحداث
          </Link>
          <Link
            to="/admin/link-checker"
            className="rounded-md border border-border px-3 py-1.5 text-sm text-text hover:bg-bg-elevated"
          >
            🔍 فاحص الروابط
          </Link>
          <Link
            to="/admin/audit-log"
            className="rounded-md border border-border px-3 py-1.5 text-sm text-text hover:bg-bg-elevated"
          >
            📜 سجل التدقيق
          </Link>
          <Link
            to="/admin/scheduled-publishes"
            className="rounded-md border border-border px-3 py-1.5 text-sm text-text hover:bg-bg-elevated"
          >
            🕓 النشر المجدوَل
          </Link>
          <button
            type="button"
            onClick={handleFullBackup}
            disabled={backupStatus === "zipping"}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-text hover:bg-bg-elevated disabled:opacity-50"
          >
            {backupStatus === "zipping" ? "...جارِ التجهيز" : "⭳ نسخة احتياطية كاملة"}
          </button>
          <Link
            to="/admin/sections"
            className="rounded-md border border-border px-3 py-1.5 text-sm text-text hover:bg-bg-elevated"
          >
            إدارة الأقسام
          </Link>
          <Link
            to="/admin/subject"
            className="rounded-md bg-accent px-3 py-1.5 text-sm text-white hover:bg-accent-hover"
          >
            + إضافة مادة جديدة
          </Link>
        </div>
      </div>

      {backupError && <p className="text-sm text-danger-text">{backupError}</p>}

      {/* ⚠️ جديد (2026-08-02، اقتراح #9): إحصائيات بسيطة من subjects نفسها —
          بلا أي طلب شبكة إضافي. "آخر نشر" أُضيف لاحقاً بنفس الجلسة بعد تنفيذ
          #5 (useLastPublishDate — GitHub Commits API)، يختفي بصمت بلا توكن. */}
      {subjects.length > 0 && (
        <div className="flex flex-wrap gap-3 text-sm">
          <span className="rounded-md border border-border bg-bg-subtle px-3 py-1.5 text-text">
            📚 إجمالي المواد: <strong className="text-text-h">{subjects.length}</strong>
          </span>
          <span className="rounded-md border border-border bg-bg-subtle px-3 py-1.5 text-text">
            👁️ ظاهرة: <strong className="text-text-h">{subjects.filter((s) => !s.hidden).length}</strong>
          </span>
          <span className="rounded-md border border-border bg-bg-subtle px-3 py-1.5 text-text">
            🙈 مخفية: <strong className="text-text-h">{subjects.filter((s) => s.hidden).length}</strong>
          </span>
          {lastPublishDate && (
            <span className="rounded-md border border-border bg-bg-subtle px-3 py-1.5 text-text">
              🕓 آخر نشر:{" "}
              <strong className="text-text-h">
                {new Date(lastPublishDate).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" })}
              </strong>
            </span>
          )}
        </div>
      )}

      <div className="flex gap-1 border-b border-border">
        <button
          type="button"
          onClick={() => setTab(TABS.LIST)}
          className={`px-3 py-2 text-sm ${
            tab === TABS.LIST
              ? "border-b-2 border-accent font-medium text-text-h"
              : "text-text-muted hover:text-text"
          }`}
        >
          قائمة المواد
        </button>
        <button
          type="button"
          onClick={() => setTab(TABS.STUDY_PLAN)}
          className={`px-3 py-2 text-sm ${
            tab === TABS.STUDY_PLAN
              ? "border-b-2 border-accent font-medium text-text-h"
              : "text-text-muted hover:text-text"
          }`}
        >
          تحرير خطة المواد
        </button>
      </div>

      {tab === TABS.STUDY_PLAN && <StudyPlanEditor />}

      {tab === TABS.LIST && (
        <>
          {subjects.length === 0 && (
            <p className="text-sm text-text-muted">لا توجد مواد بعد.</p>
          )}

          {subjects.length > 0 && semesterOptions.length > 0 && (
            <div className="flex flex-col gap-2 rounded-md border border-border bg-bg-subtle p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-text-h">📅 تصفّح حسب الفصل الدراسي</p>
                {semesterFilter !== "all" && (
                  <span className="text-xs text-text-muted">
                    {filteredSubjects.length} من {subjects.length} مادة
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setSemesterFilter("all")}
                  className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                    semesterFilter === "all"
                      ? "border-accent bg-accent text-white"
                      : "border-border text-text hover:bg-bg-elevated"
                  }`}
                >
                  كل الفصول ({subjects.length})
                </button>
                {semesterOptions.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => setSemesterFilter(o.key)}
                    title={o.year ? `السنة ${o.year}` : undefined}
                    className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                      semesterFilter === o.key
                        ? "border-accent bg-accent text-white"
                        : "border-border text-text hover:bg-bg-elevated"
                    }`}
                  >
                    {o.label} ({semesterCounts.get(o.key)})
                  </button>
                ))}
              </div>
              {semesterFilter !== "all" && (
                <p className="text-xs text-text-muted">
                  القائمة أدناه تعرض هذا الفصل فقط: عدّل أي مادة بزر «تعديل»، أو حدّدها
                  جميعاً بـ «تحديد الكل» لإخفائها/إظهارها/جدولتها دفعة واحدة.
                </p>
              )}
            </div>
          )}

          {subjects.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث بالاسم أو الرمز أو الرقم..."
                className="min-w-[200px] flex-1 rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-text"
              />
              <div className="flex gap-1">
                {[
                  { key: "all", label: "الكل" },
                  { key: "visible", label: "ظاهر" },
                  { key: "hidden", label: "مخفي" },
                ].map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setVisibilityFilter(f.key)}
                    className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                      visibilityFilter === f.key
                        ? "border-accent bg-accent text-white"
                        : "border-border text-text hover:bg-bg-elevated"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ⚠️ جديد (اقتراح #4): شريط الإجراءات الجماعية — يظهر فقط لو فيه
              مادة واحدة محدَّدة على الأقل بالقائمة المعروضة حالياً. */}
          {filteredSubjects.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex items-center gap-1.5 text-text-muted">
                <input
                  type="checkbox"
                  checked={
                    filteredSubjects.length > 0 &&
                    filteredSubjects.every((s) => selectedIds.has(s.id))
                  }
                  onChange={() => toggleSelectAllFiltered(filteredSubjects.map((s) => s.id))}
                />
                تحديد الكل (بالقائمة الحالية)
              </label>
              {selectedIds.size > 0 && (
                <>
                  <span className="text-xs text-text-muted">{selectedIds.size} محدَّدة</span>
                  <button
                    type="button"
                    onClick={() => buildBulkVisibility(true)}
                    className="rounded-md border border-warning-border bg-warning-bg px-3 py-1.5 text-xs text-warning-text hover:opacity-90"
                  >
                    🙈 إخفاء المحدَّد
                  </button>
                  <button
                    type="button"
                    onClick={() => buildBulkVisibility(false)}
                    className="rounded-md border border-border bg-bg-subtle px-3 py-1.5 text-xs text-text hover:bg-bg-elevated"
                  >
                    👁️ إظهار المحدَّد
                  </button>
                  <button
                    type="button"
                    onClick={() => openScheduleDraft(true)}
                    className="rounded-md border border-border bg-bg-subtle px-3 py-1.5 text-xs text-text hover:bg-bg-elevated"
                    title="جدولة إخفاء المحدَّد لموعد لاحق بدل النشر الآن"
                  >
                    🕓 جدولة إخفاء لاحقاً
                  </button>
                  <button
                    type="button"
                    onClick={() => openScheduleDraft(false)}
                    className="rounded-md border border-border bg-bg-subtle px-3 py-1.5 text-xs text-text hover:bg-bg-elevated"
                    title="جدولة إظهار المحدَّد لموعد لاحق بدل النشر الآن"
                  >
                    🕓 جدولة إظهار لاحقاً
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="rounded-md border border-border px-3 py-1.5 text-xs text-text-muted hover:bg-bg-elevated"
                  >
                    إلغاء التحديد
                  </button>
                </>
              )}
            </div>
          )}

          {/* نموذج جدولة مضمَّن — منفصل تماماً عن bulkPkg (نشر فوري)، يظهر فقط
              بعد "🕓 جدولة ...لاحقاً". راجع docs/scheduled-publish.md. */}
          {scheduleDraft && (
            <div className="flex flex-col gap-2 rounded-md border border-accent bg-bg-subtle p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-text">
                  🕓 جدولة {scheduleDraft.hidden ? "إخفاء" : "إظهار"} {selectedIds.size} مادة محدَّدة
                </p>
                <button
                  type="button"
                  onClick={cancelScheduleDraft}
                  className="rounded-md border border-border px-3 py-1 text-xs text-text hover:bg-bg-elevated"
                >
                  إلغاء
                </button>
              </div>

              {!schedulePkg && (
                <>
                  <label className="flex flex-col gap-1 text-xs text-text">
                    موعد التنفيذ
                    <input
                      type="datetime-local"
                      value={scheduleAt}
                      onChange={(e) => setScheduleAt(e.target.value)}
                      className="rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-text"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-text">
                    وصف مختصر (اختياري، يظهر بقائمة "🕓 النشر المجدوَل")
                    <input
                      type="text"
                      value={scheduleDesc}
                      onChange={(e) => setScheduleDesc(e.target.value)}
                      placeholder="مثال: إظهار مواد الفصل الجديد"
                      className="rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-text"
                    />
                  </label>
                  {scheduleError && <p className="text-xs text-danger-text">{scheduleError}</p>}
                  <p className="text-xs text-text-muted">
                    ⚠️ التنفيذ الفعلي يحدث تلقائياً عبر GitHub Action كل ~15 دقيقة تقريباً — لا
                    ضمان دقة أعلى من هذا (قيد GitHub نفسه، لا هذا المشروع).
                  </p>
                  <button
                    type="button"
                    onClick={confirmScheduleDraft}
                    className="self-start rounded-md border border-accent bg-bg-elevated px-3 py-1.5 text-xs text-text-h hover:bg-bg"
                  >
                    متابعة — بناء الجدولة
                  </button>
                </>
              )}

              {schedulePkg && (
                <PublishPanel pkg={schedulePkg} onPublishSuccess={handleSchedulePublishSuccess} />
              )}
            </div>
          )}

          {/* حزمة النشر الجماعي — تظهر فوق القائمة (بمعزل عن أي صف/حذف فردي)
              فور بناء buildBulkVisibility، بلا تأثير على أي pkg حذف مفتوح. */}
          {bulkPkg && (
            <div className="flex flex-col gap-2 rounded-md border border-border bg-bg-subtle p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-text">
                  تحديث ظهور {selectedIds.size} مادة محدَّدة دفعة واحدة.
                </p>
                <button
                  type="button"
                  onClick={cancelBulk}
                  className="rounded-md border border-border px-3 py-1 text-xs text-text hover:bg-bg-elevated"
                >
                  إلغاء
                </button>
              </div>
              <PublishPanel pkg={bulkPkg} onPublishSuccess={handleBulkPublishSuccess} />
            </div>
          )}

          {subjects.length > 0 && filteredSubjects.length === 0 && (
            <p className="text-sm text-text-muted">لا توجد مواد مطابقة للبحث/الفلترة الحالية.</p>
          )}

          <ul className="flex flex-col gap-2">
            {filteredSubjects.map((s) => {
              const hiddenNow = localOverrides[s.id] ?? s.hidden;
              const del = deleteState[s.id];
              const confirming = del === "confirming";
              const building = del === "building";
              const pkg = del && typeof del === "object" ? del : null;

              return (
                <li
                  key={s.id}
                  className={`flex flex-col gap-2 rounded-lg border px-4 py-3 ${
                    del
                      ? "border-danger-border bg-danger-bg"
                      : hiddenNow
                      ? "border-warning-border bg-warning-bg"
                      : "border-border bg-bg-subtle"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {!del && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(s.id)}
                          onChange={() => toggleSelect(s.id)}
                          aria-label={`تحديد ${s.name}`}
                          className="shrink-0"
                        />
                      )}
                      <div>
                        <p className="font-medium text-text-h">
                          {s.name}{" "}
                          {hiddenNow && !del && (
                            <span className="ms-2 rounded-full bg-warning-border px-2 py-0.5 text-xs text-warning-text">
                              مخفي
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-text-muted">
                          {s.id} {s.code ? `· ${s.code}` : ""}
                          {semesterFilter === "all" && curriculumMap && (() => {
                            const k = semesterKeyOf(s.id);
                            const label =
                              k === "unlinked" ? "غير مرتبطة بالخطة" : k === "elective" ? "اختيارية" : `م${k}`;
                            return ` · ${label}`;
                          })()}
                        </p>
                      </div>
                    </div>

                    {!del && (
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/admin/subject/${s.id}`}
                          className="rounded-md border border-border px-3 py-1 text-xs text-text hover:bg-bg-elevated"
                        >
                          تعديل
                        </Link>
                        <button
                          type="button"
                          onClick={() => toggleLocalHidden(s.id)}
                          className="rounded-md border border-border px-3 py-1 text-xs text-text hover:bg-bg-elevated"
                        >
                          {hiddenNow ? "إظهار" : "إخفاء"}
                        </button>
                        <button
                          type="button"
                          onClick={() => askDelete(s.id)}
                          className="rounded-md border border-danger-border bg-danger-bg px-3 py-1 text-xs text-danger-text hover:opacity-80"
                        >
                          حذف
                        </button>
                      </div>
                    )}
                  </div>

                  {confirming && (
                    <div className="flex flex-wrap items-center gap-2 rounded-md border border-danger-border bg-bg p-3 text-sm">
                      <span className="text-danger-text">
                        ⚠️ هذا حذف نهائي: سيُزال subject.json وكل ملفات المحاضرات وكل PDF
                        المرتبطة بهذي المادة، ويُخرَج سطرها من قائمة المواد. لا رجعة عنه إلا
                        بإعادة رفع المحتوى من الصفر. متأكد؟
                      </span>
                      <div className="ms-auto flex gap-2">
                        <button
                          type="button"
                          onClick={() => confirmDelete(s.id)}
                          className="rounded-md bg-danger-border px-3 py-1 text-xs font-medium text-white hover:opacity-90"
                        >
                          نعم، احذف نهائياً
                        </button>
                        <button
                          type="button"
                          onClick={() => cancelDelete(s.id)}
                          className="rounded-md border border-border px-3 py-1 text-xs text-text hover:bg-bg-elevated"
                        >
                          إلغاء
                        </button>
                      </div>
                    </div>
                  )}

                  {building && (
                    <p className="text-xs text-text-muted">...جارِ تجهيز الحذف</p>
                  )}

                  {pkg && (
                    <div className="flex flex-col gap-2 rounded-md border border-border bg-bg p-3">
                      <button
                        type="button"
                        onClick={() => cancelDelete(s.id)}
                        className="self-start rounded-md border border-border px-3 py-1 text-xs text-text hover:bg-bg-elevated"
                      >
                        إلغاء الحذف وإغلاق
                      </button>
                      {/* ⚠️ إصلاح (2026-08-03، مراجعة مستقلة للمدير): onPublishSuccess
                          لم تكن مُمرَّرة هنا إطلاقاً — بعد حذف ناجح فعلياً على GitHub،
                          كانت الواجهة تبقى عالقة بحالة "pkg" هذي للأبد (تعرض PublishPanel
                          بلا داعٍ لمادة محذوفة فعلاً بالفعل)، والقائمة لا تُحدَّث لتُسقِط
                          المادة المحذوفة إلا بتحديث يدوي للصفحة. */}
                      <PublishPanel
                        pkg={pkg}
                        onPublishSuccess={() => {
                          cancelDelete(s.id);
                          refreshSubjects();
                        }}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {Object.keys(localOverrides).length > 0 && (
            <p className="text-xs text-text-muted">
              ⚠️ تغييرات الإخفاء أعلاه محلية بالمتصفح فقط للمعاينة (الموقع Static بلا خادم) —
              افتح "تعديل" على كل مادة وانشر التغيير فعلياً عبر لوحة النشر ليتم حفظه.
            </p>
          )}
        </>
      )}
    </div>
  );
}
