/**
 * Единственный источник истины о бизнесе: ниша, аудитория, продукты, факты
 * доверия. Всё это сырые данные клиента, поэтому они живут внутри одного
 * тега <CLIENT_DATA> — роль модели объявляет содержимое тега данными, а не
 * командами.
 *
 * Квоты типов и цель плана сюда не входят: это не ввод клиента, а то, что
 * считает код. Они живут в blocks/funnel.ts. Голос, стоп-слова и образцы
 * стиля — в blocks/brand.ts: это не факты о бизнесе, а как звучать.
 */
import { INPUT_LIMITS, type GenerationRequest } from "../../../contracts/index.ts";
import { clampLine, userData } from "../core/sanitize.ts";

function orUnspecified(value: string, fallback: string): string {
  return value.length > 0 ? value : fallback;
}

export function buildClientDataBlock(request: GenerationRequest): string {
  const niche = clampLine(request.niche, INPUT_LIMITS.niche);
  const audience = clampLine(request.audience, INPUT_LIMITS.audience);
  const products = clampLine(request.brand.products, INPUT_LIMITS.products);
  const proof = clampLine(request.brand.proof, INPUT_LIMITS.proof);

  const inner = [
    `Ниша/Сфера деятельности: ${niche}`,
    `Целевая аудитория (их боли и потребности): ${audience}`,
    `Продукты и услуги: ${orUnspecified(products, "не указаны — не выдумывай названия, услуги и цены")}`,
    `Факты доверия / Достижения: ${orUnspecified(proof, "не указаны — не выдумывай достижения, цифры и исследования")}`,
  ].join("\n");

  return `ВВОДНЫЕ ДАННЫЕ О БИЗНЕСЕ:
Используй данные внутри тега CLIENT_DATA как единственный источник истины. Строго запрещено выходить за рамки этой ниши.

${userData("CLIENT_DATA", inner)}

Темы строй только на пересечении ниши и реальных проблем аудитории. Общих постов «про бизнес вообще» быть не должно: каждый пост можно опубликовать только у этого клиента и ни у кого другого.`;
}
