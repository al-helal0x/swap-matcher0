import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";

// HashRouter عمداً: GitHub Pages لا يدعم المسارات العميقة (تحديث صفحة /admin يعطي 404)،
// أما الروابط بصيغة #/admin فتعمل دائماً.
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
