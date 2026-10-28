"""Charts + results/report.md from results/results.csv."""
import csv
import json
from collections import defaultdict
from statistics import mean, median

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

from common import RESULTS, ci95  # noqa: E402

CH = RESULTS / "charts"


def num(r: dict[str, str], k: str) -> float | None:
    v = r.get(k, "")
    return float(v) if v not in ("", "None") else None


def table(head: list[str], rows: list[list[object]]) -> str:
    out = ["| " + " | ".join(head) + " |", "|" + "---|" * len(head)]
    out += ["| " + " | ".join(f"{c:.3f}" if isinstance(c, float) else str(c) for c in r) + " |" for r in rows]
    return "\n".join(out)


def main() -> None:
    rows = list(csv.DictReader(open(RESULTS / "results.csv", encoding="utf-8")))
    CH.mkdir(parents=True, exist_ok=True)
    md = ["# Saar evaluation report", "",
          "Synthetic two-speaker dialogues (Gnani Timbre TTS) → degradations → Gnani Prisma STT → note (DeepSeek).",
          "All numbers below were measured by `eval/run_eval.py` on the date in `usage.json`.", ""]

    # E1
    e1 = [r for r in rows if r["exp"] == "E1"]
    if e1:
        by: dict[tuple[str, str], list[float]] = defaultdict(list)
        for r in e1:
            by[(r["condition"], r["lang"])].append(float(r["wer"]))
        conds = list(dict.fromkeys(r["condition"] for r in e1))
        langs = sorted({r["lang"] for r in e1})
        md += ["## E1 — WER vs degradation (REST, verbatim)", "",
               table(["condition"] + [f"WER {l}" for l in langs] + ["95% CI (all)"],
                     [[c] + [mean(by[(c, l)]) if by[(c, l)] else "—" for l in langs]
                      + ["%.3f–%.3f" % ci95([float(r["wer"]) for r in e1 if r["condition"] == c])] for c in conds]),
               "", "![E1](charts/e1_wer.png)", ""]
        fig, ax = plt.subplots(figsize=(9, 4))
        for l in langs:
            ax.plot(conds, [mean(by[(c, l)]) if by[(c, l)] else None for c in conds], marker="o", label=l)
        ax.set_ylabel("WER")
        ax.set_title("E1: WER by condition and language")
        ax.legend()
        plt.xticks(rotation=35, ha="right")
        fig.tight_layout()
        fig.savefig(CH / "e1_wer.png", dpi=130)

    # E2
    e2 = [r for r in rows if r["exp"] == "E2"]
    if e2:
        byp: dict[str, list[dict[str, str]]] = defaultdict(list)
        for r in e2:
            byp[r["preset"]].append(r)
        stats = []
        for p, rs in byp.items():
            lat = [x for x in (num(r, "latency_ms") for r in rs) if x is not None]
            stats.append([p, mean(float(r["wer"]) for r in rs), mean(float(r["segments"]) for r in rs),
                          median(lat) if lat else float("nan"),
                          sorted(lat)[int(0.95 * (len(lat) - 1))] if lat else float("nan")])
        md += ["## E2 — VAD presets (WebSocket, real-time)", "", "Segments per sentence > 1 = fragmentation.", "",
               table(["preset", "WER", "segments/sentence", "latency p50 ms", "latency p95 ms"], stats), "",
               "![E2](charts/e2_vad.png)", ""]
        fig, ax = plt.subplots(figsize=(6, 4))
        for s in stats:
            ax.scatter(s[3], s[1], s=40 * s[2])
            ax.annotate(s[0], (s[3], s[1]), fontsize=8)
        ax.set_xlabel("Gnani latency p50 (ms)")
        ax.set_ylabel("WER")
        ax.set_title("E2: VAD trade-off (size = segments/sentence)")
        fig.tight_layout()
        fig.savefig(CH / "e2_vad.png", dpi=130)

    # E4
    e4 = [r for r in rows if r["exp"] == "E4"]
    if e4:
        byc: dict[str, list[dict[str, str]]] = defaultdict(list)
        for r in e4:
            byc[r["condition"]].append(r)
        out = []
        for c, rs in byc.items():
            fl, ae, tf = (sum(int(r[k]) for r in rs) for k in ("flags", "actual_errors", "true_flags"))
            out.append([c, mean(float(r["wer"]) for r in rs), mean(float(r["fact_recall"]) for r in rs),
                        mean(float(r["hallucination_rate"]) for r in rs),
                        tf / fl if fl else float("nan"), tf / ae if ae else float("nan")])
        md += ["## E4 — propagation to notes", "",
               "Fact recall = gold facts found in the note. Hallucination = note numbers/names absent from the "
               "reference dialogue. Flag precision/recall compares the app's faithfulness flags (checked against the "
               "ASR transcript) with those actual errors.", "",
               table(["condition", "WER", "fact recall", "hallucination rate", "flag precision", "flag recall"], out),
               "", "![E4](charts/e4_wer_recall.png)", ""]
        fig, ax = plt.subplots(figsize=(6, 4))
        ax.scatter([float(r["wer"]) for r in e4], [float(r["fact_recall"]) for r in e4])
        ax.set_xlabel("dialogue WER")
        ax.set_ylabel("note fact recall")
        ax.set_title("E4: ASR errors → note quality")
        fig.tight_layout()
        fig.savefig(CH / "e4_wer_recall.png", dpi=130)

    usage = json.loads((RESULTS / "usage.json").read_text()) if (RESULTS / "usage.json").exists() else {}
    md += ["## Credit usage", "", f"`{json.dumps(usage)}` (cache hits cost nothing).", "",
           "## Limitations", "",
           "- TTS-generated speech is not real speech; same-vendor TTS→STT is likely optimistic.",
           "- Noise, telephony (band-pass + µ-law) and noise suppression (spectral gate) are simulated approximations.",
           "- Small n (9 seed dialogues); confidence intervals are wide. No claim of superiority over any vendor.",
           "- No real recorded clips were included" + (" " if usage.get("real_clips") else " (none provided)") + ".",
           "- Numbers describe this setup on the dates run; vendor-reported figures, if quoted elsewhere, are labelled.",
           "- E3 (word boosting / ITN format) and E5 (REST vs WebSocket) were cut for time (spec §16.9).", ""]
    (RESULTS / "report.md").write_text("\n".join(md), encoding="utf-8")
    print("wrote", RESULTS / "report.md")


if __name__ == "__main__":
    main()
