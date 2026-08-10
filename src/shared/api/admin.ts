/**
 * Вызовы панели управления.
 *
 * Отдельный файл от клиентских вызовов, и это не формальность: у админки другой
 * токен, другой срок жизни и другая цена ошибки. Смешав их в одном модуле, легко
 * однажды отправить админский токен туда, где ждут клиентский.
 */
import { callFunction } from "./client";

export interface AdminSession {
  readonly token: string;
  readonly expiresAtMs: number;
}

export interface LicenseSummary {
  readonly id: string;
  readonly clientId: string;
  readonly disabled: boolean;
  readonly subscriptionUntil: string;
  readonly monthlyLimit: number;
  readonly note: string;
  readonly createdAt: string;
  readonly usedThisMonth: number;
}

export interface IssuedLicense {
  readonly licenseId: string;
  readonly clientId: string;
  /** Виден один раз. Восстановить его потом нельзя даже нам. */
  readonly key: string;
}

export async function adminLogin(password: string): Promise<AdminSession> {
  return await callFunction<AdminSession>("admin", { action: "login", password });
}

export async function adminLicenses(token: string): Promise<readonly LicenseSummary[]> {
  const result = await callFunction<{ licenses: readonly LicenseSummary[] }>(
    "admin",
    { action: "licenses" },
    { token },
  );
  return result.licenses;
}

export interface IssueInput {
  readonly subscriptionUntil: string;
  readonly monthlyLimit: number;
  readonly note: string;
}

export async function adminIssue(token: string, input: IssueInput): Promise<IssuedLicense> {
  return await callFunction<IssuedLicense>("admin", { action: "issue", ...input }, { token });
}

export async function adminSetDisabled(
  token: string,
  licenseId: string,
  disabled: boolean,
): Promise<void> {
  await callFunction<{ ok: boolean }>(
    "admin",
    { action: "set-disabled", licenseId, disabled },
    { token },
  );
}

export async function adminSetLimit(
  token: string,
  licenseId: string,
  monthlyLimit: number,
): Promise<void> {
  await callFunction<{ ok: boolean }>(
    "admin",
    { action: "set-limit", licenseId, monthlyLimit },
    { token },
  );
}

export async function adminSetSubscription(
  token: string,
  licenseId: string,
  subscriptionUntil: string,
): Promise<void> {
  await callFunction<{ ok: boolean }>(
    "admin",
    { action: "set-subscription", licenseId, subscriptionUntil },
    { token },
  );
}

export async function adminResetSession(token: string, licenseId: string): Promise<void> {
  await callFunction<{ ok: boolean }>("admin", { action: "reset-session", licenseId }, { token });
}
