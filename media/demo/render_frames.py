"""Render scene.html frame by frame at 30 fps into frames/.

Recordings must first be split into fr/J, fr/G and fr/L (see the README). `render_frames.py 5 30.5` renders preview frames only.
"""

import asyncio, json, pathlib, sys, os
from playwright.async_api import async_playwright

D = pathlib.Path(__file__).parent
TL = json.load(open(D / "timeline.json"))
NF = {k: len(os.listdir(D / "fr" / k)) for k in "JGL"}
CFG = {"timeline": TL, "nframes": NF}
OUT = D / "frames"
OUT.mkdir(exist_ok=True)
N = int((TL[-1]["s"] + TL[-1]["d"]) * 30)
W = 6


async def work(br, frames):
    pg = await br.new_page(viewport={"width": 1920, "height": 1080})
    pg.on("pageerror", lambda e: print("JS ERROR", e))
    await pg.add_init_script("window.CFG=" + json.dumps(CFG))
    await pg.goto((D / "scene.html").resolve().as_uri())
    await pg.evaluate("document.fonts.ready")
    for i in frames:
        await pg.evaluate(f"renderAt({i / 30})")
        await pg.screenshot(path=str(OUT / f"{i:05d}.jpg"), type="jpeg", quality=92)
    await pg.close()


async def main():
    fr = [round(float(x) * 30) for x in sys.argv[1:]] or list(range(N))
    async with async_playwright() as p:
        br = await p.chromium.launch(args=["--allow-file-access-from-files"])
        await asyncio.gather(*(work(br, fr[k::W]) for k in range(W)))
        await br.close()
    print("frames", len(fr), "of", N)


asyncio.run(main())
