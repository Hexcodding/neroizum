-- Улучшение отдельного поста через модель: свой счётчик, отдельный от планов.
--
-- Считать улучшения теми же генерациями нельзя: план стоит четыре-пять
-- обращений к модели, улучшение — одно. Если списывать за них одинаково,
-- кнопкой никто не пользуется, а ради неё она и сделана.
--
-- Устройство повторяет квоту генераций (миграция 0002) вплоть до имён полей:
-- проверка лимита и вставка резерва идут одной функцией под блокировкой строки
-- лицензии. Двумя запросами это делать нельзя — два одновременных улучшения на
-- последнем свободном слоте прочитают одно и то же число и пройдут оба.

alter table public.licenses
  add column if not exists improvement_limit integer not null default 30
    check (improvement_limit >= 0);

comment on column public.licenses.improvement_limit is
  'Сколько улучшений отдельных постов в месяц. Считается отдельно от планов.';

create table if not exists public.post_improvements (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.licenses (id) on delete cascade,
  -- Календарный месяц в виде ГГГГ-ММ.
  month_key text not null,
  status text not null default 'reserved' check (status in ('reserved', 'committed')),
  created_at timestamptz not null default now()
);

create index if not exists post_improvements_month
  on public.post_improvements (license_id, month_key);

alter table public.post_improvements enable row level security;

create or replace function public.reserve_improvement(
  p_license_id uuid,
  p_month_key text,
  p_stale_after interval default interval '10 minutes'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_used integer;
  v_id uuid;
begin
  select improvement_limit into v_limit
  from public.licenses
  where id = p_license_id and disabled = false
  for update;

  if v_limit is null then
    return null;
  end if;

  -- Брошенный резерв держит слот недолго: одно улучшение — это один запрос к
  -- модели на несколько секунд, а не многоминутная сборка плана.
  select count(*) into v_used
  from public.post_improvements
  where license_id = p_license_id
    and month_key = p_month_key
    and (status = 'committed' or created_at > now() - p_stale_after);

  if v_used >= v_limit then
    return null;
  end if;

  insert into public.post_improvements (license_id, month_key)
  values (p_license_id, p_month_key)
  returning id into v_id;

  return v_id;
end;
$$;

-- Имена параметров повторяют функции генераций: клиент базы у двух счётчиков
-- один и тот же, различается только середина имени функции.
create or replace function public.commit_improvement(p_reservation_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.post_improvements set status = 'committed' where id = p_reservation_id;
$$;

create or replace function public.release_improvement(p_reservation_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.post_improvements where id = p_reservation_id and status = 'reserved';
$$;

create or replace function public.used_improvements(
  p_license_id uuid,
  p_month_key text,
  p_stale_after interval default interval '10 minutes'
)
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.post_improvements
  where license_id = p_license_id
    and month_key = p_month_key
    and (status = 'committed' or created_at > now() - p_stale_after);
$$;

-- Список клиентов пополняется двумя колонками, поэтому функция пересоздаётся:
-- сменить набор возвращаемых полей через create or replace нельзя.
drop function if exists public.admin_licenses(text);

create function public.admin_licenses(p_month_key text)
returns table (
  id uuid,
  client_id text,
  disabled boolean,
  subscription_until date,
  monthly_limit integer,
  improvement_limit integer,
  note text,
  created_at timestamptz,
  used_this_month integer,
  improvements_this_month integer
)
language sql
security definer
set search_path = public
as $$
  select
    l.id,
    l.client_id,
    l.disabled,
    l.subscription_until,
    l.monthly_limit,
    l.improvement_limit,
    l.note,
    l.created_at,
    public.used_generations(l.id, p_month_key),
    public.used_improvements(l.id, p_month_key)
  from public.licenses l
  order by l.created_at desc;
$$;

-- Уборка расширяется вместе с новой таблицей: брошенные резервы иначе копятся.
create or replace function public.cleanup_access_data()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.sessions where expires_at < now();
  delete from public.access_attempts where happened_at < now() - interval '1 day';
  delete from public.generation_reservations
  where status = 'reserved' and created_at < now() - interval '1 day';
  delete from public.post_improvements
  where status = 'reserved' and created_at < now() - interval '1 day';
$$;

revoke all on function public.reserve_improvement(uuid, text, interval) from anon, authenticated;
revoke all on function public.commit_improvement(uuid) from anon, authenticated;
revoke all on function public.release_improvement(uuid) from anon, authenticated;
revoke all on function public.used_improvements(uuid, text, interval) from anon, authenticated;
revoke all on function public.admin_licenses(text) from anon, authenticated;
revoke all on function public.cleanup_access_data() from anon, authenticated;
