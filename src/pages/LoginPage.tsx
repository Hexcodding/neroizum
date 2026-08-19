/**
 * Вход по ключу — первый экран продукта.
 *
 * Регистрации нет: человек получает ключ от нас и вводит его один раз. Поэтому
 * экран объясняет, что тут происходит, а не молча показывает поле: «введите
 * ключ» без объяснения выглядит как ошибка сайта.
 *
 * Ключ приводится к каноническому виду при вводе (регистр, пробелы, дефисы),
 * потому что его почти всегда копируют из мессенджера вместе с мусором.
 */
import { useState } from "react";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Field } from "@/shared/ui/Field";
import { Input } from "@/shared/ui/Input";
import { Notice } from "@/shared/ui/Feedback";
import { ApiError } from "@/shared/api/errors";
import { useAccess } from "@/features/access/useAccess";
import { formatKeyInput, isKeyComplete } from "@/features/access/key-input";

const KEY_PLACEHOLDER = "NZM-XXXX-XXXX-XXXX";

export default function LoginPage() {
  const { enter, checking } = useAccess();
  const [key, setKey] = useState("");
  const [error, setError] = useState<ApiError | null>(null);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    try {
      await enter(key);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause : null);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <header className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">НЕЙРОИЗЮМ</h1>
        <p className="text-sm leading-relaxed text-muted">
          Генератор контент-планов: готовые посты и промпты для генерации изображений.
        </p>
        <span className="mx-auto inline-flex items-center rounded-full bg-secondary px-3 py-1 text-[11px] font-medium uppercase tracking-widest text-secondary-foreground">
          Бета-тестирование
        </span>
      </header>

      <Card className="p-5">
        <form
          onSubmit={(event) => {
            void submit(event);
          }}
          className="flex flex-col gap-4"
        >
          <Field
            label="Ключ доступа"
            hint="Мы присылаем его после оплаты. Можно вставить целиком — лишние символы уберутся сами."
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                value={key}
                onChange={(event) => {
                  setKey(formatKeyInput(event.target.value));
                }}
                placeholder={KEY_PLACEHOLDER}
                autoComplete="one-time-code"
                inputMode="text"
                spellCheck={false}
                className="font-mono tracking-widest"
              />
            )}
          </Field>

          {error !== null && (
            <Notice tone="error" title={titleFor(error)}>
              {error.message}
            </Notice>
          )}

          <Button type="submit" size="lg" disabled={checking || !isKeyComplete(key)}>
            {checking ? "Проверяем…" : "Войти"}
          </Button>
        </form>
      </Card>

      <p className="text-center text-xs leading-relaxed text-muted">
        Нет ключа? Напишите нам — расскажем, как получить доступ, и покажем пример готового плана.
      </p>
    </main>
  );
}

/** Заголовок сообщения зависит от того, что именно случилось. */
function titleFor(error: ApiError): string {
  if (error.code === "SUBSCRIPTION_ENDED") return "Подписка закончилась";
  if (error.code === "TOO_MANY_ATTEMPTS") return "Слишком много попыток";
  return "Не удалось войти";
}
