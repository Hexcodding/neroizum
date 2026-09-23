/**
 * Лицензионные ключи и видимые номера клиентов.
 *
 * Главный урок предыдущей версии. Там ключ выглядел как NZM-A1B2-C3D4-E5F6,
 * а рядом хранился «префикс» из первых двенадцати символов — то есть
 * NZM-A1B2-C3D. Префикс не секрет: он виден клиенту, администратору и уходит
 * в вебхук продления. Из двенадцати секретных символов раскрывались семь,
 * и на подбор оставшихся требовалось около миллиона попыток. Вместе с
 * отсутствием лимита попыток при активации это давало чужой доступ за часы.
 *
 * Здесь видимый номер клиента не имеет к ключу никакого отношения: это
 * отдельная случайная строка. По ней нельзя восстановить ни один символ ключа.
 */

/**
 * Алфавит без похожих друг на друга символов: ноль и буква O, единица и I
 * исключены. Ровно 32 символа — значит, пять бит на символ и никакого перекоса
 * при случайном выборе.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const KEY_PREFIX = "NZM";
const KEY_GROUPS = 3;
const GROUP_LENGTH = 4;
/** Длина видимого номера клиента без префикса. */
const CLIENT_ID_LENGTH = 6;

function randomChars(count: number): string {
  const bytes = new Uint8Array(count);
  crypto.getRandomValues(bytes);

  let result = "";
  for (const byte of bytes) {
    // Алфавит длиной 32 делит 256 без остатка, поэтому остаток от деления
    // не смещает распределение.
    result += ALPHABET[byte % ALPHABET.length];
  }
  return result;
}

/** Ключ вида NZM-A1B2-C3D4-E5F6. Шестьдесят бит случайности. */
export function generateLicenseKey(): string {
  const groups: string[] = [];
  for (let index = 0; index < KEY_GROUPS; index += 1) {
    groups.push(randomChars(GROUP_LENGTH));
  }
  return `${KEY_PREFIX}-${groups.join("-")}`;
}

/**
 * Видимый номер клиента. Никак не связан с ключом: генерируется отдельно.
 * Совпадения исключает уникальный индекс в базе, при совпадении номер
 * перевыпускается.
 */
export function generateClientId(): string {
  return `ID-${randomChars(CLIENT_ID_LENGTH)}`;
}

/** Приводит введённый ключ к каноническому виду: люди путают регистр и пробелы. */
export function normalizeLicenseKey(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "").replace(/[–—]/g, "-");
}

const KEY_SHAPE = new RegExp(
  `^${KEY_PREFIX}(?:-[${ALPHABET}]{${String(GROUP_LENGTH)}}){${String(KEY_GROUPS)}}$`,
);

/**
 * Проверка формы ключа до обращения к базе. Экономит запрос на явном мусоре,
 * но никогда не служит поводом для отдельного сообщения об ошибке: наружу
 * ответ всегда один и тот же.
 */
export function hasLicenseKeyShape(normalized: string): boolean {
  return KEY_SHAPE.test(normalized);
}

/**
 * Хеш секрета для хранения в базе. Ключи и токены сессий в открытом виде не
 * хранятся никогда.
 *
 * Почему обычный SHA-256, а не медленный алгоритм для паролей: секрет здесь не
 * придуман человеком, а случаен на шестьдесят бит. Перебор такого секрета
 * нереален независимо от скорости хеширования, а «перец» на стороне сервера
 * означает, что даже украденная база не даёт возможности проверять догадки
 * в оффлайне.
 */
export async function hashSecret(secret: string, pepper: string): Promise<string> {
  if (pepper.length === 0) {
    throw new Error("Не задан серверный секрет для хеширования");
  }
  const data = new TextEncoder().encode(`${pepper}:${secret}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Сравнение за постоянное время. Обычное сравнение строк выходит из цикла на
 * первом несовпавшем символе, и по времени ответа можно посимвольно угадывать
 * секрет.
 */
export function secureCompare(left: string, right: string): boolean {
  if (left.length !== right.length) return false;

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}
