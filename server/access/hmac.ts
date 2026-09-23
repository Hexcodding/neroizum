/**
 * Подпись строки серверным секретом. Используется в двух местах: проверка
 * подписи вебхука и токен администратора. Вынесено отдельно, чтобы не было
 * двух реализаций одного и того же — они неизбежно разъезжаются.
 */

export async function hmacHex(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
