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

  it("ловит штамп в тексте", () => {
    const report = check([
      makePost({ postContent: `Многие думают, что хлеб живёт неделю. ${LONG_TEXT}` }),
    ]);
    expect(report.defects[0]?.reasons.join(" ")).toMatch(/штамп «Многие думают»/);
  });

  /**
   * Первая версия проверки перечисляла точные фразы, и модель обошла её одним
   * синонимом: «многие предприниматели видят» вместо «думают». Здесь проверяется
   * именно это — что подстановка близкого слова больше не спасает.
   */
  it("синоним внутри штампа не помогает его пронести", () => {
    const variants = [
      "Многие предприниматели видят в ИИ решение всех проблем.",
      "Многие владельцы кафе уверены, что доставка не нужна.",
      "Многие боятся поднимать цены.",
    ];

    for (const opener of variants) {
      const report = check([makePost({ postContent: `${opener} ${LONG_TEXT}` })]);
      expect(report.defects[0]?.reasons.join(" "), opener).toMatch(/штамп/);
    }
  });

  it("ловит штамп в заголовке: его читатель видит первым", () => {
    const report = check([makePost({ title: "В современном мире хлеб черствеет быстрее" })]);
    expect(report.defects[0]?.reasons.join(" ")).toMatch(/в современном мире/i);
  });

  it("совет без адресата тоже считается водой", () => {
    const report = check([
      makePost({ postContent: `${LONG_TEXT} Начните с малого и тестируйте гипотезы.` }),
    ]);
    expect(report.defects[0]?.reasons.join(" ")).toMatch(/штамп/);
  });

  it("ловит «большинство считает», «каждый из нас» и «на сегодняшний день»", () => {
    const variants = [
      "Большинство считает, что хлеб должен лежать в пакете.",
      "Каждый из нас хотя бы раз выбрасывал чёрствую буханку.",
    ];
    for (const opener of variants) {
      const report = check([makePost({ postContent: `${opener} ${LONG_TEXT}` })]);
      expect(report.defects[0]?.reasons.join(" "), opener).toMatch(/штамп/);
    }

    const today = check([makePost({ title: "На сегодняшний день хлеб черствеет быстрее" })]);
    expect(today.defects[0]?.reasons.join(" ")).toMatch(/штамп/);
  });

  it("ловит пустые оценки «уникальный» и «инновационный»", () => {
    const unique = check([makePost({ postContent: `${LONG_TEXT} Это уникальный хлеб.` })]);
    const innov = check([makePost({ title: "Инновационный подход к закваске" })]);
    expect(unique.defects[0]?.reasons.join(" ")).toMatch(/уникальн/i);
    expect(innov.defects[0]?.reasons.join(" ")).toMatch(/инновационн/i);
  });

  it("живой текст без штампов проходит", () => {
    const report = check([
      makePost({
        postContent:
          "Вчера покупательница спросила: «А почему у вас хлеб дороже?» " +
          "Отвечаю: закваску кормим четыре дня, и за это время из муки уходит горечь. " +
          "Проверить просто — оставьте ломоть на столе на сутки. Наш зачерствеет, но не заплесневеет.",
      }),
    ]);
    expect(report.defects).toHaveLength(0);
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
