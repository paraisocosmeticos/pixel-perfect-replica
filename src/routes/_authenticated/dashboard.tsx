import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, Store, Receipt, Coins, AlertTriangle, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Secrets VIP" },
      { name: "description", content: "Visão geral do negócio: stock, vendas, salões e comissões." },
    ],
  }),
  component: DashboardPage,
});

async function fetchOverview() {
  const monthStart = new Date(new Date().setDate(1)).toISOString().slice(0, 10);
  const [products, salons, sales, directSales, stock, custoMedioRaw] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }),
    supabase.from("salons").select("id", { count: "exact", head: true }).eq("ativo", true),
    supabase.from("salon_sales").select("produto_id,quantidade,preco_final,comissao_rep").gte("data", monthStart),
    supabase.from("rep_direct_sales").select("produto_id,quantidade,preco_final,comissao_rep").gte("data", monthStart),
    supabase.from("stock_central").select("*"),
    (supabase as any).from("produto_custo_medio").select("produto_id,custo_medio"),
  ]);

  const allSales = [...(sales.data ?? []), ...(directSales.data ?? [])];
  const revenue = allSales.reduce((s, r: any) => s + Number(r.preco_final ?? 0), 0);
  const commissions = allSales.reduce((s, r: any) => s + Number(r.comissao_rep ?? 0), 0);

  const custoMedioMap = new Map(
    ((custoMedioRaw.data ?? []) as any[]).map((r) => [r.produto_id, Number(r.custo_medio)]),
  );
  const custoVendas = allSales.reduce((s, r: any) => {
    const cm = custoMedioMap.get(r.produto_id) ?? 0;
    return s + cm * Number(r.quantidade ?? 0);
  }, 0);
  const lucroEstimado = revenue - custoVendas;

  const lowStock = (stock.data ?? []).filter(
    (r: any) => Number(r.stock_qg) < Number(r.unidade_min_stock),
  );

  return {
    productsCount: products.count ?? 0,
    salonsCount: salons.count ?? 0,
    monthRevenue: revenue,
    monthCommissions: commissions,
    lucroEstimado,
    lowStock,
  };
}

function eur(v: number) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);
}

function DashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ["dashboard-overview"], queryFn: fetchOverview });

  const stats = [
    { label: "Produtos no catálogo", value: data?.productsCount ?? "—", icon: Package },
    { label: "Salões activos", value: data?.salonsCount ?? "—", icon: Store },
    { label: "Receita do mês", value: data ? eur(data.monthRevenue) : "—", icon: Receipt },
    { label: "Comissões do mês", value: data ? eur(data.monthCommissions) : "—", icon: Coins },
    { label: "Lucro Estimado", value: data ? eur(data.lucroEstimado) : "—", icon: TrendingUp },
  ];

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">EMC² Digital</p>
        <h1 className="text-3xl md:text-4xl font-display font-semibold mt-1">Dashboard</h1>
        <p className="text-muted-foreground mt-2">Visão geral do negócio em tempo real.</p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">{s.label}</p>
                  <p className="text-2xl font-display font-semibold mt-2">
                    {isLoading ? "…" : s.value}
                  </p>
                </div>
                <div className="h-10 w-10 rounded-full bg-secondary text-primary flex items-center justify-center">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </Card>
          );
        })}
      </section>

      <section>
        <h2 className="text-lg font-display font-semibold mb-3">Alertas de stock</h2>
        <Card className="p-5">
          {isLoading && <p className="text-sm text-muted-foreground">A carregar…</p>}
          {!isLoading && (data?.lowStock?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">Sem stock crítico de momento.</p>
          )}
          {!isLoading && (data?.lowStock?.length ?? 0) > 0 && (
            <ul className="space-y-2">
              {data!.lowStock.map((p: any) => (
                <li key={p.produto_id} className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <span className="text-sm font-medium">{p.nome}</span>
                    <span className="text-xs text-muted-foreground">{p.categoria}</span>
                  </div>
                  <Badge variant="destructive">
                    {p.stock_qg} / mín {p.unidade_min_stock}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section>
        <h2 className="text-lg font-display font-semibold mb-3">Próximos passos</h2>
        <Card className="p-5">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Esta é a fundação do <strong>Secrets VIP O Boticário</strong>. Base de dados, autenticação,
            papéis (admin/representante), layout e dashboard estão prontos. A seguir podemos construir,
            módulo a módulo: Produtos, Stock, Compras, Salões, Vendas, Promoções, Comissões e Relatórios.
          </p>
        </Card>
      </section>
    </div>
  );
}