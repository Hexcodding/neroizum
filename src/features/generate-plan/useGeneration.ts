/**
 * Генерация плана: чтение потока событий и состояние экрана.
 *
 * Посты появляются по мере готовности, поэтому состояние обновляется каждым
 * событием. Остановка — не ошибка: то, что успело сгенерироваться, остаётся на
 * экране и уже сохранено на сервере.
 */
import { useCallback, useRef, useState } from "react";
import type { GeneratedPost } from "@contracts";
import { openPlanStream } from "@/shared/api/endpoints";
import { readEvents } from "@/shared/api/stream";
import { toApiError } from "@/shared/api/errors";
import type { ApiError } from "@/shared/api/errors";

export interface GenerationState {
  readonly running: boolean;
  readonly posts: readonly GeneratedPost[];
  readonly ready: number;
  readonly total: number;
  readonly planId: string | null;
  readonly warnings: readonly string[];
  readonly error: ApiError | null;
  start(token: string, request: unknown): Promise<void>;
  stop(): void;
}

interface DoneEvent {
  readonly planId?: unknown;
  readonly posts?: unknown;
  readonly quality?: { readonly warnings?: unknown };
  readonly stopped?: unknown;
}

export function useGeneration(): GenerationState {
  const [running, setRunning] = useState(false);
  const [posts, setPosts] = useState<readonly GeneratedPost[]>([]);
  const [ready, setReady] = useState(0);
  const [total, setTotal] = useState(0);
  const [planId, setPlanId] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<readonly string[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback((): void => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
  }, []);

  const start = useCallback(async (token: string, request: unknown): Promise<void> => {
    const controller = new AbortController();
    abortRef.current = controller;

    setRunning(true);
    setPosts([]);
    setReady(0);
    setPlanId(null);
    setWarnings([]);
    setError(null);

    try {
      const stream = await openPlanStream(token, request, controller.signal);

      for await (const event of readEvents(stream)) {
        applyEvent(event, { setPosts, setReady, setTotal, setPlanId, setWarnings, setError });
      }
    } catch (cause) {
      // Остановку по кнопке в ошибку не превращаем: посты на экране остались.
      const aborted = cause instanceof DOMException && cause.name === "AbortError";
      if (!aborted) setError(toApiError(cause));
    } finally {
      abortRef.current = null;
      setRunning(false);
    }
  }, []);

  return { running, posts, ready, total, planId, warnings, error, start, stop };
}

interface Setters {
  setPosts(posts: readonly GeneratedPost[]): void;
  setReady(value: number): void;
  setTotal(value: number): void;
  setPlanId(value: string | null): void;
  setWarnings(value: readonly string[]): void;
  setError(value: ApiError | null): void;
}

function applyEvent(event: unknown, setters: Setters): void {
  if (typeof event !== "object" || event === null) return;
  const value = event as Record<string, unknown>;

  switch (value.type) {
    case "progress":
      if (typeof value.readyPosts === "number") setters.setReady(value.readyPosts);
      if (typeof value.totalPosts === "number") setters.setTotal(value.totalPosts);
      return;
    case "posts":
      if (Array.isArray(value.posts)) setters.setPosts(value.posts as GeneratedPost[]);
      return;
    case "done":
      applyDone(value.result, setters);
      return;
    case "error":
      setters.setError(toApiError({ error: value.error }));
      return;
    default:
      return;
  }
}

function applyDone(result: unknown, setters: Setters): void {
  if (typeof result !== "object" || result === null) return;
  const done = result as DoneEvent;

  if (Array.isArray(done.posts)) setters.setPosts(done.posts as GeneratedPost[]);
  if (typeof done.planId === "string") setters.setPlanId(done.planId);
  if (Array.isArray(done.quality?.warnings)) {
    setters.setWarnings(done.quality.warnings as string[]);
  }
}
