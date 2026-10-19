# swap-matcher — تبديل الفئات

- **الطالب:** `https://al-helal0x.github.io/swap-matcher/` — المادة المفتوحة + نموذج الطلب.
- **الأدمن:** `https://al-helal0x.github.io/swap-matcher/#/admin` — تعيين المواد المفتوحة (مادة أو أكثر أو فصل كامل)، وعرض كل الطلبات بوقت الإرسال الدقيق.

## الإعداد (مرة واحدة)
1. Settings ← Pages ← Source = **GitHub Actions**.
2. Settings ← Actions ← General ← Workflow permissions = **Read and write permissions**.
3. Settings ← Secrets and variables ← Actions ← Secret باسم `VITE_UPLOAD_TOKEN`
   (توكن fine-grained على هذا الريبو فقط: Contents = Read and write، Pull requests = Read and write).
4. شغّل **Deploy to GitHub Pages** من تبويب Actions.

دخول الأدمن بتوكن آخر (Contents = Read and write، Pull requests = Read) — لا تستخدم توكن الطلبات.
"# swap-matcher0" 
