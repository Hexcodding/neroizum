-- Резервирование квоты одним неделимым действием.
--
-- Проверять лимит запросом, а потом отдельно вставлять запись нельзя: два
-- одновременных запроса на последней генерации месяца прочитают одно и то же
-- число и пройдут оба. Здесь проверка и вставка происходят внутри одной
-- функции под блокировкой строки лицензии, поэтому второй запрос ждёт первого.

create or replace function public.reserve_generation(
  p_license_id uuid,
  p_month_key text,
  p_stale_after interval default interval '1 hour'
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
  -- Блокировка строки лицензии выстраивает одновременные запросы в очередь.
  select monthly_limit into v_limit
  from public.licenses
  where id = p_license_id and disabled = false
  for update;

  if v_limit is null then
    return null;
  end if;

  -- Забытые резервы не должны держать квоту навсегда: если процесс упал между
  -- резервом и подтверждением, через p_stale_after слот снова свободен.
  select count(*) into v_used
  from public.generation_reservations
  where license_id = p_license_id
    and month_key = p_month_key
    and (status = 'committed' or created_at > now() - p_stale_after);

  if v_used >= v_limit then
    return null;
  end if;

  insert into public.generation_reservations (license_id, month_key)
  values (p_license_id, p_month_key)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.commit_generation(p_reservation_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.generation_reservations
  set status = 'committed'
  where id = p_reservation_id;
$$;

create or replace function public.release_generation(p_reservation_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.generation_reservations
  where id = p_reservation_id and status = 'reserved';
$$;

-- Сколько генераций израсходовано в месяце. Незавершённые резервы считаются
-- занятыми, пока не истекли: иначе показанный остаток разойдётся с реальным.
create or replace function public.used_generations(
  p_license_id uuid,
  p_month_key text,
  p_stale_after interval default interval '1 hour'
)
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.generation_reservations
  where license_id = p_license_id
    and month_key = p_month_key
    and (status = 'committed' or created_at > now() - p_stale_after);
$$;

-- Список клиентов для админки вместе с расходом за месяц. Одним запросом, а не
-- отдельным запросом на каждую строку: иначе список из ста клиентов — это сто
-- обращений к базе.
create or replace function public.admin_licenses(p_month_key text)
returns table (
  id uuid,
  client_id text,
  disabled boolean,
  subscription_until date,
  monthly_limit integer,
  note text,
  created_at timestamptz,
  used_this_month integer
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
    l.note,
    l.created_at,
    public.used_generations(l.id, p_month_key)
  from public.licenses l
  order by l.created_at desc;
$$;

-- Уборка. Вызывается по расписанию; таблицы иначе растут без предела.
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
$$;

revoke all on function public.reserve_generation(uuid, text, interval) from anon, authenticated;
revoke all on function public.commit_generation(uuid) from anon, authenticated;
revoke all on function public.release_generation(uuid) from anon, authenticated;
revoke all on function public.used_generations(uuid, text, interval) from anon, authenticated;
revoke all on function public.admin_licenses(text) from anon, authenticated;
revoke all on function public.cleanup_access_data() from anon, authenticated;
