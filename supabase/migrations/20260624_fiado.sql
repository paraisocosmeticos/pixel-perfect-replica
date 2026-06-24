-- Módulo Fiado/Crédito: registo de valores em dívida de clientes dos salões.
-- Só admin pode ver e gerir. Valores só entram no balanço quando status='recebido'.
-- Correr manualmente no Supabase SQL Editor: projecto djnbddubchvhlzsaglis

create table public.fiado (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id),
  produto_id uuid references public.products(id),
  cliente_nome text not null,
  descricao text,
  valor numeric(10,2) not null,
  data date not null default current_date,
  status text not null default 'pendente'
    check (status in ('pendente', 'recebido')),
  data_recebido date,
  created_at timestamptz not null default now()
);

alter table public.fiado enable row level security;

-- Só admin vê e gere
create policy "fiado_admin_only" on public.fiado
for all to authenticated
using (
  exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  )
);

grant select, insert, update, delete on public.fiado to authenticated;
grant all on public.fiado to service_role;
