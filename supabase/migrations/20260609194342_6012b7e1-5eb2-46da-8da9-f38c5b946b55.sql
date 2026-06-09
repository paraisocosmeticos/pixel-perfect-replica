
-- ENUMS
create type public.app_role as enum ('admin', 'representante');
create type public.commission_status as enum ('pendente', 'pago');
create type public.stock_adjustment_type as enum ('entrada', 'saida', 'quebra');
create type public.promotion_type as enum ('percentual', 'preco_fixo');

-- USER ROLES (created first so other policies can reference it)
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(), 'admin')
$$;

create policy "user_roles_select_own" on public.user_roles for select to authenticated using (user_id = auth.uid());
create policy "user_roles_admin_all" on public.user_roles for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- PROFILES
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "profiles_select_own_or_admin" on public.profiles for select to authenticated
  using (auth.uid() = id or public.is_admin());
create policy "profiles_update_own" on public.profiles for update to authenticated using (auth.uid() = id);
create policy "profiles_insert_self" on public.profiles for insert to authenticated with check (auth.uid() = id);

-- AUTO-CREATE PROFILE + ROLE ON SIGNUP
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)), new.email);
  insert into public.user_roles (user_id, role) values (new.id, 'representante');
  return new;
end;
$$;
create trigger on_auth_user_created
after insert on auth.users for each row execute function public.handle_new_user();

-- CICLOS
create table public.boticario_cycles (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  numero_ciclo int,
  data_inicio date,
  data_fim date,
  ativo boolean not null default false,
  created_at timestamptz not null default now()
);
grant select on public.boticario_cycles to authenticated;
grant all on public.boticario_cycles to service_role;
alter table public.boticario_cycles enable row level security;
create policy "cycles_read_all" on public.boticario_cycles for select to authenticated using (true);
create policy "cycles_admin_write" on public.boticario_cycles for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- PRODUCTS
create table public.products (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  categoria text not null,
  slug text unique not null,
  preco_custo numeric(10,2) not null,
  preco_venda numeric(10,2) not null,
  unidade_min_stock int not null default 0,
  validade_meses int not null default 24,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.products to authenticated;
grant all on public.products to service_role;
alter table public.products enable row level security;
create policy "products_read_auth" on public.products for select to authenticated using (true);
create policy "products_admin_write" on public.products for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- PURCHASES
create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid references public.boticario_cycles(id),
  produto_id uuid not null references public.products(id),
  quantidade int not null check (quantidade > 0),
  preco_custo_unit numeric(10,2) not null,
  data_compra date not null default current_date,
  nota text,
  created_at timestamptz not null default now()
);
grant select on public.purchases to authenticated;
grant all on public.purchases to service_role;
alter table public.purchases enable row level security;
create policy "purchases_admin_all" on public.purchases for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- STOCK ADJUSTMENTS
create table public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.products(id),
  tipo public.stock_adjustment_type not null,
  quantidade int not null check (quantidade > 0),
  motivo text,
  data date not null default current_date,
  created_at timestamptz not null default now()
);
grant select on public.stock_adjustments to authenticated;
grant all on public.stock_adjustments to service_role;
alter table public.stock_adjustments enable row level security;
create policy "stock_adj_admin_all" on public.stock_adjustments for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- SALONS
create table public.salons (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  morada text,
  telefone text,
  contacto_nome text,
  representante_id uuid references public.profiles(id),
  ativo boolean not null default true,
  data_inicio_parceria date default current_date,
  nota_interna text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.salons to authenticated;
grant all on public.salons to service_role;
alter table public.salons enable row level security;
create policy "salons_admin_all" on public.salons for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "salons_rep_read_own" on public.salons for select to authenticated using (representante_id = auth.uid());

-- TRANSFERS
create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id),
  produto_id uuid not null references public.products(id),
  quantidade int not null check (quantidade > 0),
  data date not null default current_date,
  representante_id uuid references public.profiles(id),
  nota text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.transfers to authenticated;
grant all on public.transfers to service_role;
alter table public.transfers enable row level security;
create policy "transfers_admin_all" on public.transfers for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "transfers_rep_own" on public.transfers for all to authenticated
  using (representante_id = auth.uid() or exists (select 1 from public.salons s where s.id = salon_id and s.representante_id = auth.uid()))
  with check (representante_id = auth.uid() or exists (select 1 from public.salons s where s.id = salon_id and s.representante_id = auth.uid()));

-- RETURNS
create table public.returns (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id),
  produto_id uuid not null references public.products(id),
  quantidade int not null check (quantidade > 0),
  data date not null default current_date,
  representante_id uuid references public.profiles(id),
  motivo text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.returns to authenticated;
grant all on public.returns to service_role;
alter table public.returns enable row level security;
create policy "returns_admin_all" on public.returns for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "returns_rep_own" on public.returns for all to authenticated
  using (representante_id = auth.uid() or exists (select 1 from public.salons s where s.id = salon_id and s.representante_id = auth.uid()))
  with check (representante_id = auth.uid() or exists (select 1 from public.salons s where s.id = salon_id and s.representante_id = auth.uid()));

-- PROMOTIONS
create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.products(id),
  tipo public.promotion_type not null,
  desconto_percentual numeric(5,2),
  preco_fixo numeric(10,2),
  data_inicio date not null,
  data_fim date not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.promotions to authenticated;
grant all on public.promotions to service_role;
alter table public.promotions enable row level security;
create policy "promotions_read_auth" on public.promotions for select to authenticated using (true);
create policy "promotions_admin_write" on public.promotions for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- SALON SALES
create table public.salon_sales (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id),
  produto_id uuid not null references public.products(id),
  representante_id uuid references public.profiles(id),
  quantidade int not null check (quantidade > 0),
  preco_venda numeric(10,2) not null,
  preco_final numeric(10,2) not null default 0,
  comissao_salao numeric(10,2) not null default 0,
  comissao_rep numeric(10,2) not null default 0,
  data date not null default current_date,
  cliente_nome text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.salon_sales to authenticated;
grant all on public.salon_sales to service_role;
alter table public.salon_sales enable row level security;
create policy "salon_sales_admin_all" on public.salon_sales for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "salon_sales_rep_own" on public.salon_sales for all to authenticated
  using (representante_id = auth.uid() or exists (select 1 from public.salons s where s.id = salon_id and s.representante_id = auth.uid()))
  with check (representante_id = auth.uid() or exists (select 1 from public.salons s where s.id = salon_id and s.representante_id = auth.uid()));

-- REP DIRECT SALES
create table public.rep_direct_sales (
  id uuid primary key default gen_random_uuid(),
  representante_id uuid not null references public.profiles(id),
  produto_id uuid not null references public.products(id),
  quantidade int not null check (quantidade > 0),
  preco_venda numeric(10,2) not null,
  preco_final numeric(10,2) not null default 0,
  comissao_rep numeric(10,2) not null default 0,
  cliente_nome text,
  data date not null default current_date,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.rep_direct_sales to authenticated;
grant all on public.rep_direct_sales to service_role;
alter table public.rep_direct_sales enable row level security;
create policy "rep_direct_admin_all" on public.rep_direct_sales for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "rep_direct_rep_own" on public.rep_direct_sales for all to authenticated
  using (representante_id = auth.uid()) with check (representante_id = auth.uid());

-- VISIT LOG
create table public.salon_visit_log (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id),
  representante_id uuid not null references public.profiles(id),
  data date not null default current_date,
  notas text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.salon_visit_log to authenticated;
grant all on public.salon_visit_log to service_role;
alter table public.salon_visit_log enable row level security;
create policy "visit_admin_all" on public.salon_visit_log for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "visit_rep_own" on public.salon_visit_log for all to authenticated
  using (representante_id = auth.uid() or exists (select 1 from public.salons s where s.id = salon_id and s.representante_id = auth.uid()))
  with check (representante_id = auth.uid());

-- COMMISSION PAYMENTS
create table public.commission_payments (
  id uuid primary key default gen_random_uuid(),
  destinatario_id uuid not null,
  destinatario_tipo text not null check (destinatario_tipo in ('salao', 'representante')),
  valor numeric(10,2) not null,
  periodo text,
  status public.commission_status not null default 'pendente',
  data_pagamento date,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.commission_payments to authenticated;
grant all on public.commission_payments to service_role;
alter table public.commission_payments enable row level security;
create policy "commission_admin_all" on public.commission_payments for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- TRIGGER: SALON COMMISSION (25% salão + 10% rep)
create or replace function public.calc_salon_commission()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_promo record;
  v_preco_unit numeric(10,2);
begin
  select * into v_promo from public.promotions
    where produto_id = NEW.produto_id and ativo = true
      and current_date between data_inicio and data_fim
    order by created_at desc limit 1;

  v_preco_unit := NEW.preco_venda;
  if v_promo.id is not null then
    if v_promo.tipo = 'percentual' and v_promo.desconto_percentual is not null then
      v_preco_unit := round(NEW.preco_venda * (1 - v_promo.desconto_percentual/100.0), 2);
    elsif v_promo.tipo = 'preco_fixo' and v_promo.preco_fixo is not null then
      v_preco_unit := v_promo.preco_fixo;
    end if;
  end if;

  NEW.preco_final := round(v_preco_unit * NEW.quantidade, 2);
  NEW.comissao_salao := round(NEW.preco_final * 0.25, 2);
  NEW.comissao_rep := round(NEW.preco_final * 0.10, 2);

  if NEW.representante_id is null then
    select representante_id into NEW.representante_id from public.salons where id = NEW.salon_id;
  end if;
  return NEW;
end;
$$;
create trigger trg_salon_commission
before insert on public.salon_sales
for each row execute function public.calc_salon_commission();

-- TRIGGER: DIRECT COMMISSION (25% rep)
create or replace function public.calc_direct_commission()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_promo record;
  v_preco_unit numeric(10,2);
begin
  select * into v_promo from public.promotions
    where produto_id = NEW.produto_id and ativo = true
      and current_date between data_inicio and data_fim
    order by created_at desc limit 1;

  v_preco_unit := NEW.preco_venda;
  if v_promo.id is not null then
    if v_promo.tipo = 'percentual' and v_promo.desconto_percentual is not null then
      v_preco_unit := round(NEW.preco_venda * (1 - v_promo.desconto_percentual/100.0), 2);
    elsif v_promo.tipo = 'preco_fixo' and v_promo.preco_fixo is not null then
      v_preco_unit := v_promo.preco_fixo;
    end if;
  end if;

  NEW.preco_final := round(v_preco_unit * NEW.quantidade, 2);
  NEW.comissao_rep := round(NEW.preco_final * 0.25, 2);
  return NEW;
end;
$$;
create trigger trg_direct_commission
before insert on public.rep_direct_sales
for each row execute function public.calc_direct_commission();

-- VIEW: STOCK CENTRAL
create or replace view public.stock_central as
select
  p.id as produto_id, p.nome, p.categoria, p.unidade_min_stock, p.validade_meses,
  coalesce((select sum(quantidade) from public.purchases where produto_id = p.id), 0)
  + coalesce((select sum(quantidade) from public.stock_adjustments where produto_id = p.id and tipo = 'entrada'), 0)
  - coalesce((select sum(quantidade) from public.stock_adjustments where produto_id = p.id and tipo in ('saida','quebra')), 0)
  - coalesce((select sum(quantidade) from public.transfers where produto_id = p.id), 0)
  + coalesce((select sum(quantidade) from public.returns where produto_id = p.id), 0)
  - coalesce((select sum(quantidade) from public.rep_direct_sales where produto_id = p.id), 0)
  as stock_qg
from public.products p;

grant select on public.stock_central to authenticated;
