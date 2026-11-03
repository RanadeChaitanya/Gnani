// Waveform bars. `levels` = recent mic RMS (0..~0.3); without it, a calm decorative shape.
const REST = [5, 9, 14, 8, 18, 26, 14, 30, 20, 11, 24, 34, 18, 9, 22, 14, 7, 12, 5];

export default function Wave({ levels, bars = REST.length }: { levels?: number[]; bars?: number }) {
  const h = levels
    ? Array.from({ length: bars }, (_, i) => 4 + Math.min(56, Math.sqrt(levels[levels.length - bars + i] ?? 0) * 120))
    : REST.slice(0, bars).map((x) => x * 1.4);
  return (
    <div className={`wave ${levels?.length ? "live" : ""}`} aria-hidden="true">
      {h.map((x, i) => <i key={i} style={{ height: `${x}px` }} />)}
    </div>
  );
}
