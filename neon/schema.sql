-- CronoRank + Neon PostgreSQL
-- Execute este arquivo uma vez no SQL Editor do seu projeto Neon.
create extension if not exists pgcrypto;

create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 40),
  invite_code text not null unique check (invite_code ~ '^[A-Z2-9]{6}$'),
  access_token text not null unique check (char_length(access_token) >= 40),
  created_at timestamptz not null default now()
);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 24),
  color text not null default '#ff7043' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now()
);

create unique index if not exists players_room_nickname_unique
  on players (room_id, lower(nickname));

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 50),
  played_at date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists scores (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  score integer not null check (score between 0 and 50000),
  created_at timestamptz not null default now(),
  unique (match_id, player_id)
);

create index if not exists players_room_idx on players(room_id);
create index if not exists matches_room_date_idx on matches(room_id, played_at desc);
create index if not exists scores_room_idx on scores(room_id);
create index if not exists scores_match_idx on scores(match_id);

comment on column rooms.access_token is
  'Token privado da sala. Nunca retornar em consultas públicas nem colocar no código do front-end.';
