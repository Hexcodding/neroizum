/**
 * Переменные окружения браузерной части. Перечислены явно, чтобы опечатка в
 * имени была ошибкой типов, а не пустой строкой во время работы.
 *
 * Секретов здесь нет и быть не может: всё с префиксом VITE_ попадает в бандл и
 * доступно любому, кто откроет исходники страницы. Служебный ключ базы, ключ
 * модели и пароль администратора живут только в секретах Edge Functions.
 */
interface ImportMetaEnv {
  /** Адрес проекта Supabase, например https://xxxx.supabase.co */
  readonly VITE_SUPABASE_URL: string;
  /** Публичный ключ. Задуман открытым: доступ к данным закрыт на стороне базы. */
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** `development` или `production`. От этого зависит доступность служебных экранов. */
  readonly VITE_APP_ENV?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
