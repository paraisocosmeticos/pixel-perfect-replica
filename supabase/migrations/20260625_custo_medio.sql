-- View: custo médio ponderado de cada produto com base nas compras registadas.
-- Quando não há compras, usa o preco_custo do produto como fallback.
-- Correr manualmente no Supabase SQL Editor: projecto djnbddubchvhlzsaglis

create or replace view public.produto_custo_medio as
select
  p.id as produto_id,
  p.nome,
  p.preco_venda,
  p.preco_custo,
  case
    when coalesce(sum(pu.quantidade), 0) = 0 then p.preco_custo
    else round(
      sum(pu.quantidade * pu.preco_custo_unit) / sum(pu.quantidade),
      2
    )
  end as custo_medio
from public.products p
left join public.purchases pu on pu.produto_id = p.id
group by p.id, p.nome, p.preco_venda, p.preco_custo;

grant select on public.produto_custo_medio to authenticated;
grant select on public.produto_custo_medio to service_role;
