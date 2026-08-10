import { describe, expect, it } from "vitest";
import { ADMIN_MARKERS, findMarkers, PROMPT_MARKERS } from "./bundle-guard.mjs";

describe("поиск утечки", () => {
  // Логика поиска проверяется на своих маркерах, чтобы тест не падал каждый
  // раз, когда меняется список фраз промпта. Соответствие списка реальному
  // промпту проверяет отдельный тест server/prompt/leak-markers.test.ts.
  const markers = ["Тестовая Фраза Промпта"];

  it("находит маркер внутри минифицированного кода", () => {
    const minified = `const t="начало Тестовая Фраза Промпта конец";export{t};`;
    expect(findMarkers(minified, markers)).toContain("Тестовая Фраза Промпта");
  });

  it("не зависит от регистра — минификатор может изменить его", () => {
    expect(findMarkers("тестовая фраза промпта", markers)).toHaveLength(1);
  });

  it("молчит на обычном клиентском коде", () => {
    const clean = `export function App(){return React.createElement("div",null,"План на 7 дней")}`;
    expect(findMarkers(clean, markers)).toEqual([]);
  });
});

describe("список маркеров по умолчанию", () => {
  it("не пуст — иначе проверка стала бы декорацией", () => {
    expect(PROMPT_MARKERS.length).toBeGreaterThan(5);
  });

  it("используется, когда маркеры не переданы явно", () => {
    expect(findMarkers("... Zero Click Value ...")).toContain("Zero Click Value");
  });
});

describe("маркеры панели управления", () => {
  it("список не пуст: иначе клиентская сборка проверялась бы ни на что", () => {
    expect(ADMIN_MARKERS.length).toBeGreaterThan(3);
  });

  it("ловят и разметку панели, и её вызовы к серверу", () => {
    const chunk = `const t="Выдать доступ";fetch(u,{body:JSON.stringify({action:"reset-session"})})`;
    expect(findMarkers(chunk, ADMIN_MARKERS)).toEqual(
      expect.arrayContaining(["Выдать доступ", "reset-session"]),
    );
  });

  it("не срабатывают на клиентском коде", () => {
    const chunk = `const t="Мои планы";const u="Осталось 18 из 20";`;
    expect(findMarkers(chunk, ADMIN_MARKERS)).toEqual([]);
  });
});
