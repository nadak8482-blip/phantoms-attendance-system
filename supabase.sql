-- TeamPulse Attendance System — run in Supabase SQL Editor.
-- After creating a user in Authentication, insert a matching profile row.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  team text,
  role text not null default 'member' check (role in ('admin','member')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 100),
  event_type text not null check (event_type in ('meeting','event')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  late_after_minutes integer not null default 10 check (late_after_minutes between 0 and 180),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  status text not null check (status in ('present','late')),
  unique (event_id, member_id)
);

create index if not exists attendance_event_id_idx on public.attendance(event_id);
create index if not exists attendance_member_id_idx on public.attendance(member_id);
create index if not exists events_starts_at_idx on public.events(starts_at desc);

create or replace function public.is_active_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin' and p.active = true
  );
$$;

create or replace function public.check_in_to_event(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_event public.events%rowtype;
  v_profile public.profiles%rowtype;
  v_now timestamptz := now();
  v_status text;
begin
  if (select auth.uid()) is null then
    raise exception 'Please sign in before checking in.';
  end if;
  select * into v_profile from public.profiles where id = (select auth.uid()) and active = true;
  if not found then raise exception 'Your member profile is inactive or missing. Contact HR.'; end if;
  select * into v_event from public.events where id = p_event_id;
  if not found then raise exception 'Event not found.'; end if;
  if v_now < v_event.starts_at then raise exception 'Check-in has not opened yet.'; end if;
  if v_now > v_event.ends_at then raise exception 'Check-in is closed.'; end if;
  v_status := case when v_now > v_event.starts_at + make_interval(mins => v_event.late_after_minutes) then 'late' else 'present' end;
  insert into public.attendance(event_id, member_id, checked_in_at, status)
  values (v_event.id, v_profile.id, v_now, v_status)
  on conflict (event_id, member_id) do nothing;
  if not found then return jsonb_build_object('message','You have already checked in for this event.'); end if;
  return jsonb_build_object('message', case when v_status='late' then 'Check-in recorded (late).' else 'Check-in recorded successfully.' end, 'status', v_status);
end;
$$;
revoke all on function public.check_in_to_event(uuid) from public;
grant execute on function public.check_in_to_event(uuid) to authenticated;
revoke all on function public.is_active_admin() from public;
grant execute on function public.is_active_admin() to authenticated;

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.attendance enable row level security;

drop policy if exists "profiles: members read own, admins read all" on public.profiles;
create policy "profiles: members read own, admins read all" on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select public.is_active_admin()));

drop policy if exists "profiles: admins manage" on public.profiles;
create policy "profiles: admins manage" on public.profiles for all to authenticated
using ((select public.is_active_admin())) with check ((select public.is_active_admin()));

drop policy if exists "events: signed-in users can view" on public.events;
create policy "events: signed-in users can view" on public.events for select to authenticated
using (true);

drop policy if exists "events: admins manage" on public.events;
create policy "events: admins manage" on public.events for all to authenticated
using ((select public.is_active_admin())) with check ((select public.is_active_admin()));

drop policy if exists "attendance: members read own, admins read all" on public.attendance;
create policy "attendance: members read own, admins read all" on public.attendance for select to authenticated
using (member_id = (select auth.uid()) or (select public.is_active_admin()));

-- No direct insert/update/delete policy for attendance: all check-ins go through the validated RPC above.
