/**
 * Поддельный AI-провайдер для тестов.
 *
 * Он читает расписание прямо из промпта и отвечает постами ровно на те слоты,
 * которые в нём перечислены. Так тесты проверяют настоящую сборку промпта и
 * настоящую раскладку ответа по слотам, а не заранее заготовленный ответ.
 */
import type { GenerationError } from "../errors.ts";
import type { AiProvider, AiRequest, AiResponse } from "../provider/types.ts";

export interface PromptSlot {
  readonly number: number;
  readonly date: string;
  readonly platform: string;
}

const SLOT_LINE = /^(\d+) \| (\d{4}-\d{2}-\d{2}) \(([^)]+)\) \| (\w+)$/gm;

export function slotsFromPrompt(prompt: string): PromptSlot[] {
  const slots: PromptSlot[] = [];
  for (const match of prompt.matchAll(SLOT_LINE)) {
    const [, number, date, , platform] = match;
    if (number === undefined || date === undefined || platform === undefined) continue;
    slots.push({ number: Number(number), date, platform });
  }
  return slots;
}

const GOOD_TEXT =
  "Хлеб на закваске сохнет за день по одной причине: его убирают в пакет тёплым. " +
  "Дайте буханке остыть на решётке два часа, потом заверните в лён и держите при комнатной температуре. " +
  "Срез вниз, на доску — так мякиш не отдаёт влагу воздуху. " +
  "В холодильник не кладите: там хлеб черствеет быстрее всего, это подтвердит любой пекарь.";

export function makePostJson(
  slot: PromptSlot,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    number: slot.number,
    date: slot.date,
    time: "10:00",
    platform: slot.platform,
    rubric: "Разбор ошибки",
    format: "Текстовый пост",
    title: `Почему хлеб черствеет за сутки, пост ${String(slot.number)}`,
    hook: "Вы убираете хлеб в пакет тёплым — и он сохнет к утру.",
    description: "Разбор частой ошибки хранения хлеба.",
    script: "",
    type: "Обучающий",
    cta: "Расскажите, как храните хлеб вы.",
    hashtags: ["#хлеб", "#закваска", "#пекарня"],
    visual: "Буханка на решётке у окна, утренний свет.",
    visualStyle: slot.number % 2 === 0 ? "flash-candid" : "craft-design",
    imagePrompt:
      "candid smartphone photo of a sourdough loaf cooling on a wire rack near a window, direct flash, imperfect crumbs, linen cloth, morning light, ultra detailed, --ar 16:9",
    postContent: GOOD_TEXT,
    ...overrides,
  };
}

/** Что провайдер делает на очередном вызове. */
export type FakeBehaviour =
  | { readonly kind: "ok" }
  | {
      readonly kind: "ok-with";
      readonly overrides: Record<string, unknown>;
      /** Испортить только один пост из части, а не все сразу. */
      readonly onlyIndex?: number;
    }
  | { readonly kind: "truncated" }
  | { readonly kind: "raw"; readonly text: string }
  | { readonly kind: "fail"; readonly error: GenerationError }
  | { readonly kind: "partial"; readonly count: number };

export interface FakeProvider extends AiProvider {
  readonly calls: { readonly model: string; readonly prompt: string }[];
}

function respond(behaviour: FakeBehaviour, prompt: string, model: string): AiResponse {
  const slots = slotsFromPrompt(prompt);

  if (behaviour.kind === "raw") {
    return { text: behaviour.text, truncated: false, model };
  }
  if (behaviour.kind === "truncated") {
    const body = slots.map((slot) => JSON.stringify(makePostJson(slot))).join(",\n");
    // Ответ обрывается на середине последнего объекта, без закрывающей скобки.
    return { text: `[${body},\n{"number": 99, "title": "обор`, truncated: true, model };
  }

  const chosen = behaviour.kind === "partial" ? slots.slice(0, behaviour.count) : slots;
  const posts = chosen.map((slot, index) => {
    if (behaviour.kind !== "ok-with") return makePostJson(slot);
    const applies = behaviour.onlyIndex === undefined || behaviour.onlyIndex === index;
    return makePostJson(slot, applies ? behaviour.overrides : {});
  });
  return { text: JSON.stringify(posts), truncated: false, model };
}

export function createFakeProvider(
  script: readonly FakeBehaviour[] = [],
  models: readonly string[] = ["fake-fast", "fake-smart"],
): FakeProvider {
  const calls: { model: string; prompt: string }[] = [];

  return {
    name: "fake",
    models,
    calls,
    call(model: string, request: AiRequest): Promise<AiResponse> {
      const behaviour = script[calls.length] ?? { kind: "ok" };
      calls.push({ model, prompt: request.prompt });

      if (behaviour.kind === "fail") return Promise.reject(behaviour.error);
      return Promise.resolve(respond(behaviour, request.prompt, model));
    },
  };
}
