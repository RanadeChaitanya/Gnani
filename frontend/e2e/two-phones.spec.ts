import { expect, Page, test } from "@playwright/test";

async function enter(page: Page, url: string, name: string, lang: string, button: RegExp) {
  await page.goto(url);
  await page.getByLabel(/Your name/).fill(name);
  await page.getByLabel(/speak in/).selectOption(lang);
  await page.getByRole("button", { name: button }).click();
  await expect(page).toHaveURL(/\/room\//);
}

const live = (p: Page) => p.getByText("Transcribing", { exact: true });

test("two phones: one-tap consent, auto start, live captions on both, note, stop, delete", async ({ browser }) => {
  const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 };
  const host = await (await browser.newContext(phone)).newPage();
  const guest = await (await browser.newContext(phone)).newPage();
  const shot = (p: Page, name: string) => p.screenshot({ path: `../docs/screenshots/${name}.png` });

  await enter(host, "/setup?mode=create", "Asha", "en-IN", /Agree & start call/);
  // consent gating: nothing is transcribed while the host is alone
  await expect(host.getByText("Waiting for the other person").first()).toBeVisible();
  await expect(host.getByRole("img", { name: /QR code/ })).toBeVisible();
  await expect(live(host)).toHaveCount(0);
  await shot(host, "1-lobby-qr");
  const code = (await host.locator(".code").textContent())!.trim();

  await guest.goto(`/join/${code}`);
  await expect(guest.getByRole("heading", { name: /Join a call with\s*Asha/ })).toBeVisible();
  await shot(guest, "0-join");
  await enter(guest, `/join/${code}`, "Ravi", "mr-IN", /Agree & join/);

  // starts by itself once both agreed; captions from BOTH speakers on BOTH phones
  for (const p of [host, guest]) {
    await expect(live(p)).toBeVisible({ timeout: 10_000 });
    const captions = p.getByLabel("Live captions");
    await expect(captions.getByText("Namaste, mujhe do kilo atta chahiye").first()).toBeVisible({ timeout: 20_000 });
    await expect(captions.getByText("हो, ₹२५० होतील").first()).toBeVisible({ timeout: 20_000 });
  }
  await shot(guest, "2-call-captions");

  await expect(async () => {
    await host.getByRole("button", { name: "Note now" }).click();
    await expect(host.getByText("Note ready")).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30_000 });
  await expect(guest.getByText("Note ready")).toBeVisible();

  // stop on the guest stops capture for everyone
  await guest.getByRole("button", { name: "Stop" }).click();
  for (const p of [host, guest]) await expect(live(p)).toHaveCount(0);
  await expect(host.getByText("The other person stopped transcription.")).toBeVisible();
  await expect(guest.getByRole("button", { name: "I agree" })).toBeVisible();

  await guest.goto("/notes");
  const row = guest.locator(".note-row").filter({ hasText: "quick" });
  await expect(row).toHaveCount(1);
  await row.click();
  await expect(guest.getByText("Mock note (no LLM).")).toBeVisible();
  await expect(guest.getByRole("button", { name: "Share" })).toBeVisible();
  await shot(guest, "3-note");
  await guest.getByText("More", { exact: true }).click();
  guest.once("dialog", (d) => d.accept());
  await guest.getByRole("button", { name: "Delete" }).click();
  await expect(guest.getByText("No notes yet")).toBeVisible();
});

test("third person sees the call is full before joining", async ({ browser }) => {
  const [a, b, c] = await Promise.all([1, 2, 3].map(async () => (await browser.newContext()).newPage()));
  await enter(a, "/setup?mode=create", "A", "en-IN", /Agree & start call/);
  const code = (await a.locator(".code").textContent())!.trim();
  await enter(b, `/join/${code}`, "B", "hi-IN", /Agree & join/);
  await c.goto(`/join/${code}`);
  await expect(c.getByText("This call already has two people.")).toBeVisible();
  await expect(c.getByRole("button", { name: /Agree & join/ })).toBeDisabled();
});

test("a frozen mic pipeline is detected and rebuilt by itself", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.addInitScript(() => {
    const w = window as unknown as { __ctxs: AudioContext[]; AudioContext: typeof AudioContext };
    const Orig = w.AudioContext;
    w.__ctxs = [];
    w.AudioContext = class extends Orig {
      constructor(o?: AudioContextOptions) {
        super(o);
        w.__ctxs.push(this);
      }
    };
  });
  await enter(page, "/setup?mode=solo", "Asha", "hi-IN", /Agree & start test/);
  await expect(live(page)).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(1500);
  // what phones did in the real test: the audio engine silently stops
  await page.evaluate(() => (window as unknown as { __ctxs: AudioContext[] }).__ctxs.forEach((c) => void c.suspend()));
  await expect
    .poll(() => page.evaluate(() => {
      const c = (window as unknown as { __ctxs: AudioContext[] }).__ctxs;
      return c.length >= 2 && c[c.length - 1].state === "running";
    }), { timeout: 15_000 })
    .toBe(true);
  await expect(live(page)).toBeVisible();
  await expect(page.getByText("Your mic stopped reaching Saar.")).toHaveCount(0, { timeout: 5_000 });
});
