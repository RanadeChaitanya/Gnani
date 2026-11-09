// Saar v12: a fresh film in a flat, faceted, full-body character style. Same narration, cue for cue.
const C = CFG.cues,
  c = (i) => C[i][0],
  e_ = (i) => C[i][1],
  sv = document.getElementById("sv"),
  NS = "http://www.w3.org/2000/svg";
const BG = "#E4F1F6",
  SHD = "#C4DAD8",
  CORAL = "#EE5D5B",
  PINK = "#F2818F",
  TEAL = "#2BAE9A",
  DTEAL = "#1E7F71",
  CREAM = "#F6ECDD",
  CR2 = "#E6D5BE",
  SKIN = "#F3AE84",
  SK2 = "#D98B62",
  MAROON = "#6A2435",
  NAVY = "#2F3A56",
  NAVY2 = "#232C43",
  MUST = "#E9B24C",
  MUST2 = "#C9922F",
  SLATE = "#5D6E8C",
  WH = "#FFFFFF",
  GREY = "#9AA3A8",
  INK = "#2B2F3A",
  SAND = "#E9D3B4";
const clamp = (x) => Math.max(0, Math.min(1, x)),
  L = (a, b, p) => a + (b - a) * p,
  seg = (t, a, d) => clamp((t - a) / d),
  eio = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  eo = (x) => 1 - Math.pow(1 - x, 3),
  ent = (t, a, d = 0.45) => eio(seg(t, a, d));
const pop = (t, a, d = 0.32) => {
  if (t < a) return 0;
  const x = seg(t, a, d) - 1;
  return x * x * (2.6 * x + 1.6) + 1;
};
function S(tag, at, p, txt) {
  const e = document.createElementNS(NS, tag);
  for (const k in at) e.setAttribute(k, at[k]);
  if (txt != null) e.textContent = txt;
  p.appendChild(e);
  return e;
}
const G = (p, a = {}) => S("g", a, p),
  poly = (p, pts, f, op = 1) =>
    S("path", { d: "M" + pts.map((q) => q.join(" ")).join("L") + "Z", fill: f, opacity: op }, p),
  rect = (p, x, y, w, h, f, r = 0) => S("rect", { x, y, width: w, height: h, rx: r, fill: f }, p);
const TX = (p, x, y, s, t, f = INK, a = "middle", w = 700) =>
  S("text", { x, y, "font-size": s, fill: f, "text-anchor": a, "font-weight": w }, p, t);
const T = (e, x, y, s = 1, r = 0, sx = 1) =>
    e.setAttribute("transform", `translate(${x} ${y}) rotate(${r}) scale(${s * sx} ${s})`),
  VIS = (e, v) => (e.style.display = v ? "" : "none"),
  OP = (e, v) => {
    e.style.opacity = v;
    e.style.display = v > 0.001 ? "" : "none";
  };
// ---------- full-body figure rig (feet at 0,0) ----------
function Fig(parent, o) {
  const f = { o, root: G(parent) };
  f.shadow = poly(
    f.root,
    [
      [-o.sw, 6],
      [0, -o.sw * 0.32 + 6],
      [o.sw, 6],
      [0, o.sw * 0.55 + 6],
    ],
    SHD,
  );
  f.body = G(f.root);
  const hipY = -o.leg,
    shY = hipY - o.torso;
  f.hipY = hipY;
  f.shY = shY;
  f.legs = [-1, 1].map((k) => {
    const g = G(f.body);
    T(g, k * o.legX, hipY);
    rect(g, -o.legW / 2, 0, o.legW, o.leg, o.pants);
    rect(g, 0, 0, o.legW / 2, o.leg, o.pants2);
    poly(
      g,
      [
        [-o.legW / 2 - 4, o.leg - 16],
        [o.legW / 2 + 14 * k, o.leg - 16],
        [o.legW / 2 + 14 * k, o.leg],
        [-o.legW / 2 - 4, o.leg],
      ],
      o.shoe,
    );
    return g;
  });
  f.armB = G(f.body);
  f.torsoG = G(f.body);
  o.torsoDraw(f.torsoG, hipY, shY);
  f.arms = [-1, 1].map((k) => {
    const sh = G(k < 0 ? f.armB : f.body);
    T(sh, k * o.shX, shY + 12);
    rect(sh, -o.armW / 2, 0, o.armW, o.ua, o.sleeve);
    rect(sh, 0, 0, o.armW / 2, o.ua, o.sleeve2);
    const el = G(sh);
    T(el, 0, o.ua);
    rect(el, -o.armW / 2 + 3, 0, o.armW - 6, o.fa, SKIN);
    rect(el, 0, 0, (o.armW - 6) / 2, o.fa, SK2);
    poly(
      el,
      [
        [-o.armW / 2, o.fa],
        [o.armW / 2, o.fa],
        [o.armW / 2 - 4, o.fa + o.armW * 0.7],
        [-o.armW / 2 + 4, o.fa + o.armW * 0.7],
      ],
      SKIN,
    );
    return { sh, el, k };
  });
  f.head = G(f.body);
  T(f.head, 0, shY - o.neck);
  const hw = o.hw,
    hh = o.hh;
  rect(f.head, -o.neckW / 2, 0, o.neckW, o.neck + 8, SK2);
  f.face = G(f.head);
  T(f.face, 0, -hh / 2);
  o.headDraw(f.face, hw, hh);
  f.eyes = [-1, 1].map((k) => rect(f.face, k * o.eyeX - o.eyeW / 2, o.eyeY - o.eyeH / 2, o.eyeW, o.eyeH, INK, 2));
  f.shut = [-1, 1].map((k) => rect(f.face, k * o.eyeX - o.eyeW, o.eyeY - 2, o.eyeW * 2, 5, INK, 2));
  f.mouth = poly(f.face, [[0, 0]], MAROON);
  if (o.overDraw) o.overDraw(f.face, hw, hh);
  f.prop = G(f.root);
  return f;
}
// forward kinematics so props sit in the hand
function handPos(f, k, p) {
  const o = f.o,
    a = p["a" + k] || [10, 10],
    s = p.s || 1,
    dir = p.flip ? -1 : 1,
    a1 = ((k > 0 ? 1 : -1) * a[0] * Math.PI) / 180,
    a2 = a1 + ((k > 0 ? 1 : -1) * a[1] * Math.PI) / 180;
  let x = k * o.shX,
    y = f.shY + 12 + (p.bob || 0);
  x += -Math.sin(a1) * o.ua;
  y += Math.cos(a1) * o.ua;
  x += -Math.sin(a2) * (o.fa + o.armW * 0.4);
  y += Math.cos(a2) * (o.fa + o.armW * 0.4);
  return [p.x + dir * x * s, p.y + y * s];
}
function pose(f, t, p) {
  const o = f.o,
    s = p.s || 1;
  T(f.root, p.x, p.y, s, 0, p.flip ? -1 : 1);
  const w = p.walk || 0,
    ph = (t * 7 + (o.ph || 0)) % (2 * Math.PI),
    sw = Math.sin(ph) * 24 * w,
    bob = -Math.abs(Math.sin(ph)) * 10 * w + (p.bob || 0);
  f.body.setAttribute("transform", `translate(0 ${bob}) rotate(${p.lean || 0})`);
  f.legs.forEach((g, i) =>
    g.setAttribute("transform", `translate(${(i ? 1 : -1) * o.legX} ${f.hipY}) rotate(${(i ? -1 : 1) * sw})`),
  );
  f.arms.forEach(({ sh, el, k }) => {
    const a = p["a" + k] || [10 + (k > 0 ? -1 : 1) * sw * 0.8 * w, 10];
    sh.setAttribute("transform", `translate(${k * o.shX} ${f.shY + 12}) rotate(${(k > 0 ? 1 : -1) * a[0]})`);
    el.setAttribute("transform", `translate(0 ${o.ua}) rotate(${(k > 0 ? 1 : -1) * a[1]})`);
  });
  f.head.setAttribute("transform", `translate(0 ${f.shY - o.neck}) rotate(${p.tilt || 0})`);
  const blink = (t * 0.31 + (o.ph || 0)) % 1 < 0.03,
    shut = p.closed || blink;
  f.eyes.forEach((e) => {
    e.style.display = shut ? "none" : "";
    e.setAttribute("transform", `translate(${(p.look || 0) * 5} 0)`);
  });
  f.shut.forEach((e) => (e.style.display = shut ? "" : "none"));
  const m = o.mY,
    M = {
      smile: [
        [-16, m],
        [16, m],
        [10, m + 9],
        [-10, m + 9],
      ],
      flat: [
        [-12, m + 3],
        [12, m + 3],
        [12, m + 7],
        [-12, m + 7],
      ],
      o: [
        [-8, m],
        [8, m],
        [8, m + 14],
        [-8, m + 14],
      ],
      sad: [
        [-14, m + 9],
        [0, m + 2],
        [14, m + 9],
        [0, m + 6],
      ],
      big: [
        [-22, m - 2],
        [22, m - 2],
        [14, m + 18],
        [-14, m + 18],
      ],
    };
  f.mouth.setAttribute("d", "M" + M[p.m || "smile"].map((q) => q.join(" ")).join("L") + "Z");
}
// ---------- the cast (original) ----------
const torso = (g, hipY, shY, tw, bw, c1, c2, extra) => {
  poly(
    g,
    [
      [-bw, hipY + 4],
      [-tw, shY],
      [tw, shY],
      [bw, hipY + 4],
    ],
    c1,
  );
  poly(
    g,
    [
      [0, shY],
      [tw, shY],
      [bw, hipY + 4],
      [0, hipY + 4],
    ],
    c2,
  );
  if (extra) extra(g);
};
const headBox = (g, hw, hh, c1, c2) => {
  poly(
    g,
    [
      [-hw / 2, -hh / 2 + 10],
      [-hw / 2 + 10, -hh / 2],
      [hw / 2 - 10, -hh / 2],
      [hw / 2, -hh / 2 + 10],
      [hw / 2, hh / 2 - 14],
      [hw / 2 - 18, hh / 2],
      [-hw / 2 + 18, hh / 2],
      [-hw / 2, hh / 2 - 14],
    ],
    c1,
  );
  poly(
    g,
    [
      [0, -hh / 2],
      [hw / 2 - 10, -hh / 2],
      [hw / 2, -hh / 2 + 10],
      [hw / 2, hh / 2 - 14],
      [hw / 2 - 18, hh / 2],
      [0, hh / 2],
    ],
    c2,
  );
};
// Jugaadu Lal: broad, short-legged, white topi, teal waistcoat, mustard sash, big moustache
const JL = {
  sw: 150,
  leg: 200,
  legW: 56,
  legX: 52,
  pants: CREAM,
  pants2: CR2,
  shoe: MAROON,
  torso: 290,
  shX: 150,
  armW: 52,
  ua: 140,
  fa: 120,
  sleeve: CREAM,
  sleeve2: CR2,
  neck: 26,
  neckW: 56,
  hw: 170,
  hh: 180,
  eyeX: 34,
  eyeY: -6,
  eyeW: 12,
  eyeH: 20,
  mY: 54,
  ph: 0,
  torsoDraw: (g, hy, sy) =>
    torso(g, hy, sy, 170, 150, CREAM, CR2, (g) => {
      poly(
        g,
        [
          [-170, sy],
          [-40, sy],
          [-30, hy + 4],
          [-150, hy + 4],
        ],
        TEAL,
      );
      poly(
        g,
        [
          [170, sy],
          [40, sy],
          [30, hy + 4],
          [150, hy + 4],
        ],
        DTEAL,
      );
      rect(g, -156, hy - 80, 312, 34, MUST);
      rect(g, 0, hy - 80, 156, 34, MUST2);
      rect(g, -16, hy - 88, 32, 50, MAROON);
      [sy + 50, sy + 100, sy + 150].forEach((y) => rect(g, -6, y, 12, 12, SAND));
    }),
  headDraw: (g, hw, hh) => {
    headBox(g, hw, hh, SKIN, SK2);
    poly(
      g,
      [
        [-hw / 2, -10],
        [-hw / 2 - 14, 10],
        [-hw / 2, 30],
      ],
      SK2,
    );
    poly(
      g,
      [
        [hw / 2, -10],
        [hw / 2 + 14, 10],
        [hw / 2, 30],
      ],
      SK2,
    );
    poly(
      g,
      [
        [-hw / 2, -30],
        [-hw / 2 + 20, -50],
        [-hw / 2 + 16, 10],
        [-hw / 2, 14],
      ],
      GREY,
    );
    poly(
      g,
      [
        [hw / 2, -30],
        [hw / 2 - 20, -50],
        [hw / 2 - 16, 10],
        [hw / 2, 14],
      ],
      "#7F888D",
    );
    poly(
      g,
      [
        [-hw / 2 - 6, -hh / 2 + 14],
        [-hw / 2 + 16, -hh / 2 - 40],
        [hw / 2 - 16, -hh / 2 - 40],
        [hw / 2 + 6, -hh / 2 + 14],
      ],
      WH,
    );
    poly(
      g,
      [
        [0, -hh / 2 - 40],
        [hw / 2 - 16, -hh / 2 - 40],
        [hw / 2 + 6, -hh / 2 + 14],
        [0, -hh / 2 + 14],
      ],
      "#E8ECEE",
    );
    rect(g, -4, -hh / 2 + 18, 8, 30, CORAL);
    poly(
      g,
      [
        [0, 8],
        [-12, 30],
        [12, 30],
      ],
      SK2,
    );
  },
  overDraw: (g) => {
    poly(
      g,
      [
        [-76, 48],
        [0, 30],
        [76, 48],
        [64, 64],
        [0, 46],
        [-64, 64],
      ],
      INK,
    );
    poly(
      g,
      [
        [-76, 48],
        [-90, 34],
        [-84, 58],
      ],
      INK,
    );
    poly(
      g,
      [
        [76, 48],
        [90, 34],
        [84, 58],
      ],
      INK,
    );
  },
};
// Gupta ji (sugar): tall, long teal coat, mustard turban
const GU = {
  sw: 110,
  leg: 330,
  legW: 30,
  legX: 26,
  pants: CREAM,
  pants2: CR2,
  shoe: NAVY,
  torso: 300,
  shX: 84,
  armW: 36,
  ua: 150,
  fa: 130,
  sleeve: TEAL,
  sleeve2: DTEAL,
  neck: 22,
  neckW: 36,
  hw: 116,
  hh: 140,
  eyeX: 24,
  eyeY: 4,
  eyeW: 10,
  eyeH: 16,
  mY: 40,
  ph: 1.1,
  torsoDraw: (g, hy, sy) =>
    torso(g, hy + 80, sy, 92, 110, TEAL, DTEAL, (g) => {
      for (let i = 0; i < 5; i++)
        poly(
          g,
          [
            [-96 + i * 44, hy + 40],
            [-74 + i * 44, hy + 20],
            [-52 + i * 44, hy + 40],
          ],
          MUST,
        );
    }),
  headDraw: (g, hw, hh) => {
    headBox(g, hw, hh, SKIN, SK2);
    poly(
      g,
      [
        [-hw / 2 - 6, -hh / 2 + 26],
        [-hw / 2, -hh / 2 - 30],
        [0, -hh / 2 - 54],
        [hw / 2, -hh / 2 - 30],
        [hw / 2 + 6, -hh / 2 + 26],
      ],
      MUST,
    );
    poly(
      g,
      [
        [0, -hh / 2 - 54],
        [hw / 2, -hh / 2 - 30],
        [hw / 2 + 6, -hh / 2 + 26],
        [0, -hh / 2 + 26],
      ],
      MUST2,
    );
    poly(
      g,
      [
        [-22, 30],
        [22, 30],
        [16, 44],
        [-16, 44],
      ],
      GREY,
    );
  },
};
// Mehta ji (oil): medium, coral kurta, navy waistcoat, flat cap
const ME = {
  sw: 115,
  leg: 280,
  legW: 36,
  legX: 30,
  pants: NAVY,
  pants2: NAVY2,
  shoe: INK,
  torso: 270,
  shX: 94,
  armW: 40,
  ua: 140,
  fa: 120,
  sleeve: CORAL,
  sleeve2: "#C94845",
  neck: 20,
  neckW: 40,
  hw: 124,
  hh: 136,
  eyeX: 26,
  eyeY: 6,
  eyeW: 10,
  eyeH: 16,
  mY: 40,
  ph: 2.2,
  torsoDraw: (g, hy, sy) =>
    torso(g, hy, sy, 104, 96, CORAL, "#C94845", (g) => {
      poly(
        g,
        [
          [-104, sy],
          [-30, sy],
          [-26, hy + 4],
          [-96, hy + 4],
        ],
        NAVY,
      );
      poly(
        g,
        [
          [104, sy],
          [30, sy],
          [26, hy + 4],
          [96, hy + 4],
        ],
        NAVY2,
      );
    }),
  headDraw: (g, hw, hh) => {
    headBox(g, hw, hh, SKIN, SK2);
    poly(
      g,
      [
        [-hw / 2 - 4, -hh / 2 + 20],
        [-hw / 2 + 8, -hh / 2 - 22],
        [hw / 2 + 20, -hh / 2 - 22],
        [hw / 2 + 40, -hh / 2 + 20],
      ],
      SLATE,
    );
    poly(
      g,
      [
        [-hw / 2 - 4, -hh / 2 + 20],
        [hw / 2 + 44, -hh / 2 + 20],
        [hw / 2 + 44, -hh / 2 + 30],
        [-hw / 2 - 4, -hh / 2 + 30],
      ],
      NAVY,
    );
  },
};
// Biscuit Wala: hooded zigzag poncho, face always in shadow, a mystery number
const BW = {
  sw: 100,
  leg: 230,
  legW: 28,
  legX: 26,
  pants: GREY,
  pants2: "#7F888D",
  shoe: INK,
  torso: 250,
  shX: 82,
  armW: 34,
  ua: 130,
  fa: 110,
  sleeve: TEAL,
  sleeve2: DTEAL,
  neck: 10,
  neckW: 30,
  hw: 118,
  hh: 134,
  eyeX: 22,
  eyeY: 10,
  eyeW: 10,
  eyeH: 6,
  mY: 400,
  ph: 3.3,
  torsoDraw: (g, hy, sy) => {
    poly(
      g,
      [
        [0, sy - 40],
        [110, hy + 10],
        [-110, hy + 10],
      ],
      TEAL,
    );
    poly(
      g,
      [
        [0, sy - 40],
        [110, hy + 10],
        [0, hy + 10],
      ],
      DTEAL,
    );
    for (let i = 0; i < 6; i++)
      poly(
        g,
        [
          [-96 + i * 34, hy - 30],
          [-79 + i * 34, hy - 50],
          [-62 + i * 34, hy - 30],
        ],
        MUST,
      );
    for (let i = 0; i < 6; i++)
      poly(
        g,
        [
          [-96 + i * 34, hy - 6],
          [-79 + i * 34, hy - 26],
          [-62 + i * 34, hy - 6],
        ],
        CORAL,
      );
  },
  headDraw: (g, hw, hh) => {
    poly(
      g,
      [
        [0, -hh / 2 - 50],
        [hw / 2 + 18, -10],
        [hw / 2 + 6, hh / 2 + 10],
        [-hw / 2 - 6, hh / 2 + 10],
        [-hw / 2 - 18, -10],
      ],
      TEAL,
    );
    poly(
      g,
      [
        [0, -hh / 2 - 50],
        [hw / 2 + 18, -10],
        [hw / 2 + 6, hh / 2 + 10],
        [0, hh / 2 + 10],
      ],
      DTEAL,
    );
    poly(
      g,
      [
        [-hw / 2 + 10, -hh / 2 + 14],
        [hw / 2 - 10, -hh / 2 + 14],
        [hw / 2 - 14, hh / 2],
        [-hw / 2 + 14, hh / 2],
      ],
      NAVY2,
    );
  },
  overDraw: () => {},
};
// Chhutki: small, pink pigtails, slate dress, red trousers
const CH = {
  sw: 84,
  leg: 200,
  legW: 42,
  legX: 26,
  pants: CORAL,
  pants2: "#C94845",
  shoe: INK,
  torso: 170,
  shX: 66,
  armW: 30,
  ua: 100,
  fa: 90,
  sleeve: "#B9D58A",
  sleeve2: "#97B86A",
  neck: 14,
  neckW: 30,
  hw: 110,
  hh: 118,
  eyeX: 22,
  eyeY: 8,
  eyeW: 10,
  eyeH: 16,
  mY: 40,
  ph: 4.1,
  torsoDraw: (g, hy, sy) =>
    torso(g, hy, sy, 70, 82, SLATE, NAVY, (g) =>
      poly(
        g,
        [
          [-70, sy],
          [70, sy],
          [0, sy + 80],
        ],
        "#B9D58A",
      ),
    ),
  headDraw: (g, hw, hh) => {
    headBox(g, hw, hh, SKIN, SK2);
    poly(
      g,
      [
        [-hw / 2 - 6, 10],
        [-hw / 2 - 4, -hh / 2],
        [0, -hh / 2 - 16],
        [hw / 2 + 4, -hh / 2],
        [hw / 2 + 6, 10],
        [hw / 2 - 10, -24],
        [0, -34],
        [-hw / 2 + 10, -24],
      ],
      MAROON,
    );
    [-1, 1].forEach((k) => {
      poly(
        g,
        [
          [(k * hw) / 2, -hh / 2 + 4],
          [k * (hw / 2 + 70), -hh / 2 - 34],
          [k * (hw / 2 + 58), -hh / 2 + 40],
        ],
        PINK,
      );
      poly(
        g,
        [
          [(k * hw) / 2, -hh / 2 + 4],
          [k * (hw / 2 + 70), -hh / 2 - 34],
          [k * (hw / 2 + 40), -hh / 2 + 20],
        ],
        "#E46A7B",
      );
    });
  },
};
const icon = (p, s) => {
  const g = G(p);
  T(g, 0, 0, s);
  poly(
    g,
    [
      [-100, -80],
      [-80, -100],
      [80, -100],
      [100, -80],
      [100, 80],
      [80, 100],
      [-80, 100],
      [-100, 80],
    ],
    TEAL,
  );
  poly(
    g,
    [
      [0, -100],
      [80, -100],
      [100, -80],
      [100, 80],
      [80, 100],
      [0, 100],
    ],
    DTEAL,
  );
  poly(
    g,
    [
      [-56, -46],
      [56, -46],
      [56, 30],
      [-14, 30],
      [-40, 54],
      [-36, 30],
      [-56, 30],
    ],
    CREAM,
  );
  rect(g, -36, -26, 60, 8, INK);
  rect(g, -36, -8, 46, 8, INK);
  poly(
    g,
    [
      [6, 10],
      [16, 0],
      [28, 12],
      [50, -12],
      [60, -2],
      [28, 32],
    ],
    MUST,
  );
  return g;
};
// ---------- a world of floating island tiles, seen by a moving camera ----------
const bgR = rect(sv, 0, 0, 1080, 1920, BG),
  world = G(sv);
const tile = (p, x, y, w, top, l, r, h = 60) => {
  const g = G(p);
  T(g, x, y);
  poly(
    g,
    [
      [-w, 0],
      [0, w * 0.5],
      [0, w * 0.5 + h],
      [-w, h],
    ],
    l,
  );
  poly(
    g,
    [
      [0, w * 0.5],
      [w, 0],
      [w, h],
      [0, w * 0.5 + h],
    ],
    r,
  );
  poly(
    g,
    [
      [-w, 0],
      [0, -w * 0.5],
      [w, 0],
      [0, w * 0.5],
    ],
    top,
  );
  return g;
};
const cube = (p, x, y, s, top, l, r) => {
  poly(
    p,
    [
      [x - s, y],
      [x, y + s * 0.5],
      [x, y + s * 1.5],
      [x - s, y + s],
    ],
    l,
  );
  poly(
    p,
    [
      [x, y + s * 0.5],
      [x + s, y],
      [x + s, y + s],
      [x, y + s * 1.5],
    ],
    r,
  );
  poly(
    p,
    [
      [x - s, y],
      [x, y - s * 0.5],
      [x + s, y],
      [x, y + s * 0.5],
    ],
    top,
  );
};
// a far field of other shops' islands, for the million-distributor reveal
const far = G(world),
  FAR = [];
for (let r = -7; r <= 9; r++)
  for (let q = -6; q <= 7; q++) {
    const x = 560 + (q - r) * 170,
      y = 1050 + (q + r) * 95;
    if (Math.abs(x - 560) < 520 && Math.abs(y - 1050) < 700) continue;
    const cl = [
      [TEAL, DTEAL, "#176356"],
      [CORAL, "#C94845", "#A93C39"],
      [MUST, MUST2, "#A87A26"],
      [CREAM, CR2, SAND],
      [PINK, "#E46A7B", "#C95767"],
    ][(((q * 7 + r * 3) % 5) + 5) % 5];
    const g = tile(far, x, y, 64, ...cl, 26);
    FAR.push({ g, x, y });
  }
const farLines = G(world);
// the three named distributors and Jugaadu Lal
const ISL = { J: [230, 1250], G: [860, 660], M: [970, 1240], B: [780, 1700], H: [560, 1060] };
const cables = G(world);
const isl = {};
[
  ["J", CREAM, CR2, SAND],
  ["G", TEAL, DTEAL, "#176356"],
  ["M", CORAL, "#C94845", "#A93C39"],
  ["B", MUST, MUST2, "#A87A26"],
].forEach(([k, a, b, c2]) => {
  isl[k] = tile(world, ...ISL[k], 210, a, b, c2, 70);
});
// Jugaadu's kiosk: a little striped-roof cube
const kiosk = G(isl.J);
cube(kiosk, -70, -120, 70, SAND, "#C9A57A", "#B48F63");
for (let i = 0; i < 6; i++)
  poly(
    kiosk,
    [
      [-140 + i * 23.3, -120 - 35 + i * 11.7],
      [-140 + (i + 1) * 23.3, -120 - 35 + (i + 1) * 11.7],
      [-140 + (i + 1) * 23.3, -100 - 35 + (i + 1) * 11.7],
      [-140 + i * 23.3, -100 - 35 + i * 11.7],
    ],
    i % 2 ? CORAL : CREAM,
  );
// goods on the distributor islands
const goodsG = G(isl.G);
[
  [-60, -40],
  [-10, -14],
  [40, -40],
  [-10, -66],
].forEach(([x, y]) => cube(goodsG, x + 30, y - 50, 32, WH, "#E3E8E6", "#CDD5D2"));
TX(goodsG, 40, -110, 22, "SUGAR", DTEAL);
const goodsM = G(isl.M);
[
  [-40, -20],
  [10, -40],
  [60, -20],
].forEach(([x, y]) => {
  poly(
    goodsM,
    [
      [x - 22, y],
      [x + 22, y],
      [x + 22, y - 60],
      [x - 22, y - 60],
    ],
    MUST,
  );
  poly(
    goodsM,
    [
      [x, y],
      [x + 22, y],
      [x + 22, y - 60],
      [x, y - 60],
    ],
    MUST2,
  );
  S("ellipse", { cx: x, cy: y - 60, rx: 22, ry: 8, fill: "#F4CF7E" }, goodsM);
});
const goodsB = G(isl.B);
[0, 1, 2].forEach((i) => cube(goodsB, 30, -50 - i * 30, 40, CORAL, "#C94845", "#A93C39"));
const NAME = { G: "Gupta ji · Sugar", M: "Mehta ji · Oil", B: "Biscuit Wala · +91 98••" };
const nameT = {};
Object.keys(NAME).forEach((k) => {
  const g = G(world);
  rect(g, -150, -28, 300, 56, WH, 6);
  TX(g, 0, 10, 26, NAME[k], INK);
  nameT[k] = g;
});
// the extra callers that turn the web into a tangle
const EXTRA = [
  [120, 560],
  [460, 520],
  [1000, 420],
  [120, 1760],
  [420, 1860],
  [1020, 1960],
  [-60, 1080],
  [1180, 880],
  [1160, 1460],
  [500, 1500],
].map(([x, y], i) => ({
  x,
  y,
  g: tile(
    world,
    x,
    y,
    90,
    [TEAL, CORAL, MUST, PINK, SLATE][i % 5],
    [DTEAL, "#C94845", MUST2, "#E46A7B", NAVY][i % 5],
    ["#176356", "#A93C39", "#A87A26", "#C95767", NAVY2][i % 5],
    34,
  ),
}));
// the Saar hub that rises from below
const hub = G(world);
T(hub, ...ISL.H);
const hubT = tile(hub, 0, 0, 190, TEAL, DTEAL, "#176356", 90);
const hubIcon = G(hub);
icon(hubIcon, 0.7);
const cast = G(world),
  jl = Fig(cast, JL),
  gu = Fig(cast, GU),
  me = Fig(cast, ME),
  bw = Fig(cast, BW),
  ch = Fig(cast, CH);
// props in world space
const book = G(world);
poly(
  book,
  [
    [-60, -44],
    [60, -44],
    [60, 44],
    [-60, 44],
  ],
  MAROON,
);
poly(
  book,
  [
    [0, -44],
    [60, -44],
    [60, 44],
    [0, 44],
  ],
  "#561C2B",
);
rect(book, -52, -36, 8, 72, SAND);
rect(book, -40, -16, 70, 10, MUST);
const pages = [...Array(6)].map(() => {
  const g = G(world);
  poly(
    g,
    [
      [-26, -18],
      [26, -18],
      [26, 18],
      [-26, 18],
    ],
    WH,
  );
  rect(g, -18, -8, 36, 4, GREY);
  rect(g, -18, 2, 26, 4, GREY);
  return g;
});
const diary = (col, col2, label) => {
  const g = G(world);
  poly(
    g,
    [
      [-70, -90],
      [70, -90],
      [70, 90],
      [-70, 90],
    ],
    col,
  );
  poly(
    g,
    [
      [0, -90],
      [70, -90],
      [70, 90],
      [0, 90],
    ],
    col2,
  );
  rect(g, -60, -90, 10, 180, INK);
  rect(g, -44, -30, 100, 44, WH);
  TX(g, 6, 0, label.length > 6 ? 20 : 26, label, INK);
  return g;
};
const DIA = [diary(TEAL, DTEAL, "Gupta"), diary(CORAL, "#C94845", "Mehta"), diary(MUST, MUST2, "Biscuit")];
const DR = diary(TEAL, DTEAL, "Rates"),
  DQ = diary(CORAL, "#C94845", "Quantities");
const bubble = (txt, w, dir = 1) => {
  const g = G(world);
  poly(
    g,
    [
      [-w / 2, -46],
      [w / 2, -46],
      [w / 2, 40],
      [dir * 20, 40],
      [dir * 4, 72],
      [-dir * 14, 40],
      [-w / 2, 40],
    ],
    WH,
  );
  TX(g, 0, 12, 36, txt, INK);
  return g;
};
const haan = bubble("Haan ji", 220);
const ask = [bubble("Who said 5?", 290, 1), bubble("Which rate?", 290, -1), bubble("Paid or not?", 300, -1)];
const cloud = G(world);
[
  [0, 0, 70],
  [-80, 16, 50],
  [78, 16, 54],
  [-40, -40, 50],
  [40, -40, 54],
].forEach(([x, y, r]) => S("circle", { cx: x, cy: y, r, fill: WH }, cloud));
TX(cloud, 0, 16, 38, "Payments?", CORAL);
const lantern = [0, 1, 2, 3].map((i) => {
  const g = G(world);
  S("line", { x1: 0, y1: -200, x2: 0, y2: -60, stroke: INK, "stroke-width": 3 }, g);
  poly(
    g,
    [
      [0, -60],
      [34, 0],
      [0, 60],
      [-34, 0],
    ],
    [CORAL, MUST, PINK, TEAL][i],
  );
  poly(
    g,
    [
      [0, -60],
      [34, 0],
      [0, 60],
    ],
    ["#C94845", MUST2, "#E46A7B", DTEAL][i],
  );
  poly(
    g,
    [
      [-6, 60],
      [6, 60],
      [0, 96],
    ],
    MUST,
  );
  return g;
});
const bills = [...Array(8)].map((_, i) => {
  const g = G(world);
  poly(
    g,
    [
      [-80, -104],
      [80, -104],
      [80, 96],
      [60, 108],
      [40, 96],
      [20, 108],
      [0, 96],
      [-20, 108],
      [-40, 96],
      [-60, 108],
      [-80, 96],
    ],
    WH,
  );
  TX(g, 0, -66, 22, "BILL", GREY);
  for (let k = 0; k < 4; k++) {
    rect(g, -58, -40 + k * 36, 70, 6, SAND);
    TX(g, 62, -30 + k * 36, 20, ["₹840", "₹1,260", "₹390", "₹2,175"][(k + i) % 4], INK, "end");
  }
  return g;
});
const stamp = G(world);
S("rect", { x: -230, y: -52, width: 460, height: 104, fill: WH, stroke: CORAL, "stroke-width": 10 }, stamp);
TX(stamp, 0, 18, 54, "DOES NOT MATCH", CORAL);
const phoneP = (k) => {
  const g = G(world);
  rect(g, -20, -36, 40, 72, INK, 6);
  rect(g, -14, -28, 28, 52, k || "#9FD8CF", 3);
  return g;
};
const hp = [phoneP(), phoneP(), phoneP(), phoneP(), phoneP(CREAM), phoneP()];
const glowI = G(world);
icon(glowI, 0.5);
const ticks = [0, 1].map((i) => {
  const g = G(world);
  S("circle", { cx: 0, cy: 0, r: 40, fill: TEAL }, g);
  poly(
    g,
    [
      [-18, 0],
      [-6, 12],
      [18, -14],
      [24, -8],
      [-6, 24],
      [-24, 6],
    ],
    WH,
  );
  return g;
});
const LINES = [
  ["Hindi", "Paanch carton cheeni.", "J"],
  ["English", "At the usual rate.", "G"],
  ["Marathi", "दोन डबे तेल पाहिजेत.", "J"],
  ["Hinglish", "Done ji, Friday.", "G"],
].map(([a, b, k]) => {
  const g = G(world);
  rect(g, -170, -48, 340, 96, k === "J" ? "#FBEFE0" : "#DDF2EC", 8);
  rect(g, -170, -48, 8, 96, k === "J" ? MUST : TEAL);
  TX(g, -150, -12, 20, a, GREY, "start", 700);
  TX(g, -150, 24, 25, b, INK, "start", 600);
  return { g, k };
});
const pr = G(world);
TX(pr, 0, -10, 30, "Gnani Prisma · live", DTEAL);
const prLbl = pr;
const card = G(world);
poly(
  card,
  [
    [-250, -210],
    [250, -210],
    [250, 210],
    [-250, 210],
  ],
  WH,
);
rect(card, -250, -210, 500, 64, TEAL);
TX(card, 0, -166, 30, "Order record", WH);
const ROWS = [
  ["Distributor", "Gupta ji"],
  ["Sugar", "5 cartons"],
  ["Oil", "2 tins"],
  ["Delivery", "Friday"],
].map(([a, b], i) => {
  const g = G(card);
  T(g, 0, -100 + i * 58);
  TX(g, -220, 8, 26, a, GREY, "start", 600);
  TX(g, 220, 8, 28, b, INK, "end");
  return g;
});
const stamps = [0, 1].map((i) => {
  const g = G(card);
  S("rect", { x: -104, y: -34, width: 208, height: 68, fill: "none", stroke: TEAL, "stroke-width": 7 }, g);
  TX(g, 0, 12, 28, (i ? "Gupta" : "Jugaadu") + " ✓", TEAL);
  return g;
});
const sheet = G(world);
poly(
  sheet,
  [
    [-430, -260],
    [430, -260],
    [430, 260],
    [-430, 260],
  ],
  WH,
);
rect(sheet, -430, -260, 860, 72, DTEAL);
TX(sheet, -404, -212, 32, "Excel", WH, "start");
TX(sheet, 404, -212, 24, "All distributors", WH, "end", 600);
const HX = [-404, -120, 120, 280];
["Distributor", "Item", "Qty", "Rate"].forEach((h, i) => TX(sheet, HX[i], -150, 24, h, GREY, "start", 700));
const SROW = [
  ["Gupta ji", "Sugar", "5", "₹1,600"],
  ["Mehta ji", "Oil", "8", "₹700"],
  ["Biscuit Wala", "Biscuits", "12", "₹240"],
  ["Rao Traders", "Rice", "20", "₹1,150"],
  ["Shah & Sons", "Tea", "6", "₹980"],
].map((r, i) => {
  const g = G(sheet);
  T(g, 0, -96 + i * 72);
  rect(g, -430, -34, 860, 68, i % 2 ? "#F5FAF9" : WH);
  r.forEach((v, k) => TX(g, HX[k], 10, 27, v, INK, "start", k ? 500 : 700));
  return g;
});
const packets = [0, 1, 2].map((i) => {
  const g = G(world);
  poly(
    g,
    [
      [-24, -16],
      [24, -16],
      [24, 16],
      [-24, 16],
    ],
    [TEAL, CORAL, MUST][i],
  );
  rect(g, -16, -4, 32, 6, WH);
  return g;
});
const night = rect(sv, 0, 0, 1080, 1920, "#1C2541");
night.style.opacity = 0;
const end = G(sv),
  endBg = rect(end, 0, 0, 1080, 1920, DTEAL),
  eI = G(end);
icon(eI, 1.3);
const eName = TX(end, 540, 960, 150, "Saar", WH),
  eSoon = G(end);
rect(eSoon, -230, -56, 460, 112, CREAM, 8);
TX(eSoon, 0, 20, 58, "Coming soon", DTEAL);
const fT1 = TX(sv, 540, 300, 62, "A million distributors.", INK),
  fT2 = TX(sv, 540, 386, 62, "One platform.", DTEAL);
// tangled cable between two points: wiggles get worse as the mess grows
function cable(path, a, b, mess, t, seed) {
  const [x1, y1] = a,
    [x2, y2] = b,
    dx = x2 - x1,
    dy = y2 - y1,
    n = [-dy, dx],
    len = Math.hypot(dx, dy) || 1;
  const k = mess * 90;
  const w = (i) => Math.sin(t * 1.3 + seed * 3 + i * 2.1) * k;
  const c1 = [x1 + dx * 0.3 + (n[0] / len) * w(1), y1 + dy * 0.3 + (n[1] / len) * w(1)],
    c2 = [x1 + dx * 0.7 + (n[0] / len) * w(2), y1 + dy * 0.7 + (n[1] / len) * w(2)];
  path.setAttribute("d", `M${x1} ${y1}C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${x2} ${y2}`);
}
const CAB = [...Array(16)].map((_, i) =>
  S("path", { fill: "none", stroke: SLATE, "stroke-width": 6, "stroke-linecap": "round" }, cables),
);
const HUBC = [...Array(16)].map(() =>
  S("path", { fill: "none", stroke: TEAL, "stroke-width": 7, "stroke-linecap": "round" }, cables),
);
// camera keyframes: [time, centre x, centre y, scale]
const CAM = () => [
  [0, 250, 1060, 1.75],
  [c(1) - 0.2, 250, 1060, 1.75],
  [c(1) + 1.4, 560, 1150, 0.84],
  [c(3), 560, 1150, 0.84],
  [c(3) + 0.8, 520, 1180, 0.72],
  [c(5) - 0.3, 520, 1180, 0.72],
  [c(5) + 0.4, 260, 1080, 1.45],
  [c(6) + 0.2, 260, 1080, 1.45],
  [c(6) + 0.8, 280, 1100, 1.25],
  [c(8) + 0.3, 330, 1100, 1.2],
  [c(8) + 1.6, 520, 1120, 0.82],
  [c(10) - 0.2, 560, 1080, 0.86],
  [c(10) + 0.6, 560, 700, 1.12],
  [c(12) - 0.3, 560, 700, 1.12],
  [c(12) + 0.4, 560, 700, 0.95],
  [c(13) - 0.3, 560, 700, 0.95],
  [c(13) + 1.6, 560, 1060, 0.24],
  [60, 560, 1060, 0.22],
];
function camAt(t) {
  const K = CAM();
  let i = 0;
  while (i < K.length - 2 && t > K[i + 1][0]) i++;
  const a = K[i],
    b = K[i + 1],
    q = eio(seg(t, a[0], Math.max(0.01, b[0] - a[0])));
  return [L(a[1], b[1], q), L(a[2], b[2], q), L(a[3], b[3], q)];
}
const onIsl = (k, dx = 0) => [ISL[k][0] + dx, ISL[k][1] - 6];
function renderAt(t) {
  hp.forEach((h) => VIS(h, false));
  const [cx, cy, cs] = camAt(t);
  world.setAttribute("transform", `translate(540 960) scale(${cs}) translate(${-cx} ${-cy})`);
  const nt = clamp((t - c(5)) / (c(7) - c(5))) * (1 - seg(t, c(8) - 0.1, 1.2));
  night.style.opacity = 0.42 * eio(nt);
  bgR.setAttribute("fill", BG);
  // islands bob gently, each on its own rhythm
  Object.entries(isl).forEach(([k, g], i) => {
    const v = t >= [0, c(1) + 0.2, c(1) + 1.7, c(1) + 3.3][i];
    const q = k === "J" ? 1 : ent(t, [0, c(1) + 0.2, c(1) + 1.7, c(1) + 3.3][i], 0.8);
    g.setAttribute("transform", `translate(${ISL[k][0]} ${ISL[k][1] + (1 - q) * 900 + Math.sin(t * 1.2 + i) * 6})`);
    g.style.opacity = k === "J" || v ? 1 : 0;
  });
  EXTRA.forEach((o, i) => {
    const a = c(3) + 0.1 + i * 0.22,
      q = ent(t, a, 0.6),
      out = ent(t, c(8) + 0.2, 0.8);
    o.g.style.opacity = t >= a ? q * (1 - out * 0.0) : 0;
    o.g.setAttribute("transform", `translate(${o.x} ${o.y + (1 - q) * 700 + Math.sin(t + i) * 5})`);
  });
  const hq = ent(t, c(8) - 0.1, 1.2);
  hub.style.opacity = t >= c(8) - 0.1 ? 1 : 0;
  hub.setAttribute("transform", `translate(${ISL.H[0]} ${ISL.H[1] + (1 - hq) * 900})`);
  hubIcon.setAttribute("transform", `translate(0 ${-150 + Math.sin(t * 2) * 8}) scale(${0.7 * pop(t, c(8) + 0.9)})`);
  FAR.forEach((o, i) => {
    const a = c(13) + 0.2 + (((o.x + o.y) % 400) / 400) * 1.2,
      q = ent(t, a, 0.5);
    o.g.style.opacity = t >= a ? q : 0;
  });
  // Jugaadu Lal
  let p = { x: ISL.J[0] + 10, y: ISL.J[1] - 4, s: 0.82, m: "smile" };
  if (t < c(1)) {
    p.a1 = [70, 40];
    p["a-1"] = [40, 30];
    p.m = t > 3.6 ? "big" : "smile";
    p.closed = t > 3.6 && t < 4.8;
    p.look = -0.3;
    p.tilt = Math.sin(t * 1.5) * 2;
  } else if (t < c(3)) {
    p.look = 1;
    p.m = t > c(1) + 5.4 ? "big" : "smile";
    if (t > c(2)) {
      p.a1 = [160, 20];
      p.m = "o";
    }
  } else if (t < c(4)) {
    p.a1 = [160, 30];
    const nod = Math.max(0, Math.sin((t - c(3)) * Math.PI * 3));
    p.bob = nod * 8;
    p.tilt = nod * 4;
    p.m = nod > 0.5 ? "o" : "smile";
    p.look = Math.sin(t * 1.6);
  } else if (t < c(5)) {
    p.a1 = [120, -60];
    p["a-1"] = [120, -60];
    p.m = "flat";
  } else if (t < c(7)) {
    p.m = t > c(6) ? "sad" : "flat";
    p.a1 = [150, 100];
    p.tilt = t > c(6) ? -6 : 3;
    if (t > c(6) + 1.4) p.bob = 10;
  } else if (t < c(9)) {
    p.x += 60;
    p.m = t > c(8) + 0.2 ? "big" : "sad";
    p.look = -1;
    p.tilt = t > c(8) + 0.2 ? 0 : -5;
    if (t > c(8)) {
      p.a1 = [150, 20];
    }
  } else {
    p.a1 = [160, 20];
    p.look = 1;
    p.m = t > c(12) ? "big" : "smile";
  }
  pose(jl, t, p);
  VIS(book, t < c(1) + 0.4);
  if (t < c(1) + 0.4) {
    const [hx, hy] = handPos(jl, 1, p);
    T(book, hx, hy - 8, 0.82, Math.sin(t * 2) * 4);
  }
  pages.forEach((g, i) => {
    const a = seg(t, 2.6 + i * 0.14, 1.3),
      [hx, hy] = handPos(jl, 1, p);
    VIS(g, a > 0 && a < 1);
    T(g, hx + Math.sin(i * 2) * a * 220, hy - a * 360 + a * a * 170, 0.8, a * 360 * (i % 2 ? 1 : -1));
  });
  // distributors stand on their islands
  [
    [gu, "G", c(1) + 0.2],
    [me, "M", c(1) + 1.7],
    [bw, "B", c(1) + 3.3],
  ].forEach(([f, k, a], i) => {
    const q = ent(t, a, 0.8),
      on = t >= a;
    VIS(f.root, on);
    if (!on) return;
    const pp = {
      x: ISL[k][0] - 40,
      y: ISL[k][1] - 6 + (1 - q) * 900 + Math.sin(t * 1.2 + i + 1) * 6,
      s: 0.62,
      flip: true,
      look: -1,
      m: "smile",
    };
    if (t > c(2) + i * 0.4 && t < c(8)) {
      pp.a1 = [160, 20];
      pp.m = t > c(4) && t < c(5) ? "o" : "smile";
    }
    if (k === "G" && t >= c(9)) {
      pp.a1 = [160, 20];
      pp.m = "smile";
    }
    pose(f, t, pp);
    const hpp = hp[i + 1];
    VIS(hpp, (pp.a1 && t < c(8)) || (k === "G" && t >= c(9) && t < c(12)));
    if (pp.a1) {
      const [hx, hy] = handPos(f, 1, pp);
      T(hpp, hx, hy - 16, 0.62);
    }
    const nq = seg(t, a + 0.6, 0.3) * (1 - seg(t, c(2) - 0.3, 0.3));
    OP(nameT[k], nq);
    T(nameT[k], ISL[k][0], ISL[k][1] + 170);
    const dq = pop(t, c(2) + 0.6 + i * 0.45);
    OP(DIA[i], t > c(2) + 0.6 + i * 0.45 && t < c(3) + 0.2 ? 1 : 0);
    T(DIA[i], ISL[k][0] + 110, ISL[k][1] - 330, Math.max(0, dq) * 0.75, (i - 1) * 6);
  });
  VIS(hp[0], (t >= c(2) && t < c(4)) || t >= c(8) + 0.3);
  if (hp[0].style.display !== "none") {
    const [hx, hy] = handPos(jl, 1, p);
    T(hp[0], hx, hy - 16, 0.82);
  }
  // cables: tidy at first, a tangle by Diwali, then straight lines through the hub
  const mess = clamp((t - c(2)) / (c(6) - c(2))) * (1 - seg(t, c(8) - 0.2, 0.8));
  const ends = [onIsl("G"), onIsl("M"), onIsl("B"), ...EXTRA.map((o) => [o.x, o.y])];
  CAB.forEach((pth, i) => {
    const e = ends[i];
    if (!e) {
      pth.style.opacity = 0;
      return;
    }
    const a = i < 3 ? c(2) + 0.4 + i * 0.3 : c(3) + 0.3 + (i - 3) * 0.22,
      q = seg(t, a, 0.4);
    pth.style.opacity = t >= a ? Math.min(1, q) * (1 - seg(t, c(8) - 0.2, 0.6)) : 0;
    const red = t > c(4) && t < c(8) && Math.sin(t * 6 + i) > 0.3;
    pth.setAttribute("stroke", red ? CORAL : SLATE);
    const j = ISL.J,
      mid = [L(j[0], e[0], q), L(j[1] - 100, e[1] - 60, q)];
    cable(pth, [j[0], j[1] - 100], mid, 0.4 + mess * 2.2, t, i);
  });
  HUBC.forEach((pth, i) => {
    const e = i === 0 ? [ISL.J[0], ISL.J[1] - 60] : ends[i - 1];
    if (!e) {
      pth.style.opacity = 0;
      return;
    }
    const a = c(9) + (i === 0 || i === 1 ? 0 : 1.2 + i * 0.08),
      q = seg(t, a, 0.5);
    pth.style.opacity = t >= a ? 1 : 0;
    const h = [ISL.H[0], ISL.H[1] - 40];
    pth.setAttribute("d", `M${h[0]} ${h[1]}L${L(h[0], e[0], q)} ${L(h[1], e[1] - 40, q)}`);
  });
  // lanterns, doubts, haan ji
  lantern.forEach((g, i) => {
    const on = t >= c(4) + 0.1 && t < c(7) + 0.5;
    VIS(g, on);
    T(
      g,
      [160, 420, 700, 960][i],
      ISL.J[1] - 760 + Math.sin(t * 2 + i) * 10,
      pop(t, c(4) + 0.1 + i * 0.1) * 0.9,
      Math.sin(t * 1.6 + i) * 5,
    );
  });
  const hk = Math.floor((t - c(3) - 1) / 0.6),
    hon = t > c(3) + 1 && t < c(4) - 0.2;
  VIS(haan, hon);
  if (hon) T(haan, ISL.J[0] + (hk % 2 ? 150 : -120), ISL.J[1] - 520, pop(t, c(3) + 1 + hk * 0.6, 0.2));
  ask.forEach((g, i) => {
    const a = c(4) + 0.4 + i * 0.5,
      on = t >= a && t < c(5) - 0.1;
    VIS(g, on);
    const k = "GMB"[i];
    T(g, ISL[k][0] - 60, ISL[k][1] - 420, pop(t, a) * 1.1);
  });
  // memory and paper
  [
    [DR, -150],
    [DQ, 170],
  ].forEach(([g, dx], i) => {
    const a = c(5) + 0.2 + i * 1.1,
      on = t >= a && t < c(6) - 0.1;
    VIS(g, on);
    T(g, ISL.J[0] + dx, L(ISL.J[1], ISL.J[1] - 430, ent(t, a, 0.5)), 0.8, i ? 6 : -6);
  });
  VIS(cloud, t >= c(5) + 2.6 && t < c(6) - 0.1);
  T(cloud, ISL.J[0] + 10, ISL.J[1] - 620, pop(t, c(5) + 2.6) * 0.8);
  bills.forEach((g, i) => {
    const a = c(6) + 0.1 + i * 0.12,
      q = seg(t, a, 0.9),
      on = t >= a && t < c(7) - 0.1;
    VIS(g, on);
    T(
      g,
      ISL.J[0] + [-150, 170, -80, 120, -30, 60, 10, -120][i] + Math.sin(q * 9 + i) * 50 * (1 - q),
      L(ISL.J[1] - 900, ISL.J[1] - [260, 240, 160, 150, 90, 110, 40, 30][i], eo(q)),
      0.7,
      [-10, 8, 6, -6, 9, -4, 2, -8][i] + Math.sin(q * 8) * 20 * (1 - q),
    );
  });
  const sq = seg(t, c(6) + 1.4, 0.14);
  VIS(stamp, t >= c(6) + 1.4 && t < c(7) - 0.1);
  T(stamp, ISL.J[0] + 20, ISL.J[1] - 300, L(1.3, 0.8, sq), -6);
  // Chhutki arrives on the same island and holds up the answer
  const con = t >= c(7) - 0.4 && t < c(9) - 0.1,
    cq = ent(t, c(7) - 0.4, 0.8);
  VIS(ch.root, con);
  if (con) {
    const cp = { x: ISL.J[0] - 90, y: ISL.J[1] - 4 - (1 - cq) * 500, s: 0.8, a1: [150, 30], look: 1, m: "smile" };
    pose(ch, t, cp);
    const [hx, hy] = handPos(ch, 1, cp);
    VIS(hp[4], t < c(8) + 0.3);
    T(hp[4], hx, hy - 20, 1, -10);
    VIS(glowI, t < c(8) + 0.6);
    T(glowI, hx, hy - 130, pop(t, c(7) + 0.8));
  } else {
    VIS(hp[4], false);
    VIS(glowI, false);
  }
  // agreement on both islands
  ticks.forEach((g, i) => {
    const a = c(9) + 1.1 + i * 0.8;
    VIS(g, t >= a && t < c(10) + 0.2);
    const k = i ? "G" : "J";
    T(g, ISL[k][0] + (i ? -40 : 10), ISL[k][1] - 640, pop(t, a));
  });
  // words travel along the cables into the hub
  VIS(pr, t >= c(10) - 0.1 && t < c(11));
  T(pr, ISL.H[0], ISL.H[1] - 820);
  LINES.forEach((o, i) => {
    const a = c(10) + 0.4 + i * 1.4,
      q = seg(t, a, 1.1),
      on = t >= a && t < c(11) - 0.05;
    VIS(o.g, on);
    const s = o.k === "J" ? [ISL.J[0] + 60, ISL.J[1] - 260] : [ISL.G[0] - 60, ISL.G[1] - 200],
      e = [ISL.H[0], ISL.H[1] - 720 + i * 112];
    T(o.g, L(s[0], e[0], eio(q)), L(s[1], e[1], eio(q)), L(0.6, 1, eio(q)));
  });
  // the record, then the sheet
  const kq = pop(t, c(11) - 0.1, 0.4);
  VIS(card, t >= c(11) - 0.1 && t < c(12) + 0.1);
  T(card, ISL.H[0], ISL.H[1] - 520, kq);
  ROWS.forEach((g, i) => (g.style.opacity = seg(t, c(11) + 0.2 + i * 0.3, 0.25)));
  stamps.forEach((g, i) => {
    const a = c(11) + 1.9 + i * 0.8,
      q = seg(t, a, 0.12);
    g.style.opacity = q;
    T(g, i ? 120 : -120, 150, L(1.5, 1, q), i ? 5 : -5);
  });
  const shq = ent(t, c(12) - 0.05, 0.5) * (1 - ent(t, c(13) - 0.3, 0.3));
  OP(sheet, shq);
  T(sheet, ISL.H[0], ISL.H[1] - 560, 1);
  SROW.forEach((g, i) => (g.style.opacity = seg(t, c(12) + 0.5 + i * 0.45, 0.25)));
  packets.forEach((g, i) => {
    const on = t >= c(12) + 0.2 && t < c(13) - 0.3;
    VIS(g, on);
    const a = ((t - c(12)) * 0.9 + i * 0.33) % 1,
      k = "GMB"[i];
    T(g, L(ISL[k][0], ISL.H[0], a), L(ISL[k][1] - 60, ISL.H[1] - 300, a) - Math.sin(a * Math.PI) * 80, 1.2);
  });
  // a million islands, one hub
  OP(fT1, ent(t, c(13) + 0.4, 0.4) * (1 - seg(t, c(14) - 0.4, 0.3)));
  OP(fT2, ent(t, c(13) + 1.1, 0.4) * (1 - seg(t, c(14) - 0.4, 0.3)));
  const eq = ent(t, c(14) - 0.35, 0.4);
  VIS(end, eq > 0);
  endBg.setAttribute("opacity", eq);
  T(eI, 540, 640, pop(t, c(14) - 0.2, 0.45));
  OP(eName, ent(t, c(14), 0.35));
  const so = ent(t, c(15), 0.35);
  OP(eSoon, so);
  T(eSoon, 540, 1140 + (1 - so) * 20);
}
