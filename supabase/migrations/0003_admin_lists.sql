-- Episodios gratis por serie (antes era 10 para todas)
alter table public.series add column if not exists free_episodes int not null default 10;

-- Mi lista
create table if not exists public.my_list (
  user_id uuid not null references auth.users(id) on delete cascade,
  series_id uuid not null references public.series(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, series_id)
);
alter table public.my_list enable row level security;
create policy "cada quien ve su lista" on public.my_list for select using (auth.uid() = user_id);

-- Almacenamiento: portadas públicas y videos privados (se entregan con enlaces temporales)
insert into storage.buckets (id, name, public)
values ('posters', 'posters', true), ('videos', 'videos', false)
on conflict (id) do nothing;
