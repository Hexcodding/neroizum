/**
 * Поток событий генерации.
 *
 * План на тридцать постов собирается около минуты. Отдавать его одним ответом
 * значит показывать пользователю крутящийся индикатор и надеяться, что он
 * дождётся: в третьей версии на платном тарифе именно так и было, и люди
 * перезагружали страницу, теряя готовые посты.
 *
 * Формат — Server-Sent Events: обычный текстовый поток, который умеет читать
 * любой браузер без библиотек. Каждое событие — одна строка JSON.
 */

export type StreamEvent =
  | { readonly type: "progress"; readonly readyPosts: number; readonly totalPosts: number }
  | { readonly type: "posts"; readonly posts: readonly unknown[] }
  | { readonly type: "done"; readonly result: unknown }
  | { readonly type: "error"; readonly error: unknown };

/** Одно событие в проводном виде. Двойной перевод строки — конец события. */
export function encodeEvent(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export interface StreamHandle {
  send(event: StreamEvent): void;
  close(): void;
}

/**
 * Поток и способ в него писать. Работа запускается вызывающим кодом: поток
 * закрывается им же, иначе браузер будет ждать до таймаута.
 */
export function createEventStream(): { body: ReadableStream<Uint8Array>; handle: StreamHandle } {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let closed = false;

  const body = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;
    },
    cancel() {
      // Пользователь закрыл вкладку. Писать больше некуда, но и падать не нужно.
      closed = true;
    },
  });

  return {
    body,
    handle: {
      send(event: StreamEvent): void {
        if (closed || controller === null) return;
        controller.enqueue(encoder.encode(encodeEvent(event)));
      },
      close(): void {
        if (closed || controller === null) return;
        closed = true;
        controller.close();
      },
    },
  };
}

export function streamHeaders(cors: Record<string, string>): Record<string, string> {
  return {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store",
    // Промежуточные прокси иначе копят ответ в буфере, и прогресс приходит
    // разом в конце — то есть смысла в потоке не остаётся.
    "x-accel-buffering": "no",
    connection: "keep-alive",
    ...cors,
  };
}
