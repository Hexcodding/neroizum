/**
 * Чтение потока событий генерации.
 *
 * Формат простой: строки «data: {json}», события разделены пустой строкой.
 * Библиотека для этого не нужна — встроенный EventSource не годится, потому что
 * не умеет ни POST, ни заголовок с токеном.
 *
 * Важная деталь: кусок ответа может оборваться на середине строки, поэтому
 * остаток всегда переносится в следующую итерацию. Иначе пост, разрезанный
 * пополам границей пакета, теряется — и заметно это будет только на длинных
 * планах у клиента, а не на коротких у нас.
 */

const EVENT_SEPARATOR = "\n\n";
const DATA_PREFIX = "data: ";

export async function* readEvents(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<unknown, void, void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let separator = buffer.indexOf(EVENT_SEPARATOR);
      while (separator !== -1) {
        const chunk = buffer.slice(0, separator);
        buffer = buffer.slice(separator + EVENT_SEPARATOR.length);
        const parsed = parseChunk(chunk);
        if (parsed !== null) yield parsed;
        separator = buffer.indexOf(EVENT_SEPARATOR);
      }
    }

    // Последнее событие может прийти без завершающей пустой строки.
    const tail = parseChunk(buffer);
    if (tail !== null) yield tail;
  } finally {
    reader.releaseLock();
  }
}

function parseChunk(chunk: string): unknown | null {
  const line = chunk.trim();
  if (!line.startsWith(DATA_PREFIX)) return null;

  try {
    return JSON.parse(line.slice(DATA_PREFIX.length)) as unknown;
  } catch {
    // Испорченное событие пропускается: остальной план из-за него терять незачем.
    return null;
  }
}
