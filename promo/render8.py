"""Render film8.html to PNGs. `render.py 5 12.5 30` renders preview frames at those seconds."""
import asyncio, json, pathlib, sys
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).parent
CFG = json.load(open(ROOT / "cues.json"))
OUT = ROOT / "frames8"
OUT.mkdir(exist_ok=True)
N, WORKERS = 1800, 5


async def work(br, frames):
    pg = await br.new_page(viewport={"width": 1080, "height": 1920})
    pg.on("pageerror", lambda e: print("JS ERROR", e))
    await pg.add_init_script("window.CFG=" + json.dumps(CFG))
    await pg.goto((ROOT / "film8.html").resolve().as_uri())
    await pg.evaluate("document.fonts.ready")
    for i in frames:
        await pg.evaluate(f"renderAt({i/30})")
        await pg.screenshot(path=str(OUT / f"{i:05d}.png"))
    await pg.close()


async def main():
    frames = [round(float(x) * 30) for x in sys.argv[1:]] or list(range(N))
    async with async_playwright() as p:
        br = await p.chromium.launch()
        await asyncio.gather(*(work(br, frames[k::WORKERS]) for k in range(WORKERS)))
        await br.close()

asyncio.run(main())
