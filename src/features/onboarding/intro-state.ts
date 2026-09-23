/**
 * Показывали ли вступление.
 *
 * Признак живёт в браузере, а не на сервере: это свойство устройства, а не
 * клиента. Человек, впервые открывший продукт на телефоне, должен получить
 * объяснение ещё раз — он не помнит, что видел его месяц назад на компьютере.
 */

const STORAGE_KEY = "neuroizium.intro-seen";

export function wasIntroSeen(): boolean {
  return localStorage.getItem(STORAGE_KEY) === "yes";
}

export function markIntroSeen(): void {
  localStorage.setItem(STORAGE_KEY, "yes");
}
