/**
 * Сборка финального промпта из блоков.
 *
 * Этот файл не содержит текста инструкций — только порядок блоков. Так правку
 * формулировки всегда видно в диффе одного блока, а не в тысяче строк одной
 * функции. Порядок не случаен: сначала кто ты и для кого работаешь, потом
 * правила качества, и лишь в конце формат ответа — требования к формату
 * лучше держатся, когда стоят последними.
 */
import type { GenerationRequest, ScheduleSlot } from "@contracts";
import { ROLE_BLOCK } from "./core/role";
import { OUTPUT_CONTRACT_BLOCK } from "./core/output-contract";
import { buildBusinessBlock } from "./blocks/business";
import { buildBrandBlock } from "./blocks/brand";
import { buildFunnelBlock } from "./blocks/funnel";
import { buildRubricsBlock } from "./blocks/rubrics";
import { buildPlatformsBlock } from "./blocks/platforms";
import { ANTI_TEASER_BLOCK } from "./blocks/anti-teaser";
import { buildVisualBlock } from "./blocks/visual";
import { buildComplianceBlock } from "./blocks/compliance";
import { buildScheduleBlock } from "./blocks/schedule";
import { buildContinuationBlock } from "./blocks/continuation";
import { buildRepairBlock } from "./blocks/repair";
import { PROMPT_VERSION } from "./version";

export interface BuiltPrompt {
  readonly text: string;
  /** Версия промпта сохраняется вместе с планом. */
  readonly version: string;
  /** Сколько постов ожидается в ответе — для проверки результата. */
  readonly expectedPostCount: number;
}

export interface BuildOptions {
  /**
   * Причины, по которым предыдущая попытка этих постов не прошла проверку
   * качества. Пусто при обычной генерации.
   */
  readonly repairReasons?: readonly string[];
}

export function buildPrompt(
  request: GenerationRequest,
  slots: readonly ScheduleSlot[],
  options: BuildOptions = {},
): BuiltPrompt {
  if (slots.length === 0) {
    throw new Error("Расписание пустое: нечего генерировать");
  }

  const blocks = [
    ROLE_BLOCK,
    buildBusinessBlock(request),
    buildBrandBlock(request.brand, request.authorRole),
    buildFunnelBlock(request.goal, request.channelStage, slots.length),
    buildRubricsBlock(),
    buildPlatformsBlock(request.platforms),
    ANTI_TEASER_BLOCK,
    buildVisualBlock(),
    buildComplianceBlock(request.infoPlanMode),
    buildScheduleBlock(slots),
    buildContinuationBlock(request.previousPosts),
    buildRepairBlock(options.repairReasons ?? []),
    OUTPUT_CONTRACT_BLOCK,
  ];

  return {
    text: blocks.filter((block) => block.length > 0).join("\n\n"),
    version: PROMPT_VERSION,
    expectedPostCount: slots.length,
  };
}

export { PROMPT_VERSION } from "./version";
export { PLAN_RESPONSE_SCHEMA } from "./core/output-contract";
export { CONTENT_MIX_BY_GOAL, expectedTypeCounts } from "./blocks/funnel";
export { VISUAL_STYLES, VISUAL_STYLE_IDS, MAX_STYLE_REPEATS_IN_ROW } from "./blocks/visual";
export { RUBRICS, MAX_RUBRIC_REPEATS_IN_ROW } from "./blocks/rubrics";
export { INFO_PLAN_FORBIDDEN_WORDS } from "./blocks/compliance";
