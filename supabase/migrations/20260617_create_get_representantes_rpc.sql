-- RPC function to fetch all representantes profiles.
-- Runs as SECURITY DEFINER (bypasses RLS) so admins can list all reps.
-- Run manually in Supabase SQL Editor for project djnbddubchvhlzsaglis.

create or replace function public.get_representantes()
returns table (id uuid, nome text, email text)
language sql
security definer
stable
as $$
  select p.id, p.nome, p.email
  from public.profiles p
  join public.user_roles ur on ur.user_id = p.id
  where ur.role = 'representante';
$$;

grant execute on function public.get_representantes() to authenticated;
