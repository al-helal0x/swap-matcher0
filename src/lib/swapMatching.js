// 🔁 «مُطابِق تبديل الفئات» — منطق نقي (بلا شبكة/React). يستورده الموقع والـ Action معاً
// (نفس المصدر لقواعد الفئات المطلوبة، فلا يختلف تحقق الواجهة عن تحقق المعالج).
//
// أنماط الطلب:
//   any     = أقبل أي فئة غير فئتي
//   earlier = أقبل أي فئة قبل فئتي (رقمها أصغر)
//   custom  = فئات أحددها بنفسي (واحدة أو أكثر)
//   agreed  = اتفقت مع طالب آخر على التبديل (فئة واحدة = فئة الطالب الآخر + بياناته)
//
// الأسبقية: ترتيب الطلبات حسب createdAt (وقت فتح الـ PR على GitHub، يضعه
// الـ Action لا الطالب — لا يمكن تزويره). الأقدم له الحق الأول دائماً.

export const SLOT_COUNT = { theory: 4, lab: 8 };
export const MAX_ENTRIES = 12; // أقصى عدد مواد/محاضرات بطلب واحد
export const SECTION_NAMES = { theory: "نظري", lab: "عملي" };
export const MODES = ["any", "earlier", "custom", "agreed"];
export const MODE_LABELS = {
  any: "يقبل أي فئة",
  earlier: "يقبل أي فئة قبل فئته",
  custom: "فئات محددة",
  agreed: "اتفاق مع طالب آخر",
};

/** الفئات المطلوبة لنمط معيّن. custom/agreed يأتيان من اختيار الطالب (chosen). */
export function resolveTargets(mode, from, section, chosen = []) {
  const all = Array.from({ length: SLOT_COUNT[section] || 0 }, (_, i) => i + 1);
  if (mode === "any") return all.filter((n) => n !== from);
  if (mode === "earlier") return all.filter((n) => n < from);
  return [...new Set(chosen.map(Number))].filter((n) => all.includes(n) && n !== from).sort((a, b) => a - b);
}

/** يوحّد الشكل القديم (toSlot واحدة) والجديد (toSlots + mode + partner). */
export function normalizeRequest(r) {
  const toSlots = Array.isArray(r.toSlots) ? r.toSlots.map(Number) : r.toSlot != null ? [Number(r.toSlot)] : [];
  return { ...r, fromSlot: Number(r.fromSlot), toSlots, mode: r.mode || "custom", partner: r.partner || null };
}

export function sortByPriority(requests) {
  return [...requests].sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt) || a.id.localeCompare(b.id)
  );
}

/**
 * requests: طلبات نفس المادة + نفس النوع، مُطبَّعة، وبدون طلبات "اتفاق" (لها مسارها الخاص).
 * a يقبل أخذ مكان b إذا كانت فئة b الحالية ضمن فئات a المطلوبة.
 * تبديل ثنائي: كلٌّ يقبل مكان الآخر. دورة ثلاثية: a يقبل مكان b، وb مكان c، وc مكان a.
 * يبدأ دائماً بأقدم طلب (ثنائي ثم ثلاثي له) ويختار أقدم شريك متاح → احترام الأسبقية.
 * يرجع مجموعات مرتّبة بحيث ينتقل العضو i إلى فئة العضو (i+1) الحالية.
 */
export function findMatches(requests) {
  const sorted = sortByPriority(requests);
  const used = new Set();
  const free = (r) => !used.has(r.id);
  const wants = (a, b) => a.toSlots.includes(b.fromSlot);
  const distinct = (...rs) => new Set(rs.map((r) => r.studentId)).size === rs.length;
  const matches = [];
  const take = (group) => {
    group.forEach((r) => used.add(r.id));
    matches.push(group);
  };

  // نمرّ على الطلبات من الأقدم؛ لكل طلب نجرّب تبديلاً ثنائياً أولاً ثم دورة ثلاثية.
  // (لا نكمل كل الثنائيات قبل الثلاثيات: ذلك قد يحرم الأقدم من دورة تشمله.)
  for (const a of sorted) {
    if (!free(a)) continue;

    const pair = sorted.find((r) => free(r) && r.id !== a.id && distinct(a, r) && wants(a, r) && wants(r, a));
    if (pair) {
      take([a, pair]);
      continue;
    }

    for (const b of sorted) {
      if (!free(b) || b.id === a.id || !distinct(a, b) || !wants(a, b)) continue;
      const c = sorted.find(
        (r) => free(r) && r.id !== a.id && r.id !== b.id && distinct(a, b, r) && wants(b, r) && wants(r, a)
      );
      if (c) {
        take([a, b, c]);
        break;
      }
    }
  }
  return matches;
}

/** حالة اتفاق طالبين: confirmed = كلاهما قدّم طلب اتفاق متطابق، awaiting = لم يؤكد الآخر بعد، conflict = تعارض. */
function agreedStatus(a, agreedList) {
  const b = agreedList.find((x) => x.id !== a.id && x.studentId === a.partner.studentId);
  if (!b) return { status: "awaiting", with: null };
  const namesMe = b.partner?.studentId === a.studentId;
  const slotsMatch = b.fromSlot === a.toSlots[0] && a.fromSlot === b.toSlots[0];
  return { status: namesMe && slotsMatch ? "confirmed" : "conflict", with: b };
}

/**
 * يجمّع الطلبات بحسب (المادة، النوع) ويحسب لكل طلب:
 *  - order: ترتيب أسبقيته داخل المجموعة (1 = الأقدم)
 *  - ranks: { فئة: ترتيبه بين الراغبين بها } (للطلبات غير "الاتفاق")
 *  - match: { movesTo, others[] } لو وُجد تطابق ممكن
 *  - agreed: { status, with } لطلبات الاتفاق
 */
export function buildGroups(rawRequests) {
  const byKey = new Map();
  for (const raw of rawRequests) {
    const r = normalizeRequest(raw);
    const key = `${r.subjectId}::${r.section}`;
    if (!byKey.has(key)) {
      byKey.set(key, { key, subjectId: r.subjectId, subjectName: r.subjectName, section: r.section, items: [] });
    }
    byKey.get(key).items.push(r);
  }

  const groups = [];
  for (const g of byKey.values()) {
    const sorted = sortByPriority(g.items);
    const open = sorted.filter((r) => r.mode !== "agreed");
    const agreedList = sorted.filter((r) => r.mode === "agreed");
    const matches = findMatches(open);

    const matchOf = new Map();
    for (const m of matches) {
      const info = m.map((r, i) => ({ r, movesTo: m[(i + 1) % m.length].fromSlot }));
      for (const { r, movesTo } of info) {
        matchOf.set(r.id, {
          movesTo,
          others: info
            .filter((x) => x.r.id !== r.id)
            .map((x) => ({ id: x.r.id, studentName: x.r.studentName, studentId: x.r.studentId, fromSlot: x.r.fromSlot, movesTo: x.movesTo })),
        });
      }
    }

    const perSlot = new Map();
    const items = sorted.map((r, i) => {
      let ranks = null;
      let agreed = null;
      if (r.mode === "agreed") {
        agreed = agreedStatus(r, agreedList);
      } else {
        ranks = {};
        for (const s of r.toSlots) {
          const n = (perSlot.get(s) || 0) + 1;
          perSlot.set(s, n);
          ranks[s] = n;
        }
      }
      return { ...r, order: i + 1, ranks, agreed, match: matchOf.get(r.id) || null };
    });
    const agreedConfirmed = items.filter((r) => r.agreed?.status === "confirmed").length / 2;
    groups.push({ ...g, items, matchCount: matches.length, agreedConfirmed });
  }
  const sectionOrder = { theory: 0, lab: 1 }; // النظري قبل العملي
  return groups.sort((a, b) => a.subjectName.localeCompare(b.subjectName, "ar") || sectionOrder[a.section] - sectionOrder[b.section]);
}

// ─── حالة الطلب وحركة الفئات (للعرض والتصدير) ───────────────────────────────

/** حالة الطلب بعد buildGroups: match | agreed-confirmed | agreed-awaiting | agreed-conflict | waiting */
export function requestStatus(r) {
  if (r.agreed) return `agreed-${r.agreed.status}`;
  return r.match ? "match" : "waiting";
}

export const STATUS_LABELS = {
  match: "تطابق ممكن",
  "agreed-confirmed": "اتفاق مؤكد",
  "agreed-awaiting": "اتفاق بانتظار التأكيد",
  "agreed-conflict": "اتفاق متعارض",
  waiting: "بانتظار شريك",
};

/** لكل فئة: كم طالباً يريد الخروج منها وكم يريد الدخول إليها (طلبات "الاتفاق" مستثناة: تبادل ثنائي لا يغيّر الأعداد). */
export function slotMovement(items, section) {
  const open = items.filter((r) => r.mode !== "agreed");
  return Array.from({ length: SLOT_COUNT[section] || 0 }, (_, i) => {
    const slot = i + 1;
    return {
      slot,
      leaving: open.filter((r) => r.fromSlot === slot).length,
      entering: open.filter((r) => r.toSlots.includes(slot)).length,
    };
  });
}
