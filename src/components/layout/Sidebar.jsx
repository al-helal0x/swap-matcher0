import React from "react";
import { NavLink } from "react-router-dom";
import FavoritesSection from "./FavoritesSection.jsx";
import RecentlyViewedSection from "./RecentlyViewedSection.jsx";
import ContactSection from "./ContactSection.jsx";

// ⚠️ ملف مملوك للمدير — لا يُعدَّل من قبل أي عضو.
//
// ⚠️ تحديث إداري (خطة الدفعة 4، المهمة 1): حُذف رابط "لوحة التحكم" نهائياً —
// الوصول لـ /admin الآن فقط لمن يعرف الرابط المباشر ويملك توكن صالح
// (AdminAuthGate بـ App.jsx). لا تُعده لاحقاً بدون قرار إداري صريح.
//
// ⚠️ تحديث إداري (طلب لاحق): الشريط الجانبي كان hidden بالكامل على الجوال
// بلا أي طريقة وصول (hidden md:block) — صار الآن قائمة منسدلة من الجانب
// (drawer) يتحكم بها زر هامبرجر بـ Header.jsx عبر props مُمرَّرة من App.jsx.
// على الشاشات الكبيرة (md+) يبقى ظاهراً دائماً كما كان تماماً، بلا أي تغيير
// بالسلوك أو المظهر هناك.
//
// ⚠️ تحديث إداري (طلب لاحق): قسم "تواصل مع المشرفين" (ContactSection.jsx)
// مثبَّت الآن أسفل القائمة دائماً بلا تمرير معه — النافبار + المفضلة + آخر
// الزيارات صارت بمنطقة قابلة للتمرير المستقل (flex-1 overflow-y-auto) فوقه،
// بحيث القسم السفلي يبقى ظاهراً دائماً حتى لو طالت قائمة "آخر الزيارات".
//
// ⚠️ تحديث إداري (2026-07-30، مهمة "تصفح بدون إنترنت"): رابط دائم جديد
// "📥 المواد بدون إنترنت" (/offline) بـ NAV_ITEMS — ثابت دائماً (بخلاف
// FavoritesSection/RecentlyViewedSection الشرطيَّين) لأنه صفحة ميزة أساسية
// لا تخصيص شخصي، تعرض حالتها الفارغة بنفسها لو ما فيه ملفات محمّلة بعد.

const NAV_ITEMS = [
  { to: "/", label: "المواد", end: true },
  { to: "/study-plan", label: "الخطة الدراسية" },
  { to: "/swaps", label: "🔁 تبديل الفئات" },
  { to: "/offline", label: "📥 المواد بدون إنترنت" },
];

export default function Sidebar({ open = false, onClose }) {
  return (
    <>
      {/* خلفية داكنة تظهر فقط على الجوال لما القائمة مفتوحة — الضغط عليها يغلقها */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-64 shrink-0 flex-col
          border-l border-border bg-bg-subtle p-4 transition-transform
          duration-200 ease-out
          md:static md:z-auto md:w-56 md:translate-x-0 md:transition-none
          ${open ? "translate-x-0" : "translate-x-full md:translate-x-0"}`}
      >
        <div className="mb-6 flex items-center justify-between">
          <span className="text-lg font-bold text-text-h">assistant404</span>
          {/* زر إغلاق يظهر فقط على الجوال (بالشاشات الكبيرة القائمة ثابتة دائماً) */}
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text md:hidden"
            aria-label="إغلاق القائمة"
          >
            ✕
          </button>
        </div>

        {/* منطقة قابلة للتمرير المستقل — كل شي غير قسم التواصل السفلي */}
        <div className="flex-1 overflow-y-auto">
          <nav className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onClose}
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? "bg-accent text-white"
                      : "text-text hover:bg-bg-elevated"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <FavoritesSection />
          <RecentlyViewedSection />
        </div>

        {/* مثبَّت دائماً أسفل القائمة، لا يتحرك مع التمرير أعلاه */}
        <ContactSection />
      </aside>
    </>
  );
}
