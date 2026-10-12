-- Catálogo
create table public.series (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  synopsis text not null default '',
  genre text not null default '',
  poster_url text,
  is_featured boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.episodes (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series(id) on delete cascade,
  number int not null,
  title text not null default '',
  duration_seconds int not null default 90,
  unique (series_id, number)
);

-- URL del video separada: solo el servidor la lee (service role),
-- después de comprobar si el episodio es gratis o el usuario tiene Acceso Total.
create table public.episode_videos (
  episode_id uuid primary key references public.episodes(id) on delete cascade,
  video_url text not null
);

-- Suscripciones (las escribe el webhook de Stripe)
create table public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  price_id text,
  status text not null default 'inactive',
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.series enable row level security;
alter table public.episodes enable row level security;
alter table public.episode_videos enable row level security;
alter table public.subscriptions enable row level security;

create policy "catálogo público" on public.series for select using (true);
create policy "episodios públicos" on public.episodes for select using (true);
create policy "cada quien ve su suscripción" on public.subscriptions
  for select using (auth.uid() = user_id);
-- episode_videos: sin políticas, nadie la lee desde el navegador.
