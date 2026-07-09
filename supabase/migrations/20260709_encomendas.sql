create table public.encomendas (
  id uuid primary key default gen_random_uuid(),
  numero serial unique,
  origem_tipo text not null check (origem_tipo in ('salao', 'representante')),
  origem_id uuid not null,
  status text not null default 'pendente'
    check (status in (
      'pendente',
      'encomendado_boticario',
      'stock_recebido',
      'transferido_entregue',
      'pagamento_recebido',
      'cancelado'
    )),
  notas text,
  data_pedido date not null default current_date,
  data_encomenda_boticario date,
  data_stock_recebido date,
  data_entrega date,
  data_pagamento date,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.encomenda_itens (
  id uuid primary key default gen_random_uuid(),
  encomenda_id uuid not null references public.encomendas(id) on delete cascade,
  produto_id uuid not null references public.products(id),
  quantidade int not null check (quantidade > 0),
  preco_venda numeric(10,2),
  created_at timestamptz not null default now()
);

alter table public.encomendas enable row level security;
alter table public.encomenda_itens enable row level security;

create policy "encomendas_admin_all" on public.encomendas
for all to authenticated
using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
)
with check (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
);

create policy "encomenda_itens_admin_all" on public.encomenda_itens
for all to authenticated
using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
)
with check (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
);

grant select, insert, update, delete on public.encomendas to authenticated;
grant select, insert, update, delete on public.encomenda_itens to authenticated;
grant all on public.encomendas to service_role;
grant all on public.encomenda_itens to service_role;
grant usage on sequence public.encomendas_numero_seq to authenticated;
