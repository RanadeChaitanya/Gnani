// Saar live demo, 1920x1080. Real screen recordings inside device frames, with animated technical overlays.
const TL = CFG.timeline,
  SC = Object.fromEntries(TL.map((s) => [s.k, s])),
  NF = CFG.nframes;
const $ = (id) => document.getElementById(id),
  NS = "http://www.w3.org/2000/svg";
const clamp = (x) => Math.max(0, Math.min(1, x)),
  L = (a, b, p) => a + (b - a) * p,
  seg = (t, a, d) => clamp((t - a) / d),
  eio = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  eo = (x) => 1 - Math.pow(1 - x, 3);
const ent = (t, a, d = 0.5) => eio(seg(t, a, d));
const on = (el, v, dy = 24) => {
  el.style.opacity = v;
  el.style.transform = `translateY(${(1 - v) * dy}px)`;
  el.style.visibility = v > 0.002 ? "visible" : "hidden";
};
// ---------- devices ----------
function phoneEl(id, label) {
  const d = document.createElement("div");
  d.className = "phone";
  d.id = id;
  d.innerHTML = `<div class=screen><img></div><div class=notch></div><div class=plabel>${label}</div>`;
  $("stage").appendChild(d);
  return d;
}
const PJ = phoneEl("pj", "Jugaadu Lal · shop owner"),
  PG = phoneEl("pg", "Gupta ji · distributor"),
  PR = phoneEl("pr", "Jugaadu Lal · phone");
const LAP = document.createElement("div");
LAP.className = "laptop";
LAP.innerHTML = "<div class=lscreen><img></div><div class=lbase></div>";
$("stage").appendChild(LAP);
async function frame(el, cam, src) {
  const img = el.querySelector("img"),
    n = Math.max(1, Math.min(NF[cam], Math.round(src * 30) + 1)),
    f = `fr/${cam}/${String(n).padStart(5, "0")}.jpg`;
  if (img.dataset.f !== f) {
    img.dataset.f = f;
    img.src = f;
    await img.decode().catch(() => {});
  }
}
function place(el, x, y, s, v, rot = 0) {
  el.style.transform = `translate(${x}px,${y}px) scale(${s}) rotate(${rot}deg)`;
  el.style.opacity = v;
  el.style.visibility = v > 0.002 ? "visible" : "hidden";
}
// ---------- architecture diagram ----------
const ARCH = [
  ["mic", "Phone mic", "own voice only", 0],
  ["wk", "AudioWorklet", "16 kHz PCM · 1,024 B / 32 ms", 1],
  ["ws", "WebSocket", "binary frames, real time", 2],
  ["api", "FastAPI proxy", "API key stays server-side", 3],
  ["pr", "Gnani Prisma v3.0", "indic-auto · VAD · partials", 4],
  ["hub", "Room hub", "reorder · echo dedupe", 5],
  ["end", "Call ends", "transcript, ordered", 0],
  ["llm", "LLM + JSON schema", "structured note", 1],
  ["calc", "Totals in code", "no model arithmetic", 2],
  ["fc", "Faithfulness check", "numbers vs transcript", 3],
  ["ok", "Both confirm", "or correct", 4],
  ["db", "IndexedDB · Records", "Excel · WhatsApp", 5],
];
const svgA = $("archsvg");
ARCH.forEach(([id, a, b, i], k) => {
  const row = k < 6 ? 0 : 1,
    x = 70 + i * 300,
    y = row ? 640 : 330;
  const g = document.createElementNS(NS, "g");
  g.id = "n_" + id;
  g.innerHTML = `<rect x=${x} y=${y} width=250 height=120 rx=14 class=node /><text x=${x + 20} y=${y + 50} class=nt>${a}</text><text x=${x + 20} y=${y + 86} class=ns>${b}</text>`;
  svgA.appendChild(g);
  if (i < 5) {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", `M${x + 250} ${y + 60}H${x + 300}`);
    p.setAttribute("class", "link");
    p.id = "l_" + id;
    svgA.appendChild(p);
  }
});
const down = document.createElementNS(NS, "path");
down.setAttribute("d", "M1645 450V520H195V640");
down.setAttribute("class", "link");
down.id = "l_down";
svgA.appendChild(down);
const dots = [...Array(10)].map(() => {
  const c = document.createElementNS(NS, "circle");
  c.setAttribute("r", 7);
  c.setAttribute("class", "dot");
  svgA.appendChild(c);
  return c;
});
// ---------- timeline ----------
async function renderAt(t) {
  const S = (k) => SC[k].s,
    E = (k) => SC[k].s + SC[k].d,
    inS = (k) => t >= S(k) - 0.6 && t < E(k) + 0.6,
    P = (k) => clamp((t - S(k)) / SC[k].d);
  // background drifts slowly; a thin progress line along the bottom
  $("bgglow").style.transform = `translate(${Math.sin(t * 0.07) * 120}px,${Math.cos(t * 0.05) * 80}px)`;
  $("prog").style.width = `${(t / E("close")) * 100}%`;
  // scene label (top-left), one at a time
  const LBL = {
    problem: "01 · The problem",
    arch: "02 · Architecture",
    dial: "03 · Call by number",
    live: "04 · Live, multilingual transcription",
    note: "05 · Structured note",
    prisma: "06 · Gnani Prisma",
    records: "07 · Distributor records",
    future: "08 · Roadmap · concept",
    close: "",
  };
  let cur = "";
  for (const s of TL) if (t >= s.s) cur = s.k;
  $("lbl").textContent = LBL[cur] || "";
  on($("lbl"), cur in LBL && LBL[cur] ? ent(t, S(cur) + 0.1, 0.4) * (1 - seg(t, E(cur) - 0.35, 0.3)) : 0, 0);
  // title
  const ti = ent(t, 0.2, 0.8) * (1 - ent(t, E("title") - 0.5, 0.5));
  on($("title"), ti);
  [...document.querySelectorAll("#title .chip")].forEach((c, i) => on(c, ent(t, 1.4 + i * 0.35, 0.4)));
  // problem
  const pv = inS("problem") ? ent(t, S("problem"), 0.5) * (1 - ent(t, E("problem") - 0.5, 0.5)) : 0;
  on($("problem"), pv);
  [...document.querySelectorAll("#problem .pl")].forEach((c, i) =>
    on(c, ent(t, S("problem") + 0.3 + i * 2.1, 0.5), 30),
  );
  on($("parrow"), ent(t, S("problem") + 7.4, 0.5), 0);
  on($("presult"), ent(t, S("problem") + 7.9, 0.5));
  // architecture: nodes appear in order of the narration, packets flow
  const av = inS("arch") ? ent(t, S("arch"), 0.5) * (1 - ent(t, E("arch") - 0.5, 0.5)) : 0;
  on($("arch"), av, 0);
  const ap = P("arch");
  ARCH.forEach(([id], k) => {
    const at = k < 6 ? 0.04 + k * 0.075 : 0.62 + (k - 6) * 0.06,
      v = ent(t, S("arch") + at * SC.arch.d, 0.4);
    const g = $("n_" + id);
    g.style.opacity = v;
    g.setAttribute("transform", `translate(0 ${(1 - v) * 20})`);
    const l = $("l_" + id);
    if (l) l.style.opacity = v;
  });
  $("l_down").style.opacity = ent(t, S("arch") + 0.6 * SC.arch.d, 0.4);
  dots.forEach((d, i) => {
    const q = (t * 0.35 + i / 10) % 1,
      row = i % 2;
    const x = row ? L(195, 1700, q) : L(195, 1700, q),
      y = row ? 700 : 390;
    d.setAttribute("cx", x);
    d.setAttribute("cy", y);
    d.style.opacity = av * (row ? ent(t, S("arch") + 0.65 * SC.arch.d, 0.4) : 1) * 0.9;
  });
  // phones: dial → live → note
  const ph = ["dial", "live", "note"].some(inS),
    pin = ph ? ent(t, S("dial") - 0.2, 0.7) * (1 - ent(t, E("note") - 0.4, 0.5)) : 0;
  const MAP = { dial: [0.8, 11.0], live: [11.0, 46.0], note: [46.4, 60.4] };
  let src = 0;
  for (const k of ["dial", "live", "note"]) if (t >= S(k)) src = L(MAP[k][0], MAP[k][1], P(k));
  const sway = Math.sin(t * 0.6) * 1.2;
  place(PJ, 420, 70, 0.98, pin, -1.5 + sway * 0.3);
  place(PG, 1080, 70, 0.98, pin, 1.5 - sway * 0.3);
  if (pin > 0) {
    await Promise.all([frame(PJ, "J", src), frame(PG, "G", src + (t >= S("live") ? 0.0 : 0))]);
  }
  on($("speed"), inS("live") ? ent(t, S("live") + 0.3, 0.3) * (1 - seg(t, E("live") - 0.3, 0.3)) : 0, 0);
  const callouts = [
    ["c1", "dial", 0.25],
    ["c2", "dial", 0.55],
    ["c3", "dial", 0.78],
    ["c4", "live", 0.12],
    ["c5", "live", 0.38],
    ["c6", "live", 0.58],
    ["c7", "live", 0.8],
    ["c8", "note", 0.12],
    ["c9", "note", 0.36],
    ["c10", "note", 0.58],
    ["c11", "note", 0.82],
  ];
  callouts.forEach(([id, k, f]) => {
    const a = S(k) + f * SC[k].d,
      v = inS(k) ? ent(t, a, 0.4) * (1 - ent(t, E(k) - 0.4, 0.4)) : 0;
    on($(id), v, 0);
    $(id).style.transform += ` scale(${L(0.9, 1, v)})`;
  });
  // packet log: what the WebSocket actually carries
  const lg = inS("live") ? ent(t, S("live") + 0.5, 0.4) * (1 - ent(t, E("live") - 0.4, 0.4)) : 0;
  on($("log"), lg, 0);
  [...document.querySelectorAll("#log .ln")].forEach(
    (l, i) => (l.style.opacity = seg(t, S("live") + 1 + i * 2.2, 0.3)),
  );
  // Prisma spotlight
  const pz = inS("prisma") ? ent(t, S("prisma"), 0.5) * (1 - ent(t, E("prisma") - 0.5, 0.5)) : 0;
  on($("prisma"), pz);
  [...document.querySelectorAll("#prisma .fact")].forEach((f, i) =>
    on(f, ent(t, S("prisma") + 0.6 + i * 3.2, 0.5), 20),
  );
  const bars = [...document.querySelectorAll("#pwave rect")];
  bars.forEach((b, i) => {
    const h = 20 + 120 * Math.abs(Math.sin(t * (2.2 + (i % 5) * 0.3) + i * 0.7)) * pz;
    b.setAttribute("height", h);
    b.setAttribute("y", 160 - h / 2);
  });
  // laptop + phone records
  const rv = inS("records") ? ent(t, S("records") - 0.1, 0.6) * (1 - ent(t, E("records") - 0.5, 0.5)) : 0;
  place(LAP, 560, 110, 0.95, rv, 0);
  place(PR, 70, 70, 0.86, rv, -2);
  if (rv > 0) {
    await Promise.all([frame(LAP, "L", L(0.3, 19.4, P("records"))), frame(PR, "J", L(64.6, 77.4, P("records")))]);
  }
  ["r1", "r2", "r3"].forEach((id, i) => {
    const a = S("records") + [0.2, 0.45, 0.72][i] * SC.records.d;
    on($(id), inS("records") ? ent(t, a, 0.4) * (1 - ent(t, E("records") - 0.4, 0.4)) : 0, 0);
  });
  // concept: native call integration
  const fv = inS("future") ? ent(t, S("future"), 0.5) * (1 - ent(t, E("future") - 0.5, 0.5)) : 0;
  on($("future"), fv, 0);
  const fp = P("future");
  [...document.querySelectorAll("#future .fn")].forEach((n, i) => {
    n.style.opacity = ent(t, S("future") + 0.4 + i * 1.6, 0.4);
  });
  const ring = document.querySelectorAll("#future .ring");
  ring.forEach((r, i) => {
    const q = (t * 0.8 + i / 3) % 1;
    r.setAttribute("r", 40 + q * 70);
    r.style.opacity = (1 - q) * fv;
  });
  const fdots = document.querySelectorAll("#future .fdot");
  fdots.forEach((d, i) => {
    const q = (t * 0.45 + i / 6) % 1;
    d.setAttribute("cx", L(330, 1600, q));
    d.style.opacity = fv * ent(t, S("future") + 3, 0.5);
  });
  // close
  const cv = t >= S("close") - 0.4 ? ent(t, S("close") - 0.3, 0.7) : 0;
  on($("close"), cv);
  [...document.querySelectorAll("#close .cl")].forEach((c, i) => on(c, ent(t, S("close") + 0.6 + i * 1.3, 0.5)));
}
