/**
 * Сохранение файла из браузера и копирование в буфер.
 *
 * Обе операции завязаны на возможности браузера, поэтому лежат в общем слое, а
 * не рядом с логикой выгрузки: предметный слой не должен знать про DOM.
 */

export function downloadFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();

  // Ссылку нужно освободить, иначе содержимое остаётся в памяти вкладки.
  URL.revokeObjectURL(url);
}

/**
 * Копирование текста. Современный способ требует защищённого соединения,
 * поэтому есть запасной путь — иначе на локальной машине по http кнопка
 * «Скопировать» молча ничего не делает.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return copyViaTextarea(text);
  }
}

function copyViaTextarea(text: string): boolean {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "true");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}
