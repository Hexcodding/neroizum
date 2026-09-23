-- Картинки к постам: свой счётчик, своё хранилище, ссылка у поста.
--
-- Считать картинки генерациями планов нельзя: план текстом стоит десять-
-- пятнадцать центов, одна картинка — три с половиной. Тридцать картинок к
-- плану дороже самого плана в семь-десять раз, и общий счётчик означал бы, что
-- один клиент с кнопкой «картинку к каждому посту» съедает месячный бюджет.
--
-- Устройство счётчика — третья копия одного и того же: проверка лимита и
-- вставка резерва одной функцией под блокировкой строки лицензии (решение 21).
-- Имена параметров и статусы повторяют миграции 0002 и 0003 дословно, потому
-- что клиент базы у трёх счётчиков общий и различает их только серединой имени
-- функции.

alter table public.licenses
  add column if not exists image_limit integer not null default 30
    check (image_limit >= 0);

comment on column public.licenses.image_limit is
  'Сколько картинок к постам в месяц. Самый дорогой ресурс продукта.';

create table if not exists public.post_images (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.licenses (id) on delete cascade,
  -- Календарный месяц в виде ГГГГ-ММ.
  month_key text not null,
  status text not null default 'reserved' check (status in ('reserved', 'committed')),
  created_at timestamptz not null default now()
);

create index if not exists post_images_month
  on public.post_images (license_id, month_key);

alter table public.post_images enable row level security;

-- Готовая картинка лежит в хранилище, у поста хранится только путь к ней.
-- Отдельной колонкой, а не внутри payload: payload перезаписывается целиком
-- при правке и при переделке поста через модель, и картинка исчезала бы от
-- нажатия «Переделать».
alter table public.posts
  add column if not exists image_path text;

comment on column public.posts.image_path is
  'Путь в бакете post-images. Ссылка наружу подписывается на время показа.';

create or replace function public.reserve_image(
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
  select image_limit into v_limit
  from public.licenses
  where id = p_license_id and disabled = false
  for update;

  if v_limit is null then
    return null;
  end if;

  select count(*) into v_used
  from public.post_images
  where license_id = p_license_id
    and month_key = p_month_key
    and (status = 'committed' or created_at > now() - p_stale_after);

  if v_used >= v_limit then
    return null;
  end if;

  insert into public.post_images (license_id, month_key)
  values (p_license_id, p_month_key)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.commit_image(p_reservation_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.post_images set status = 'committed' where id = p_reservation_id;
$$;

create or replace function public.release_image(p_reservation_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.post_images where id = p_reservation_id and status = 'reserved';
$$;

create or replace function public.used_images(
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
  from public.post_images
  where license_id = p_license_id
    and month_key = p_month_key
    and (status = 'committed' or created_at > now() - p_stale_after);
$$;

-- Список клиентов снова пополняется двумя колонками, поэтому функция
-- пересоздаётся: сменить набор возвращаемых полей через create or replace нельзя.
drop function if exists public.admin_licenses(text);

create function public.admin_licenses(p_month_key text)
returns table (
  id uuid,
  client_id text,
  disabled boolean,
  subscription_until date,
  monthly_limit integer,
  improvement_limit integer,
  image_limit integer,
  note text,
  created_at timestamptz,
  used_this_month integer,
  improvements_this_month integer,
  images_this_month integer
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
    l.image_limit,
    l.note,
    l.created_at,
    public.used_generations(l.id, p_month_key),
    public.used_improvements(l.id, p_month_key),
    public.used_images(l.id, p_month_key)
  from public.licenses l
  order by l.created_at desc;
$$;

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
  delete from public.post_images
  where status = 'reserved' and created_at < now() - interval '1 day';
$$;

-- ХРАНИЛИЩЕ КАРТИНОК --------------------------------------------------------
--
-- Бакет закрытый, и политик доступа к нему нет — как и у таблиц (миграция
-- 0001). Служебная роль защиту обходит, поэтому загружает и подписывает ссылки
-- сервер, а браузер получает ссылку со сроком жизни. Открытый бакет означал бы,
-- что картинки неопубликованного плана лежат в интернете по угадываемому пути.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', false, 8388608, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

revoke all on function public.reserve_image(uuid, text, interval) from anon, authenticated;
revoke all on function public.commit_image(uuid) from anon, authenticated;
revoke all on function public.release_image(uuid) from anon, authenticated;
revoke all on function public.used_images(uuid, text, interval) from anon, authenticated;
revoke all on function public.admin_licenses(text) from anon, authenticated;
revoke all on function public.cleanup_access_data() from anon, authenticated;
