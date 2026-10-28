import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Link, Navigate, Route, Routes, useParams } from "react-router-dom";
import { setLang, useT } from "./lib/i18n";
import Home from "./pages/Home";
import Notes from "./pages/Notes";
import NoteDetail from "./pages/NoteDetail";
import Privacy from "./pages/Privacy";
import RoomPage from "./pages/Room";
import Enter from "./pages/Enter";
import "./styles.css";

function JoinRedirect() {
  const { code = "" } = useParams();
  return <Navigate to={`/setup?mode=join&code=${code.toUpperCase()}`} replace />;
}

function App() {
  const { t, lang } = useT();
  return (
    <div className="app">
      <header className="top">
        <Link to="/" className="brand">Saar · सार</Link>
        <Link to="/notes" className="btn small">{t("notes")}</Link>
        <button className="small" onClick={() => setLang(lang === "en" ? "hi" : "en")} aria-label="Switch language">
          {lang === "en" ? "हिं" : "EN"}
        </button>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/setup" element={<Enter />} />
          <Route path="/join/:code" element={<JoinRedirect />} />
          <Route path="/room/:code" element={<RoomPage />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/notes/:id" element={<NoteDetail />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
