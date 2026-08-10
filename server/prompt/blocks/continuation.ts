/**
 * Защита от повторов при генерации по частям.
 *
 * План на 30 дней собирается несколькими запросами, и каждая следующая часть
 * должна знать, что уже было. В третьей версии передавались только номер,
 * дата, заголовок и тип последних двенадцати постов — рубрика, хук и формат
 * терялись, поэтому на длинном плане модель повторяла одну и ту же мысль
 * другими словами. Здесь передаётся всё, что определяет содержание поста,
 * и повтор запрещён явно по каждому признаку.
 */
import { INPUT_LIMITS, PLATFORMS, type PreviousPostSummary } from "@contracts";
import { clampLine } from "../core/sanitize";

const TITLE_LIMIT = 120;
const HOOK_LIMIT = 160;

function summaryLine(post: PreviousPostSummary): string {
  const platform = PLATFORMS[post.platform].name;
  const title = clampLine(post.title, TITLE_LIMIT);
  const hook = clampLine(post.hook, HOOK_LIMIT);
  return `${post.number} | ${post.date} | ${platform} | ${post.type} | ${post.rubric} | ${post.format} | «${title}» | хук: ${hook}`;
}

export function buildContinuationBlock(previousPosts: readonly PreviousPostSummary[]): string {
  if (previousPosts.length === 0) return "";

  // Берём последние посты: именно с ними у новой части выше всего риск совпасть.
  const recent = previousPosts.slice(-INPUT_LIMITS.previousPostsCount);

  return `УЖЕ СОЗДАННЫЕ ПОСТЫ ЭТОГО ПЛАНА. Это продолжение, а не новый план.

номер | дата | площадка | тип | рубрика | формат | заголовок | хук
${recent.map(summaryLine).join("\n")}

ЗАПРЕЩЕНО повторять из списка выше:
- тему и её пересказ другими словами;
- угол подачи: если ошибка уже разобрана со стороны клиента, новый пост смотрит с другой стороны или берёт другую ошибку;
- механику хука: если хук уже строился на вопросе к читателю, следующий строится иначе;
- механику призыва: не повторяй один и тот же призыв к действию подряд;
- одну и ту же рубрику в соседних постах.

Новые посты обязаны логически продолжать начатое: развивать мысль дальше по пути читателя, а не возвращаться к тому, что он уже прочитал.`;
}
