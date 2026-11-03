import { Browser, expect, Page, test } from "@playwright/test";

const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 };
const shot = (p: Page, name: string) => p.screenshot({ path: `../docs/screenshots/${name}.png` });
const live = (p: Page) => p.getByText("Transcribing", { exact: true });

/** First run on a phone: name, own number, language → Continue. */
async function setUp(browser: Browser, name: string, number: string, lang: string): Promise<Page> {
  const page = await (await browser.newContext(phone)).newPage();
  await page.goto("/");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Your mobile number").fill(number);
  if (lang !== "auto") {
    await page.getByText("Language: detected automatically").click();
    await page.getByRole("combobox").selectOption(lang);
  }
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("button", { name: /Call someone/ })).toBeVisible();
  return page;
}

async function dial(page: Page, number: string) {
  await page.getByRole("button", { name: /Call someone/ }).click();
  await page.getByLabel("Mobile number").fill(number);
  await page.getByRole("button", { name: "Call", exact: true }).click();
  await expect(page).toHaveURL(/\/room\//);
}

test("call by number: it rings, accept, captions on both, stop/resume, both confirm the note", async ({ browser }) => {
  const host = await setUp(browser, "Asha", "98765 43210", "en-IN");
  const guest = await setUp(browser, "Ravi", "91234 56789", "mr-IN");
  await shot(host, "0-home");

  await dial(host, "9123456789");
  await expect(host.getByText("Ringing…")).toBeVisible();
  await expect(live(host)).toHaveCount(0); // nothing is transcribed until the other person accepts
  await shot(host, "1-calling");

  await expect(guest.getByRole("dialog", { name: "Incoming Saar call" })).toBeVisible({ timeout: 10_000 });
  await expect(guest.getByRole("heading", { name: "Asha" })).toBeVisible();
  await shot(guest, "2-incoming");
  await guest.getByRole("button", { name: "Accept call" }).click();

  for (const p of [host, guest]) {
    await expect(live(p)).toBeVisible({ timeout: 10_000 });
    const captions = p.getByLabel("Live captions");
    await expect(captions.getByText("Namaste, mujhe do kilo atta chahiye").first()).toBeVisible({ timeout: 20_000 });
    await expect(captions.getByText("हो, ₹२५० होतील").first()).toBeVisible({ timeout: 20_000 });
  }
  await shot(guest, "3-call");

  // either person can stop; it stops for both, and agreeing again resumes
  await guest.getByRole("button", { name: "Stop" }).click();
  for (const p of [host, guest]) await expect(live(p)).toHaveCount(0);
  await expect(host.getByText("The other person stopped transcription.")).toBeVisible();
  await guest.getByRole("button", { name: "I agree" }).click();
  for (const p of [host, guest]) await expect(live(p)).toBeVisible({ timeout: 10_000 });

  await host.getByRole("button", { name: "End" }).click();
  for (const p of [host, guest]) await expect(p.getByText("Is this note correct?")).toBeVisible({ timeout: 20_000 });
  await expect(guest.getByText("Draft", { exact: true })).toBeVisible();
  await shot(guest, "4-review");

  // a correction rewrites the note and asks both again
  await guest.getByRole("button", { name: /Something is wrong/ }).click();
  await guest.getByLabel("What should change?").fill("Atta is 3 kg");
  await guest.getByRole("button", { name: "Send correction" }).click();
  for (const p of [host, guest]) await expect(p.getByText("Ravi: Atta is 3 kg")).toBeVisible({ timeout: 20_000 });

  await host.getByRole("button", { name: /Yes, the note is correct/ }).click();
  await expect(host.getByText("Waiting for Ravi to confirm…")).toBeVisible();
  await guest.getByRole("button", { name: /Yes, the note is correct/ }).click();
  for (const p of [host, guest]) {
    await expect(p.getByText("Confirmed by all participants")).toBeVisible();
    await expect(p.getByRole("button", { name: /Phone notes/ })).toBeVisible();
    await expect(p.getByRole("button", { name: /WhatsApp/ })).toBeVisible();
  }
  await shot(host, "5-final-note");

  await host.getByRole("button", { name: "Done" }).click();
  const row = host.locator(".note-row").first();
  await expect(row.getByText("Confirmed")).toBeVisible();
  await row.click();
  await expect(host.getByText("Confirmed by all participants")).toBeVisible();
  await host.getByText("Transcript, Markdown file, delete").click();
  host.once("dialog", (d) => d.accept());
  await host.getByRole("button", { name: "Delete" }).click();
  await expect(host.getByText(/No notes yet/)).toBeVisible();
});

test("not on Saar: invite link, one tap to accept; a third person can't join", async ({ browser }) => {
  const host = await setUp(browser, "Meena", "99887 76655", "auto");
  await dial(host, "8000000001");
  await expect(host.getByText("Not on Saar right now")).toBeVisible();
  await expect(host.getByRole("link", { name: "Send invite on WhatsApp" })).toHaveAttribute("href", /wa\.me\/918000000001\?text=/);
  const code = host.url().split("/room/")[1];

  const guest = await (await browser.newContext(phone)).newPage();
  await guest.goto(`/join/${code}`);
  await expect(guest.getByRole("heading", { name: "Meena" })).toBeVisible();
  await guest.getByLabel("Name").fill("Sunil");
  await guest.getByRole("button", { name: "Accept call" }).click();
  for (const p of [host, guest]) await expect(live(p)).toBeVisible({ timeout: 10_000 });

  const third = await (await browser.newContext()).newPage();
  await third.goto(`/join/${code}`);
  await expect(third.getByText("This call already has two people.")).toBeVisible();
  await expect(third.getByRole("button", { name: "Accept call" })).toBeDisabled();
});

test("a frozen mic pipeline is detected and rebuilt by itself", async ({ browser }) => {
  const page = await setUp(browser, "Asha", "97000 00001", "hi-IN");
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
  await page.reload();
  await page.getByText(/How it works/).click();
  await page.getByRole("button", { name: "Try alone" }).click();
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
