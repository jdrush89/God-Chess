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

create table if not exists public.player_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now(),
  progress jsonb not null
);

create table if not exists public.player_stats_public (
  user_id uuid primary key references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now(),
  snapshot jsonb not null
);

alter table public.profiles enable row level security;
alter table public.game_saves enable row level security;
alter table public.player_stats enable row level security;
alter table public.player_stats_public enable row level security;

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

drop policy if exists "Users can read their private stats" on public.player_stats;
create policy "Users can read their private stats"
  on public.player_stats for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their private stats" on public.player_stats;
create policy "Users can create their private stats"
  on public.player_stats for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their private stats" on public.player_stats;
create policy "Users can update their private stats"
  on public.player_stats for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their private stats" on public.player_stats;
create policy "Users can delete their private stats"
  on public.player_stats for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can read their public stats" on public.player_stats_public;
create policy "Users can read their public stats"
  on public.player_stats_public for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their public stats" on public.player_stats_public;
create policy "Users can create their public stats"
  on public.player_stats_public for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their public stats" on public.player_stats_public;
create policy "Users can update their public stats"
  on public.player_stats_public for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their public stats" on public.player_stats_public;
create policy "Users can delete their public stats"
  on public.player_stats_public for delete
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

-- Social identity, friendship, public achievements, and invitations.
alter table public.profiles add column if not exists public_id text;

create or replace function public.normalize_public_id(value text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(btrim(coalesce(value, '')), '[^a-z0-9-]', '', 'g'));
$$;

create or replace function public.generate_public_id()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  candidate text;
begin
  loop
    candidate := 'gc-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
    exit when not exists (
      select 1 from public.profiles where public_id = candidate
    );
  end loop;
  return candidate;
end;
$$;

create or replace function public.set_profile_public_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.public_id is distinct from old.public_id then
    new.public_id := old.public_id;
  end if;
  new.public_id := public.normalize_public_id(new.public_id);
  if new.public_id = '' then
    new.public_id := public.generate_public_id();
  end if;
  if new.public_id !~ '^gc-[a-z0-9]{8}$' then
    raise exception 'Invalid public account ID';
  end if;
  return new;
end;
$$;

update public.profiles
set public_id = public.generate_public_id()
where public_id is null or btrim(public_id) = '';

alter table public.profiles alter column public_id set not null;
create unique index if not exists profiles_public_id_key
  on public.profiles(public_id);

drop trigger if exists profiles_public_id on public.profiles;
create trigger profiles_public_id
  before insert or update of public_id on public.profiles
  for each row execute procedure public.set_profile_public_id();

create table if not exists public.friend_requests (
  requester_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (requester_id, recipient_id),
  check (requester_id <> recipient_id)
);

create unique index if not exists friend_requests_unique_pair
  on public.friend_requests (
    least(requester_id, recipient_id),
    greatest(requester_id, recipient_id)
  );
create index if not exists friend_requests_recipient_status
  on public.friend_requests(recipient_id, status, updated_at desc);
create index if not exists friend_requests_requester_status
  on public.friend_requests(requester_id, status, updated_at desc);

create table if not exists public.player_achievements_public (
  user_id uuid primary key references auth.users(id) on delete cascade,
  completed_ids jsonb not null default '[]'::jsonb
    check (jsonb_typeof(completed_ids) = 'array'),
  updated_at timestamptz not null default now()
);

create table if not exists public.game_invitations (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  variant text not null
    check (variant in ('classic', 'three-player', 'four-player')),
  player_count integer not null check (player_count in (2, 3, 4)),
  room_code text not null check (room_code ~ '^[A-Z2-9]{5}$'),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'dismissed', 'expired')),
  expires_at timestamptz not null default (now() + interval '2 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sender_id <> recipient_id),
  check (
    (variant = 'classic' and player_count = 2) or
    (variant = 'three-player' and player_count = 3) or
    (variant = 'four-player' and player_count = 4)
  )
);

create index if not exists game_invitations_recipient_status
  on public.game_invitations(recipient_id, status, expires_at, created_at desc);
create index if not exists game_invitations_sender_status
  on public.game_invitations(sender_id, status, expires_at, created_at desc);
create unique index if not exists game_invitations_pending_room
  on public.game_invitations(sender_id, recipient_id, variant, room_code)
  where status = 'pending';

alter table public.friend_requests enable row level security;
alter table public.player_achievements_public enable row level security;
alter table public.game_invitations enable row level security;

create or replace function public.are_friends(first_user uuid, second_user uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select first_user is not null
    and second_user is not null
    and exists (
      select 1
      from public.friend_requests request
      where request.status = 'accepted'
        and (
          (request.requester_id = first_user and request.recipient_id = second_user) or
          (request.requester_id = second_user and request.recipient_id = first_user)
        )
    );
$$;

drop policy if exists "Users can read involved friend requests" on public.friend_requests;
create policy "Users can read involved friend requests"
  on public.friend_requests for select
  using (auth.uid() = requester_id or auth.uid() = recipient_id);

drop policy if exists "Users can read friend public stats" on public.player_stats_public;
create policy "Users can read friend public stats"
  on public.player_stats_public for select
  using (
    auth.uid() = user_id or
    public.are_friends(auth.uid(), user_id)
  );

drop policy if exists "Users can read friend public achievements" on public.player_achievements_public;
create policy "Users can read friend public achievements"
  on public.player_achievements_public for select
  using (
    auth.uid() = user_id or
    public.are_friends(auth.uid(), user_id)
  );

drop policy if exists "Users can create their public achievements" on public.player_achievements_public;
create policy "Users can create their public achievements"
  on public.player_achievements_public for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their public achievements" on public.player_achievements_public;
create policy "Users can update their public achievements"
  on public.player_achievements_public for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their public achievements" on public.player_achievements_public;
create policy "Users can delete their public achievements"
  on public.player_achievements_public for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can read involved invitations" on public.game_invitations;
create policy "Users can read involved invitations"
  on public.game_invitations for select
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

create or replace function public.search_profiles(search_term text)
returns table(public_id text, display_name text)
language sql
security definer
set search_path = public
stable
as $$
  select profile.public_id, profile.display_name
  from public.profiles profile
  where auth.uid() is not null
    and profile.id <> auth.uid()
    and btrim(coalesce(search_term, '')) <> ''
    and (
      profile.public_id = public.normalize_public_id(search_term) or
      profile.display_name ilike '%' || btrim(search_term) || '%'
    )
  order by
    (profile.public_id = public.normalize_public_id(search_term)) desc,
    lower(profile.display_name),
    profile.public_id
  limit 20;
$$;

create or replace function public.send_friend_request(target_public_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_user uuid;
  existing_request public.friend_requests%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  select id into target_user
  from public.profiles
  where public_id = public.normalize_public_id(target_public_id);
  if target_user is null then
    raise exception 'Player not found';
  end if;
  if target_user = current_user_id then
    raise exception 'You cannot add yourself';
  end if;

  select * into existing_request
  from public.friend_requests
  where (requester_id = current_user_id and recipient_id = target_user)
     or (requester_id = target_user and recipient_id = current_user_id)
  for update;

  if found and existing_request.status = 'accepted' then
    raise exception 'You are already friends';
  end if;
  if found and existing_request.status = 'pending' then
    raise exception 'A friend request is already pending';
  end if;
  if found then
    delete from public.friend_requests
    where requester_id = existing_request.requester_id
      and recipient_id = existing_request.recipient_id;
  end if;

  insert into public.friend_requests(requester_id, recipient_id)
  values (current_user_id, target_user);
end;
$$;

create or replace function public.accept_friend_request(target_public_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.friend_requests request
  set status = 'accepted', updated_at = now()
  from public.profiles profile
  where request.requester_id = profile.id
    and request.recipient_id = auth.uid()
    and request.status = 'pending'
    and profile.public_id = public.normalize_public_id(target_public_id);
  if not found then
    raise exception 'Pending friend request not found';
  end if;
end;
$$;

create or replace function public.decline_friend_request(target_public_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.friend_requests request
  set status = 'declined', updated_at = now()
  from public.profiles profile
  where request.requester_id = profile.id
    and request.recipient_id = auth.uid()
    and request.status = 'pending'
    and profile.public_id = public.normalize_public_id(target_public_id);
  if not found then
    raise exception 'Pending friend request not found';
  end if;
end;
$$;

create or replace function public.remove_friend(target_public_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user uuid;
begin
  select id into target_user
  from public.profiles
  where public_id = public.normalize_public_id(target_public_id);
  delete from public.friend_requests request
  where request.status = 'accepted'
    and (
      (request.requester_id = auth.uid() and request.recipient_id = target_user) or
      (request.recipient_id = auth.uid() and request.requester_id = target_user)
    );
  if not found then
    raise exception 'Friend not found';
  end if;
  update public.game_invitations invitation
  set status = 'dismissed', updated_at = now()
  where invitation.status = 'pending'
    and (
      (invitation.sender_id = auth.uid() and invitation.recipient_id = target_user) or
      (invitation.recipient_id = auth.uid() and invitation.sender_id = target_user)
    );
end;
$$;

create or replace function public.send_game_invite(
  target_public_id text,
  invite_variant text,
  invite_player_count integer,
  invite_room_code text,
  invite_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_user uuid;
  normalized_code text := upper(btrim(invite_room_code));
  normalized_expiry timestamptz := coalesce(
    invite_expires_at,
    now() + interval '2 hours'
  );
  invitation_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  select id into target_user
  from public.profiles
  where public_id = public.normalize_public_id(target_public_id);
  if target_user is null or target_user = current_user_id then
    raise exception 'Invalid invitation recipient';
  end if;
  if not public.are_friends(current_user_id, target_user) then
    raise exception 'Only accepted friends can be invited';
  end if;
  if normalized_code !~ '^[A-Z2-9]{5}$' then
    raise exception 'Invalid room code';
  end if;
  if not (
    (invite_variant = 'classic' and invite_player_count = 2) or
    (invite_variant = 'three-player' and invite_player_count = 3) or
    (invite_variant = 'four-player' and invite_player_count = 4)
  ) then
    raise exception 'Invalid invitation mode';
  end if;
  if normalized_expiry <= now() or normalized_expiry > now() + interval '24 hours' then
    raise exception 'Invalid invitation expiry';
  end if;

  update public.game_invitations
  set status = 'expired', updated_at = now()
  where status = 'pending' and expires_at <= now();

  if exists (
    select 1 from public.game_invitations
    where sender_id = current_user_id
      and recipient_id = target_user
      and variant = invite_variant
      and room_code = normalized_code
      and status = 'pending'
      and expires_at > now()
  ) then
    raise exception 'That friend already has a pending invitation to this room';
  end if;

  insert into public.game_invitations(
    sender_id,
    recipient_id,
    variant,
    player_count,
    room_code,
    expires_at
  )
  values (
    current_user_id,
    target_user,
    invite_variant,
    invite_player_count,
    normalized_code,
    normalized_expiry
  )
  returning id into invitation_id;
  return invitation_id;
end;
$$;

create or replace function public.prepare_game_invite(invite_id uuid)
returns table(
  id uuid,
  sender_public_id text,
  sender_display_name text,
  variant text,
  player_count integer,
  room_code text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.game_invitations invitation
  set status = 'expired', updated_at = now()
  where invitation.id = invite_id
    and invitation.recipient_id = auth.uid()
    and invitation.status = 'pending'
    and invitation.expires_at <= now();

  return query
  select
    invitation.id,
    sender.public_id,
    sender.display_name,
    invitation.variant,
    invitation.player_count,
    invitation.room_code,
    invitation.expires_at
  from public.game_invitations invitation
  join public.profiles sender on sender.id = invitation.sender_id
  where invitation.id = invite_id
    and invitation.recipient_id = auth.uid()
    and invitation.status = 'pending'
    and invitation.expires_at > now()
    and public.are_friends(invitation.sender_id, invitation.recipient_id);
end;
$$;

create or replace function public.respond_game_invite(
  invite_id uuid,
  next_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if next_status not in ('accepted', 'declined', 'dismissed') then
    raise exception 'Invalid invitation response';
  end if;
  update public.game_invitations invitation
  set status = next_status, updated_at = now()
  where invitation.id = invite_id
    and invitation.recipient_id = auth.uid()
    and invitation.status = 'pending'
    and invitation.expires_at > now();
  if not found then
    raise exception 'Pending invitation not found';
  end if;
end;
$$;

create or replace function public.social_inbox()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with accepted_friends as (
    select
      case
        when request.requester_id = auth.uid() then request.recipient_id
        else request.requester_id
      end as friend_id
    from public.friend_requests request
    where request.status = 'accepted'
      and auth.uid() in (request.requester_id, request.recipient_id)
  ),
  friend_rows as (
    select jsonb_build_object(
      'publicId', profile.public_id,
      'displayName', profile.display_name,
      'stats', stats.snapshot,
      'completedAchievementIds', coalesce(achievements.completed_ids, '[]'::jsonb)
    ) as value
    from accepted_friends friend
    join public.profiles profile on profile.id = friend.friend_id
    left join public.player_stats_public stats on stats.user_id = friend.friend_id
    left join public.player_achievements_public achievements
      on achievements.user_id = friend.friend_id
    order by lower(profile.display_name), profile.public_id
  ),
  incoming_rows as (
    select jsonb_build_object(
      'publicId', profile.public_id,
      'displayName', profile.display_name,
      'status', request.status,
      'incoming', true
    ) as value
    from public.friend_requests request
    join public.profiles profile on profile.id = request.requester_id
    where request.recipient_id = auth.uid() and request.status = 'pending'
    order by request.created_at desc
  ),
  outgoing_rows as (
    select jsonb_build_object(
      'publicId', profile.public_id,
      'displayName', profile.display_name,
      'status', request.status,
      'incoming', false
    ) as value
    from public.friend_requests request
    join public.profiles profile on profile.id = request.recipient_id
    where request.requester_id = auth.uid() and request.status = 'pending'
    order by request.created_at desc
  ),
  invitation_rows as (
    select jsonb_build_object(
      'id', invitation.id,
      'senderPublicId', sender.public_id,
      'senderDisplayName', sender.display_name,
      'variant', invitation.variant,
      'playerCount', invitation.player_count,
      'roomCode', invitation.room_code,
      'status', invitation.status,
      'expiresAt', invitation.expires_at
    ) as value
    from public.game_invitations invitation
    join public.profiles sender on sender.id = invitation.sender_id
    where invitation.recipient_id = auth.uid()
      and invitation.status = 'pending'
      and invitation.expires_at > now()
      and public.are_friends(invitation.sender_id, invitation.recipient_id)
    order by invitation.created_at desc
  ),
  sent_invitation_rows as (
    select jsonb_build_object(
      'recipientPublicId', recipient.public_id,
      'variant', invitation.variant,
      'roomCode', invitation.room_code
    ) as value
    from public.game_invitations invitation
    join public.profiles recipient on recipient.id = invitation.recipient_id
    where invitation.sender_id = auth.uid()
      and invitation.status = 'pending'
      and invitation.expires_at > now()
  )
  select jsonb_build_object(
    'friends', coalesce((select jsonb_agg(value) from friend_rows), '[]'::jsonb),
    'incomingRequests', coalesce((select jsonb_agg(value) from incoming_rows), '[]'::jsonb),
    'outgoingRequests', coalesce((select jsonb_agg(value) from outgoing_rows), '[]'::jsonb),
    'invites', coalesce((select jsonb_agg(value) from invitation_rows), '[]'::jsonb),
    'sentInvites', coalesce((select jsonb_agg(value) from sent_invitation_rows), '[]'::jsonb)
  );
$$;

revoke all on function public.search_profiles(text) from public;
revoke all on function public.send_friend_request(text) from public;
revoke all on function public.accept_friend_request(text) from public;
revoke all on function public.decline_friend_request(text) from public;
revoke all on function public.remove_friend(text) from public;
revoke all on function public.send_game_invite(text, text, integer, text, timestamptz) from public;
revoke all on function public.prepare_game_invite(uuid) from public;
revoke all on function public.respond_game_invite(uuid, text) from public;
revoke all on function public.social_inbox() from public;
revoke all on function public.are_friends(uuid, uuid) from public;

grant execute on function public.search_profiles(text) to authenticated;
grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.accept_friend_request(text) to authenticated;
grant execute on function public.decline_friend_request(text) to authenticated;
grant execute on function public.remove_friend(text) to authenticated;
grant execute on function public.send_game_invite(text, text, integer, text, timestamptz) to authenticated;
grant execute on function public.prepare_game_invite(uuid) to authenticated;
grant execute on function public.respond_game_invite(uuid, text) to authenticated;
grant execute on function public.social_inbox() to authenticated;
grant execute on function public.are_friends(uuid, uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'friend_requests'
  ) then
    alter publication supabase_realtime add table public.friend_requests;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'game_invitations'
  ) then
    alter publication supabase_realtime add table public.game_invitations;
  end if;
end;
$$;
