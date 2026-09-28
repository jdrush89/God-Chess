create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 24),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.game_saves (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  saved_at timestamptz not null default now(),
  game jsonb not null,
  primary key (user_id, id)
);

alter table public.profiles enable row level security;
alter table public.game_saves enable row level security;

drop policy if exists "Users can read their profile" on public.profiles;
create policy "Users can read their profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can update their profile" on public.profiles;
create policy "Users can update their profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Users can insert their profile" on public.profiles;
create policy "Users can insert their profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users can read their saves" on public.game_saves;
create policy "Users can read their saves"
  on public.game_saves for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their saves" on public.game_saves;
create policy "Users can create their saves"
  on public.game_saves for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their saves" on public.game_saves;
create policy "Users can update their saves"
  on public.game_saves for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their saves" on public.game_saves;
create policy "Users can delete their saves"
  on public.game_saves for delete
  using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), 'Player'), 24)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
