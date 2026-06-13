import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Settings, Users, RefreshCw, Building2, Upload, Plus, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Secrets VIP" }] }),
  component: ConfiguracoesPage,
});

type UserRow = { id: string; nome: string; email: string; role: string; created_at: string };
type Cycle = { id: string; nome: string; numero_ciclo: number | null; data_inicio: string | null; data_fim: string | null; ativo: boolean };

function fmtDate(s: string) { return new Date(s).toLocaleDateString("pt-PT"); }

async function fetchConfigData() {
  const [{ data: profiles }, { data: roles }, { data: cycles }] = await Promise.all([
    supabase.from("profiles").select("id,nome,email,created_at").order("nome"),
    supabase.from("user_roles").select("user_id,role"),
    supabase.from("boticario_cycles").select("*").order("created_at", { ascending: false }),
  ]);

  const roleMap = new Map((roles ?? []).map((r: any) => [r.user_id, r.role]));
  const users: UserRow[] = (profiles ?? []).map((p: any) => ({
    id: p.id,
    nome: p.nome,
    email: p.email,
    role: roleMap.get(p.id) ?? "representante",
    created_at: p.created_at,
  }));

  return { users, cycles: (cycles ?? []) as Cycle[] };
}

// ── Change Role Modal ─────────────────────────────────────────────────────────
function ChangeRoleModal({
  user,
  onClose,
}: {
  user: UserRow | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [role, setRole] = useState<"admin" | "representante">("representante");

  useEffect(() => { if (user) setRole(user.role as any); }, [user]);

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("user_roles")
        .update({ role })
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["config"] });
      toast.success("Role actualizado.");
      onClose();
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  return (
    <Dialog open={!!user} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Alterar Role — {user?.nome}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <Select value={role} onValueChange={(v) => setRole(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="representante">Representante</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Nova Rep Instrução Modal ──────────────────────────────────────────────────
function NovaRepModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  useEffect(() => { if (open) { setEmail(""); setNome(""); } }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Adicionar Nova Representante</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" />
            </div>
          </div>
          {email && (
            <div className="rounded-md bg-muted p-4 space-y-3 text-sm">
              <p className="font-semibold flex items-center gap-2"><Settings className="h-4 w-4" /> Passos para criar a conta:</p>
              <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                <li>Acede ao <strong>Supabase Dashboard</strong> → Authentication → Users → <strong>Add user</strong></li>
                <li>Email: <span className="font-mono text-foreground bg-background rounded px-1">{email}</span> · Auto Confirm: <strong>ON</strong></li>
                <li>Após criado, executa no <strong>SQL Editor</strong>:</li>
              </ol>
              <pre className="bg-background rounded-md p-3 text-xs overflow-x-auto border">{`-- Adicionar role representante para ${nome || email}
UPDATE public.user_roles
SET role = 'representante'
WHERE user_id = (
  SELECT id FROM auth.users
  WHERE email = '${email}'
);`}</pre>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground" start={4}>
                <li>Vai a <strong>Salões</strong> → editar salão → atribui a representante</li>
              </ol>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Novo Ciclo Modal ──────────────────────────────────────────────────────────
function NovoCicloModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [numero, setNumero] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");

  useEffect(() => { if (open) { setNome(""); setNumero(""); setInicio(""); setFim(""); } }, [open]);

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("boticario_cycles").insert({
        nome: nome.trim(),
        numero_ciclo: numero ? parseInt(numero) : null,
        data_inicio: inicio || null,
        data_fim: fim || null,
        ativo: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["config"] });
      toast.success("Ciclo criado.");
      onClose();
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Novo Ciclo O Boticário</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Ciclo 12/2026" />
          </div>
          <div className="space-y-1">
            <Label>Número do Ciclo</Label>
            <Input type="number" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ex: 12" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Data Início</Label>
              <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Data Fim</Label>
              <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} min={inicio} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => mutation.mutate()} disabled={!nome.trim() || mutation.isPending}>
            {mutation.isPending ? "A criar…" : "Criar Ciclo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Importação Modal ──────────────────────────────────────────────────────────
type BoticarioProduct = {
  id: number;
  title: string;
  handle: string;
  variants: { price: string }[];
};

type ImportLine = {
  product: BoticarioProduct;
  selected: boolean;
  preco_custo: string;
  categoria: string;
};

const IMPORT_CATEGORIAS = ["Perfumaria", "Maquilhagem", "Cuidado de Pele", "Cuidado Capilar", "Corpo & Banho", "Outros"];

function ImportacaoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [lines, setLines] = useState<ImportLine[]>([]);
  const [step, setStep] = useState<"idle" | "list" | "importing">("idle");
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => { if (open) { setStep("idle"); setLines([]); setErrors([]); } }, [open]);

  async function fetchProducts() {
    setLoading(true);
    try {
      const res = await fetch("https://www.oboticario.pt/collections/all/products.json?limit=250");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const fetched: ImportLine[] = (json.products ?? []).map((p: BoticarioProduct) => ({
        product: p,
        selected: false,
        preco_custo: "",
        categoria: "Outros",
      }));
      setLines(fetched);
      setStep("list");
    } catch (e: any) {
      toast.error("Erro ao carregar produtos", { description: e.message });
    } finally {
      setLoading(false);
    }
  }

  function setLine(i: number, k: keyof ImportLine, v: any) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));
  }

  const selectedLines = lines.filter((l) => l.selected);

  const importMutation = useMutation({
    mutationFn: async () => {
      const errs: string[] = [];
      for (const l of selectedLines) {
        const slug = l.product.handle;
        const preco_venda = parseFloat(l.product.variants[0]?.price ?? "0");
        const preco_custo = parseFloat(l.preco_custo) || preco_venda * 0.5;
        const { error } = await supabase.from("products").insert({
          nome: l.product.title,
          slug,
          categoria: l.categoria,
          preco_custo,
          preco_venda,
          ativo: true,
        });
        if (error) {
          if (error.code === "23505") { // unique violation
            errs.push(`Ignorado (já existe): ${l.product.title}`);
          } else {
            errs.push(`Erro em "${l.product.title}": ${error.message}`);
          }
        }
      }
      setErrors(errs);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      const ok = selectedLines.length - errors.length;
      toast.success(`${ok} produto${ok !== 1 ? "s" : ""} importado${ok !== 1 ? "s" : ""}.`);
      if (errors.length === 0) onClose();
    },
    onError: (e: any) => toast.error("Erro na importação", { description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Importar Produtos O Boticário</DialogTitle></DialogHeader>

        {step === "idle" && (
          <div className="space-y-4 py-4">
            <div className="rounded-md bg-muted p-4 text-sm space-y-2">
              <p className="font-semibold">Como funciona:</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Carregamos o catálogo da loja O Boticário PT (JSON público)</li>
                <li>Seleccionas os produtos que queres importar</li>
                <li>Defines preço de custo e categoria para cada um</li>
                <li>Os produtos com slug já existente são ignorados (aviso)</li>
              </ol>
            </div>
            <Button className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={fetchProducts} disabled={loading}>
              {loading ? "A carregar…" : "Carregar Catálogo O Boticário"}
            </Button>
          </div>
        )}

        {step === "list" && (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{lines.length} produtos carregados · {selectedLines.length} seleccionados</span>
              <Button variant="ghost" size="sm" onClick={() => setLines((ls) => ls.map((l) => ({ ...l, selected: !l.selected })))}>
                Seleccionar todos
              </Button>
            </div>
            <div className="border rounded-md divide-y max-h-[40vh] overflow-y-auto">
              {lines.map((l, i) => (
                <div key={l.product.id} className={`flex items-center gap-3 px-3 py-2 ${l.selected ? "bg-muted/50" : ""}`}>
                  <Checkbox checked={l.selected} onCheckedChange={(v) => setLine(i, "selected", !!v)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{l.product.title}</p>
                    <p className="text-xs text-muted-foreground">PVP: €{l.product.variants[0]?.price}</p>
                  </div>
                  {l.selected && (
                    <div className="flex items-center gap-2 shrink-0">
                      <Input
                        type="number" min="0" step="0.01"
                        placeholder="€ custo"
                        className="w-24 h-7 text-xs"
                        value={l.preco_custo}
                        onChange={(e) => setLine(i, "preco_custo", e.target.value)}
                      />
                      <Select value={l.categoria} onValueChange={(v) => setLine(i, "categoria", v)}>
                        <SelectTrigger className="w-36 h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {IMPORT_CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {errors.length > 0 && (
              <div className="rounded-md bg-orange-50 dark:bg-orange-950 border border-orange-200 p-3 space-y-1">
                <p className="text-sm font-semibold flex items-center gap-2 text-orange-800 dark:text-orange-200">
                  <AlertTriangle className="h-4 w-4" /> Avisos
                </p>
                {errors.map((e, i) => <p key={i} className="text-xs text-orange-700 dark:text-orange-300">{e}</p>)}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          {step === "list" && (
            <Button
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={() => importMutation.mutate()}
              disabled={selectedLines.length === 0 || importMutation.isPending}
            >
              {importMutation.isPending ? "A importar…" : `Importar ${selectedLines.length} produto${selectedLines.length !== 1 ? "s" : ""}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
const EMPRESA_KEY = "secrets_vip_empresa";

function ConfiguracoesPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["config"], queryFn: fetchConfigData });

  const [changeRoleUser, setChangeRoleUser] = useState<UserRow | null>(null);
  const [novaRepOpen, setNovaRepOpen] = useState(false);
  const [novoCicloOpen, setNovoCicloOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // Empresa form (localStorage)
  const [empresa, setEmpresa] = useState(() => {
    try { return JSON.parse(localStorage.getItem(EMPRESA_KEY) ?? "{}"); } catch { return {}; }
  });

  function saveEmpresa() {
    localStorage.setItem(EMPRESA_KEY, JSON.stringify(empresa));
    toast.success("Dados da empresa guardados.");
  }

  const activateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error: e1 } = await supabase.from("boticario_cycles").update({ ativo: false }).neq("id", "00000000-0000-0000-0000-000000000000");
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("boticario_cycles").update({ ativo: true }).eq("id", id);
      if (e2) throw e2;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["config"] }); toast.success("Ciclo activado."); },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Sistema</p>
        <h1 className="text-3xl md:text-4xl font-display font-semibold mt-1">Configurações</h1>
        <p className="text-muted-foreground mt-2">Gestão de utilizadores, ciclos e configurações da plataforma.</p>
      </header>

      <Tabs defaultValue="utilizadores">
        <TabsList className="mb-6">
          <TabsTrigger value="utilizadores" className="data-[state=active]:border-b-2 data-[state=active]:border-accent">
            <Users className="h-4 w-4 mr-1.5" /> Utilizadores
          </TabsTrigger>
          <TabsTrigger value="ciclos" className="data-[state=active]:border-b-2 data-[state=active]:border-accent">
            <RefreshCw className="h-4 w-4 mr-1.5" /> Ciclos
          </TabsTrigger>
          <TabsTrigger value="empresa" className="data-[state=active]:border-b-2 data-[state=active]:border-accent">
            <Building2 className="h-4 w-4 mr-1.5" /> Empresa
          </TabsTrigger>
          <TabsTrigger value="importacao" className="data-[state=active]:border-b-2 data-[state=active]:border-accent">
            <Upload className="h-4 w-4 mr-1.5" /> Importação
          </TabsTrigger>
        </TabsList>

        {/* ── Utilizadores ── */}
        <TabsContent value="utilizadores" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold text-lg">Utilizadores da Plataforma</h2>
            <Button className="bg-accent text-accent-foreground hover:bg-accent/90" size="sm" onClick={() => setNovaRepOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Nova Representante
            </Button>
          </div>
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-primary hover:bg-primary">
                  <TableHead className="text-primary-foreground">Nome</TableHead>
                  <TableHead className="text-primary-foreground">Email</TableHead>
                  <TableHead className="text-primary-foreground">Role</TableHead>
                  <TableHead className="text-primary-foreground">Criado em</TableHead>
                  <TableHead className="text-primary-foreground"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">A carregar…</TableCell></TableRow>
                )}
                {(data?.users ?? []).map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.nome}</TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      {u.role === "admin"
                        ? <Badge className="bg-accent text-accent-foreground hover:bg-accent">Admin</Badge>
                        : <Badge variant="secondary">Representante</Badge>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{fmtDate(u.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => setChangeRoleUser(u)}>
                        Alterar Role
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ── Ciclos ── */}
        <TabsContent value="ciclos" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold text-lg">Ciclos O Boticário</h2>
            <Button variant="outline" size="sm" onClick={() => setNovoCicloOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Novo Ciclo
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {isLoading && <p className="text-sm text-muted-foreground">A carregar…</p>}
            {(data?.cycles ?? []).map((c) => (
              <Card key={c.id} className={`p-4 space-y-2 ${c.ativo ? "ring-2 ring-accent" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{c.nome}</p>
                    {c.numero_ciclo && <p className="text-xs text-muted-foreground">Ciclo nº {c.numero_ciclo}</p>}
                  </div>
                  {c.ativo
                    ? <Badge className="bg-accent text-accent-foreground hover:bg-accent shrink-0">Activo</Badge>
                    : <Badge variant="secondary" className="shrink-0">Inactivo</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {c.data_inicio ? new Date(c.data_inicio).toLocaleDateString("pt-PT") : "—"} →{" "}
                  {c.data_fim ? new Date(c.data_fim).toLocaleDateString("pt-PT") : "—"}
                </p>
                {!c.ativo && (
                  <Button variant="outline" size="sm" className="self-start" onClick={() => activateMutation.mutate(c.id)} disabled={activateMutation.isPending}>
                    Activar
                  </Button>
                )}
              </Card>
            ))}
            {!isLoading && (data?.cycles ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground col-span-full">Nenhum ciclo criado ainda.</p>
            )}
          </div>
        </TabsContent>

        {/* ── Empresa ── */}
        <TabsContent value="empresa">
          <Card className="p-6 max-w-lg space-y-5">
            <h2 className="font-display font-semibold text-lg">Dados da Empresa</h2>
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Nome da Empresa</Label>
                <Input value={empresa.nome ?? ""} onChange={(e) => setEmpresa((x: any) => ({ ...x, nome: e.target.value }))} placeholder="Secrets VIP Lda." />
              </div>
              <div className="space-y-1">
                <Label>NIF</Label>
                <Input value={empresa.nif ?? ""} onChange={(e) => setEmpresa((x: any) => ({ ...x, nif: e.target.value }))} placeholder="500 000 000" />
              </div>
              <div className="space-y-1">
                <Label>Morada Fiscal</Label>
                <Input value={empresa.morada ?? ""} onChange={(e) => setEmpresa((x: any) => ({ ...x, morada: e.target.value }))} placeholder="Rua, nº, Código Postal, Cidade" />
              </div>
            </div>
            <Button className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={saveEmpresa}>
              Guardar
            </Button>
            <p className="text-xs text-muted-foreground">Os dados são guardados localmente neste browser.</p>
          </Card>
        </TabsContent>

        {/* ── Importação ── */}
        <TabsContent value="importacao">
          <Card className="p-6 max-w-xl space-y-5">
            <h2 className="font-display font-semibold text-lg">Importar Produtos O Boticário</h2>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>Importa o catálogo de produtos directamente da loja online O Boticário PT.</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Os produtos com slug já existente são ignorados (sem duplicados)</li>
                <li>Podes definir preço de custo e categoria por produto</li>
                <li>Após importação, edita os produtos em <strong>Produtos</strong></li>
              </ul>
            </div>
            <Button className="bg-accent text-accent-foreground hover:bg-accent/90 flex items-center gap-2" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" /> Importar do Boticário
            </Button>
          </Card>
        </TabsContent>
      </Tabs>

      <ChangeRoleModal user={changeRoleUser} onClose={() => setChangeRoleUser(null)} />
      <NovaRepModal open={novaRepOpen} onClose={() => setNovaRepOpen(false)} />
      <NovoCicloModal open={novoCicloOpen} onClose={() => setNovoCicloOpen(false)} />
      <ImportacaoModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
