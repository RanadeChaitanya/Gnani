import React from "react";
import ReactDOM from "react-dom/client";
import { useState } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import IncomingCall from "./components/IncomingCall";
import { getProfile, useIncomingCall } from "./lib/profile";
import { NoteIcon, WaveIcon } from "./components/icons";
import { setLang, useT } from "./lib/i18n";
import Home from "./pages/Home";
import Notes from "./pages/Notes";
import NoteDetail from "./pages/NoteDetail";
import Privacy from "./pages/Privacy";
import RoomPage from "./pages/Room";
import Join from "./pages/Join";
import "./styles.css";

function App() {
  const { t, lang } = useT();
  const [profile, setProfile] = useState(getProfile);
  const [ring, clearRing] = useIncomingCall(profile);
  const inCall = useLocation().pathname.startsWith("/room/");
  return (
    <div className="app">
      <header className="top">
        <Link to="/" className="brand"><span className="logo"><WaveIcon size={16} /></span>Saar</Link>
        <Link to="/notes" className="btn icon-btn" aria-label={t("notes")}><NoteIcon size={20} /></Link>
        <button className="icon-btn small" onClick={() => setLang(lang === "en" ? "hi" : "en")} aria-label="Switch language">
          {lang === "en" ? "हिं" : "EN"}
        </button>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Home onProfile={setProfile} />} />
          <Route path="/join/:code" element={<Join />} />
          <Route path="/room/:code" element={<RoomPage />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/notes/:id" element={<NoteDetail />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
      {ring && profile && !inCall && <IncomingCall ring={ring} profile={profile} onDone={clearRing} />}
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
