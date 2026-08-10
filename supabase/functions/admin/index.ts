// Точка входа панели управления. Пароль администратора здесь не хранится:
// сервер знает только его хеш из секретов проекта.
import { handleAdmin } from "../../../server/http/handlers/admin.ts";
import { begin, bearer, wire } from "../_shared/wire.ts";

Deno.serve(async (request: Request): Promise<Response> => {
  const context = wire();
  const { response, early } = begin(request, context.policy);
  if (early !== null) return early;

  return await handleAdmin(
    request,
    bearer(request),
    {
      admin: {
        licenses: context.adminLicenses,
        log: context.adminLog,
        pepper: context.config.pepper,
        // Пока администратор один. Когда появится второй, подпись возьмётся из
        // токена, а не из константы — место для этого уже есть.
        actorLabel: "admin",
      },
      attempts: context.attempts,
      config: {
        passwordHash: context.config.adminPasswordHash,
        pepper: context.config.pepper,
        tokenSecret: context.config.adminTokenSecret,
      },
      nowMs: context.nowMs,
      today: context.today,
    },
    response,
  );
});
