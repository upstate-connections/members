-- =====================================================================
-- Connection Group Site — database setup
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Then run the "BOOTSTRAP" line at the bottom with YOUR email.
-- =====================================================================

-- ---------- Tables ----------------------------------------------------

create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  full_name   text not null,
  phone       text,
  business    text,
  industry    text,
  website     text,
  bio         text,
  role        text not null default 'member' check (role in ('member','officer')),
  active      boolean not null default true,
  joined_on   date default current_date,
  created_at  timestamptz not null default now()
);

create table if not exists public.events (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  starts_at        timestamptz not null,
  ends_at          timestamptz,
  location         text,
  description      text,
  speaker_name     text,
  speaker_business text,
  created_at       timestamptz not null default now()
);

create table if not exists public.dues (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.members(id) on delete cascade,
  period      text not null,              -- e.g. '2026' or '2026-Q1'
  amount      numeric(10,2),
  paid        boolean not null default false,
  paid_on     date,
  note        text,
  updated_at  timestamptz not null default now(),
  unique (member_id, period)
);

create table if not exists public.site_settings (
  id           int primary key default 1 check (id = 1),
  group_name   text default 'Our Connection Group',
  cashapp_url  text,
  dues_amount  numeric(10,2),
  dues_period  text default to_char(current_date, 'YYYY'),
  welcome_md   text default 'Welcome! Check the calendar for our next meeting.',
  policies_md  text default E'## Membership\n\n(Officers: edit this in Admin → Settings.)',
  updated_at   timestamptz not null default now()
);
insert into public.site_settings (id) values (1) on conflict (id) do nothing;

-- ---------- Helper functions -----------------------------------------

create or replace function public.current_email() returns text
language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where email = public.current_email() and active)
$$;

create or replace function public.is_officer() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where email = public.current_email() and active and role = 'officer')
$$;

create or replace function public.my_member_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from members where email = public.current_email() and active limit 1
$$;

-- Always store emails lowercase; stop non-officers changing protected fields.
create or replace function public.members_guard() returns trigger
language plpgsql as $$
begin
  new.email := lower(trim(new.email));
  if tg_op = 'UPDATE' and not public.is_officer() then
    if new.email <> old.email or new.role <> old.role or new.active <> old.active then
      raise exception 'Only officers can change email, role, or active status.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists members_guard on public.members;
create trigger members_guard before insert or update on public.members
for each row execute function public.members_guard();

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

drop trigger if exists dues_touch on public.dues;
create trigger dues_touch before update on public.dues
for each row execute function public.touch_updated_at();

-- Only people on the member list can create a login.
create or replace function public.check_allowed_signup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.members where email = lower(new.email) and active) then
    raise exception 'This email is not on the member list. Ask an officer to add you.';
  end if;
  return new;
end $$;

drop trigger if exists before_user_signup on auth.users;
create trigger before_user_signup before insert on auth.users
for each row execute function public.check_allowed_signup();

-- ---------- Row Level Security ---------------------------------------

alter table public.members       enable row level security;
alter table public.events        enable row level security;
alter table public.dues          enable row level security;
alter table public.site_settings enable row level security;

-- members
drop policy if exists members_read   on public.members;
drop policy if exists members_insert on public.members;
drop policy if exists members_update on public.members;
drop policy if exists members_delete on public.members;
create policy members_read   on public.members for select to authenticated using (public.is_member());
create policy members_insert on public.members for insert to authenticated with check (public.is_officer());
create policy members_update on public.members for update to authenticated
  using (public.is_officer() or email = public.current_email())
  with check (public.is_officer() or email = public.current_email());
create policy members_delete on public.members for delete to authenticated using (public.is_officer());

-- events
drop policy if exists events_read  on public.events;
drop policy if exists events_write on public.events;
create policy events_read  on public.events for select to authenticated using (public.is_member());
create policy events_write on public.events for all    to authenticated using (public.is_officer()) with check (public.is_officer());

-- dues: officers see everything, members see only their own
drop policy if exists dues_read  on public.dues;
drop policy if exists dues_write on public.dues;
create policy dues_read  on public.dues for select to authenticated
  using (public.is_officer() or member_id = public.my_member_id());
create policy dues_write on public.dues for all to authenticated
  using (public.is_officer()) with check (public.is_officer());

-- settings
drop policy if exists settings_read  on public.site_settings;
drop policy if exists settings_write on public.site_settings;
create policy settings_read  on public.site_settings for select to authenticated using (public.is_member());
create policy settings_write on public.site_settings for update to authenticated using (public.is_officer()) with check (public.is_officer());

grant select, insert, update, delete on public.members, public.events, public.dues, public.site_settings to authenticated;
revoke all on public.members, public.events, public.dues, public.site_settings from anon;

-- =====================================================================
-- BOOTSTRAP: make yourself the first officer (edit, then run this line)
-- =====================================================================
-- insert into public.members (email, full_name, role) values ('you@example.com', 'Your Name', 'officer');
