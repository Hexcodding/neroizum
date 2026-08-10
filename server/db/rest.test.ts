import { afterEach, describe, expect, it, vi } from "vitest";
import { select } from "./rest.ts";

/** Подменяет fetch и возвращает заголовки, с которыми ушёл запрос. */
async function headersOfRequest(serviceKey: string): Promise<Record<string, string>> {
  const fetchMock = vi.fn(
    (): Promise<Response> => Promise.resolve(new Response("[]", { status: 200 })),
  );
  vi.stubGlobal("fetch", fetchMock);

  await select({ url: "https://project.supabase.co", serviceKey }, "licenses", "id=eq.1");

  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return init.headers as Record<string, string>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("заголовки запросов к базе", () => {
  it("новый ключ уходит только в apikey", async () => {
    const headers = await headersOfRequest("sb_secret_abc123");

    expect(headers.apikey).toBe("sb_secret_abc123");
    // В Authorization платформа ждёт JWT и на новый ключ отвечает «Invalid JWT».
    expect(headers.authorization).toBeUndefined();
  });

  it("старый ключ-JWT уходит в оба заголовка", async () => {
    const headers = await headersOfRequest("eyJhbGciOiJIUzI1NiJ9.payload.signature");

    expect(headers.apikey).toBe("eyJhbGciOiJIUzI1NiJ9.payload.signature");
    expect(headers.authorization).toBe("Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature");
  });
});
