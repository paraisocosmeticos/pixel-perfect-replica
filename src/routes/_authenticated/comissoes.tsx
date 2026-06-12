import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Coins } from "lucide-react";

export const Route = createFileRoute("/_authenticated/comissoes")({
  head: () => ({
    meta: [{ title: "Comissões — Secrets VIP" }],
  }),
  component: ComissoesPage,
});

function ComissoesPage() {
  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Financeiro</p>
        <h1 className="text-3xl md:text-4xl font-display font-semibold mt-1">Comissões</h1>
        <p className="text-muted-foreground mt-2">Gestão e pagamento de comissões.</p>
      </header>
      <Card className="p-10 flex flex-col items-center gap-4 text-center">
        <div className="h-14 w-14 rounded-full bg-secondary text-primary flex items-center justify-center">
          <Coins className="h-7 w-7" />
        </div>
        <div>
          <p className="text-lg font-display font-semibold">Em construção</p>
          <p className="text-sm text-muted-foreground mt-1">
            O módulo de Comissões está a ser desenvolvido e estará disponível em breve.
          </p>
        </div>
      </Card>
    </div>
  );
}
