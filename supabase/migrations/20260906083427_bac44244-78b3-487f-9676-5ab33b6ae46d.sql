alter table public.visits
  add column if not exists city text,
  add column if not exists region text,
  add column if not exists org text,
  add column if not exists device text,
  add column if not exists browser text,
  add column if not exists os text,
  add column if not exists language text,
  add column if not exists is_refresh boolean not null default false,
  add column if not exists screen text,
  add column if not exists timezone text;

alter table public.downloads
  add column if not exists country text,
  add column if not exists city text,
  add column if not exists device text;

create table if not exists public.geo_cache (
  ip text primary key,
  country text,
  country_code text,
  region text,
  city text,
  org text,
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now()
);
grant all on public.geo_cache to service_role;
alter table public.geo_cache enable row level security;

create table if not exists public.visit_pings (
  id uuid primary key default gen_random_uuid(),
  ip text not null,
  path text not null,
  telegram_message_id bigint,
  revisit_count integer not null default 0,
  base_text text not null default '',
  last_sent_at timestamptz not null default now(),
  unique (ip, path)
);
grant all on public.visit_pings to service_role;
alter table public.visit_pings enable row level security;

create index if not exists idx_visits_country on public.visits (country);
create index if not exists idx_visits_created_at on public.visits (created_at desc);