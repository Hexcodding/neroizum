/**
 * Что админке нужно от базы. Как и в доступах, интерфейс отдельно от Postgres —
 * иначе логику выдачи и блокировки ключей нельзя проверить тестами.
 */

export interface NewLicenseRow {
  readonly clientId: string;
  readonly keyHash: string;
  readonly subscriptionUntil: string;
  readonly monthlyLimit: number;
  readonly note: string;
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

export interface AdminLicenseStore {
  /** Возвращает идентификатор созданной лицензии. */
  create(row: NewLicenseRow): Promise<string>;
  /** Проверка занятости видимого номера: он должен быть уникален. */
  clientIdTaken(clientId: string): Promise<boolean>;
  list(monthKey: string): Promise<LicenseSummary[]>;
  setDisabled(licenseId: string, disabled: boolean): Promise<void>;
  setMonthlyLimit(licenseId: string, monthlyLimit: number): Promise<void>;
  setSubscriptionUntil(licenseId: string, date: string): Promise<void>;
  /** Сброс активной сессии: нужен при блокировке и при передаче ключа. */
  dropSessions(licenseId: string): Promise<void>;
}
