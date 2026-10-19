import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// base = اسم الريبو بالضبط (GitHub Pages يخدم الموقع تحت /swap-matcher/).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/swap-matcher0/",
});
