import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { FileText, Upload, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────
type Cycle = { id: string; nome: string; ativo: boolean };

type ParsedLine = {
  codigo: string;         // 5-digit Boticário product code
  descricao: string;
  categoria: string;
  quantidade: number;
  pvp: number;
  subTotal: number;
  pctDesc: number;        // % desconto CB
  ganhoscb: number;       // ganhos CB
  pcb: number;            // PCB a pagar
  custUnit: number;       // calculated unit cost
};

type PreviewRow = ParsedLine & {
  produtoId: string | null;   // found in app
  produtoNome: string | null; // nome from app
  status: "found" | "notfound" | "ignore";
  selected: boolean;
  // for "notfound" creation
  newNome: string;
  newCategoria: string;
  newPrecoVenda: string;
};

// ── PDF text extraction ────────────────────────────────────────────────────────
async function extractTextFromPDF(file: File): Promise<string> {
  // Dynamic import to avoid SSR issues
  const pdfjsLib = await import("pdfjs-dist");
  // Set worker src — use bundled worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const texts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item: any) => item.str).join(" ");
    texts.push(pageText);
  }
  return texts.join("\n");
}

// ── Parser ────────────────────────────────────────────────────────────────────
// Boticário invoice columns:
// Prod. | Catálogo | Descrição | Categoria | Qtd | PVP Un. | Sub Total | % desc.CB | Ganhos CB | PCB a pagar | IVA
//
// Strategy: extract tokens around 5-digit product codes.
// Each product row starts with a 5-digit code.
function parseBoticarioText(text: string): ParsedLine[] {
  const lines = text.split(/\n|\r/).map((l) => l.trim()).filter(Boolean);
  const results: ParsedLine[] = [];

  // Join all lines into one string for pattern matching
  const full = lines.join(" ");

  // Pattern: 5-digit code followed by catalog code (alphanumeric), description, category,
  // then numbers for qty, pvp, subtotal, %desc, ganhos, pcb, iva
  // We look for sequences: DDDDD (catalog) text... numbers
  // Since PDF text extraction varies, we use a flexible multi-token approach.

  // Split into tokens
  const tokens = full.split(/\s+/);

  const ptNum = (s: string): number => {
    // Portuguese number: 1.234,56 → 1234.56
    return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
  };

  const isPtNum = (s: string) => /^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$/.test(s);
  const is5Digit = (s: string) => /^\d{5}$/.test(s);

  let i = 0;
  while (i < tokens.length) {
    if (!is5Digit(tokens[i])) { i++; continue; }

    const codigo = tokens[i];
    i++;

    // Skip catalog code (alphanumeric, not a number block)
    if (i < tokens.length && !isPtNum(tokens[i])) i++;

    // Collect description tokens until we hit a sequence of numbers
    const descTokens: string[] = [];
    while (i < tokens.length && !isPtNum(tokens[i])) {
      descTokens.push(tokens[i]);
      i++;
    }
    const descricaoRaw = descTokens.join(" ");

    // Last word of description might be the category — heuristic: category is ALL CAPS single word
    let descricao = descricaoRaw;
    let categoria = "";
    const words = descricaoRaw.split(" ");
    if (words.length > 1) {
      const last = words[words.length - 1];
      if (/^[A-ZÁÉÍÓÚÂÊÔÃÕÜÇÑ\-\/]+$/.test(last) && last.length > 2) {
        categoria = last;
        descricao = words.slice(0, -1).join(" ");
      }
    }

    // Collect up to 7 numeric tokens: qty, pvp, subTotal, %desc, ganhos, pcb, iva
    const nums: number[] = [];
    while (i < tokens.length && nums.length < 7) {
      if (isPtNum(tokens[i])) {
        nums.push(ptNum(tokens[i]));
        i++;
      } else {
        break;
      }
    }

    if (nums.length < 3) continue; // not enough data

    const [quantidade, pvp, subTotal, pctDesc = 0, ganhoscb = 0, pcb = 0] = nums;
    if (!quantidade || quantidade <= 0) continue;

    // Calculate unit cost
    let custUnit: number;
    if (pcb > 0) {
      custUnit = Math.round((pcb / quantidade) * 100) / 100;
    } else if (pctDesc >= 100) {
      custUnit = 0; // free promotional item
    } else {
      custUnit = Math.round((subTotal / quantidade) * 100) / 100;
    }

    results.push({
      codigo,
      descricao: descricao.trim() || `Produto ${codigo}`,
      categoria: categoria || "Outros",
      quantidade,
      pvp,
      subTotal,
      pctDesc,
      ganhoscb,
      pcb,
      custUnit,
    });
  }

  return results;
}

// ── Main component ─────────────────────────────────────────────────────────────
export function ImportarFaturaPDFButton({ cycles }: { cycles: Cycle[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <FileText className="h-4 w-4 mr-2" /> Importar Fatura PDF
      </Button>
      <ImportarFaturaPDFModal open={open} onClose={() => setOpen(false)} cycles={cycles} />
    </>
  );
}

function ImportarFaturaPDFModal({
  open,
  onClose,
  cycles,
}: {
  open: boolean;
  onClose: () => void;
  cycles: Cycle[];
}) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [cycleId, setCycleId] = useState(() => cycles.find((c) => c.ativo)?.id ?? "");
  const [dataCompra, setDataCompra] = useState(new Date().toISOString().slice(0, 10));
  const [parseError, setParseError] = useState("");

  // Load all products (slug = 5-digit code)
  const { data: appProducts = [] } = useQuery({
    queryKey: ["products-slug"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id,nome,slug,categoria,preco_venda,preco_custo").eq("ativo", true);
      return (data ?? []) as { id: string; nome: string; slug: string; categoria: string; preco_venda: number; preco_custo: number }[];
    },
    enabled: open,
  });

  const CATEGORIAS = ["Perfumaria", "Maquilhagem", "Cuidado de Pele", "Cuidado Capilar", "Corpo & Banho", "Outros"];

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    setParseError("");
    setRows([]);
    try {
      const text = await extractTextFromPDF(file);
      const parsed = parseBoticarioText(text);
      if (parsed.length === 0) {
        setParseError("Não foi possível extrair linhas de produto. Verifica se o PDF é da fatura O Boticário.");
        setParsing(false);
        return;
      }
      // Cross-reference with app products by slug prefix
      const preview: PreviewRow[] = parsed.map((line) => {
        // slug in app is like "12345-nome-do-produto-TIMESTAMP" — starts with the 5-digit code
        const match = appProducts.find(
          (p) => p.slug === line.codigo || p.slug.startsWith(line.codigo + "-") || p.slug.startsWith(line.codigo),
        );
        return {
          ...line,
          produtoId: match?.id ?? null,
          produtoNome: match?.nome ?? null,
          status: match ? "found" : "notfound",
          selected: true,
          newNome: line.descricao,
          newCategoria: line.categoria,
          newPrecoVenda: String(line.pvp),
        };
      });
      setRows(preview);
    } catch (err: any) {
      setParseError(`Erro ao ler PDF: ${err.message}`);
    }
    setParsing(false);
    // reset input so same file can be re-uploaded
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function toggleRow(i: number) {
    setRows((rs) => rs.map((r, idx) => idx === i ? { ...r, selected: !r.selected } : r));
  }

  function setStatus(i: number, status: PreviewRow["status"]) {
    setRows((rs) => rs.map((r, idx) => idx === i ? { ...r, status, selected: status !== "ignore" } : r));
  }

  function updateRow(i: number, patch: Partial<PreviewRow>) {
    setRows((rs) => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }

  const selectedRows = rows.filter((r) => r.selected && r.status !== "ignore");
  const toImport = selectedRows.length;

  const importMutation = useMutation({
    mutationFn: async () => {
      const today = dataCompra;
      const inserts: any[] = [];

      for (const row of selectedRows) {
        let produtoId = row.produtoId;

        // Create product if not found
        if (row.status === "notfound") {
          const slug = row.codigo + "-" + row.newNome.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) + "-" + Date.now();
          const { data: newProd, error } = await supabase.from("products").insert({
            nome: row.newNome.trim() || row.descricao,
            categoria: row.newCategoria || "Outros",
            slug,
            preco_custo: row.custUnit,
            preco_venda: parseFloat(row.newPrecoVenda) || row.pvp,
            unidade_min_stock: 5,
            validade_meses: 24,
            ativo: true,
          }).select("id").single();
          if (error) throw new Error(`Criar produto "${row.newNome}": ${error.message}`);
          produtoId = newProd.id;
        }

        if (!produtoId) continue;

        inserts.push({
          produto_id: produtoId,
          quantidade: row.quantidade,
          preco_custo_unit: row.custUnit,
          data_compra: today,
          cycle_id: cycleId || null,
        });
      }

      if (inserts.length === 0) throw new Error("Nenhuma linha válida para importar.");
      const { error } = await supabase.from("purchases").insert(inserts);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compras"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["custo-medio"] });
      toast.success(`${toImport} ${toImport === 1 ? "linha importada" : "linhas importadas"} com sucesso.`);
      onClose();
      setRows([]);
    },
    onError: (e: any) => toast.error("Erro ao importar", { description: e.message }),
  });

  function handleClose() {
    if (!importMutation.isPending) { setRows([]); setParseError(""); onClose(); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Importar Fatura PDF — O Boticário
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Upload area */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Ficheiro PDF</Label>
                <label
                  className={cn(
                    "flex items-center gap-2 cursor-pointer rounded-md border border-dashed border-border px-3 py-2 text-sm hover:bg-accent/30 transition-colors",
                    parsing && "opacity-50 pointer-events-none",
                  )}
                >
                  <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground truncate">
                    {parsing ? "A processar…" : "Clica para escolher PDF"}
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={handleFile}
                    disabled={parsing}
                  />
                </label>
              </div>
              <div className="space-y-1">
                <Label>Ciclo</Label>
                <Select value={cycleId || "none"} onValueChange={(v) => setCycleId(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Sem ciclo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem ciclo</SelectItem>
                    {cycles.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}{c.ativo ? " ✓" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Data da Compra</Label>
                <Input type="date" value={dataCompra} onChange={(e) => setDataCompra(e.target.value)} />
              </div>
            </div>

            {parseError && (
              <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{parseError}</span>
              </div>
            )}
          </div>

          {/* Preview table */}
          {rows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  {rows.length} {rows.length === 1 ? "linha extraída" : "linhas extraídas"} —{" "}
                  <span className="text-accent font-semibold">{toImport} seleccionadas</span>
                </p>
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" /> Encontrado
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-orange-400" /> Novo produto
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-gray-300" /> Ignorar
                  </span>
                </div>
              </div>

              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-primary hover:bg-primary">
                      <TableHead className="text-primary-foreground w-8"></TableHead>
                      <TableHead className="text-primary-foreground">Código</TableHead>
                      <TableHead className="text-primary-foreground">Nome / App</TableHead>
                      <TableHead className="text-primary-foreground text-right">Qtd</TableHead>
                      <TableHead className="text-primary-foreground text-right">Custo Un.</TableHead>
                      <TableHead className="text-primary-foreground text-right">PCB</TableHead>
                      <TableHead className="text-primary-foreground text-right">PVP</TableHead>
                      <TableHead className="text-primary-foreground text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, i) => (
                      <TableRow
                        key={i}
                        className={cn(
                          row.status === "ignore" && "opacity-40",
                        )}
                      >
                        <TableCell>
                          <Checkbox
                            checked={row.selected && row.status !== "ignore"}
                            disabled={row.status === "ignore"}
                            onCheckedChange={() => toggleRow(i)}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs">{row.codigo}</TableCell>
                        <TableCell className="max-w-[220px]">
                          {row.status === "found" ? (
                            <span className="text-sm font-medium">{row.produtoNome}</span>
                          ) : row.status === "notfound" ? (
                            <div className="space-y-1">
                              <Input
                                className="h-7 text-xs"
                                value={row.newNome}
                                onChange={(e) => updateRow(i, { newNome: e.target.value })}
                                placeholder="Nome do produto"
                              />
                              <div className="flex gap-1">
                                <Select value={row.newCategoria} onValueChange={(v) => updateRow(i, { newCategoria: v })}>
                                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {CATEGORIAS.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                                <Input
                                  className="h-7 text-xs w-20"
                                  type="number"
                                  placeholder="PVP"
                                  value={row.newPrecoVenda}
                                  onChange={(e) => updateRow(i, { newPrecoVenda: e.target.value })}
                                />
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">{row.descricao}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm">{row.quantidade}</TableCell>
                        <TableCell className="text-right text-sm font-semibold">
                          {new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(row.custUnit)}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {row.pcb > 0
                            ? new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(row.pcb)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(row.pvp)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Select
                            value={row.status}
                            onValueChange={(v) => setStatus(i, v as PreviewRow["status"])}
                          >
                            <SelectTrigger className="h-7 w-36 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="found" disabled={!row.produtoId} className="text-xs">
                                ✅ Encontrado
                              </SelectItem>
                              <SelectItem value="notfound" className="text-xs">
                                🟠 Novo produto
                              </SelectItem>
                              <SelectItem value="ignore" className="text-xs">
                                ⚪ Ignorar
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={importMutation.isPending}>
            Cancelar
          </Button>
          {rows.length > 0 && (
            <Button
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={() => importMutation.mutate()}
              disabled={toImport === 0 || importMutation.isPending}
            >
              {importMutation.isPending
                ? "A importar…"
                : `Importar ${toImport} ${toImport === 1 ? "produto" : "produtos"}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
