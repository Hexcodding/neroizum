import { describe, expect, it } from "vitest";
import { isValidPromptVersion, PROMPT_VERSION } from "./version.ts";

describe("версия промпта", () => {
  it("имеет корректный формат", () => {
    expect(isValidPromptVersion(PROMPT_VERSION)).toBe(true);
  });

  it("отвергает мусор", () => {
    expect(isValidPromptVersion("v1")).toBe(false);
    expect(isValidPromptVersion("1.0")).toBe(false);
    expect(isValidPromptVersion("")).toBe(false);
  });
});
