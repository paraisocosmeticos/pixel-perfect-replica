-- Fix: profiles RLS policy "profiles_select_own_or_admin" was using is_admin() which
-- can have recursion issues. Replace with direct EXISTS subquery on user_roles.
-- Also add insert/upsert policy so admin can create profiles for new reps.

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
for select to authenticated
using (
  auth.uid() = id
  or exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  )
);

drop policy if exists "profiles_admin_insert" on public.profiles;
create policy "profiles_admin_insert" on public.profiles
for insert to authenticated
with check (
  auth.uid() = id
  or exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  )
);

drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles
for update to authenticated
using (
  auth.uid() = id
  or exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  )
);
