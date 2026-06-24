import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type ComboboxProduct = {
  id: string;
  nome: string;
  preco_venda?: number;
  preco_custo?: number;
  stock?: number;
};

export function ProductCombobox({
  value,
  onChange,
  products,
  showPrice = false,
  showStock = false,
  placeholder = "Pesquisar produto…",
  disabled = false,
}: {
  value: string;
  onChange: (id: string) => void;
  products: ComboboxProduct[];
  showPrice?: boolean;
  showStock?: boolean;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = products.find((p) => p.id === value);

  const filtered = products.filter((p) =>
    p.nome.toLowerCase().includes(search.toLowerCase()),
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(p: ComboboxProduct) {
    onChange(p.id);
    setSearch("");
    setOpen(false);
  }

  function formatExtra(p: ComboboxProduct) {
    const parts: string[] = [];
    if (showPrice) {
      const price = p.preco_venda ?? p.preco_custo;
      if (price !== undefined) {
        parts.push(
          new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(price),
        );
      }
    }
    if (showStock && p.stock !== undefined) {
      parts.push(`QG: ${p.stock}`);
    }
    return parts.length ? ` — ${parts.join(" · ")}` : "";
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen((prev) => !prev);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors",
          "hover:bg-accent/40 focus:outline-none focus:ring-1 focus:ring-ring",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <span className="truncate text-left">
          {selected
            ? `${selected.nome}${formatExtra(selected)}`
            : <span className="text-muted-foreground">{placeholder}</span>}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[200px] rounded-md border bg-popover text-popover-foreground shadow-md">
          <div className="p-2">
            <Input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar…"
              className="h-8 text-sm"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto pb-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted-foreground">Nenhum produto encontrado.</li>
            )}
            {filtered.map((p) => (
              <li
                key={p.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(p)}
                className={cn(
                  "flex cursor-pointer items-center justify-between px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground",
                  p.id === value && "bg-accent/60 font-medium",
                )}
              >
                <span className="truncate">{p.nome}</span>
                {(showPrice || showStock) && (
                  <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                    {showPrice && (p.preco_venda !== undefined || p.preco_custo !== undefined) && (
                      <span>
                        {new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(
                          (p.preco_venda ?? p.preco_custo)!,
                        )}
                      </span>
                    )}
                    {showStock && p.stock !== undefined && (
                      <span className={cn("ml-1", showPrice && "border-l border-border pl-1")}>
                        QG: {p.stock}
                      </span>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
