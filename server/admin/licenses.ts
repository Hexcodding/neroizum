/**
 * Операции администратора над лицензиями.
 *
 * Два правила, которые здесь важнее остальных:
 *
 * 1. Ключ в открытом виде существует ровно один раз — в ответе на выпуск.
 *    Дальше в базе только хеш, и «посмотреть ключ клиента» невозможно даже
 *    администратору. Это цена за то, что украденная база не даёт доступов.
 * 2. Каждое действие пишется в журнал. Без журнала нельзя ответить на вопрос
 *    «кто и когда отключил клиента», а этот вопрос возникает всегда.
 */
import { generateClientId, generateLicenseKey, hashSecret } from "../access/keys.ts";
import type { AdminLogStore } from "../access/store.ts";
import type { AdminLicenseStore, LicenseSummary } from "./store.ts";

/** Границы, за которыми значение почти наверняка опечатка. */
export const LIMIT_BOUNDS = { min: 1, max: 500 } as const;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Сколько раз пробуем подобрать свободный видимый номер клиента. */
const CLIENT_ID_ATTEMPTS = 5;

export interface AdminDeps {
  readonly licenses: AdminLicenseStore;
  readonly log: AdminLogStore;
  readonly pepper: string;
  /** Кто выполняет действие: подпись для журнала. */
  readonly actorLabel: string;
}

export interface IssueLicenseInput {
  readonly subscriptionUntil: string;
  readonly monthlyLimit: number;
  readonly note: string;
}

export interface IssuedLicense {
  readonly licenseId: string;
  readonly clientId: string;
  /** Показывается администратору один раз и больше не восстанавливается. */
  readonly key: string;
}

export class AdminInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminInputError";
  }
}

function requireIsoDate(value: string): void {
  if (!ISO_DATE.test(value)) {
    throw new AdminInputError("Дата подписки указывается в виде ГГГГ-ММ-ДД");
  }
}

function requireLimit(value: number, what = "генераций"): void {
  const whole = Number.isInteger(value);
  if (!whole || value < LIMIT_BOUNDS.min || value > LIMIT_BOUNDS.max) {
    throw new AdminInputError(
      `Лимит ${what} в месяц — целое число от ${String(LIMIT_BOUNDS.min)} до ${String(LIMIT_BOUNDS.max)}`,
    );
  }
}

async function freeClientId(store: AdminLicenseStore): Promise<string> {
  for (let attempt = 0; attempt < CLIENT_ID_ATTEMPTS; attempt += 1) {
    const candidate = generateClientId();
    if (!(await store.clientIdTaken(candidate))) return candidate;
  }
  throw new Error("Не удалось подобрать свободный номер клиента");
}

export async function issueLicense(
  input: IssueLicenseInput,
  deps: AdminDeps,
): Promise<IssuedLicense> {
  requireIsoDate(input.subscriptionUntil);
  requireLimit(input.monthlyLimit);

  const key = generateLicenseKey();
  const clientId = await freeClientId(deps.licenses);

  const licenseId = await deps.licenses.create({
    clientId,
    keyHash: await hashSecret(key, deps.pepper),
    subscriptionUntil: input.subscriptionUntil,
    monthlyLimit: input.monthlyLimit,
    note: input.note.trim().slice(0, 200),
  });

  // В журнал уходит номер клиента, но никогда сам ключ и никогда его хеш.
  await deps.log.record("license.issued", deps.actorLabel, {
    licenseId,
    clientId,
    subscriptionUntil: input.subscriptionUntil,
    monthlyLimit: input.monthlyLimit,
  });

  return { licenseId, clientId, key };
}

/**
 * Блокировка сразу обрывает активную сессию. Иначе отключённый клиент работает
 * до истечения токена, а администратор считает, что доступ закрыт.
 */
export async function setLicenseDisabled(
  licenseId: string,
  disabled: boolean,
  deps: AdminDeps,
): Promise<void> {
  await deps.licenses.setDisabled(licenseId, disabled);
  if (disabled) {
    await deps.licenses.dropSessions(licenseId);
  }
  await deps.log.record(disabled ? "license.disabled" : "license.enabled", deps.actorLabel, {
    licenseId,
  });
}

export async function changeMonthlyLimit(
  licenseId: string,
  monthlyLimit: number,
  deps: AdminDeps,
): Promise<void> {
  requireLimit(monthlyLimit);
  await deps.licenses.setMonthlyLimit(licenseId, monthlyLimit);
  await deps.log.record("license.limit-changed", deps.actorLabel, { licenseId, monthlyLimit });
}

export async function changeImprovementLimit(
  licenseId: string,
  improvementLimit: number,
  deps: AdminDeps,
): Promise<void> {
  requireLimit(improvementLimit, "улучшений постов");
  await deps.licenses.setImprovementLimit(licenseId, improvementLimit);
  await deps.log.record("license.improvement-limit-changed", deps.actorLabel, {
    licenseId,
    improvementLimit,
  });
}

export async function changeImageLimit(
  licenseId: string,
  imageLimit: number,
  deps: AdminDeps,
): Promise<void> {
  requireLimit(imageLimit, "картинок");
  await deps.licenses.setImageLimit(licenseId, imageLimit);
  await deps.log.record("license.image-limit-changed", deps.actorLabel, { licenseId, imageLimit });
}

export async function changeSubscriptionUntil(
  licenseId: string,
  subscriptionUntil: string,
  deps: AdminDeps,
): Promise<void> {
  requireIsoDate(subscriptionUntil);
  await deps.licenses.setSubscriptionUntil(licenseId, subscriptionUntil);
  await deps.log.record("license.subscription-changed", deps.actorLabel, {
    licenseId,
    subscriptionUntil,
  });
}

/**
 * Сброс сессии по просьбе клиента: «зашёл с другого компьютера, старый занят».
 * Отдельная операция, потому что это не блокировка и попадать в журнал должна
 * иначе.
 */
export async function resetSession(licenseId: string, deps: AdminDeps): Promise<void> {
  await deps.licenses.dropSessions(licenseId);
  await deps.log.record("license.session-reset", deps.actorLabel, { licenseId });
}

export async function listLicenses(monthKey: string, deps: AdminDeps): Promise<LicenseSummary[]> {
  return deps.licenses.list(monthKey);
}
