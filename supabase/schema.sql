-- ============================================================
--  ChefChefChef — schéma de base de données (Supabase / Postgres)
--  À coller tel quel dans l'éditeur SQL de Supabase, puis « Run ».
--  Idempotent : peut être relancé sans casser les données.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Recettes ----------
create table if not exists public.recipes (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  servings      integer,
  prep_min      integer,
  cook_min      integer,
  tags          text[] not null default '{}',
  ingredients   jsonb not null default '[]',   -- [{qty, unit, name, note}]
  steps         jsonb not null default '[]',   -- ["étape 1", ...]
  notes         text,
  source_url    text,
  source_text   text,                          -- texte d'origine (import / collage)
  photo_url     text,
  ambiguous     boolean not null default false,
  created_by    text,                          -- 'chef' | 'cheffe'
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.recipe_logs (
  id          uuid primary key default gen_random_uuid(),
  recipe_id   uuid not null references public.recipes(id) on delete cascade,
  cooked_on   date not null default current_date,
  cooked_by   text,
  rating      integer check (rating between 1 and 5),
  comment     text,
  created_at  timestamptz not null default now()
);

-- ---------- Techniques ----------
create table if not exists public.techniques (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  steps         jsonb not null default '[]',
  pitfalls      jsonb not null default '[]',
  tags          text[] not null default '{}',
  photo_url     text,
  is_example    boolean not null default false,
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------- Boissons (vins, spiritueux, cocktails & shots) ----------
create table if not exists public.drinks (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('wine','spirit','cocktail')),
  name          text not null,
  type          text,          -- rouge / blanc / gin / rhum / ...
  region        text,
  vintage       integer,
  notes         text,
  stock         integer not null default 0,
  peak_from     integer,       -- apogée : année de début
  peak_to       integer,       -- apogée : année de fin
  drink_before  date,          -- « à boire avant »
  is_shot       boolean not null default false,
  ingredients   jsonb not null default '[]',   -- cocktails : [{qty, unit, name}]
  method        text,                          -- cocktails : technique
  photo_url     text,
  is_example    boolean not null default false,
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Bouteilles du « bar » (pour le mode « mon bar » des cocktails)
create table if not exists public.bar_items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  text,
  created_at  timestamptz not null default now()
);

-- ---------- Frigo, garde-manger, planning, courses ----------
create table if not exists public.fridge_items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  text,
  created_at  timestamptz not null default now()
);

create table if not exists public.pantry_items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.plan_entries (
  id          uuid primary key default gen_random_uuid(),
  day         date not null,
  slot        text not null default 'soir' check (slot in ('midi','soir')),
  recipe_id   uuid not null references public.recipes(id) on delete cascade,
  servings    integer,
  created_by  text,
  created_at  timestamptz not null default now()
);

create table if not exists public.shopping_items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  qty         numeric,
  unit        text,
  aisle       text not null default 'autre',
  checked     boolean not null default false,
  checked_by  text,
  manual      boolean not null default false,
  recipe_ids  uuid[] not null default '{}',
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- updated_at automatique ----------
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['recipes','techniques','drinks','shopping_items'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------- Sécurité (RLS) ----------
-- Toutes les tables : lecture/écriture réservées aux utilisateurs connectés
-- (le compte technique partagé, voir DEPLOY.md). Rien pour les anonymes.
do $$
declare t text;
begin
  foreach t in array array['recipes','recipe_logs','techniques','drinks','bar_items',
                           'fridge_items','pantry_items','plan_entries','shopping_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "authenticated full access" on public.%I', t);
    execute format('create policy "authenticated full access" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ---------- Temps réel ----------
do $$
declare t text;
begin
  foreach t in array array['recipes','recipe_logs','techniques','drinks','bar_items',
                           'fridge_items','pantry_items','plan_entries','shopping_items'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
    -- les suppressions doivent transmettre la ligne entière
    execute format('alter table public.%I replica identity full', t);
  end loop;
end $$;

-- ---------- Photos (Storage) ----------
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

drop policy if exists "photos public read" on storage.objects;
create policy "photos public read" on storage.objects
  for select using (bucket_id = 'photos');

drop policy if exists "photos authenticated write" on storage.objects;
create policy "photos authenticated write" on storage.objects
  for insert to authenticated with check (bucket_id = 'photos');

drop policy if exists "photos authenticated update" on storage.objects;
create policy "photos authenticated update" on storage.objects
  for update to authenticated using (bucket_id = 'photos');

drop policy if exists "photos authenticated delete" on storage.objects;
create policy "photos authenticated delete" on storage.objects
  for delete to authenticated using (bucket_id = 'photos');
