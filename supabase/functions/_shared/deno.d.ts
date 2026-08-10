// Минимальное описание того, чем мы пользуемся из Deno. Полные типы Deno здесь
// не подключаются намеренно: с ними серверному коду стало бы доступно всё
// окружение, и запрет «server/ не знает про браузер и не знает про рантайм»
// перестал бы что-либо значить.
declare const Deno: {
  readonly env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response> | Response): void;
};
