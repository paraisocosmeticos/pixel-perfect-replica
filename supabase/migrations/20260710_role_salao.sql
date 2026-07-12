-- ── Role 'salao' e tabela salao_users ─────────────────────────────────────────

-- Adicionar 'salao' ao enum app_role (idempotente com DO block)
do $$
begin
  if not exists (
    select 1 from pg_enum
    where enumlabel = 'salao'
      and enumtypid = (select oid from pg_type where typname = 'app_role')
  ) then
    alter type public.app_role add value 'salao';
  end if;
end$$;

-- Tabela de ligação utilizador → salão
create table if not exists public.salao_users (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  salon_id   uuid not null references public.salons(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id, salon_id)
);
alter table public.salao_users enable row level security;

-- Utilizador só vê a sua própria ligação
create policy "salao_users_own" on public.salao_users
  for select to authenticated
  using (user_id = auth.uid());

-- Admin gere tudo
create policy "salao_users_admin" on public.salao_users
  for all to authenticated
  using   (exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin'));

grant select, insert, update, delete on public.salao_users to authenticated;
grant all on public.salao_users to service_role;

-- ── Policies para role 'salao' ver os seus dados ───────────────────────────────

-- Salão lê o próprio registo
create policy "salons_salao_read_own" on public.salons
  for select to authenticated
  using (
    id = (
      select salon_id from public.salao_users
      where user_id = auth.uid()
      limit 1
    )
  );

-- Transferências
create policy "transfers_salao_read" on public.transfers
  for select to authenticated
  using (
    salon_id = (
      select salon_id from public.salao_users
      where user_id = auth.uid()
      limit 1
    )
  );

-- Vendas de salão
create policy "salon_sales_salao_read" on public.salon_sales
  for select to authenticated
  using (
    salon_id = (
      select salon_id from public.salao_users
      where user_id = auth.uid()
      limit 1
    )
  );

-- Devoluções
create policy "returns_salao_read" on public.returns
  for select to authenticated
  using (
    salon_id = (
      select salon_id from public.salao_users
      where user_id = auth.uid()
      limit 1
    )
  );

-- Visitas
create policy "visit_salao_read" on public.salon_visit_log
  for select to authenticated
  using (
    salon_id = (
      select salon_id from public.salao_users
      where user_id = auth.uid()
      limit 1
    )
  );
