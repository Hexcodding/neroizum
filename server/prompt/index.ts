/**
 * Сборка финального промпта из блоков.
 *
 * Этот файл не содержит текста инструкций — только порядок блоков. Так правку
 * формулировки всегда видно в диффе одного блока, а не в тысяче строк одной
 * функции. Порядок не случаен: сначала кто ты и для кого работаешь, потом
 * правила качества, и лишь в конце формат ответа — требования к формату
 * лучше держатся, когда стоят последними.
 */
import type { GenerationRequest, ScheduleSlot } from "../../contracts/index.ts";
import { ROLE_BLOCK } from "./core/role.ts";
import { OUTPUT_CONTRACT_BLOCK } from "./core/output-contract.ts";
import { buildClientDataBlock } from "./blocks/client-data.ts";
import { buildBrandBlock } from "./blocks/brand.ts";
import { buildFunnelBlock } from "./blocks/funnel.ts";
import { buildRubricsBlock } from "./blocks/rubrics.ts";
import { buildPlatformsBlock } from "./blocks/platforms.ts";
import { ANTI_TEASER_BLOCK } from "./blocks/anti-teaser.ts";
import { VOICE_BLOCK } from "./blocks/voice.ts";
import { buildVisualBlock } from "./blocks/visual.ts";
import { buildComplianceBlock } from "./blocks/compliance.ts";
import { buildScheduleBlock } from "./blocks/schedule.ts";
import { buildContinuationBlock } from "./blocks/continuation.ts";
import { buildRepairBlock } from "./blocks/repair.ts";
import { PROMPT_VERSION } from "./version.ts";

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
   * качества, либо просьба человека переделать пост. Пусто при обычной
   * генерации.
   */
  readonly repairReasons?: readonly string[];
  /** Текущий текст поста: нужен, когда переделываем по просьбе человека. */
  readonly currentPost?: string;
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
    buildClientDataBlock(request),
    buildBrandBlock(request.brand, request.authorRole),
    buildFunnelBlock(request.goal, request.channelStage, slots.length),
    buildRubricsBlock(),
    buildPlatformsBlock(request.platforms),
    ANTI_TEASER_BLOCK,
    VOICE_BLOCK,
    buildVisualBlock(),
    buildComplianceBlock(request.infoPlanMode),
    buildScheduleBlock(slots),
    buildContinuationBlock(request.previousPosts),
    buildRepairBlock({
      reasons: options.repairReasons ?? [],
      currentPost: options.currentPost,
    }),
    OUTPUT_CONTRACT_BLOCK,
  ];

  return {
    text: blocks.filter((block) => block.length > 0).join("\n\n"),
    version: PROMPT_VERSION,
    expectedPostCount: slots.length,
  };
}

export { PROMPT_VERSION } from "./version.ts";
export { PLAN_RESPONSE_SCHEMA } from "./core/output-contract.ts";
export { CONTENT_MIX_BY_GOAL, expectedTypeCounts } from "./blocks/funnel.ts";
export { VISUAL_STYLES, VISUAL_STYLE_IDS, MAX_STYLE_REPEATS_IN_ROW } from "./blocks/visual.ts";
export { RUBRICS, MAX_RUBRIC_REPEATS_IN_ROW } from "./blocks/rubrics.ts";
export { CLICHE_RULES, findCliche } from "./blocks/voice.ts";
export { INFO_PLAN_FORBIDDEN_WORDS } from "./blocks/compliance.ts";
