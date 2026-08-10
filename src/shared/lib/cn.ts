/**
 * Склейка классов Tailwind с разрешением конфликтов.
 * Нужна, чтобы класс, переданный снаружи компонента, перебивал класс
 * по умолчанию, а не соседствовал с ним в разметке.
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
