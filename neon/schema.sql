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
  game_number integer check (game_number > 0),
  played_at date not null default current_date,
  created_at timestamptz not null default now()
);

-- Migração segura para bancos que já tinham a tabela matches.
alter table matches add column if not exists game_number integer check (game_number > 0);

create unique index if not exists matches_room_game_number_unique
  on matches (room_id, game_number) where game_number is not null;

create table if not exists scores (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  score integer not null check (score between 0 and 50000),
  created_at timestamptz not null default now(),
  unique (match_id, player_id)
);

create table if not exists round_details (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  round_number smallint not null check (round_number between 1 and 5),
  round_score integer not null check (round_score between 0 and 10000),
  year_error integer not null check (year_error >= 0),
  distance_km numeric(12, 3) not null check (distance_km >= 0),
  created_at timestamptz not null default now(),
  unique (match_id, player_id, round_number),
  foreign key (match_id, player_id) references scores(match_id, player_id) on delete cascade
);

create index if not exists players_room_idx on players(room_id);
create index if not exists matches_room_date_idx on matches(room_id, played_at desc);
create index if not exists scores_room_idx on scores(room_id);
create index if not exists scores_match_idx on scores(match_id);
create index if not exists round_details_room_idx on round_details(room_id);
create index if not exists round_details_player_idx on round_details(player_id);

comment on column rooms.access_token is
  'Token privado da sala. Nunca retornar em consultas públicas nem colocar no código do front-end.';
