import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("склеивает классы", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("последний конфликтующий класс побеждает", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("игнорирует пустые значения", () => {
    expect(cn("p-2", false, undefined, null, "")).toBe("p-2");
  });
});
