import { expect, Page, test } from "@playwright/test";

async function setup(page: Page, url: string, name: string, lang: string) {
  await page.goto(url);
  await page.getByLabel(/Your name/).fill(name);
  await page.getByLabel(/I speak in/).selectOption(lang);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/room\//);
}

test("two phones: consent gating, captions on both, quick note, revoke, delete", async ({ browser }) => {
  const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 };
  const hostCtx = await browser.newContext(phone);
  const guestCtx = await browser.newContext(phone);
  const shot = (p: Page, name: string) => p.screenshot({ path: `../docs/screenshots/${name}.png` });
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();

  await setup(host, "/setup?mode=create", "Asha", "en-IN");
  const code = (await host.locator(".code").textContent())!.trim();
  await setup(guest, `/join/${code}`, "Ravi", "mr-IN");

  // consent gating: host cannot start until both agree
  const start = host.getByRole("button", { name: "Start transcribing" });
  await expect(host.getByText("Ravi · mr-IN")).toBeVisible();
  await expect(start).toBeDisabled();
  await host.getByRole("button", { name: "I agree" }).click();
  await expect(start).toBeDisabled();
  await guest.getByRole("button", { name: "I agree" }).click();
  await expect(start).toBeEnabled();
  await shot(host, "1-lobby-consent");
  await start.click();

  // live captions from BOTH speakers appear on BOTH phones
  for (const p of [host, guest]) {
    await expect(p.getByText("Transcribing", { exact: true })).toBeVisible();
    const captions = p.getByLabel("Live captions");
    await expect(captions.getByText("Namaste, mujhe do kilo atta chahiye").first()).toBeVisible({ timeout: 20_000 });
    await expect(captions.getByText("हो, ₹२५० होतील").first()).toBeVisible({ timeout: 20_000 });
  }

  await shot(guest, "2-call-captions");

  // quick note lands in Notes on both devices
  await expect(async () => {
    await host.getByRole("button", { name: "Quick note" }).click();
    await expect(host.getByText("Note saved to Notes")).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30_000 });
  await expect(guest.getByText("Note saved to Notes")).toBeVisible();

  // revoke on the guest stops capture for everyone
  await guest.getByRole("button", { name: "Revoke consent / Stop" }).click();
  for (const p of [host, guest]) {
    await expect(p.getByText("Starts when everyone has agreed")).toBeVisible();
    await expect(p.getByText("Transcribing", { exact: true })).toHaveCount(0);
  }
  await expect(host.getByText("The other person stopped transcription.")).toBeVisible();

  // note is in the guest's local Notes, opens, and can be deleted
  await guest.goto("/notes");
  const card = guest.locator(".card").filter({ hasText: "quick" });
  await expect(card).toHaveCount(1);
  await card.getByRole("link").click();
  await expect(guest.getByRole("heading", { name: "Summary" })).toBeVisible();
  await shot(guest, "3-note");
  guest.once("dialog", (d) => d.accept());
  await guest.getByRole("button", { name: "Delete" }).click();
  await expect(guest.getByText("No notes yet")).toBeVisible();
});

test("third person gets a clear room-full error", async ({ browser }) => {
  const [a, b, c] = await Promise.all([1, 2, 3].map(async () => (await browser.newContext()).newPage()));
  await setup(a, "/setup?mode=create", "A", "en-IN");
  const code = (await a.locator(".code").textContent())!.trim();
  await setup(b, `/join/${code}`, "B", "hi-IN");
  await c.goto(`/join/${code}`);
  await c.getByLabel(/Your name/).fill("C");
  await c.getByRole("button", { name: "Continue" }).click();
  await expect(c.getByRole("alert")).toHaveText(/already has two people/);
});
