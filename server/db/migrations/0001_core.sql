-- Основная схема НЕЙРОИЗЮМ v2.
--
-- Модель доступа: клиент никогда не обращается к базе напрямую. Все запросы
-- идут через серверные функции, работающие служебной ролью. Поэтому на всех
-- таблицах включена защита на уровне строк и НЕ создано ни одной политики:
-- для анонимной и авторизованной роли это означает полный запрет, а служебная
-- роль защиту обходит по своей природе.
--
-- Такой подход выбран вместо набора политик осознанно: политику можно написать
-- слишком широко и не заметить этого, а отсутствующая политика ошибиться не
-- может. Если позже понадобится прямой доступ клиента к своим планам, политики
-- добавляются отдельной миграцией и ровно на нужные таблицы.

create extension if not exists pgcrypto;

-- ЛИЦЕНЗИИ ------------------------------------------------------------------

create table public.licenses (
  id uuid primary key default gen_random_uuid(),
  -- Видимый номер клиента. Генерируется независимо от ключа: в предыдущей
  -- версии видимый префикс был началом самого ключа и раскрывал 7 из 12
  -- секретных символов.
  client_id text not null unique,
  -- Только хеш. Сам ключ виден администратору один раз при создании.
  key_hash text not null unique,
  disabled boolean not null default false,
  subscription_until date not null,
  monthly_limit integer not null default 20 check (monthly_limit >= 0),
  -- Пометка администратора: кому выдан ключ.
  note text not null default '',
  created_at timestamptz not null default now()
);

comment on column public.licenses.client_id is
  'Видимый номер клиента, не связанный с ключом. Раскрывать безопасно.';
comment on column public.licenses.key_hash is
  'SHA-256 от серверного секрета и ключа. Ключ в открытом виде не хранится.';

-- СЕССИИ --------------------------------------------------------------------

create table public.sessions (
  token_hash text primary key,
  license_id uuid not null references public.licenses (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Одна активная сессия на лицензию: защита от передачи ключа между людьми.
create unique index sessions_one_per_license on public.sessions (license_id);
create index sessions_expires_at on public.sessions (expires_at);

-- ПОПЫТКИ ДОСТУПА -----------------------------------------------------------

-- Счётчики живут в базе, а не в памяти процесса: в предыдущей версии счётчик
-- обнулялся при холодном старте, и лимит попыток обходился ожиданием.
create table public.access_attempts (
  id bigint generated always as identity primary key,
  bucket text not null,
  happened_at timestamptz not null default now()
);

create index access_attempts_bucket on public.access_attempts (bucket, happened_at desc);

-- КВОТА ---------------------------------------------------------------------

create table public.generation_reservations (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.licenses (id) on delete cascade,
  -- Календарный месяц в виде ГГГГ-ММ.
  month_key text not null,
  status text not null default 'reserved' check (status in ('reserved', 'committed')),
  created_at timestamptz not null default now()
);

create index generation_reservations_month
  on public.generation_reservations (license_id, month_key);

-- ПЛАТЕЖИ -------------------------------------------------------------------

-- Первичный ключ по идентификатору события платёжной системы и есть защита от
-- повторной обработки: повторный запрос упрётся в уникальность. Платёжные
-- системы повторяют запросы штатно, это не сбой.
create table public.payments (
  event_id text primary key,
  license_id uuid not null references public.licenses (id) on delete cascade,
  paid_until date not null,
  processed_at timestamptz not null default now()
);

-- ДЕЙСТВИЯ АДМИНИСТРАТОРА ---------------------------------------------------

create table public.admin_actions (
  id bigint generated always as identity primary key,
  action text not null,
  actor_label text not null,
  details jsonb not null default '{}'::jsonb,
  happened_at timestamptz not null default now()
);

-- КОНТЕНТ-ПЛАНЫ -------------------------------------------------------------

create table public.content_plans (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.licenses (id) on delete cascade,
  title text not null default '',
  -- Версия промпта, которым сделан план: без неё через месяц не понять, чем
  -- сгенерирован результат и стало ли лучше после правки промпта.
  prompt_version text not null,
  request jsonb not null,
  created_at timestamptz not null default now()
);

create index content_plans_license on public.content_plans (license_id, created_at desc);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.content_plans (id) on delete cascade,
  number integer not null,
  publish_date date not null,
  platform text not null,
  -- Пост целиком лежит одним объектом: набор полей задаётся контрактом ответа
  -- модели и меняется вместе с версией промпта, а не через миграции.
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  unique (plan_id, number)
);

create index posts_plan_date on public.posts (plan_id, publish_date);

-- ЗАЩИТА --------------------------------------------------------------------

alter table public.licenses enable row level security;
alter table public.sessions enable row level security;
alter table public.access_attempts enable row level security;
alter table public.generation_reservations enable row level security;
alter table public.payments enable row level security;
alter table public.admin_actions enable row level security;
alter table public.content_plans enable row level security;
alter table public.posts enable row level security;

-- Ни одной политики не создаётся: доступ только у служебной роли.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
