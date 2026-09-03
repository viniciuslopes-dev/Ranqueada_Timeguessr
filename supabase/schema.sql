-- CronoRank: execute este arquivo uma vez no SQL Editor do Supabase.
create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 40),
  invite_code text not null unique check (invite_code ~ '^[A-Z2-9]{6}$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 24),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 24),
  color text not null default '#ff7043' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now()
);

create unique index if not exists players_room_nickname_unique
  on public.players (room_id, lower(nickname));

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 50),
  played_at date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  score integer not null check (score between 0 and 50000),
  created_at timestamptz not null default now(),
  unique (match_id, player_id)
);

create index if not exists players_room_idx on public.players(room_id);
create index if not exists matches_room_date_idx on public.matches(room_id, played_at desc);
create index if not exists scores_room_idx on public.scores(room_id);
create index if not exists scores_match_idx on public.scores(match_id);

-- Função privada usada pelas políticas sem causar recursão em room_members.
create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.room_members
    where room_id = p_room_id and user_id = auth.uid()
  );
$$;

revoke all on function public.is_room_member(uuid) from public;
grant execute on function public.is_room_member(uuid) to authenticated;

-- Cria sala, associa o navegador atual e cadastra o primeiro jogador.
create or replace function public.create_room(p_name text, p_nickname text)
returns table(room_id uuid, invite_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid;
  v_code text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if char_length(trim(p_name)) not between 2 and 40 then
    raise exception 'Room name must have 2 to 40 characters';
  end if;
  if char_length(trim(p_nickname)) not between 1 and 24 then
    raise exception 'Nickname must have 1 to 24 characters';
  end if;

  loop
    select string_agg(substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1), '')
      into v_code from generate_series(1, 6);
    exit when not exists (select 1 from public.rooms where rooms.invite_code = v_code);
  end loop;

  insert into public.rooms (name, invite_code, created_by)
    values (trim(p_name), v_code, auth.uid())
    returning id into v_room_id;
  insert into public.room_members (room_id, user_id, nickname)
    values (v_room_id, auth.uid(), trim(p_nickname));
  insert into public.players (room_id, nickname, color)
    values (v_room_id, trim(p_nickname), '#ff7043');

  room_id := v_room_id;
  invite_code := v_code;
  return next;
end;
$$;

-- Entra por código. Se o nick já foi cadastrado pelo organizador, ele é reaproveitado.
create or replace function public.join_room(p_invite_code text, p_nickname text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid;
  v_colors constant text[] := array['#ff7043','#4f7cff','#8b5cf6','#23a982','#e8a317','#e75480','#197f91','#6f7d3c'];
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if char_length(trim(p_nickname)) not between 1 and 24 then
    raise exception 'Nickname must have 1 to 24 characters';
  end if;

  select id into v_room_id
    from public.rooms
    where rooms.invite_code = upper(trim(p_invite_code));
  if v_room_id is null then
    raise exception 'Room not found' using errcode = 'P0002';
  end if;

  insert into public.room_members (room_id, user_id, nickname)
    values (v_room_id, auth.uid(), trim(p_nickname))
    on conflict (room_id, user_id) do update set nickname = excluded.nickname;

  if not exists (
    select 1 from public.players
    where room_id = v_room_id and lower(nickname) = lower(trim(p_nickname))
  ) then
    insert into public.players (room_id, nickname, color)
      values (v_room_id, trim(p_nickname), v_colors[1 + floor(random() * array_length(v_colors, 1))::int]);
  end if;

  return v_room_id;
end;
$$;

revoke all on function public.create_room(text, text) from public;
revoke all on function public.join_room(text, text) from public;
grant execute on function public.create_room(text, text) to authenticated;
grant execute on function public.join_room(text, text) to authenticated;

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.scores enable row level security;

drop policy if exists "members read rooms" on public.rooms;
create policy "members read rooms" on public.rooms for select to authenticated
  using (public.is_room_member(id));

drop policy if exists "members read memberships" on public.room_members;
create policy "members read memberships" on public.room_members for select to authenticated
  using (public.is_room_member(room_id));

drop policy if exists "members read players" on public.players;
create policy "members read players" on public.players for select to authenticated
  using (public.is_room_member(room_id));
drop policy if exists "members add players" on public.players;
create policy "members add players" on public.players for insert to authenticated
  with check (public.is_room_member(room_id));
drop policy if exists "members edit players" on public.players;
create policy "members edit players" on public.players for update to authenticated
  using (public.is_room_member(room_id)) with check (public.is_room_member(room_id));
drop policy if exists "members delete players" on public.players;
create policy "members delete players" on public.players for delete to authenticated
  using (public.is_room_member(room_id));

drop policy if exists "members read matches" on public.matches;
create policy "members read matches" on public.matches for select to authenticated
  using (public.is_room_member(room_id));
drop policy if exists "members add matches" on public.matches;
create policy "members add matches" on public.matches for insert to authenticated
  with check (public.is_room_member(room_id));
drop policy if exists "members edit matches" on public.matches;
create policy "members edit matches" on public.matches for update to authenticated
  using (public.is_room_member(room_id)) with check (public.is_room_member(room_id));
drop policy if exists "members delete matches" on public.matches;
create policy "members delete matches" on public.matches for delete to authenticated
  using (public.is_room_member(room_id));

drop policy if exists "members read scores" on public.scores;
create policy "members read scores" on public.scores for select to authenticated
  using (public.is_room_member(room_id));
drop policy if exists "members add valid scores" on public.scores;
create policy "members add valid scores" on public.scores for insert to authenticated
  with check (
    public.is_room_member(room_id)
    and exists (select 1 from public.matches where id = match_id and matches.room_id = scores.room_id)
    and exists (select 1 from public.players where id = player_id and players.room_id = scores.room_id)
  );
drop policy if exists "members edit scores" on public.scores;
create policy "members edit scores" on public.scores for update to authenticated
  using (public.is_room_member(room_id)) with check (public.is_room_member(room_id));
drop policy if exists "members delete scores" on public.scores;
create policy "members delete scores" on public.scores for delete to authenticated
  using (public.is_room_member(room_id));

grant select on public.rooms, public.room_members, public.players, public.matches, public.scores to authenticated;
grant insert, update, delete on public.players, public.matches, public.scores to authenticated;

-- Ativa eventos em tempo real sem falhar caso o script seja executado novamente.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'players') then
    alter publication supabase_realtime add table public.players;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'matches') then
    alter publication supabase_realtime add table public.matches;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'scores') then
    alter publication supabase_realtime add table public.scores;
  end if;
end $$;
