import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Tag } from "lucide-react";

export const Route = createFileRoute("/_authenticated/promocoes")({
  head: () => ({ meta: [{ title: "Promoções — Secrets VIP" }] }),
  component: PromocoesPage,
});

function PromocoesPage() {
  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Marketing</p>
        <h1 className="text-3xl md:text-4xl font-display font-semibold mt-1">Promoções</h1>
        <p className="text-muted-foreground mt-2">Gestão de promoções e descontos.</p>
      </header>
      <Card className="p-10 flex flex-col items-center gap-4 text-center">
        <div className="h-14 w-14 rounded-full bg-secondary text-primary flex items-center justify-center">
          <Tag className="h-7 w-7" />
        </div>
        <div>
          <p className="text-lg font-display font-semibold">Em construção</p>
          <p className="text-sm text-muted-foreground mt-1">
            O módulo de Promoções está a ser desenvolvido e estará disponível em breve.
          </p>
        </div>
      </Card>
    </div>
  );
}
