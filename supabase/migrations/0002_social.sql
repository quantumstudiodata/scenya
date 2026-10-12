-- Reseñas, comentarios y me gusta. Se escriben desde el servidor (API routes);
-- el navegador solo puede leerlos.
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  rating int not null check (rating between 1 and 5),
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  unique (series_id, user_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.episodes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);
create index comments_episode_idx on public.comments (episode_id, created_at desc);

create table public.episode_likes (
  episode_id uuid not null references public.episodes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (episode_id, user_id)
);

alter table public.reviews enable row level security;
alter table public.comments enable row level security;
alter table public.episode_likes enable row level security;

create policy "reseñas públicas" on public.reviews for select using (true);
create policy "comentarios públicos" on public.comments for select using (true);
create policy "likes públicos" on public.episode_likes for select using (true);
