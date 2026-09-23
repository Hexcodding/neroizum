/**
 * Хеш пароля администратора для секрета NEUROIZIUM_ADMIN_PASSWORD_HASH.
 *
 * Существует, чтобы пароль считался на вашей машине и не пересылался никому —
 * ни мне, ни в переписку. В панель Supabase уезжает только хеш, а по нему пароль
 * не восстанавливается.
 *
 * Пароль спрашивается вводом, а не берётся из команды: аргумент команды остаётся
 * в истории PowerShell, то есть в файле на диске.
 *
 * Запуск: npm run admin-hash
 */
import { createInterface } from "node:readline";
import process from "node:process";
import { hashSecret } from "../server/access/keys.ts";

interface HiddenInterface {
  _writeToOutput?: (text: string) => void;
}

/** Ввод без эха: пароль и «перец» не должны оставаться на экране. */
function askHidden(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });

  // Замена вывода — единственный способ спрятать ввод в стандартном readline.
  (rl as unknown as HiddenInterface)._writeToOutput = (text: string): void => {
    process.stdout.write(text.includes(question) ? text : "");
  };

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      process.stdout.write("\n");
      rl.close();
      resolve(answer);
    });
  });
}

const pepper = (await askHidden("NEUROIZIUM_PEPPER (тот же, что в секретах): ")).trim();
const password = (await askHidden("Пароль администратора: ")).trim();

if (pepper.length === 0 || password.length === 0) {
  console.error("Нужны оба значения: перец и пароль. Ничего не посчитано.");
  process.exit(1);
}

console.warn("\nNEUROIZIUM_ADMIN_PASSWORD_HASH:");
console.warn(await hashSecret(password, pepper));
console.warn(
  "\nВпишите это значение в Edge Functions → Secrets. Сам пароль нигде не сохранён:\n" +
    "потеряете — посчитаете хеш заново для нового пароля.",
);
