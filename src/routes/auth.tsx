import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Entrar — Secrets VIP O Boticário" },
      { name: "description", content: "Acesso à plataforma de gestão de revenda." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        navigate({ to: "/dashboard" });
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    console.log('LOGIN ERROR:', JSON.stringify(error));
    console.log('LOGIN DATA:', JSON.stringify(data));
    setLoading(false);
    if (error) {
      toast.error("Não foi possível entrar", { description: error.message });
      return;
    }
    toast.success("Bem-vindo de volta!");
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { nome },
      },
    });
    setLoading(false);
    if (error) {
      toast.error("Não foi possível criar conta", { description: error.message });
      return;
    }
    toast.success("Conta criada com sucesso!");
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--gradient-hero)" }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8 text-primary-foreground">
          <div className="inline-flex items-center gap-2 mb-3">
            <Sparkles className="h-6 w-6 text-accent" />
            <span className="text-sm uppercase tracking-[0.25em] opacity-80">EMC² Digital</span>
          </div>
          <h1 className="text-4xl font-display font-semibold">Secrets VIP</h1>
          <p className="opacity-80 mt-1 text-sm">O Boticário · Gestão de Revenda</p>
        </div>

        <Card className="p-6 shadow-xl border-0">
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid grid-cols-2 w-full mb-6">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input id="login-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Palavra-passe</Label>
                  <Input id="login-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "A entrar..." : "Entrar"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-nome">Nome</Label>
                  <Input id="signup-nome" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="O seu nome" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input id="signup-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Palavra-passe</Label>
                  <Input id="signup-password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
                  <p className="text-xs text-muted-foreground">Mínimo 6 caracteres.</p>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "A criar..." : "Criar conta"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </Card>

        <p className="text-center text-xs text-primary-foreground/70 mt-6">
          v2.0 · Powered by EMC² Digital
        </p>
      </div>
    </div>
  );
}