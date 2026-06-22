-- Creates the stock_central view for the new Supabase project (djnbddubchvhlzsaglis).
-- Run manually in SQL Editor if not already applied.
--
-- stock_qg = compras + entradas - saidas/quebras - transferencias + devoluções - vendas diretas rep

create or replace view public.stock_central as
select
  p.id           as produto_id,
  p.nome,
  p.categoria,
  p.unidade_min_stock,
  p.validade_meses,
  coalesce((select sum(quantidade) from public.purchases          where produto_id = p.id), 0)
  + coalesce((select sum(quantidade) from public.stock_adjustments where produto_id = p.id and tipo = 'entrada'), 0)
  - coalesce((select sum(quantidade) from public.stock_adjustments where produto_id = p.id and tipo in ('saida','quebra')), 0)
  - coalesce((select sum(quantidade) from public.transfers         where produto_id = p.id), 0)
  + coalesce((select sum(quantidade) from public.returns           where produto_id = p.id), 0)
  - coalesce((select sum(quantidade) from public.rep_direct_sales  where produto_id = p.id), 0)
  as stock_qg
from public.products p
where p.ativo = true;

grant select on public.stock_central to authenticated;
