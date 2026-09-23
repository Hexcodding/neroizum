/**
 * Работа с датами. Все вычисления идут в UTC и через строки ГГГГ-ММ-ДД.
 *
 * Зачем так строго: в предыдущей версии дата жила в данных в виде
 * «15.03.2026 (Суббота)» и разбиралась регулярным выражением. Любая арифметика
 * над такой датой ломается на переходе через месяц, а часовой пояс сервера
 * мог сдвинуть план на сутки.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const WEEKDAY_NAMES = [
  "Воскресенье",
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
] as const;

const MILLISECONDS_IN_DAY = 24 * 60 * 60 * 1000;

/** Разбирает ГГГГ-ММ-ДД. Возвращает null, если дата не существует. */
export function parseIsoDate(value: string): Date | null {
  const match = ISO_DATE.exec(value.trim());
  if (match === null) return null;

  const [, year, month, day] = match;
  if (year === undefined || month === undefined || day === undefined) return null;

  const timestamp = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;

  // Проверка на 31 февраля: JavaScript молча превратит её в 3 марта.
  if (date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) {
    return null;
  }
  return date;
}

export function formatIsoDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(isoDate: string, days: number): string {
  const date = parseIsoDate(isoDate);
  if (date === null) {
    throw new Error(`Некорректная дата: ${isoDate}`);
  }
  return formatIsoDate(new Date(date.getTime() + days * MILLISECONDS_IN_DAY));
}

/** Название дня недели на русском: нужно и в промпте, и в интерфейсе. */
export function weekdayName(isoDate: string): string {
  const date = parseIsoDate(isoDate);
  if (date === null) {
    throw new Error(`Некорректная дата: ${isoDate}`);
  }
  const name = WEEKDAY_NAMES[date.getUTCDay()];
  if (name === undefined) {
    throw new Error(`Не удалось определить день недели для ${isoDate}`);
  }
  return name;
}

/** Дата для человека: «15.03.2026, суббота». */
export function formatHumanDate(isoDate: string): string {
  const date = parseIsoDate(isoDate);
  if (date === null) {
    throw new Error(`Некорректная дата: ${isoDate}`);
  }
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${date.getUTCFullYear()}, ${weekdayName(isoDate).toLowerCase()}`;
}

export function todayIso(): string {
  return formatIsoDate(new Date());
}
