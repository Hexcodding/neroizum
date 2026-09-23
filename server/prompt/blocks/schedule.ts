/**
 * Расписание передаётся модели готовым.
 *
 * В предыдущих версиях модель просили «рассчитать точное количество постов
 * исходя из частоты» и «распределить равномерно». Это арифметика, и модель
 * ошибалась в ней регулярно: то количество не то, то две публикации в один
 * день, то все посты на одной площадке. Теперь номер, дата и площадка каждого
 * поста посчитаны кодом, а от модели требуется только содержание.
 */
import { PLATFORMS, countByPlatform, type ScheduleSlot } from "../../../contracts/index.ts";

function slotLine(slot: ScheduleSlot): string {
  return `${slot.number} | ${slot.date} (${slot.weekday.toLowerCase()}) | ${slot.platform}`;
}

function distributionLine(slots: readonly ScheduleSlot[]): string {
  const counts = countByPlatform(slots);
  const parts = Object.entries(counts).map(([platform, count]) => {
    const name = platform in PLATFORMS ? PLATFORMS[platform as keyof typeof PLATFORMS].name : platform;
    return `${name} — ${String(count)}`;
  });
  return parts.join(", ");
}

export function buildScheduleBlock(slots: readonly ScheduleSlot[]): string {
  return `РАСПИСАНИЕ. Создай РОВНО ${slots.length} постов — по одному на каждую строку таблицы, в том же порядке. Номер, дату и площадку копируй в ответ без изменений; придумывать свои даты, добавлять или пропускать посты запрещено.

номер | дата (день недели) | площадка
${slots.map(slotLine).join("\n")}

Распределение по площадкам: ${distributionLine(slots)}.

День недели учитывай в содержании: в пятницу и выходные люди читают иначе, чем в рабочий вторник. Время публикации в поле time выбирай сам, исходя из площадки и аудитории.`;
}
