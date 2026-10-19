import React from "react";
import { Routes, Route, Link } from "react-router-dom";
import AdminAuthGate from "./components/admin/AdminAuthGate.jsx";
import SwapRequestPage from "./pages/SwapRequestPage.jsx";
import AdminSwaps from "./pages/Admin/AdminSwaps.jsx";

// الطالب:  <الموقع>/#/       ← المادة المفتوحة + نموذج الطلب فقط
// الأدمن:  <الموقع>/#/admin  ← يتطلب توكن GitHub صالحاً (AdminAuthGate)
export default function App() {
  return (
    <div className="min-h-screen bg-bg text-text" dir="rtl">
      <header className="border-b border-border bg-bg-subtle px-4 py-3">
        <Link to="/" className="text-lg font-bold text-text-h">
          🔁 تبديل الفئات
        </Link>
      </header>
      <main className="p-4 md:p-6">
        <Routes>
          <Route path="/" element={<SwapRequestPage />} />
          <Route
            path="/admin"
            element={
              <AdminAuthGate>
                <AdminSwaps />
              </AdminAuthGate>
            }
          />
          <Route path="*" element={<p className="p-10 text-center text-text-muted">الصفحة غير موجودة</p>} />
        </Routes>
      </main>
    </div>
  );
}
