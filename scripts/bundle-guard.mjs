/**
 * Защита главного актива: промпт не должен оказаться в браузерном бандле.
 *
 * Зачем именно так: в предыдущей версии клиентский модуль реэкспортировал
 * серверный промпт, и в собранном файле dist/assets/index-*.js читались
 * дословные куски инструкций. Никто этого не заметил, потому что приложение
 * работало нормально. Проверка ставится до появления промпта, чтобы
 * защита существовала раньше того, что она защищает.
 *
 * Запуск: node scripts/bundle-guard.mjs
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

/**
 * Фразы-маркеры. Пополняется на этапе 1 вместе с блоками промпта.
 * Маркер должен быть достаточно характерным, чтобы не совпасть случайно.
 */
export const PROMPT_MARKERS = [
  "Senior Content Architect",
  "Zero Click Value",
  "Surreal Absurdity",
  "Analog Nostalgia",
  "NEUROIZIUM_PROMPT_MARKER",
];

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
  for (const file of files) {
    const content = await readFile(file, "utf8");
    for (const marker of findMarkers(content)) {
      leaks.push({ file: path.relative(distDirectory, file), marker });
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

  console.log(`Промпт в бандле не найден. Проверено файлов: ${files.length}.`);
}

// CLI-часть запускается только при прямом вызове, чтобы тест мог
// импортировать функции без побочных эффектов.
if (process.argv[1] !== undefined && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  await main();
}
