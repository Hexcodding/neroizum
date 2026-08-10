import { describe, expect, it } from "vitest";
import { findMarkers, PROMPT_MARKERS } from "./bundle-guard.mjs";

describe("защита промпта", () => {
  it("находит маркер внутри минифицированного кода", () => {
    const minified = `const t="Ты Senior Content Architect и работаешь";export{t};`;
    expect(findMarkers(minified)).toContain("Senior Content Architect");
  });

  it("не зависит от регистра — минификатор может изменить его", () => {
    expect(findMarkers("zero click value")).toContain("Zero Click Value");
  });

  it("молчит на обычном клиентском коде", () => {
    const clean = `export function App(){return React.createElement("div",null,"План на 7 дней")}`;
    expect(findMarkers(clean)).toEqual([]);
  });

  it("список маркеров не пуст — иначе проверка стала бы декорацией", () => {
    expect(PROMPT_MARKERS.length).toBeGreaterThan(0);
  });
});
