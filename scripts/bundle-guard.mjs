/**
 * Что не должно оказаться в браузерном бандле: промпт и панель управления.
 *
 * Зачем именно так: в предыдущей версии клиентский модуль реэкспортировал
 * серверный промпт, и в собранном файле dist/assets/index-*.js читались
 * дословные куски инструкций. Никто этого не заметил, потому что приложение
 * работало нормально. Проверка ставится до появления промпта, чтобы
 * защита существовала раньше того, что она защищает.
 *
 * Панель управления проверяется по той же причине и тем же способом: она не
 * «спрятана за адресом», её кода в клиентской сборке нет вовсе, и утверждать это
 * можно только проверкой готовых файлов.
 *
 * Запуск: node scripts/bundle-guard.mjs
 */
import { readdir, readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

/**
 * Фразы-маркеры лежат в отдельном файле, потому что их читают двое: этот
 * скрипт и тест, проверяющий, что каждая фраза действительно есть в промпте.
 * Без такого теста список тихо устареет после первой правки формулировок,
 * и проверка станет декорацией.
 */
// Путь считается от корня проекта, а не от адреса этого модуля: под тестовым
// запуском адрес модуля не является файловым, и чтение по нему падает.
const markersPath = path.resolve(process.cwd(), "scripts/prompt-leak-markers.json");

const markerFile = JSON.parse(readFileSync(markersPath, "utf8"));

export const PROMPT_MARKERS = markerFile.markers;
export const ADMIN_MARKERS = markerFile.adminMarkers;

const SCANNED_EXTENSIONS = new Set([".js", ".mjs", ".css", ".map", ".html"]);

/**
 * Ищет маркеры в тексте. Вынесено отдельной чистой функцией, чтобы саму
 * логику поиска можно было проверить тестом, а не надеяться на неё.
 * @param {string} text
 * @param {readonly string[]} markers
 * @returns {string[]}
 */
export function findMarkers(text, markers = PROMPT_MARKERS) {
  const haystack = text.toLowerCase();
  return markers.filter((marker) => haystack.includes(marker.toLowerCase()));
}

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && SCANNED_EXTENSIONS.has(path.extname(entry.name)))
    .map((entry) => path.join(entry.parentPath ?? directory, entry.name));
}

async function main() {
  const distDirectory = path.resolve(process.cwd(), "dist");
  let files;
  try {
    files = await collectFiles(distDirectory);
  } catch {
    console.error("Проверка невозможна: папки dist нет. Сначала выполните npm run build.");
    process.exit(1);
    return;
  }

  const leaks = [];
  const adminLeaks = [];
  for (const file of files) {
    const content = await readFile(file, "utf8");
    const shortName = path.relative(distDirectory, file);
    for (const marker of findMarkers(content)) {
      leaks.push({ file: shortName, marker });
    }
    for (const marker of findMarkers(content, ADMIN_MARKERS)) {
      adminLeaks.push({ file: shortName, marker });
    }
  }

  if (leaks.length > 0) {
    console.error("Промпт попал в браузерный бандл. Сборка остановлена.\n");
    for (const leak of leaks) {
      console.error(`  ${leak.file} — найдено: «${leak.marker}»`);
    }
    console.error("\nПричина почти всегда одна: клиентский модуль импортирует из server/prompt/.");
    process.exit(1);
    return;
  }

  if (adminLeaks.length > 0) {
    console.error("Панель управления попала в клиентскую сборку. Сборка остановлена.\n");
    for (const leak of adminLeaks) {
      console.error(`  ${leak.file} — найдено: «${leak.marker}»`);
    }
    console.error(
      "\nПричина: страница админки достижима из клиентских маршрутов. Она должна\n" +
        "подключаться только под признаком ADMIN_ENABLED, а собираться командой npm run build:admin.",
    );
    process.exit(1);
    return;
  }

  console.log(
    `Ни промпта, ни панели управления в бандле нет. Проверено файлов: ${files.length}.`,
  );
}

// CLI-часть запускается только при прямом вызове, чтобы тест мог
// импортировать функции без побочных эффектов.
if (process.argv[1] !== undefined && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  await main();
}
