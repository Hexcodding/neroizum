/**
 * Данные о бизнесе: чем занимается и для кого. Отделено от профиля бренда,
 * потому что это разные вещи: здесь предмет разговора, там — как он звучит.
 *
 * Оба поля пользователь пишет свободным текстом, поэтому оба проходят через
 * очистку и попадают в промпт в тегах: внутри тегов — данные, не инструкции.
 */
import { GOAL_LABELS, INPUT_LIMITS, type GenerationRequest } from "@contracts";
import { clampLine, userData } from "../core/sanitize";

export function buildBusinessBlock(request: GenerationRequest): string {
  const niche = clampLine(request.niche, INPUT_LIMITS.niche);
  const audience = clampLine(request.audience, INPUT_LIMITS.audience);

  return `О БИЗНЕСЕ:
Чем занимается: ${userData("niche", niche)}
Для кого: ${userData("audience", audience)}
Цель этого плана: ${GOAL_LABELS[request.goal]}

Темы бери строго из этой ниши и для этой аудитории. Общих постов «про бизнес вообще» быть не должно: каждый пост можно опубликовать только у этого клиента и ни у кого другого.`;
}
