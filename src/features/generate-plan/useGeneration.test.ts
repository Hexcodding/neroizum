/**
 * Состояние генерации. Проверяется поведение, за которое человек платит:
 * посты появляются по мере готовности, остановка не считается ошибкой,
 * а отказ модели показывается словами сервера.
 *
 * Форма событий здесь повторяет то, что отправляет обработчик генерации.
 * Разъехавшись, эти две формы дают самую неприятную поломку: сервер работает,
 * тесты сервера зелёные, а на экране ничего не появляется.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const openPlanStream = vi.fn();

vi.mock("@/shared/api/endpoints", () => ({
  openPlanStream: (token: string, request: unknown, signal?: AbortSignal) =>
    openPlanStream(token, request, signal) as unknown,
}));

const { useGeneration } = await import("./useGeneration");

function streamOf(events: readonly unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.close();
    },
  });
}

const POST = { number: 1, date: "2026-03-16", time: "10:00", postContent: "Текст." };

describe("генерация плана", () => {
  it("посты и прогресс приходят по мере готовности, в конце появляется план", async () => {
    openPlanStream.mockResolvedValue(
      streamOf([
        { type: "progress", readyPosts: 1, totalPosts: 3 },
        { type: "posts", posts: [POST] },
        {
          type: "done",
          result: {
            posts: [POST, { ...POST, number: 2 }],
            planId: "plan-1",
            quality: { warnings: ["В двух постах похожие заголовки."] },
          },
        },
      ]),
    );

    const { result } = renderHook(() => useGeneration());

    await act(async () => {
      await result.current.start("token", { niche: "пекарня" });
    });

    await waitFor(() => {
      expect(result.current.running).toBe(false);
    });
    expect(result.current.total).toBe(3);
    expect(result.current.posts).toHaveLength(2);
    expect(result.current.planId).toBe("plan-1");
    expect(result.current.warnings).toEqual(["В двух постах похожие заголовки."]);
    expect(result.current.error).toBeNull();
  });

  it("отказ приходит словами сервера, а не общей ошибкой", async () => {
    openPlanStream.mockResolvedValue(
      streamOf([
        { type: "posts", posts: [POST] },
        {
          type: "error",
          error: {
            code: "PROVIDER_UNAVAILABLE",
            message: "Модель не ответила. Попробуйте через минуту.",
            retryable: true,
            fields: [],
          },
        },
      ]),
    );

    const { result } = renderHook(() => useGeneration());

    await act(async () => {
      await result.current.start("token", {});
    });

    expect(result.current.error?.message).toBe("Модель не ответила. Попробуйте через минуту.");
    expect(result.current.error?.retryable).toBe(true);
    // Успевшие посты остаются на экране: попытка не потрачена впустую.
    expect(result.current.posts).toHaveLength(1);
  });

  it("обрыв соединения по остановке не превращается в ошибку", async () => {
    // Именно так выглядит остановка изнутри: соединение обрывается с AbortError
    // уже после того, как часть постов пришла.
    // Обрыв объявляется вторым чтением, а не сразу: поток, которому сообщили об
    // ошибке, выбрасывает всё, что лежало в очереди, и первый пост не дошёл бы
    // до кода — хотя в жизни он приходит.
    let delivered = false;
    openPlanStream.mockResolvedValue(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          if (delivered) {
            controller.error(new DOMException("Aborted", "AbortError"));
            return;
          }
          delivered = true;
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify({ type: "posts", posts: [POST] })}\n\n`),
          );
        },
      }),
    );

    const { result } = renderHook(() => useGeneration());

    await act(async () => {
      await result.current.start("token", {});
    });

    expect(result.current.error).toBeNull();
    expect(result.current.running).toBe(false);
    // Успевшие посты остаются на экране, а не пропадают вместе с соединением.
    expect(result.current.posts).toHaveLength(1);
  });

  it("кнопка «остановить» снимает признак работы сразу", async () => {
    openPlanStream.mockReturnValue(new Promise(() => undefined));

    const { result } = renderHook(() => useGeneration());

    act(() => {
      void result.current.start("token", {});
    });
    expect(result.current.running).toBe(true);

    act(() => {
      result.current.stop();
    });

    expect(result.current.running).toBe(false);
  });

  it("обрыв связи объясняется человеческим языком", async () => {
    openPlanStream.mockRejectedValue(new TypeError("Failed to fetch"));

    const { result } = renderHook(() => useGeneration());

    await act(async () => {
      await result.current.start("token", {});
    });

    expect(result.current.error?.code).toBe("NETWORK");
    expect(result.current.running).toBe(false);
  });
});
