import { describe, expect, it } from "vitest";
import type { ContentType, GeneratedPost } from "../../contracts/index.ts";
import { checkPlanQuality } from "./quality.ts";

const LONG_TEXT =
  "Хлеб черствеет из-за тёплого пакета. Дайте буханке остыть на решётке два часа, " +
  "затем заверните в лён и держите при комнатной температуре, срезом вниз. " +
  "Холодильник ускоряет черствение, поэтому туда хлеб не убирают никогда.";

function makePost(overrides: Partial<GeneratedPost> = {}): GeneratedPost {
  return {
    number: 1,
    date: "2026-03-02",
    time: "10:00",
    platform: "telegram",
    rubric: "Разбор ошибки",
    format: "Текстовый пост",
    title: "Почему хлеб черствеет за сутки",
    hook: "Вы убираете хлеб тёплым.",
    description: "Разбор ошибки хранения.",
    script: "",
    type: "Обучающий",
    cta: "Расскажите, как храните хлеб.",
    hashtags: ["#хлеб"],
    visual: "Буханка на решётке.",
    visualStyle: "craft-design",
    imagePrompt: "sourdough loaf on a rack, --ar 16:9",
    postContent: LONG_TEXT,
    ...overrides,
  };
}

const NO_EXPECTATIONS: Record<ContentType, number> = {
  Обучающий: 0,
  Вовлекающий: 0,
  Экспертный: 0,
  Продающий: 0,
};

/**
 * По умолчанию ожидаемые пропорции считаются от самих постов: иначе проверка
 * пропорций шумит в тестах, которые проверяют совсем другое.
 */
function actualCounts(posts: readonly GeneratedPost[]): Record<ContentType, number> {
  const counts = { ...NO_EXPECTATIONS };
  for (const post of posts) counts[post.type] += 1;
  return counts;
}

function check(posts: readonly GeneratedPost[], infoPlanMode = false) {
  return checkPlanQuality({ posts, expectedTypeCounts: actualCounts(posts), infoPlanMode });
}

describe("проверка отдельного поста", () => {
  it("хороший пост проходит", () => {
    expect(check([makePost()]).defects).toHaveLength(0);
  });

  it("ловит пустой текст поста", () => {
    const report = check([makePost({ postContent: "Скоро расскажу." })]);
    expect(report.defects[0]?.reasons.join(" ")).toMatch(/короткий/);
  });

  it("ловит тизер вместо содержания", () => {
    const report = check([
      makePost({ postContent: `${LONG_TEXT} Остальное смотри карусель в профиле.` }),
    ]);
    expect(report.defects[0]?.reasons.join(" ")).toMatch(/смотри карусель/);
  });

  it("ловит обещанные пункты, которых нет в тексте", () => {
    const report = check([
      makePost({ title: "5 ошибок при хранении хлеба", postContent: LONG_TEXT }),
    ]);
    expect(report.defects[0]?.reasons.join(" ")).toMatch(/обещает 5 пунктов/);
  });

  it("не придирается, когда все обещанные пункты перечислены", () => {
    const list = ["1. Тёплый пакет.", "2. Холодильник.", "3. Тонкая нарезка."].join("\n");
    const report = check([
      makePost({
        title: "3 ошибки при хранении хлеба",
        postContent: `${LONG_TEXT}\n${list}`,
      }),
    ]);
    expect(report.defects).toHaveLength(0);
  });

  it("ловит текст, который сильно длиннее лимита площадки", () => {
    const report = check([makePost({ platform: "max", postContent: LONG_TEXT.repeat(5) })]);
    expect(report.defects[0]?.reasons.join(" ")).toMatch(/длиннее лимита/);
  });

  it("в режиме инфо-плана ловит рекламные слова", () => {
    const report = check([makePost({ postContent: `${LONG_TEXT} Только сегодня скидка.` })], true);
    expect(report.defects[0]?.reasons.join(" ")).toMatch(/скидка/);
  });

  it("вне инфо-плана рекламные слова разрешены", () => {
    const report = check([makePost({ postContent: `${LONG_TEXT} Только сегодня скидка.` })]);
    expect(report.defects).toHaveLength(0);
  });
});

describe("проверка плана целиком", () => {
  it("ловит повтор заголовка", () => {
    const report = check([makePost({ number: 1 }), makePost({ number: 2 })]);
    expect(report.defects.map((defect) => defect.number)).toEqual([2]);
    expect(report.defects[0]?.reasons.join(" ")).toMatch(/повторяет пост №1/);
  });

  it("не считает повтором разные заголовки", () => {
    const report = check([
      makePost({ number: 1 }),
      makePost({ number: 2, title: "Чем закваска отличается от дрожжей" }),
    ]);
    expect(report.defects).toHaveLength(0);
  });

  it("ловит визуальный стиль три раза подряд", () => {
    const posts = [1, 2, 3].map((number) =>
      makePost({ number, title: `Заголовок ${String(number)}`, visualStyle: "craft-design" }),
    );
    expect(check(posts).planWarnings.join(" ")).toMatch(/craft-design/);
  });

  it("два раза подряд стилю разрешено", () => {
    const posts = [1, 2].map((number) =>
      makePost({ number, title: `Заголовок ${String(number)}`, visualStyle: "craft-design" }),
    );
    expect(check(posts).planWarnings).toHaveLength(0);
  });

  it("замечает нарушение пропорций типов", () => {
    const report = checkPlanQuality({
      posts: [1, 2, 3, 4].map((number) =>
        makePost({ number, title: `Заголовок ${String(number)}`, type: "Продающий" }),
      ),
      expectedTypeCounts: { ...NO_EXPECTATIONS, Обучающий: 4 },
      infoPlanMode: false,
    });
    expect(report.planWarnings.join(" ")).toMatch(/Обучающий/);
  });
});
