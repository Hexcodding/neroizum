import { describe, expect, it } from "vitest";
import { readEvents } from "./stream";

/** Поток из заранее нарезанных кусков: так проверяется разрезание событий. */
function streamOf(chunks: readonly string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(chunks: readonly string[]): Promise<unknown[]> {
  const result: unknown[] = [];
  for await (const event of readEvents(streamOf(chunks))) result.push(event);
  return result;
}

describe("чтение потока событий", () => {
  it("разбирает несколько событий из одного куска", async () => {
    const events = await collect([
      'data: {"type":"progress","readyPosts":8}\n\ndata: {"type":"done"}\n\n',
    ]);

    expect(events).toEqual([{ type: "progress", readyPosts: 8 }, { type: "done" }]);
  });

  it("склеивает событие, разрезанное границей куска", async () => {
    const events = await collect(['data: {"type":"pro', 'gress","readyPosts":3}\n\n']);

    expect(events).toEqual([{ type: "progress", readyPosts: 3 }]);
  });

  it("отдаёт последнее событие без завершающей пустой строки", async () => {
    const events = await collect(['data: {"type":"done"}']);

    expect(events).toEqual([{ type: "done" }]);
  });

  it("испорченное событие пропускается, остальные приходят", async () => {
    const events = await collect([
      'data: {"type":"posts"}\n\ndata: {это не json\n\ndata: {"type":"done"}\n\n',
    ]);

    expect(events).toEqual([{ type: "posts" }, { type: "done" }]);
  });

  it("многобайтные символы на границе куска не ломаются", async () => {
    const encoder = new TextEncoder();
    const full = encoder.encode('data: {"text":"пост"}\n\n');
    const cut = 15;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(full.slice(0, cut));
        controller.enqueue(full.slice(cut));
        controller.close();
      },
    });

    const events: unknown[] = [];
    for await (const event of readEvents(stream)) events.push(event);

    expect(events).toEqual([{ text: "пост" }]);
  });
});
