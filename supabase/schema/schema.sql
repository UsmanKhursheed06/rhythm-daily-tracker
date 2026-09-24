-- All tracker content is ciphertext. Scheduling metadata is deliberately separate.
create schema if not exists rhythm_private;
revoke all on schema rhythm_private from public,anon,authenticated;
grant usage on schema rhythm_private to service_role;
create table public.rhythm_records(owner uuid not null references auth.users(id) on delete cascade,id text not null,ciphertext text not null,version bigint not null default 1,primary key(owner,id));
create table public.rhythm_profiles(owner uuid primary key references auth.users(id) on delete cascade,timezone text not null default 'Asia/Karachi',reminder_enabled boolean not null default false);
create table public.rhythm_day_marks(owner uuid not null references auth.users(id) on delete cascade,day date not null,complete boolean not null default false,primary key(owner,day));
create table public.rhythm_subscriptions(owner uuid not null references auth.users(id) on delete cascade,id text not null,ciphertext text not null,created_at timestamptz not null default now(),primary key(owner,id));
create table public.rhythm_deliveries(owner uuid not null,subscription_id text not null,day date not null,status text not null default 'pending',lease_until timestamptz not null default now(),attempts integer not null default 0,primary key(owner,subscription_id,day),foreign key(owner,subscription_id) references public.rhythm_subscriptions(owner,id) on delete cascade);
alter table public.rhythm_records enable row level security;
alter table public.rhythm_profiles enable row level security;
alter table public.rhythm_day_marks enable row level security;
alter table public.rhythm_subscriptions enable row level security;
alter table public.rhythm_deliveries enable row level security;
create policy own_records on public.rhythm_records for all to authenticated using((select auth.uid())=owner) with check((select auth.uid())=owner);
create policy own_profile on public.rhythm_profiles for all to authenticated using((select auth.uid())=owner) with check((select auth.uid())=owner);
create policy own_days on public.rhythm_day_marks for all to authenticated using((select auth.uid())=owner) with check((select auth.uid())=owner);
create policy own_push on public.rhythm_subscriptions for all to authenticated using((select auth.uid())=owner) with check((select auth.uid())=owner);
revoke all on public.rhythm_records,public.rhythm_profiles,public.rhythm_day_marks,public.rhythm_subscriptions,public.rhythm_deliveries from anon,authenticated;
grant select,insert,update,delete on public.rhythm_records,public.rhythm_profiles,public.rhythm_day_marks,public.rhythm_subscriptions to authenticated;
grant all on public.rhythm_records,public.rhythm_profiles,public.rhythm_day_marks,public.rhythm_subscriptions,public.rhythm_deliveries to service_role;
create function public.rhythm_apply(p_changes jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare item jsonb; affected integer; conflicts jsonb='[]'; uid uuid=auth.uid();
begin
 if uid is null then raise exception 'authentication required'; end if;
 if jsonb_typeof(p_changes)<>'array' or jsonb_array_length(p_changes)>100 then raise exception 'invalid batch';end if;
 for item in select value from jsonb_array_elements(p_changes) loop
  if length(item->>'id')>160 or length(item->>'ciphertext')>20000 then raise exception 'invalid record';end if;
  insert into public.rhythm_records as r(owner,id,ciphertext,version) values(uid,item->>'id',item->>'ciphertext',1)
  on conflict(owner,id) do update set ciphertext=excluded.ciphertext,version=r.version+1 where r.version=coalesce((item->>'version')::bigint,0);
  get diagnostics affected=row_count;
  if affected=0 then conflicts=conflicts||jsonb_build_array(item->>'id');
  elsif item ? 'day_date' then
   insert into public.rhythm_day_marks(owner,day,complete) values(uid,(item->>'day_date')::date,(item->>'day_complete')::boolean)
   on conflict(owner,day) do update set complete=excluded.complete;
  end if;
 end loop;
 return jsonb_build_object('conflicts',conflicts);
end $$;
revoke all on function public.rhythm_apply(jsonb) from public,anon;
grant execute on function public.rhythm_apply(jsonb) to authenticated;
create function rhythm_private.runtime_secrets() returns jsonb language sql security definer set search_path='' as $$
 select jsonb_object_agg(name,decrypted_secret) from vault.decrypted_secrets where name in ('rhythm_encryption_key','rhythm_cron_secret','rhythm_vapid_public','rhythm_vapid_private');
$$;
revoke all on function rhythm_private.runtime_secrets() from public,anon,authenticated;
grant execute on function rhythm_private.runtime_secrets() to service_role;
create function public.rhythm_runtime_secrets() returns jsonb language sql security invoker set search_path='' as $$select rhythm_private.runtime_secrets();$$;
revoke all on function public.rhythm_runtime_secrets() from public,anon,authenticated;
grant execute on function public.rhythm_runtime_secrets() to service_role;
create function public.rhythm_claim_reminders() returns table(owner uuid,subscription_id text,day date,ciphertext text) language sql security invoker set search_path='' as $$
 with due as (
 select p.owner,s.id subscription_id,((now() at time zone p.timezone)::date-1) as day,s.ciphertext
 from public.rhythm_profiles p join public.rhythm_subscriptions s on s.owner=p.owner
 where p.reminder_enabled and extract(hour from now() at time zone p.timezone)=0
 and not exists(select 1 from public.rhythm_deliveries n where n.owner=p.owner and n.subscription_id=s.id and n.day=(now() at time zone p.timezone)::date-1 and (n.status='sent' or n.lease_until>now() or n.attempts>=3))
 and not exists(select 1 from public.rhythm_day_marks d where d.owner=p.owner and d.day=(now() at time zone p.timezone)::date-1 and d.complete)
 ), claimed as (
 insert into public.rhythm_deliveries as r(owner,subscription_id,day,status,lease_until,attempts)
 select d.owner,d.subscription_id,d.day,'pending',now()+interval '5 minutes',1 from due d limit 100
 on conflict(owner,subscription_id,day) do update set lease_until=excluded.lease_until,attempts=r.attempts+1
 where r.status<>'sent' and r.lease_until<now() and r.attempts<3
 returning r.owner,r.subscription_id,r.day
 ) select d.owner,d.subscription_id,d.day,d.ciphertext from due d join claimed c using(owner,subscription_id,day);
$$;
revoke all on function public.rhythm_claim_reminders() from public,anon,authenticated;
grant execute on function public.rhythm_claim_reminders() to service_role;

create function public.rhythm_valid_timezone(t text) returns boolean language sql stable security invoker set search_path='' as $$select exists(select 1 from pg_catalog.pg_timezone_names where name=t);$$;
alter table public.rhythm_profiles add constraint valid_timezone check(public.rhythm_valid_timezone(timezone));

