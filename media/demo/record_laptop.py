"""Record the laptop screens: the recorded call's records on a desktop browser, plus a few earlier synthetic calls for context."""

import asyncio, copy, csv, html, json, pathlib, time
from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:8000"
D = pathlib.Path(__file__).parent
cap = json.load(open(D / "captured_notes.json", encoding="utf-8"))
real = cap["notes"][0]
EV = {}


def past(name, days, items, lang, line, title):
    n = copy.deepcopy(real)
    n["id"] = f"demo-{name}-{days}"
    n["created_at"] = n["saved_at"] = f"2026-10-{30 - days:02d}T11:00:00.000Z"
    n["participants"] = ["Jugaadu Lal", name]
    n["title"] = title
    c = n["note"]
    c["items"] = [
        dict(
            name=i,
            quantity=q,
            unit=u,
            unit_price=p,
            total_price=q * p,
            shop=None,
            heard_as=None,
        )
        for i, q, u, p in items
    ]
    c["action_items"], c["uncertain_spans"], c["outcome"] = [], [], title
    n["costs"] = {
        **(n.get("costs") or {}),
        "grand_total": sum(q * p for _, q, _, p in items),
        "unpriced_items": 0,
    }
    n["transcript"] = [
        {
            "seq": 0,
            "participant_id": "x",
            "name": name,
            "text": line,
            "started_at": 0,
            "lang_code": lang,
        }
    ]
    n["review"] = {"by": {}, "final": True, "corrections": []}
    return n


NOTES = [
    real,
    past(
        "Gupta ji",
        14,
        [("Sugar (cheeni)", 4, "carton", 1500)],
        "hi-IN",
        "Chaar carton, pandrah sau ka rate.",
        "Sugar restock",
    ),
    past(
        "Mehta ji",
        6,
        [("Oil", 8, "tins", 700)],
        "mr-IN",
        "आठ डबे तेल, सातशे रुपये.",
        "Oil for the festive week",
    ),
    past(
        "Biscuit Wala",
        3,
        [("Biscuits", 12, "boxes", 240)],
        "hi-IN",
        "Barah dabbe biscuit.",
        "Biscuits, mixed boxes",
    ),
    past(
        "Rao Traders",
        9,
        [("Rice", 20, "bags", 1150)],
        "en-IN",
        "Twenty bags of rice at 1150.",
        "Rice for Diwali",
    ),
    past(
        "Shah & Sons",
        11,
        [("Tea", 6, "cartons", 980)],
        "en-IN",
        "Six cartons of tea.",
        "Tea restock",
    ),
]


async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch()
        ctx = await br.new_context(
            viewport={"width": 1440, "height": 900},
            record_video_dir=str(D / "rec_L"),
            record_video_size={"width": 1440, "height": 900},
            accept_downloads=True,
        )
        await ctx.add_init_script(
            "if(location.port==='8000')document.addEventListener('DOMContentLoaded',()=>document.documentElement.style.zoom='1.3')"
        )
        pg = await ctx.new_page()
        t0 = time.monotonic()
        await pg.goto(BASE + "/privacy")
        await pg.evaluate(
            """([notes, profile]) => new Promise(res => { localStorage.setItem('saar:profile', profile); const r = indexedDB.open('keyval-store', 1);
            r.onupgradeneeded = () => r.result.createObjectStore('keyval'); r.onsuccess = () => { const tx = r.result.transaction('keyval', 'readwrite');
            notes.forEach(n => tx.objectStore('keyval').put(n, n.id)); tx.oncomplete = res; }; })""",
            [NOTES, cap["profile"]],
        )
        await pg.goto(BASE + "/records")
        EV["records"] = round(time.monotonic() - t0, 2)
        await pg.wait_for_timeout(3500)
        async with pg.expect_download() as dl:
            await pg.get_by_role("button", name="Download all records (Excel)").click()
        path = D / "saar-all.csv"
        await (await dl.value).save_as(path)
        await pg.wait_for_timeout(1200)
        await pg.get_by_role("link", name="Gupta ji").click()
        EV["detail"] = round(time.monotonic() - t0, 2)
        await pg.wait_for_timeout(3000)
        for _ in range(5):
            await pg.mouse.wheel(0, 240)
            await pg.wait_for_timeout(600)
        await pg.get_by_label("Their WhatsApp number").fill("91234 56789")
        await pg.get_by_label(
            "Message language (detected from the call)"
        ).select_option("mr")
        EV["lang_mr"] = round(time.monotonic() - t0, 2)
        await pg.wait_for_timeout(3000)
        rows = list(csv.reader(open(path, encoding="utf-8-sig")))
        cells = "".join(
            "<tr>"
            + "".join(
                f"<{'th' if i == 0 else 'td'}>{html.escape(v)}</{'th' if i == 0 else 'td'}>"
                for v in r
            )
            + "</tr>"
            for i, r in enumerate(rows)
        )
        (D / "sheet.html").write_text(
            f"""<!doctype html><meta charset=utf-8><style>body{{margin:0;font:15px Segoe UI,sans-serif;background:#fff}}
        .bar{{background:#1E6B4C;color:#fff;padding:14px 22px;font-weight:600}}.f{{padding:8px 22px;border-bottom:1px solid #ddd;color:#555}}
        table{{border-collapse:collapse;margin:0}}th,td{{border:1px solid #d9d9d9;padding:7px 12px;white-space:nowrap}}th{{background:#f3f3f3;text-align:left}}
        tr:nth-child(odd) td{{background:#fbfbfb}}</style><div class=bar>saar-all.csv · opened in a spreadsheet</div><div class=f>fx &nbsp; =SUM(H2:H{len(rows)})</div><table>{cells}</table>""",
            encoding="utf-8",
        )
        await pg.goto((D / "sheet.html").as_uri())
        EV["sheet"] = round(time.monotonic() - t0, 2)
        await pg.wait_for_timeout(5000)
        await ctx.close()
        await br.close()
    json.dump(EV, open(D / "events_laptop.json", "w"), indent=1)
    print(EV)


asyncio.run(main())
