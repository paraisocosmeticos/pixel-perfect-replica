import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Coins, Store, Users, Receipt } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/comissoes")({
  head: () => ({ meta: [{ title: "Comissões — Secrets VIP" }] }),
  component: ComissoesPage,
});

type CommissionPayment = {
  id: string;
  destinatario_id: string;
  destinatario_tipo: "salao" | "representante";
  valor: number;
  periodo: string | null;
  status: "pendente" | "pago";
  data_pagamento: string | null;
  created_at: string;
};

type SalonSale = {
  salon_id: string;
  data: string;
  preco_final: number;
  comissao_salao: number;
};

type DirectSale = {
  representante_id: string;
  data: string;
  preco_final: number;
  comissao_rep: number;
};

type SalonRepSale = {
  representante_id: string | null;
  salon_id: string;
  data: string;
  comissao_rep: number;
  preco_final: number;
};

function eur(v: number) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("pt-PT");
}

function periodoLabel(ym: string) {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1).toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
}

// Grouped row types
type SalonCommRow = {
  key: string;
  salon_id: string;
  salonNome: string;
  periodo: string;
  vendas: number;
  comissao: number;
  pago: boolean;
};

type RepCommRow = {
  key: string;
  rep_id: string;
  repNome: string;
  periodo: string;
  vendasSalao: number;
  vendasDiretas: number;
  comissaoSalao: number;
  comissaoDireta: number;
  comissaoTotal: number;
  valorPago: number;
  pendente: number;
  pago: boolean;
};

async function fetchComissoesData() {
  const monthStart = new Date(new Date().setDate(1)).toISOString().slice(0, 10);

  const [
    { data: salonSales },
    { data: salonRepSales },
    { data: directSales },
    { data: salons },
    { data: repsRaw },
    { data: payments },
  ] = await Promise.all([
    supabase.from("salon_sales").select("salon_id,data,preco_final,comissao_salao"),
    supabase.from("salon_sales").select("representante_id,salon_id,data,comissao_rep,preco_final"),
    supabase.from("rep_direct_sales").select("representante_id,data,preco_final,comissao_rep"),
    supabase.from("salons").select("id,nome").eq("ativo", true),
    (supabase as any).rpc("get_representantes"),
    supabase.from("commission_payments").select("*").order("created_at", { ascending: false }),
  ]);

  const salonMap = new Map((salons ?? []).map((s: any) => [s.id, s.nome]));
  const repMap = new Map((repsRaw ?? []).map((p: any) => [p.id, p.nome]));

  // paid amounts per key: "tipo:id:periodo" → total paid
  const paidAmountMap = new Map<string, number>();
  for (const p of (payments ?? []) as CommissionPayment[]) {
    if (p.status !== "pago") continue;
    const k = `${p.destinatario_tipo}:${p.destinatario_id}:${p.periodo ?? ""}`;
    paidAmountMap.set(k, (paidAmountMap.get(k) ?? 0) + Number(p.valor));
  }

  // ── Build salon commission rows ──
  const salonAgg = new Map<string, { vendas: number; comissao: number }>();
  for (const s of (salonSales ?? []) as SalonSale[]) {
    const periodo = s.data.slice(0, 7);
    const key = `${s.salon_id}:${periodo}`;
    const cur = salonAgg.get(key) ?? { vendas: 0, comissao: 0 };
    cur.vendas += Number(s.preco_final);
    cur.comissao += Number(s.comissao_salao);
    salonAgg.set(key, cur);
  }

  const salonRows: SalonCommRow[] = Array.from(salonAgg.entries()).map(([key, val]) => {
    const [salon_id, periodo] = key.split(/:(.+)/);
    const valorPago = paidAmountMap.get(`salao:${salon_id}:${periodo}`) ?? 0;
    return {
      key,
      salon_id,
      salonNome: salonMap.get(salon_id) ?? salon_id,
      periodo,
      vendas: val.vendas,
      comissao: val.comissao,
      pago: valorPago >= val.comissao - 0.01,
    };
  }).sort((a, b) => b.periodo.localeCompare(a.periodo));

  // ── Build rep commission rows ──
  const repAgg = new Map<string, { vendasSalao: number; vendasDiretas: number; comissaoSalao: number; comissaoDireta: number }>();

  for (const s of (salonRepSales ?? []) as SalonRepSale[]) {
    if (!s.representante_id) continue;
    const periodo = s.data.slice(0, 7);
    const key = `${s.representante_id}:${periodo}`;
    const cur = repAgg.get(key) ?? { vendasSalao: 0, vendasDiretas: 0, comissaoSalao: 0, comissaoDireta: 0 };
    cur.vendasSalao += Number(s.preco_final);
    cur.comissaoSalao += Number(s.comissao_rep);
    repAgg.set(key, cur);
  }

  for (const s of (directSales ?? []) as DirectSale[]) {
    if (!s.representante_id) continue;
    const periodo = s.data.slice(0, 7);
    const key = `${s.representante_id}:${periodo}`;
    const cur = repAgg.get(key) ?? { vendasSalao: 0, vendasDiretas: 0, comissaoSalao: 0, comissaoDireta: 0 };
    cur.vendasDiretas += Number(s.preco_final);
    cur.comissaoDireta += Number(s.comissao_rep);
    repAgg.set(key, cur);
  }

  const repRows: RepCommRow[] = Array.from(repAgg.entries()).map(([key, val]) => {
    const [rep_id, periodo] = key.split(/:(.+)/);
    const total = val.comissaoSalao + val.comissaoDireta;
    const valorPago = paidAmountMap.get(`representante:${rep_id}:${periodo}`) ?? 0;
    const pendente = Math.max(0, total - valorPago);
    return {
      key,
      rep_id,
      repNome: repMap.get(rep_id) ?? rep_id,
      periodo,
      vendasSalao: val.vendasSalao,
      vendasDiretas: val.vendasDiretas,
      comissaoSalao: val.comissaoSalao,
      comissaoDireta: val.comissaoDireta,
      comissaoTotal: total,
      valorPago,
      pendente,
      pago: pendente < 0.01,
    };
  }).sort((a, b) => b.periodo.localeCompare(a.periodo));

  // KPIs
  const pendenteSaloes = salonRows.filter((r) => !r.pago).reduce((s, r) => s + r.comissao, 0);
  const pendenteReps = repRows.reduce((s, r) => s + r.pendente, 0);
  const pagoEsteMes = (payments ?? [])
    .filter((p: CommissionPayment) => p.status === "pago" && p.data_pagamento && p.data_pagamento >= monthStart)
    .reduce((s: number, p: CommissionPayment) => s + Number(p.valor), 0);

  const historyMonths = Array.from(
    new Set((payments ?? []).map((p: CommissionPayment) => (p.data_pagamento ?? p.created_at).slice(0, 7))),
  ).sort((a, b) => b.localeCompare(a));

  return {
    salonRows,
    repRows,
    payments: (payments ?? []) as CommissionPayment[],
    salonMap,
    repMap,
    pendenteSaloes,
    pendenteReps,
    pagoEsteMes,
    historyMonths,
  };
}

// ── Pay Confirmation Modal ────────────────────────────────────────────────────
type PayTarget = {
  destinatario_id: string;
  destinatario_tipo: "salao" | "representante";
  nome: string;
  periodo: string;
  valor: number;
};

function ConfirmPayModal({
  target,
  onClose,
}: {
  target: PayTarget | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("commission_payments").insert({
        destinatario_id: target!.destinatario_id,
        destinatario_tipo: target!.destinatario_tipo,
        valor: target!.valor,
        periodo: target!.periodo,
        status: "pago",
        data_pagamento: new Date().toISOString().slice(0, 10),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comissoes"] });
      toast.success("Comissão marcada como paga.");
      onClose();
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  return (
    <Dialog open={!!target} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Confirmar Pagamento</DialogTitle></DialogHeader>
        {target && (
          <div className="py-3 space-y-2 text-sm">
            <p>Pagar <span className="font-semibold">{eur(target.valor)}</span> a{" "}
              <span className="font-semibold">{target.nome}</span>?</p>
            <p className="text-muted-foreground">Período: {periodoLabel(target.periodo)}</p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            className="bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "A registar…" : "Confirmar Pagamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
function ComissoesPage() {
  const { data: currentUser } = useQuery({ queryKey: ["current-user"] });
  const { data, isLoading } = useQuery({ queryKey: ["comissoes"], queryFn: fetchComissoesData });

  if (currentUser && (currentUser as any).role !== "admin") {
    return <Navigate to="/dashboard" />;
  }
  const qc = useQueryClient();

  const [payTarget, setPayTarget] = useState<PayTarget | null>(null);
  const [selectedSalons, setSelectedSalons] = useState<Set<string>>(new Set());
  const [selectedReps, setSelectedReps] = useState<Set<string>>(new Set());
  const [histMonth, setHistMonth] = useState("todos-meses");

  const salonRows = data?.salonRows ?? [];
  const repRows = data?.repRows ?? [];
  const payments = data?.payments ?? [];

  const pendingRows_s = salonRows.filter((r) => !r.pago);
  const pendingRows_r = repRows.filter((r) => !r.pago);

  function toggleSalon(key: string) {
    setSelectedSalons((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }
  function toggleRep(key: string) {
    setSelectedReps((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  const bulkPayMutation = useMutation({
    mutationFn: async ({ tipo, keys }: { tipo: "salao" | "representante"; keys: string[] }) => {
      const inserts = keys.map((k) => {
        const row = tipo === "salao"
          ? salonRows.find((r) => r.key === k)
          : repRows.find((r) => r.key === k);
        const id = tipo === "salao" ? (row as SalonCommRow)?.salon_id : (row as RepCommRow)?.rep_id;
        const valor = tipo === "salao" ? (row as SalonCommRow)?.comissao : (row as RepCommRow)?.pendente;
        return {
          destinatario_id: id,
          destinatario_tipo: tipo,
          valor,
          periodo: row?.periodo,
          status: "pago" as const,
          data_pagamento: new Date().toISOString().slice(0, 10),
        };
      });
      const { error } = await supabase.from("commission_payments").insert(inserts);
      if (error) throw error;
    },
    onSuccess: (_, { tipo }) => {
      qc.invalidateQueries({ queryKey: ["comissoes"] });
      if (tipo === "salao") setSelectedSalons(new Set());
      else setSelectedReps(new Set());
      toast.success("Comissões pagas.");
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const filteredHistory = payments.filter((p) => {
    if (!["pago"].includes(p.status)) return false;
    if (histMonth !== "todos-meses") {
      const d = (p.data_pagamento ?? p.created_at).slice(0, 7);
      if (d !== histMonth) return false;
    }
    return true;
  });

  const kpis = [
    { label: "Total Pendente", value: data ? eur((data.pendenteSaloes ?? 0) + (data.pendenteReps ?? 0)) : "—", icon: Coins },
    { label: "Pago Este Mês", value: data ? eur(data.pagoEsteMes) : "—", icon: Receipt },
    { label: "Pendente Salões", value: data ? eur(data.pendenteSaloes) : "—", icon: Store },
    { label: "Pendente Representantes", value: data ? eur(data.pendenteReps) : "—", icon: Users },
  ];

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Financeiro</p>
        <h1 className="text-3xl md:text-4xl font-display font-semibold mt-1">Comissões</h1>
        <p className="text-muted-foreground mt-2">Gestão de comissões pendentes e histórico de pagamentos.</p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.label} className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">{k.label}</p>
                  <p className="text-2xl font-display font-semibold mt-2 leading-tight">{isLoading ? "…" : k.value}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-secondary text-primary flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </Card>
          );
        })}
      </section>

      <Tabs defaultValue="saloes">
        <TabsList className="mb-4">
          <TabsTrigger value="saloes">Salões</TabsTrigger>
          <TabsTrigger value="representantes">Representantes</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        {/* ── Tab Salões ── */}
        <TabsContent value="saloes" className="space-y-4">
          {selectedSalons.size > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-md bg-muted">
              <span className="text-sm">{selectedSalons.size} selecionado{selectedSalons.size > 1 ? "s" : ""}</span>
              <Button
                size="sm"
                className="bg-accent text-accent-foreground hover:bg-accent/90"
                onClick={() => bulkPayMutation.mutate({ tipo: "salao", keys: Array.from(selectedSalons) })}
                disabled={bulkPayMutation.isPending}
              >
                Pagar seleccionados
              </Button>
            </div>
          )}
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-primary hover:bg-primary">
                  <TableHead className="text-primary-foreground w-8"></TableHead>
                  <TableHead className="text-primary-foreground">Salão</TableHead>
                  <TableHead className="text-primary-foreground">Período</TableHead>
                  <TableHead className="text-primary-foreground text-right">Vendas</TableHead>
                  <TableHead className="text-primary-foreground text-right">Comissão (25%)</TableHead>
                  <TableHead className="text-primary-foreground text-center">Status</TableHead>
                  <TableHead className="text-primary-foreground"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">A carregar…</TableCell></TableRow>
                )}
                {!isLoading && salonRows.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Sem comissões calculadas.</TableCell></TableRow>
                )}
                {salonRows.map((r) => (
                  <TableRow key={r.key} className={r.pago ? "opacity-60" : ""}>
                    <TableCell>
                      {!r.pago && (
                        <Checkbox
                          checked={selectedSalons.has(r.key)}
                          onCheckedChange={() => toggleSalon(r.key)}
                        />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{r.salonNome}</TableCell>
                    <TableCell className="text-muted-foreground">{periodoLabel(r.periodo)}</TableCell>
                    <TableCell className="text-right">{eur(r.vendas)}</TableCell>
                    <TableCell className="text-right font-semibold">{eur(r.comissao)}</TableCell>
                    <TableCell className="text-center">
                      {r.pago
                        ? <Badge className="bg-green-600 text-white hover:bg-green-600">Pago</Badge>
                        : <Badge className="bg-orange-500 text-white hover:bg-orange-500">Pendente</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      {!r.pago && (
                        <Button
                          size="sm" variant="outline"
                          onClick={() => setPayTarget({ destinatario_id: r.salon_id, destinatario_tipo: "salao", nome: r.salonNome, periodo: r.periodo, valor: r.comissao })}
                        >
                          Pagar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ── Tab Representantes ── */}
        <TabsContent value="representantes" className="space-y-4">
          {selectedReps.size > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-md bg-muted">
              <span className="text-sm">{selectedReps.size} selecionado{selectedReps.size > 1 ? "s" : ""}</span>
              <Button
                size="sm"
                className="bg-accent text-accent-foreground hover:bg-accent/90"
                onClick={() => bulkPayMutation.mutate({ tipo: "representante", keys: Array.from(selectedReps) })}
                disabled={bulkPayMutation.isPending}
              >
                Pagar seleccionados
              </Button>
            </div>
          )}
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-primary hover:bg-primary">
                  <TableHead className="text-primary-foreground w-8"></TableHead>
                  <TableHead className="text-primary-foreground">Representante</TableHead>
                  <TableHead className="text-primary-foreground">Período</TableHead>
                  <TableHead className="text-primary-foreground text-right">Vnd. Salões</TableHead>
                  <TableHead className="text-primary-foreground text-right">Vnd. Directas</TableHead>
                  <TableHead className="text-primary-foreground text-right">Com. Salões</TableHead>
                  <TableHead className="text-primary-foreground text-right">Com. Directas</TableHead>
                  <TableHead className="text-primary-foreground text-right">Total</TableHead>
                  <TableHead className="text-primary-foreground text-right">Pago</TableHead>
                  <TableHead className="text-primary-foreground text-right">Pendente</TableHead>
                  <TableHead className="text-primary-foreground text-center">Status</TableHead>
                  <TableHead className="text-primary-foreground"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={11} className="text-center py-10 text-muted-foreground">A carregar…</TableCell></TableRow>
                )}
                {!isLoading && repRows.length === 0 && (
                  <TableRow><TableCell colSpan={11} className="text-center py-10 text-muted-foreground">Sem comissões calculadas.</TableCell></TableRow>
                )}
                {repRows.map((r) => (
                  <TableRow key={r.key} className={r.pago ? "opacity-60" : ""}>
                    <TableCell>
                      {!r.pago && (
                        <Checkbox
                          checked={selectedReps.has(r.key)}
                          onCheckedChange={() => toggleRep(r.key)}
                        />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{r.repNome}</TableCell>
                    <TableCell className="text-muted-foreground">{periodoLabel(r.periodo)}</TableCell>
                    <TableCell className="text-right">{eur(r.vendasSalao)}</TableCell>
                    <TableCell className="text-right">{eur(r.vendasDiretas)}</TableCell>
                    <TableCell className="text-right">{eur(r.comissaoSalao)}</TableCell>
                    <TableCell className="text-right">{eur(r.comissaoDireta)}</TableCell>
                    <TableCell className="text-right font-semibold">{eur(r.comissaoTotal)}</TableCell>
                    <TableCell className="text-right text-green-600">{r.valorPago > 0 ? eur(r.valorPago) : "—"}</TableCell>
                    <TableCell className="text-right font-semibold text-orange-600">{r.pendente > 0 ? eur(r.pendente) : "—"}</TableCell>
                    <TableCell className="text-center">
                      {r.pago
                        ? <Badge className="bg-green-600 text-white hover:bg-green-600">Pago</Badge>
                        : <Badge className="bg-orange-500 text-white hover:bg-orange-500">Pendente</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      {!r.pago && (
                        <Button
                          size="sm" variant="outline"
                          onClick={() => setPayTarget({ destinatario_id: r.rep_id, destinatario_tipo: "representante", nome: r.repNome, periodo: r.periodo, valor: r.pendente })}
                        >
                          Pagar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ── Tab Histórico ── */}
        <TabsContent value="historico" className="space-y-4">
          <div className="flex items-center gap-3">
            <Select value={histMonth} onValueChange={setHistMonth}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos-meses">Todos os meses</SelectItem>
                {(data?.historyMonths ?? []).map((m) => (
                  <SelectItem key={m} value={m}>{periodoLabel(m)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-primary hover:bg-primary">
                  <TableHead className="text-primary-foreground">Data Pagamento</TableHead>
                  <TableHead className="text-primary-foreground">Destinatário</TableHead>
                  <TableHead className="text-primary-foreground">Tipo</TableHead>
                  <TableHead className="text-primary-foreground">Período</TableHead>
                  <TableHead className="text-primary-foreground text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">A carregar…</TableCell></TableRow>
                )}
                {!isLoading && filteredHistory.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Sem pagamentos registados.</TableCell></TableRow>
                )}
                {filteredHistory.map((p) => {
                  const nome = p.destinatario_tipo === "salao"
                    ? data?.salonMap.get(p.destinatario_id) ?? p.destinatario_id
                    : data?.repMap.get(p.destinatario_id) ?? p.destinatario_id;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>{fmtDate(p.data_pagamento)}</TableCell>
                      <TableCell className="font-medium">{nome}</TableCell>
                      <TableCell className="text-muted-foreground capitalize">
                        {p.destinatario_tipo === "salao" ? "Salão" : "Representante"}
                      </TableCell>
                      <TableCell>{p.periodo ? periodoLabel(p.periodo) : "—"}</TableCell>
                      <TableCell className="text-right font-semibold">{eur(Number(p.valor))}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <ConfirmPayModal target={payTarget} onClose={() => setPayTarget(null)} />
    </div>
  );
}
