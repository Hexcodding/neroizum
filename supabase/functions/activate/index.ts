// Точка входа «войти по ключу». Вся логика — в server/access и server/http;
// здесь только приём запроса и передача собранных зависимостей.
import { handleActivate, handleLogout } from "../../../server/http/handlers/activate.ts";
import { begin, bearer, wire } from "../_shared/wire.ts";

Deno.serve(async (request: Request): Promise<Response> => {
  const context = wire();
  const { response, early } = begin(request, context.policy);
  if (early !== null) return early;

  const deps = {
    context: {
      licenses: context.licenses,
      attempts: context.attempts,
      pepper: context.config.pepper,
      nowMs: context.nowMs,
      today: context.today,
    },
  };

  const url = new URL(request.url);
  if (url.pathname.endsWith("/logout")) {
    return await handleLogout(bearer(request), deps, response);
  }
  return await handleActivate(request, deps, response);
});
