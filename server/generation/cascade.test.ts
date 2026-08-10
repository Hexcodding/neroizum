import { describe, expect, it, vi } from "vitest";
import { PLAN_RESPONSE_SCHEMA } from "../prompt/core/output-contract.ts";
import { GenerationError } from "./errors.ts";
import { callWithCascade } from "./provider/cascade.ts";
import { createFakeProvider, type FakeBehaviour } from "./__fixtures__/fake-provider.ts";
import type { AiRequest } from "./provider/types.ts";

function makeRequest(signal?: AbortSignal): AiRequest {
  return {
    prompt: "1 | 2026-03-02 (понедельник) | telegram",
    schema: PLAN_RESPONSE_SCHEMA,
    temperature: 0.8,
    maxOutputTokens: 4096,
    timeoutMs: 1000,
    signal,
  };
}

function fail(code: "RATE_LIMITED" | "PROVIDER_UNAVAILABLE" | "TIMEOUT" | "INTERNAL"): FakeBehaviour {
  return { kind: "fail", error: new GenerationError(code, `тест: ${code}`) };
}

const noWait = { sleep: () => Promise.resolve() };

describe("каскад и повторы", () => {
  it("с первого раза отвечает первой моделью", async () => {
    const provider = createFakeProvider();
    const response = await callWithCascade(makeRequest(), { provider, ...noWait });

    expect(response.model).toBe("fake-fast");
    expect(provider.calls).toHaveLength(1);
  });

  it("повторяет ту же модель при слишком частых запросах", async () => {
    const provider = createFakeProvider([fail("RATE_LIMITED"), { kind: "ok" }]);
    const response = await callWithCascade(makeRequest(), { provider, ...noWait });

    expect(response.model).toBe("fake-fast");
    expect(provider.calls).toHaveLength(2);
  });

  it("пауза между попытками растёт", async () => {
    const sleep = vi.fn(() => Promise.resolve());
    const provider = createFakeProvider([
      fail("RATE_LIMITED"),
      fail("RATE_LIMITED"),
      { kind: "ok" },
    ]);
    await callWithCascade(makeRequest(), { provider, sleep, baseDelayMs: 100 });

    expect(sleep.mock.calls).toEqual([[100], [200]]);
  });

  it("после исчерпания попыток переходит к следующей модели", async () => {
    const provider = createFakeProvider([
      fail("RATE_LIMITED"),
      fail("RATE_LIMITED"),
      fail("RATE_LIMITED"),
      { kind: "ok" },
    ]);
    const response = await callWithCascade(makeRequest(), { provider, ...noWait });

    expect(response.model).toBe("fake-smart");
    expect(provider.calls).toHaveLength(4);
  });

  it("медленную модель не уговаривает, а сразу меняет", async () => {
    const provider = createFakeProvider([fail("TIMEOUT"), { kind: "ok" }]);
    const response = await callWithCascade(makeRequest(), { provider, ...noWait });

    expect(response.model).toBe("fake-smart");
    expect(provider.calls).toHaveLength(2);
  });

  it("свою поломку не размазывает по всем моделям", async () => {
    const provider = createFakeProvider([fail("INTERNAL")]);

    await expect(callWithCascade(makeRequest(), { provider, ...noWait })).rejects.toMatchObject({
      code: "INTERNAL",
    });
    expect(provider.calls).toHaveLength(1);
  });

  it("когда не ответила ни одна модель, отдаёт последнюю причину", async () => {
    const provider = createFakeProvider(Array.from({ length: 6 }, () => fail("RATE_LIMITED")));

    await expect(callWithCascade(makeRequest(), { provider, ...noWait })).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
    expect(provider.calls).toHaveLength(6);
  });

  it("остановка пользователем прерывает каскад сразу", async () => {
    const controller = new AbortController();
    controller.abort();
    const provider = createFakeProvider();

    await expect(
      callWithCascade(makeRequest(controller.signal), { provider, ...noWait }),
    ).rejects.toMatchObject({ code: "STOPPED_BY_USER" });
    expect(provider.calls).toHaveLength(0);
  });

  it("сообщает наблюдателю, что происходило", async () => {
    const attempts: string[] = [];
    const provider = createFakeProvider([fail("RATE_LIMITED"), { kind: "ok" }]);

    await callWithCascade(makeRequest(), {
      provider,
      ...noWait,
      onAttempt: (info) => attempts.push(`${info.model}:${info.outcome}`),
    });

    expect(attempts).toEqual(["fake-fast:retry", "fake-fast:ok"]);
  });
});
