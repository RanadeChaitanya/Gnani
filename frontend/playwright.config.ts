import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Two browser contexts = two phones. Fake mic plays e2e/speech.wav; backend uses the fake Gnani server
// and the mock LLM, with no call audio (CALL_AUDIO_PROVIDER=none). Run `npm run build` first.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const py = path.join(root, "backend", ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const db = path.join(mkdtempSync(path.join(tmpdir(), "saar-e2e-")), "e2e.db").replace(/\\/g, "/");

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  use: {
    baseURL: "http://127.0.0.1:8011",
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        `--use-file-for-fake-audio-capture=${path.join(root, "frontend", "e2e", "speech.wav")}`,
        "--autoplay-policy=no-user-gesture-required",
      ],
    },
    permissions: ["microphone"],
  },
  webServer: [
    { command: `"${py}" scripts/fake_gnani_server.py --port 9011`, cwd: path.join(root, "backend"), port: 9011 },
    {
      command: `"${py}" -m uvicorn app.main:app --port 8011`,
      cwd: path.join(root, "backend"),
      url: "http://127.0.0.1:8011/api/health",
      env: {
        DATABASE_URL: `sqlite:///${db}`,
        LLM_PROVIDER: "mock",
        CALL_AUDIO_PROVIDER: "none",
        GNANI_API_KEY: "fake",
        GNANI_WS_URL_OVERRIDE: "ws://127.0.0.1:9011/stt/v3/stream",
        JWT_SECRET: "e2e-secret-e2e-secret-e2e-secret-32",
        MIC_AEC: "false",
        MIC_NS: "false",
        MIC_AGC: "false",
        RATE_LIMIT_PER_MIN: "1000",
      },
    },
  ],
});
