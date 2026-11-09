"""Record a real two-phone Saar call against a local server: real Prisma transcription, real note, both confirmations.

Start the backend on port 8000 first, then run `python record_call.py`. Event times are written to call_events.json.
"""

import asyncio, json, pathlib, time
from playwright.async_api import async_playwright, expect

BASE = "http://127.0.0.1:8000"
D = pathlib.Path(__file__).parent
PHONE = dict(
    viewport={"width": 780, "height": 1688},
    device_scale_factor=1,
    permissions=["microphone"],
)
EV = {}


def mark(k, t0):
    EV[k] = round(time.monotonic() - t0, 2)
    print(k, EV[k], flush=True)


async def phone(p, who):
    br = await p.chromium.launch(
        args=[
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            f"--use-file-for-fake-audio-capture={D / f'mic_{who}.wav'}",
            "--autoplay-policy=no-user-gesture-required",
        ]
    )
    ctx = await br.new_context(
        **PHONE,
        record_video_dir=str(D / f"rec_{who}"),
        record_video_size={"width": 780, "height": 1688},
    )
    await ctx.add_init_script(
        "document.addEventListener('DOMContentLoaded',()=>document.documentElement.style.zoom='2')"
    )  # crisp 2x capture of the 390-px phone layout
    # demo recording only: two headless browsers on one PC can't open the WebRTC voice link, so hide those two notices
    await ctx.add_init_script(
        """new MutationObserver(()=>document.querySelectorAll('.banner,.info,[role=alert]').forEach(e=>{if(/couldn.t connect|can.t hear you/i.test(e.textContent))e.style.display='none'})).observe(document,{subtree:true,childList:true,characterData:true})"""
    )
    return br, ctx, await ctx.new_page()


async def setup(pg, name, num):
    await pg.goto(BASE + "/")
    await pg.wait_for_timeout(900)
    await pg.get_by_label("Name").press_sequentially(name, delay=60)
    await pg.get_by_label("Your mobile number").press_sequentially(num, delay=55)
    await pg.wait_for_timeout(400)
    await pg.get_by_role("button", name="Continue").click()
    await expect(pg.get_by_role("button", name="Call")).to_be_visible()


async def main():
    async with async_playwright() as p:
        bj, cj, J = await phone(p, "J")
        bg, cg, Gp = await phone(p, "G")
        t0 = time.monotonic()
        await asyncio.gather(
            setup(J, "Jugaadu Lal", "98765 43210"), setup(Gp, "Gupta ji", "91234 56789")
        )
        mark("setup_done", t0)
        await J.wait_for_timeout(1200)
        await J.get_by_role("button", name="Call").click()
        await J.wait_for_timeout(700)
        await J.get_by_label("Mobile number").press_sequentially(
            "91234 56789", delay=70
        )
        await J.get_by_role("button", name="Call", exact=True).click()
        mark("dial", t0)
        await expect(Gp.get_by_role("dialog")).to_be_visible(timeout=15000)
        mark("ring", t0)
        await Gp.wait_for_timeout(1800)
        await Gp.get_by_role("button", name="Accept").click()
        mark("accept", t0)
        for pg in (J, Gp):
            await expect(pg.get_by_text("Transcribing", exact=True)).to_be_visible(
                timeout=20000
            )
        mark("live", t0)
        await J.wait_for_timeout(
            36000
        )  # the scripted conversation plays through both fake mics
        mark("talk_done", t0)
        await J.get_by_role("button", name="End").click()
        mark("end", t0)
        for pg in (J, Gp):
            await expect(pg.get_by_role("button", name="Confirm")).to_be_visible(
                timeout=60000
            )
        mark("note", t0)
        await J.wait_for_timeout(4000)
        await J.mouse.wheel(0, 500)
        await Gp.mouse.wheel(0, 500)
        await J.wait_for_timeout(2500)
        await J.get_by_role("button", name="Confirm").click()
        mark("confirm_j", t0)
        await Gp.wait_for_timeout(1500)
        await Gp.get_by_role("button", name="Confirm").click()
        mark("confirm_g", t0)
        for pg in (J, Gp):
            await expect(pg.get_by_text("Confirmed by all participants")).to_be_visible(
                timeout=20000
            )
        mark("final", t0)
        await J.wait_for_timeout(2500)
        await J.mouse.wheel(0, 900)
        await J.wait_for_timeout(2500)
        notes = await J.evaluate("""() => new Promise(res => { const r = indexedDB.open('keyval-store'); r.onsuccess = () => {
            const tx = r.result.transaction('keyval'); const all = tx.objectStore('keyval').getAll(); all.onsuccess = () => res(all.result); }; })""")
        profile = await J.evaluate("() => localStorage.getItem('saar:profile')")
        json.dump(
            {"notes": notes, "profile": profile},
            open(D / "captured_notes.json", "w", encoding="utf-8"),
            ensure_ascii=False,
        )
        await J.get_by_role("button", name="Done").click()
        await J.wait_for_timeout(1500)
        await J.get_by_role("link", name="Records").click()
        mark("records", t0)
        await J.wait_for_timeout(2000)
        await J.get_by_role("link", name="Gupta ji").click()
        await J.wait_for_timeout(2500)
        for _ in range(6):
            await J.mouse.wheel(0, 260)
            await J.wait_for_timeout(700)
        mark("wa", t0)
        await J.wait_for_timeout(3000)
        for c, b in ((cj, bj), (cg, bg)):
            await c.close()
            await b.close()
    json.dump(EV, open(D / "call_events.json", "w"), indent=1)


asyncio.run(main())
