import React from "react";
import { useSwapSettings } from "../hooks/useSwapSettings.js";
import SwapRequestForm from "../components/swap/SwapRequestForm.jsx";

// 🔁 «مُطابِق تبديل الفئات» — صفحة الطالب: المواد المفتوحة + حقول الإدخال فقط.
// المواد يعيّنها الأدمن من /admin/swaps (مادة أو أكثر أو فصل كامل).
// الطالب يقدّم طلباً واحداً لمادة أو أكثر (يضيف بنداً لكل مادة).
export default function SwapRequestPage() {
  const { settings, loading } = useSwapSettings();

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <h1 className="text-xl font-bold text-text-h">🔁 طلب تبديل فئة</h1>
      {loading && <p className="text-text-muted">...جارِ التحميل</p>}
      {!loading && !settings && (
        <p className="rounded-md border border-border bg-bg-subtle px-4 py-3 text-sm text-text-muted">
          لا يتم استقبال طلبات تبديل الفئات حالياً.
        </p>
      )}
      {settings && <SwapRequestForm subjects={settings.openSubjects} />}
    </div>
  );
}
