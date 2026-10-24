-- Private Poker Club: database schema.
-- Browsers can only READ two tables (table_views, private_hands) and only rows they are allowed to see.
-- Every write goes through the "poker" Edge Function, which uses the service-role key (never shipped to the browser).

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_user_id uuid not null,
  status text not null default 'lobby' check (status in ('lobby', 'playing')),
  settings jsonb not null,
  log jsonb not null default '[]'::jsonb,        -- lobby events (joined / left / started)
  rev bigint not null default 0,                 -- bumped on every published change
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);

create table public.room_players (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null,                         -- anonymous guest session (auth.uid())
  name text not null,
  seat smallint not null check (seat between 0 and 5),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id),
  unique (room_id, seat)
);
create unique index room_players_unique_name on public.room_players (room_id, lower(name));

-- Authoritative game state INCLUDING the deck and everybody's cards. Service role only.
create table public.games (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  state jsonb not null,
  version int not null default 1,
  updated_at timestamptz not null default now()
);

-- Sanitised state that every seated player may read (no deck, no hidden cards).
create table public.table_views (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  version bigint not null,
  view jsonb not null
);

-- Each player's own hole cards. A player can only read their own row.
create table public.private_hands (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null,
  hand_number int not null,
  cards jsonb not null,
  primary key (room_id, user_id)
);

alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.games enable row level security;
alter table public.table_views enable row level security;
alter table public.private_hands enable row level security;
-- rooms / room_players / games: RLS on and NO policies = invisible to browsers.

revoke all on all tables in schema public from anon, authenticated;
grant select on public.table_views, public.private_hands to authenticated;

create function public.is_room_member(p_room uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.room_players where room_id = p_room and user_id = auth.uid())
$$;
revoke all on function public.is_room_member(uuid) from public, anon;
grant execute on function public.is_room_member(uuid) to authenticated;

create policy "seated players can read their table"
  on public.table_views for select to authenticated
  using (public.is_room_member(room_id));

create policy "players can read only their own cards"
  on public.private_hands for select to authenticated
  using (user_id = auth.uid());

-- Helper functions used by the Edge Function (service role only).
create function public.bump_rev(p_room uuid) returns bigint
language sql security definer set search_path = public
as $$ update public.rooms set rev = rev + 1, last_activity_at = now() where id = p_room returning rev $$;

create function public.write_view(p_room uuid, p_rev bigint, p_view jsonb) returns void
language sql security definer set search_path = public
as $$
  insert into public.table_views (room_id, version, view) values (p_room, p_rev, p_view)
  on conflict (room_id) do update set version = excluded.version, view = excluded.view
  where public.table_views.version < excluded.version
$$;

create function public.append_room_log(p_room uuid, p_text text) returns void
language sql security definer set search_path = public
as $$
  update public.rooms
  set log = log || jsonb_build_array(jsonb_build_object(
    'time', (extract(epoch from clock_timestamp()) * 1000)::bigint, 'text', p_text))
  where id = p_room
$$;

-- Deletes rooms with no activity for p_hours (cascades to players, games, views, hands).
create function public.cleanup_stale_rooms(p_hours int) returns int
language sql security definer set search_path = public
as $$
  with removed as (
    delete from public.rooms where last_activity_at < now() - make_interval(hours => p_hours) returning 1
  ) select count(*)::int from removed
$$;

revoke all on function public.bump_rev(uuid), public.write_view(uuid, bigint, jsonb),
  public.append_room_log(uuid, text), public.cleanup_stale_rooms(int) from public, anon, authenticated;
grant execute on function public.bump_rev(uuid), public.write_view(uuid, bigint, jsonb),
  public.append_room_log(uuid, text), public.cleanup_stale_rooms(int) to service_role;

-- Realtime: browsers subscribe to these two tables (RLS still decides who receives what).
alter publication supabase_realtime add table public.table_views, public.private_hands;
