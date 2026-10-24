create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 24),
  portrait_id text not null default 'quetzacoatl'
    check (portrait_id in (
      'quetzacoatl', 'chiron', 'anubis', 'artemis', 'teles', 'death',
      'medusa', 'ares', 'midas', 'leonidas', 'kangus', 'salem'
    )),
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

create table if not exists public.ranked_ratings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rating double precision not null default 1500,
  deviation double precision not null default 350,
  volatility double precision not null default 0.06,
  games_played integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,
  updated_at timestamptz not null default now(),
  check (rating between 100 and 3000),
  check (deviation between 30 and 350),
  check (volatility > 0),
  check (games_played >= 0 and wins >= 0 and losses >= 0 and draws >= 0)
);

alter table public.profiles enable row level security;
alter table public.game_saves enable row level security;
alter table public.player_stats enable row level security;
alter table public.player_stats_public enable row level security;
alter table public.ranked_ratings enable row level security;

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

drop policy if exists "Users can read their ranked rating" on public.ranked_ratings;
create policy "Users can read their ranked rating"
  on public.ranked_ratings for select
  using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, portrait_id)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), 'Player'), 24),
    case
      when new.raw_user_meta_data ->> 'portrait_id' in (
        'quetzacoatl', 'chiron', 'anubis', 'artemis', 'teles', 'death',
        'medusa', 'ares', 'midas', 'leonidas', 'kangus', 'salem'
      ) then new.raw_user_meta_data ->> 'portrait_id'
      else 'quetzacoatl'
    end
  )
  on conflict (id) do nothing;
  insert into public.ranked_ratings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

insert into public.ranked_ratings (user_id)
select profile.id
from public.profiles profile
on conflict (user_id) do nothing;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Social identity, friendship, public achievements, and invitations.
alter table public.profiles add column if not exists public_id text;
alter table public.profiles add column if not exists portrait_id text;

update public.profiles
set portrait_id = 'quetzacoatl'
where portrait_id is null or portrait_id not in (
  'quetzacoatl', 'chiron', 'anubis', 'artemis', 'teles', 'death',
  'medusa', 'ares', 'midas', 'leonidas', 'kangus', 'salem'
);

alter table public.profiles alter column portrait_id set default 'quetzacoatl';
alter table public.profiles alter column portrait_id set not null;
alter table public.profiles drop constraint if exists profiles_portrait_id_check;
alter table public.profiles add constraint profiles_portrait_id_check
  check (portrait_id in (
    'quetzacoatl', 'chiron', 'anubis', 'artemis', 'teles', 'death',
    'medusa', 'ares', 'midas', 'leonidas', 'kangus', 'salem'
  ));

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

drop policy if exists "Users can read friend ranked ratings" on public.ranked_ratings;
create policy "Users can read friend ranked ratings"
  on public.ranked_ratings for select
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

drop function if exists public.search_profiles(text);
create function public.search_profiles(search_term text)
returns table(public_id text, display_name text, portrait_id text)
language sql
security definer
set search_path = public
stable
as $$
  select profile.public_id, profile.display_name, profile.portrait_id
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
      'portraitId', profile.portrait_id,
      'stats', stats.snapshot,
      'rankedRating', case
        when rating.user_id is null then null
        else jsonb_build_object(
          'rating', rating.rating,
          'deviation', rating.deviation,
          'volatility', rating.volatility,
          'gamesPlayed', rating.games_played,
          'wins', rating.wins,
          'losses', rating.losses,
          'draws', rating.draws
        )
      end,
      'completedAchievementIds', coalesce(achievements.completed_ids, '[]'::jsonb)
    ) as value
    from accepted_friends friend
    join public.profiles profile on profile.id = friend.friend_id
    left join public.player_stats_public stats on stats.user_id = friend.friend_id
    left join public.ranked_ratings rating on rating.user_id = friend.friend_id
    left join public.player_achievements_public achievements
      on achievements.user_id = friend.friend_id
    order by lower(profile.display_name), profile.public_id
  ),
  incoming_rows as (
    select jsonb_build_object(
      'publicId', profile.public_id,
      'displayName', profile.display_name,
      'portraitId', profile.portrait_id,
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
      'portraitId', profile.portrait_id,
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

-- Ranked classic 1v1 matchmaking and Glicko-2 ratings.
create table if not exists public.ranked_queue (
  user_id uuid primary key references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now()
);

create table if not exists public.ranked_matches (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'matched'
    check (status in ('matched', 'playing', 'completed', 'cancelled')),
  room_code text
    check (room_code is null or room_code ~ '^[A-Z2-9]{5}$'),
  winner_color text check (winner_color is null or winner_color in ('white', 'black')),
  -- Legacy 2v2 column retained so reapplying this schema is non-destructive.
  winner_team text check (winner_team is null or winner_team in ('team-a', 'team-b')),
  result_reason text
    check (result_reason is null or result_reason in ('game', 'disconnect', 'forfeit', 'draw')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create table if not exists public.ranked_match_players (
  match_id uuid not null references public.ranked_matches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  color text check (color is null or color in ('white', 'black')),
  -- Legacy 2v2 columns remain nullable after the one-time migration.
  seat text check (seat is null or seat in ('north', 'east', 'south', 'west')),
  team text check (team is null or team in ('team-a', 'team-b')),
  is_host boolean not null default false,
  join_token uuid not null default gen_random_uuid(),
  heartbeat_at timestamptz not null default now(),
  rating_before double precision not null,
  deviation_before double precision not null,
  volatility_before double precision not null,
  rating_after double precision,
  rating_change double precision,
  primary key (match_id, user_id),
  unique (match_id, seat)
);

alter table public.ranked_match_players
  add column if not exists join_token uuid not null default gen_random_uuid();

create table if not exists public.ranked_result_reports (
  match_id uuid not null references public.ranked_matches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  winner_color text check (winner_color is null or winner_color in ('white', 'black')),
  -- Legacy 2v2 column retained for idempotent migration.
  winner_team text check (winner_team is null or winner_team in ('team-a', 'team-b')),
  created_at timestamptz not null default now(),
  primary key (match_id, user_id)
);

do $$
declare
  legacy_ranked_2v2 boolean;
begin
  select not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ranked_match_players'
      and column_name = 'color'
  )
  into legacy_ranked_2v2;

  alter table public.ranked_matches
    add column if not exists winner_color text
      check (winner_color is null or winner_color in ('white', 'black'));
  alter table public.ranked_match_players
    add column if not exists color text
      check (color is null or color in ('white', 'black'));
  alter table public.ranked_result_reports
    add column if not exists winner_color text
      check (winner_color is null or winner_color in ('white', 'black'));
  alter table public.ranked_match_players
    alter column seat drop not null,
    alter column team drop not null;

  if legacy_ranked_2v2 then
    update public.ranked_matches
    set
      status = 'cancelled',
      completed_at = coalesce(completed_at, now())
    where status in ('matched', 'playing');
    delete from public.ranked_queue;
    update public.ranked_ratings
    set
      rating = 1500,
      deviation = 350,
      volatility = 0.06,
      games_played = 0,
      wins = 0,
      losses = 0,
      draws = 0,
      updated_at = now();
  end if;
end;
$$;

create index if not exists ranked_queue_order
  on public.ranked_queue(joined_at, heartbeat_at);
create index if not exists ranked_match_players_user
  on public.ranked_match_players(user_id, match_id);
create index if not exists ranked_match_players_heartbeat
  on public.ranked_match_players(match_id, heartbeat_at);
create unique index if not exists ranked_match_players_join_token
  on public.ranked_match_players(join_token);
create unique index if not exists ranked_match_players_color
  on public.ranked_match_players(match_id, color)
  where color is not null;
create index if not exists ranked_ratings_leaderboard
  on public.ranked_ratings(rating desc, deviation asc, games_played desc)
  where games_played > 0;

alter table public.ranked_queue enable row level security;
alter table public.ranked_matches enable row level security;
alter table public.ranked_match_players enable row level security;
alter table public.ranked_result_reports enable row level security;

create or replace function public.ranked_leaderboard()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with leaders as (
    select
      profile.public_id,
      profile.display_name,
      profile.portrait_id,
      rating.rating,
      rating.deviation,
      rating.volatility,
      rating.games_played,
      rating.wins,
      rating.losses,
      rating.draws
    from public.ranked_ratings rating
    join public.profiles profile on profile.id = rating.user_id
    where rating.games_played > 0
    order by
      rating.rating desc,
      rating.deviation asc,
      rating.games_played desc,
      lower(profile.display_name),
      profile.public_id
    limit 100
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'publicId', leader.public_id,
        'displayName', leader.display_name,
        'portraitId', leader.portrait_id,
        'rating', leader.rating,
        'deviation', leader.deviation,
        'volatility', leader.volatility,
        'gamesPlayed', leader.games_played,
        'wins', leader.wins,
        'losses', leader.losses,
        'draws', leader.draws
      )
      order by
        leader.rating desc,
        leader.deviation asc,
        leader.games_played desc,
        lower(leader.display_name),
        leader.public_id
    ),
    '[]'::jsonb
  )
  from leaders leader;
$$;

create or replace function public.glicko2_volatility_value(
  x double precision,
  delta_value double precision,
  phi_value double precision,
  variance_value double precision,
  a_value double precision,
  tau_value double precision
)
returns double precision
language sql
immutable
as $$
  select (
    exp(x) * (
      delta_value * delta_value -
      phi_value * phi_value -
      variance_value -
      exp(x)
    )
  ) / (
    2 * power(phi_value * phi_value + variance_value + exp(x), 2)
  ) - (x - a_value) / (tau_value * tau_value);
$$;

create or replace function public.glicko2_update(
  player_rating double precision,
  player_deviation double precision,
  player_volatility double precision,
  opponent_rating double precision,
  opponent_deviation double precision,
  score_value double precision
)
returns table(
  next_rating double precision,
  next_deviation double precision,
  next_volatility double precision
)
language plpgsql
immutable
as $$
declare
  scale_value constant double precision := 173.7178;
  tau_value constant double precision := 0.5;
  epsilon_value constant double precision := 0.000001;
  mu_value double precision;
  phi_value double precision;
  opponent_mu double precision;
  opponent_phi double precision;
  impact_value double precision;
  expectation_value double precision;
  variance_value double precision;
  delta_value double precision;
  a_value double precision;
  lower_value double precision;
  upper_value double precision;
  next_value double precision;
  lower_result double precision;
  upper_result double precision;
  next_result double precision;
  step_value integer := 1;
  pre_deviation double precision;
  final_phi double precision;
  final_mu double precision;
begin
  if score_value not in (0, 0.5, 1) then
    raise exception 'Invalid Glicko-2 score';
  end if;
  mu_value := (player_rating - 1500) / scale_value;
  phi_value := player_deviation / scale_value;
  opponent_mu := (opponent_rating - 1500) / scale_value;
  opponent_phi := opponent_deviation / scale_value;
  impact_value := 1 / sqrt(1 + 3 * opponent_phi * opponent_phi / power(pi(), 2));
  expectation_value := 1 / (
    1 + exp(-impact_value * (mu_value - opponent_mu))
  );
  variance_value := 1 / (
    impact_value * impact_value *
    expectation_value * (1 - expectation_value)
  );
  delta_value := variance_value * impact_value *
    (score_value - expectation_value);
  a_value := ln(player_volatility * player_volatility);
  lower_value := a_value;
  if delta_value * delta_value > phi_value * phi_value + variance_value then
    upper_value := ln(
      delta_value * delta_value - phi_value * phi_value - variance_value
    );
  else
    while public.glicko2_volatility_value(
      a_value - step_value * tau_value,
      delta_value,
      phi_value,
      variance_value,
      a_value,
      tau_value
    ) < 0 loop
      step_value := step_value + 1;
    end loop;
    upper_value := a_value - step_value * tau_value;
  end if;
  lower_result := public.glicko2_volatility_value(
    lower_value,
    delta_value,
    phi_value,
    variance_value,
    a_value,
    tau_value
  );
  upper_result := public.glicko2_volatility_value(
    upper_value,
    delta_value,
    phi_value,
    variance_value,
    a_value,
    tau_value
  );
  while abs(upper_value - lower_value) > epsilon_value loop
    next_value := lower_value +
      (lower_value - upper_value) * lower_result /
      (upper_result - lower_result);
    next_result := public.glicko2_volatility_value(
      next_value,
      delta_value,
      phi_value,
      variance_value,
      a_value,
      tau_value
    );
    if next_result * upper_result <= 0 then
      lower_value := upper_value;
      lower_result := upper_result;
    else
      lower_result := lower_result / 2;
    end if;
    upper_value := next_value;
    upper_result := next_result;
  end loop;
  next_volatility := exp(lower_value / 2);
  pre_deviation := sqrt(
    phi_value * phi_value + next_volatility * next_volatility
  );
  final_phi := 1 / sqrt(
    1 / (pre_deviation * pre_deviation) + 1 / variance_value
  );
  final_mu := mu_value + final_phi * final_phi * impact_value *
    (score_value - expectation_value);
  next_rating := greatest(100, least(3000, 1500 + scale_value * final_mu));
  next_deviation := greatest(30, least(350, scale_value * final_phi));
  return next;
end;
$$;

drop function if exists public.finalize_ranked_match(uuid, text, text);
create or replace function public.finalize_ranked_match(
  target_match_id uuid,
  winning_color text,
  finish_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  match_row public.ranked_matches%rowtype;
  player_row public.ranked_match_players%rowtype;
  opponent_rating double precision;
  opponent_deviation double precision;
  score_value double precision;
  updated_rating double precision;
  updated_deviation double precision;
  updated_volatility double precision;
  winner_color_value text := winning_color;
begin
  if winner_color_value is not null and winner_color_value not in ('white', 'black') then
    raise exception 'Invalid ranked winner';
  end if;
  if finish_reason not in ('game', 'disconnect', 'forfeit', 'draw') then
    raise exception 'Invalid ranked result reason';
  end if;
  select match.*
  into match_row
  from public.ranked_matches match
  where match.id = target_match_id
  for update;
  if not found or match_row.status in ('completed', 'cancelled') then
    return;
  end if;

  for player_row in
    select player.*
    from public.ranked_match_players player
    where player.match_id = target_match_id
    order by player.color
  loop
    select
      opponent.rating_before,
      opponent.deviation_before
    into opponent_rating, opponent_deviation
    from public.ranked_match_players opponent
    where opponent.match_id = target_match_id
      and opponent.color <> player_row.color;

    score_value := case
      when winner_color_value is null then 0.5
      when player_row.color = winner_color_value then 1
      else 0
    end;
    select
      result.next_rating,
      result.next_deviation,
      result.next_volatility
    into
      updated_rating,
      updated_deviation,
      updated_volatility
    from public.glicko2_update(
      player_row.rating_before,
      player_row.deviation_before,
      player_row.volatility_before,
      opponent_rating,
      opponent_deviation,
      score_value
    ) result;

    update public.ranked_ratings rating
    set
      rating = updated_rating,
      deviation = updated_deviation,
      volatility = updated_volatility,
      games_played = rating.games_played + 1,
      wins = rating.wins + case when score_value = 1 then 1 else 0 end,
      losses = rating.losses + case when score_value = 0 then 1 else 0 end,
      draws = rating.draws + case when score_value = 0.5 then 1 else 0 end,
      updated_at = now()
    where rating.user_id = player_row.user_id;

    update public.ranked_match_players player
    set
      rating_after = updated_rating,
      rating_change = updated_rating - player_row.rating_before
    where player.match_id = target_match_id
      and player.user_id = player_row.user_id;
  end loop;

  update public.ranked_matches match
  set
    status = 'completed',
    winner_color = winner_color_value,
    result_reason = finish_reason,
    completed_at = now()
  where match.id = target_match_id;
end;
$$;

create or replace function public.try_create_ranked_match()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  queued_users uuid[];
  new_match_id uuid;
  queued_user uuid;
  color_names text[];
  player_index integer;
  rating_row public.ranked_ratings%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('god-chess-ranked-1v1'));
  delete from public.ranked_queue queue
  where queue.heartbeat_at < now() - interval '45 seconds';

  select array_agg(candidate.user_id order by candidate.joined_at)
  into queued_users
  from (
    select queue.user_id, queue.joined_at
    from public.ranked_queue queue
    where not exists (
      select 1
      from public.ranked_match_players player
      join public.ranked_matches match on match.id = player.match_id
      where player.user_id = queue.user_id
        and match.status in ('matched', 'playing')
    )
    order by queue.joined_at
    limit 2
  ) candidate;

  if coalesce(array_length(queued_users, 1), 0) < 2 then
    return null;
  end if;

  insert into public.ranked_matches default values
  returning id into new_match_id;

  color_names := case
    when random() < 0.5 then array['white', 'black']
    else array['black', 'white']
  end;

  for player_index in 1..2 loop
    queued_user := queued_users[player_index];
    insert into public.ranked_ratings (user_id)
    values (queued_user)
    on conflict (user_id) do nothing;
    select rating.*
    into rating_row
    from public.ranked_ratings rating
    where rating.user_id = queued_user
    for update;
    insert into public.ranked_match_players(
      match_id,
      user_id,
      color,
      is_host,
      rating_before,
      deviation_before,
      volatility_before
    )
    values (
      new_match_id,
      queued_user,
      color_names[player_index],
      player_index = 1,
      rating_row.rating,
      rating_row.deviation,
      rating_row.volatility
    );
  end loop;

  delete from public.ranked_queue queue
  where queue.user_id = any(queued_users);
  return new_match_id;
end;
$$;

create or replace function public.ranked_payload(
  target_user_id uuid,
  target_match_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  selected_match_id uuid := target_match_id;
  selected_match public.ranked_matches%rowtype;
  local_player public.ranked_match_players%rowtype;
  rating_row public.ranked_ratings%rowtype;
  phase_value text;
  participants_value jsonb;
begin
  select rating.*
  into rating_row
  from public.ranked_ratings rating
  where rating.user_id = target_user_id;

  if selected_match_id is null then
    select player.match_id
    into selected_match_id
    from public.ranked_match_players player
    join public.ranked_matches match on match.id = player.match_id
    where player.user_id = target_user_id
      and match.status in ('matched', 'playing')
    order by match.created_at desc
    limit 1;
  end if;

  if selected_match_id is null then
    return jsonb_build_object(
      'phase', case
        when exists (
          select 1 from public.ranked_queue queue
          where queue.user_id = target_user_id
        ) then 'queued'
        else 'idle'
      end,
      'rating', jsonb_build_object(
        'rating', rating_row.rating,
        'deviation', rating_row.deviation,
        'volatility', rating_row.volatility,
        'gamesPlayed', rating_row.games_played,
        'wins', rating_row.wins,
        'losses', rating_row.losses,
        'draws', rating_row.draws
      )
    );
  end if;

  select match.*
  into selected_match
  from public.ranked_matches match
  where match.id = selected_match_id;
  select player.*
  into local_player
  from public.ranked_match_players player
  where player.match_id = selected_match_id
    and player.user_id = target_user_id;
  if not found then
    raise exception 'Ranked match not found';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'publicId', profile.public_id,
      'displayName', profile.display_name,
      'portraitId', profile.portrait_id,
      'color', player.color,
      'host', player.is_host,
      'connected', player.heartbeat_at >= now() - interval '2 minutes',
      'rating', player.rating_before
    )
    order by case player.color
      when 'white' then 1
      else 2
    end
  ), '[]'::jsonb)
  into participants_value
  from public.ranked_match_players player
  join public.profiles profile on profile.id = player.user_id
  where player.match_id = selected_match_id;

  phase_value := selected_match.status;
  return jsonb_build_object(
    'phase', phase_value,
    'rating', jsonb_build_object(
      'rating', rating_row.rating,
      'deviation', rating_row.deviation,
      'volatility', rating_row.volatility,
      'gamesPlayed', rating_row.games_played,
      'wins', rating_row.wins,
      'losses', rating_row.losses,
      'draws', rating_row.draws
    ),
    'match', jsonb_build_object(
      'id', selected_match.id,
      'roomCode', selected_match.room_code,
      'joinToken', local_player.join_token,
      'colorTokens', case
        when local_player.is_host then (
          select jsonb_object_agg(player.color, player.join_token::text)
          from public.ranked_match_players player
          where player.match_id = selected_match.id
        )
        else null
      end,
      'color', local_player.color,
      'host', local_player.is_host,
      'participants', participants_value,
      'winnerColor', selected_match.winner_color,
      'resultReason', selected_match.result_reason,
      'ratingChange', local_player.rating_change
    )
  );
end;
$$;

create or replace function public.ranked_status(
  target_match_id uuid default null,
  touch_match boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  selected_match_id uuid := target_match_id;
  stale_colors text[];
  stale_color text;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if selected_match_id is null then
    select player.match_id
    into selected_match_id
    from public.ranked_match_players player
    join public.ranked_matches match on match.id = player.match_id
    where player.user_id = current_user_id
      and match.status in ('matched', 'playing')
    order by match.created_at desc
    limit 1;
  end if;
  if selected_match_id is not null and not exists (
    select 1
    from public.ranked_match_players player
    where player.match_id = selected_match_id
      and player.user_id = current_user_id
  ) then
    raise exception 'Ranked match not found';
  end if;
  if selected_match_id is not null then
    perform 1
    from public.ranked_matches match
    where match.id = selected_match_id
    for update;
  end if;

  insert into public.ranked_ratings (user_id)
  values (current_user_id)
  on conflict (user_id) do nothing;
  update public.ranked_queue queue
  set heartbeat_at = now()
  where queue.user_id = current_user_id;

  if selected_match_id is not null and touch_match then
    update public.ranked_match_players player
    set heartbeat_at = now()
    where player.match_id = selected_match_id
      and player.user_id = current_user_id;
  end if;

  update public.ranked_matches match
  set
    status = 'cancelled',
    result_reason = null,
    completed_at = now()
  where match.id = selected_match_id
    and match.status = 'matched'
    and match.room_code is null
    and match.created_at < now() - interval '2 minutes';

  if exists (
    select 1
    from public.ranked_matches match
    where match.id = selected_match_id
      and match.status in ('matched', 'playing')
  ) then
    select array_agg(distinct player.color)
    into stale_colors
    from public.ranked_match_players player
    where player.match_id = selected_match_id
      and player.heartbeat_at < now() - interval '2 minutes';
    if coalesce(array_length(stale_colors, 1), 0) = 1 then
      stale_color := stale_colors[1];
      perform public.finalize_ranked_match(
        selected_match_id,
        case when stale_color = 'white' then 'black' else 'white' end,
        'disconnect'
      );
    elsif coalesce(array_length(stale_colors, 1), 0) > 1 then
      update public.ranked_matches match
      set
        status = 'cancelled',
        result_reason = null,
        completed_at = now()
      where match.id = selected_match_id
        and match.status in ('matched', 'playing');
    end if;
  end if;
  if selected_match_id is null and exists (
    select 1
    from public.ranked_queue queue
    where queue.user_id = current_user_id
  ) then
    perform public.try_create_ranked_match();
  end if;
  return public.ranked_payload(current_user_id, selected_match_id);
end;
$$;

create or replace function public.join_ranked_queue()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  active_match_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  perform pg_advisory_xact_lock(hashtext('god-chess-ranked-1v1'));
  select player.match_id
  into active_match_id
  from public.ranked_match_players player
  join public.ranked_matches match on match.id = player.match_id
  where player.user_id = current_user_id
    and match.status in ('matched', 'playing')
  limit 1;
  if active_match_id is not null then
    return public.ranked_status(active_match_id, true);
  end if;
  insert into public.ranked_ratings (user_id)
  values (current_user_id)
  on conflict (user_id) do nothing;
  insert into public.ranked_queue(user_id, joined_at, heartbeat_at)
  values (current_user_id, now(), now())
  on conflict (user_id) do update
    set heartbeat_at = now();
  active_match_id := public.try_create_ranked_match();
  if active_match_id is null then
    select player.match_id
    into active_match_id
    from public.ranked_match_players player
    join public.ranked_matches match on match.id = player.match_id
    where player.user_id = current_user_id
      and match.status in ('matched', 'playing')
    limit 1;
  end if;
  return public.ranked_payload(current_user_id, active_match_id);
end;
$$;

create or replace function public.leave_ranked_queue()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  perform pg_advisory_xact_lock(hashtext('god-chess-ranked-1v1'));
  delete from public.ranked_queue queue
  where queue.user_id = auth.uid();
  return public.ranked_payload(auth.uid(), null);
end;
$$;

create or replace function public.publish_ranked_room(
  target_match_id uuid,
  ranked_room_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if ranked_room_code !~ '^[A-Z2-9]{5}$' then
    raise exception 'Invalid ranked room code';
  end if;
  update public.ranked_matches match
  set
    room_code = ranked_room_code,
    status = 'playing',
    started_at = coalesce(match.started_at, now())
  where match.id = target_match_id
    and (
      match.status = 'matched' or (
        match.status = 'playing' and
        match.room_code = ranked_room_code
      )
    )
    and exists (
      select 1
      from public.ranked_match_players player
      where player.match_id = match.id
        and player.user_id = auth.uid()
        and player.is_host
    );
  if not found then
    raise exception 'Unable to publish this ranked room';
  end if;
  return public.ranked_status(target_match_id, true);
end;
$$;

drop function if exists public.report_ranked_result(uuid, text);
create or replace function public.report_ranked_result(
  target_match_id uuid,
  winning_color text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  agreed_result text;
  match_status text;
begin
  if winning_color is not null and winning_color not in ('white', 'black') then
    raise exception 'Invalid ranked winner';
  end if;
  select match.status
  into match_status
  from public.ranked_matches match
  where match.id = target_match_id
  for update;
  if match_status is distinct from 'playing' or not exists (
    select 1
    from public.ranked_match_players player
    where player.match_id = target_match_id
      and player.user_id = auth.uid()
  ) then
    return public.ranked_status(target_match_id, true);
  end if;
  insert into public.ranked_result_reports(match_id, user_id, winner_color)
  values (target_match_id, auth.uid(), winning_color)
  on conflict (match_id, user_id) do update
    set winner_color = excluded.winner_color, created_at = now();

  select coalesce(report.winner_color, 'draw')
  into agreed_result
  from public.ranked_result_reports report
  join public.ranked_match_players player
    on player.match_id = report.match_id
    and player.user_id = report.user_id
  where report.match_id = target_match_id
  group by coalesce(report.winner_color, 'draw')
  having count(*) = 2
  order by count(*) desc
  limit 1;
  if agreed_result is not null then
    perform public.finalize_ranked_match(
      target_match_id,
      case when agreed_result = 'draw' then null else agreed_result end,
      case when agreed_result = 'draw' then 'draw' else 'game' end
    );
  end if;
  return public.ranked_status(target_match_id, true);
end;
$$;

create or replace function public.forfeit_ranked_match(
  target_match_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  forfeiting_color text;
  match_status text;
begin
  select match.status
  into match_status
  from public.ranked_matches match
  where match.id = target_match_id
  for update;
  if match_status is null or match_status not in ('matched', 'playing') then
    return public.ranked_payload(auth.uid(), target_match_id);
  end if;
  select player.color
  into forfeiting_color
  from public.ranked_match_players player
  where player.match_id = target_match_id
    and player.user_id = auth.uid()
    and not exists (
      select 1
      from public.ranked_result_reports report
      where report.match_id = target_match_id
        and report.user_id = auth.uid()
    );
  if forfeiting_color is not null then
    perform public.finalize_ranked_match(
      target_match_id,
      case when forfeiting_color = 'white' then 'black' else 'white' end,
      'forfeit'
    );
  end if;
  return public.ranked_payload(auth.uid(), target_match_id);
end;
$$;

revoke all on function public.glicko2_volatility_value(
  double precision,
  double precision,
  double precision,
  double precision,
  double precision,
  double precision
) from public;
revoke all on function public.glicko2_update(
  double precision,
  double precision,
  double precision,
  double precision,
  double precision,
  double precision
) from public;
revoke all on function public.finalize_ranked_match(uuid, text, text) from public;
revoke all on function public.try_create_ranked_match() from public;
revoke all on function public.ranked_payload(uuid, uuid) from public;
revoke all on function public.ranked_status(uuid, boolean) from public;
revoke all on function public.join_ranked_queue() from public;
revoke all on function public.leave_ranked_queue() from public;
revoke all on function public.publish_ranked_room(uuid, text) from public;
revoke all on function public.report_ranked_result(uuid, text) from public;
revoke all on function public.forfeit_ranked_match(uuid) from public;
revoke all on function public.ranked_leaderboard() from public;

grant execute on function public.ranked_status(uuid, boolean) to authenticated;
grant execute on function public.join_ranked_queue() to authenticated;
grant execute on function public.leave_ranked_queue() to authenticated;
grant execute on function public.publish_ranked_room(uuid, text) to authenticated;
grant execute on function public.report_ranked_result(uuid, text) to authenticated;
grant execute on function public.forfeit_ranked_match(uuid) to authenticated;
grant execute on function public.ranked_leaderboard() to anon, authenticated;
