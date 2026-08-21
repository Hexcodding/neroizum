/**
 * Список лицензий и действия над ними.
 *
 * После каждого действия список перечитывается с сервера целиком, а не
 * правится на месте. Для панели, которой пользуются несколько человек, это
 * честнее: локальная правка показывала бы то, чего в базе нет, если запрос
 * не прошёл.
 */
import { useCallback, useEffect, useState } from "react";
import {
  adminLicenses,
  adminResetSession,
  adminSetDisabled,
  adminSetImageLimit,
  adminSetImprovementLimit,
  adminSetLimit,
  adminSetSubscription,
} from "@/shared/api/admin";
import type { LicenseSummary } from "@/shared/api/admin";
import { toApiError } from "@/shared/api/errors";
import type { ApiError } from "@/shared/api/errors";

export interface LicensesState {
  readonly licenses: readonly LicenseSummary[] | null;
  readonly error: ApiError | null;
  /** Лицензия, по которой сейчас идёт запрос: её кнопки заблокированы. */
  readonly busyId: string | null;
  reload(): Promise<void>;
  setDisabled(licenseId: string, disabled: boolean): Promise<void>;
  setLimit(licenseId: string, monthlyLimit: number): Promise<void>;
  setImprovementLimit(licenseId: string, improvementLimit: number): Promise<void>;
  setImageLimit(licenseId: string, imageLimit: number): Promise<void>;
  setSubscription(licenseId: string, until: string): Promise<void>;
  resetSession(licenseId: string): Promise<void>;
}

export function useLicenses(token: string | null): LicensesState {
  const [licenses, setLicenses] = useState<readonly LicenseSummary[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    if (token === null) return;
    setError(null);
    try {
      setLicenses(await adminLicenses(token));
    } catch (cause) {
      setError(toApiError(cause));
    }
  }, [token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = useCallback(
    async (licenseId: string, action: (token: string) => Promise<void>): Promise<void> => {
      if (token === null) return;
      setBusyId(licenseId);
      setError(null);
      try {
        await action(token);
        await reload();
      } catch (cause) {
        setError(toApiError(cause));
      } finally {
        setBusyId(null);
      }
    },
    [token, reload],
  );

  return {
    licenses,
    error,
    busyId,
    reload,
    setDisabled: (licenseId, disabled) =>
      run(licenseId, (key) => adminSetDisabled(key, licenseId, disabled)),
    setLimit: (licenseId, monthlyLimit) =>
      run(licenseId, (key) => adminSetLimit(key, licenseId, monthlyLimit)),
    setImprovementLimit: (licenseId, improvementLimit) =>
      run(licenseId, (key) => adminSetImprovementLimit(key, licenseId, improvementLimit)),
    setImageLimit: (licenseId, imageLimit) =>
      run(licenseId, (key) => adminSetImageLimit(key, licenseId, imageLimit)),
    setSubscription: (licenseId, until) =>
      run(licenseId, (key) => adminSetSubscription(key, licenseId, until)),
    resetSession: (licenseId) => run(licenseId, (key) => adminResetSession(key, licenseId)),
  };
}
