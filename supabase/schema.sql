-- =============================================
-- SECRETS VIP O BOTICÁRIO — Supabase Schema
-- =============================================

-- PROFILES
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'comercial')),
  name text not null,
  zone text default '',
  commission_direct numeric default 25,
  commission_reseller numeric default 10,
  active boolean default true,
  created_at timestamptz default now()
);

-- PRODUCTS
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text default '',
  category text default 'perfumaria',
  catalog_price numeric default 0,
  cost_price numeric default 0,
  expiry_date date,
  cycle text default '',
  created_at timestamptz default now()
);

-- CUSTOMERS
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text default '',
  email text default '',
  created_at timestamptz default now()
);

-- PURCHASES (compras de stock pela admin)
create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id),
  quantity integer not null,
  unit_price numeric not null,
  date date not null default current_date,
  created_at timestamptz default now()
);

-- SALES (vendas directas pela admin)
create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id),
  customer_id uuid references customers(id),
  quantity integer not null,
  sale_price numeric not null,
  payment_method text default 'dinheiro',
  profit numeric default 0,
  date date not null default current_date,
  created_at timestamptz default now()
);

-- CREDIT SALES (fiado)
create table if not exists credit_sales (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid references sales(id),
  amount numeric not null,
  due_date date,
  status text default 'pendente' check (status in ('pendente', 'pago')),
  created_at timestamptz default now()
);

-- RESELLERS (salões)
create table if not exists resellers (
  id uuid primary key default gen_random_uuid(),
  salon_name text not null,
  contact_name text default '',
  address text default '',
  phone text default '',
  commission_rate numeric default 25,
  comercial_id uuid references profiles(id),
  last_visit_date date,
  active boolean default true,
  created_at timestamptz default now()
);

-- RESELLER STOCK (produtos em comodato)
create table if not exists reseller_stock (
  id uuid primary key default gen_random_uuid(),
  reseller_id uuid references resellers(id),
  product_id uuid references products(id),
  quantity integer default 0,
  date date default current_date,
  created_at timestamptz default now()
);

-- RESELLER SALES (vendas feitas pelos salões)
create table if not exists reseller_sales (
  id uuid primary key default gen_random_uuid(),
  reseller_id uuid references resellers(id),
  product_id uuid references products(id),
  quantity integer not null,
  sale_price numeric not null,
  comercial_id uuid references profiles(id),
  date date not null default current_date,
  created_at timestamptz default now()
);

-- RESELLER RETURNS (devoluções)
create table if not exists reseller_returns (
  id uuid primary key default gen_random_uuid(),
  reseller_id uuid references resellers(id),
  product_id uuid references products(id),
  quantity integer not null,
  date date not null default current_date,
  created_at timestamptz default now()
);

-- STOCK ADJUSTMENTS
create table if not exists stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id),
  type text not null check (type in ('entrada', 'saida')),
  reason text default '',
  quantity integer not null,
  notes text default '',
  date date not null default current_date,
  created_at timestamptz default now()
);

-- ORDERS (encomendas das comerciais)
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  comercial_id uuid references profiles(id),
  reseller_id uuid references resellers(id),
  product_id uuid references products(id),
  quantity integer not null,
  notes text default '',
  status text default 'pendente' check (status in ('pendente', 'aprovado', 'rejeitado')),
  created_at timestamptz default now()
);

-- COMERCIAL DIRECT SALES (vendas directas pelas comerciais)
create table if not exists comercial_direct_sales (
  id uuid primary key default gen_random_uuid(),
  comercial_id uuid references profiles(id),
  product_id uuid references products(id),
  customer_name text default '',
  quantity integer not null,
  sale_price numeric not null,
  commission_25 numeric default 0,
  date date not null default current_date,
  created_at timestamptz default now()
);

-- =============================================
-- VIEWS
-- =============================================

-- Stock view (calcula stock disponível)
create or replace view stock_view as
select
  p.id as product_id,
  p.name,
  p.code,
  coalesce((
    select sum(case when sa.type = 'entrada' then sa.quantity else -sa.quantity end)
    from stock_adjustments sa where sa.product_id = p.id
  ), 0) +
  coalesce((
    select sum(pu.quantity) from purchases pu where pu.product_id = p.id
  ), 0) -
  coalesce((
    select sum(s.quantity) from sales s where s.product_id = p.id
  ), 0) as total_stock,
  coalesce((
    select sum(rs.quantity) from reseller_stock rs where rs.product_id = p.id
  ), 0) as in_resellers
from products p;

-- Products public view (sem cost_price — para comerciais)
create or replace view products_public as
select id, name, code, category, catalog_price, expiry_date, cycle, created_at
from products;

-- =============================================
-- RLS POLICIES
-- =============================================

alter table profiles enable row level security;
alter table products enable row level security;
alter table customers enable row level security;
alter table purchases enable row level security;
alter table sales enable row level security;
alter table credit_sales enable row level security;
alter table resellers enable row level security;
alter table reseller_stock enable row level security;
alter table reseller_sales enable row level security;
alter table reseller_returns enable row level security;
alter table stock_adjustments enable row level security;
alter table orders enable row level security;
alter table comercial_direct_sales enable row level security;

-- Helper function: get current user role
create or replace function get_my_role()
returns text as $$
  select role from profiles where id = auth.uid()
$$ language sql security definer;

-- PROFILES
create policy "own profile" on profiles for all using (id = auth.uid());
create policy "admin see all profiles" on profiles for select using (get_my_role() = 'admin');

-- PRODUCTS — all authenticated can read; admin full access
create policy "all can read products" on products for select using (auth.role() = 'authenticated');
create policy "admin manage products" on products for all using (get_my_role() = 'admin');

-- CUSTOMERS — admin only
create policy "admin customers" on customers for all using (get_my_role() = 'admin');

-- PURCHASES — admin only
create policy "admin purchases" on purchases for all using (get_my_role() = 'admin');

-- SALES — admin only
create policy "admin sales" on sales for all using (get_my_role() = 'admin');

-- CREDIT SALES — admin only
create policy "admin credit_sales" on credit_sales for all using (get_my_role() = 'admin');

-- RESELLERS
create policy "admin all resellers" on resellers for all using (get_my_role() = 'admin');
create policy "comercial own resellers" on resellers for select using (
  get_my_role() = 'comercial' and comercial_id = auth.uid()
);
create policy "comercial update own resellers" on resellers for update using (
  get_my_role() = 'comercial' and comercial_id = auth.uid()
);

-- RESELLER STOCK
create policy "admin all reseller_stock" on reseller_stock for all using (get_my_role() = 'admin');
create policy "comercial own reseller_stock" on reseller_stock for select using (
  get_my_role() = 'comercial' and reseller_id in (
    select id from resellers where comercial_id = auth.uid()
  )
);

-- RESELLER SALES
create policy "admin all reseller_sales" on reseller_sales for all using (get_my_role() = 'admin');
create policy "comercial own reseller_sales" on reseller_sales for select using (
  get_my_role() = 'comercial' and comercial_id = auth.uid()
);
create policy "comercial insert reseller_sales" on reseller_sales for insert with check (
  get_my_role() = 'comercial' and comercial_id = auth.uid()
);

-- RESELLER RETURNS
create policy "admin all returns" on reseller_returns for all using (get_my_role() = 'admin');

-- STOCK ADJUSTMENTS
create policy "admin all stock_adjustments" on stock_adjustments for all using (get_my_role() = 'admin');

-- ORDERS
create policy "admin all orders" on orders for all using (get_my_role() = 'admin');
create policy "comercial own orders" on orders for select using (
  get_my_role() = 'comercial' and comercial_id = auth.uid()
);
create policy "comercial insert orders" on orders for insert with check (
  get_my_role() = 'comercial' and comercial_id = auth.uid()
);

-- COMERCIAL DIRECT SALES
create policy "admin all direct_sales" on comercial_direct_sales for all using (get_my_role() = 'admin');
create policy "comercial own direct_sales" on comercial_direct_sales for select using (
  get_my_role() = 'comercial' and comercial_id = auth.uid()
);
create policy "comercial insert direct_sales" on comercial_direct_sales for insert with check (
  get_my_role() = 'comercial' and comercial_id = auth.uid()
);
