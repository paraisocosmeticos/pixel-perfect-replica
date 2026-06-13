
-- Fix: products RLS policy was blocking admins due to is_admin() depending
-- on auth.uid() which can be stale/mismatched in some session states.
-- Replace with a direct subquery that is more reliable.

drop policy if exists "products_admin_write" on public.products;

create policy "products_admin_write" on public.products
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

-- Also fix the same pattern for other tables that use is_admin()
-- in case the RPC has the same issue.

drop policy if exists "products_admin_write" on public.purchases;
drop policy if exists "purchases_admin_all" on public.purchases;
create policy "purchases_admin_all" on public.purchases
for all to authenticated
using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
)
with check (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
);

drop policy if exists "stock_adj_admin_all" on public.stock_adjustments;
create policy "stock_adj_admin_all" on public.stock_adjustments
for all to authenticated
using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
)
with check (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
);

drop policy if exists "cycles_admin_write" on public.boticario_cycles;
create policy "cycles_admin_write" on public.boticario_cycles
for all to authenticated
using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
)
with check (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
);

drop policy if exists "promotions_admin_write" on public.promotions;
create policy "promotions_admin_write" on public.promotions
for all to authenticated
using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
)
with check (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
);

drop policy if exists "commission_admin_all" on public.commission_payments;
create policy "commission_admin_all" on public.commission_payments
for all to authenticated
using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
)
with check (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
);

drop policy if exists "salons_admin_all" on public.salons;
create policy "salons_admin_all" on public.salons
for all to authenticated
using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
)
with check (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
);

drop policy if exists "user_roles_admin_all" on public.user_roles;
create policy "user_roles_admin_all" on public.user_roles
for all to authenticated
using (
  exists (select 1 from public.user_roles ur2 where ur2.user_id = auth.uid() and ur2.role = 'admin')
)
with check (
  exists (select 1 from public.user_roles ur2 where ur2.user_id = auth.uid() and ur2.role = 'admin')
);
