import { expect, it } from "vitest";
import { strings } from "./i18n";

it("every English string has a non-empty Hindi translation", () => {
  for (const k of Object.keys(strings.en)) expect((strings.hi as Record<string, string>)[k], k).toBeTruthy();
  expect(Object.keys(strings.hi).sort()).toEqual(Object.keys(strings.en).sort());
});
