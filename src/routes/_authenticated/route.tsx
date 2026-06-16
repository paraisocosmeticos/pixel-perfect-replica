import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    console.log('BEFORELOAD getUser ERROR:', JSON.stringify(error));
    console.log('BEFORELOAD getUser DATA:', JSON.stringify(data));
    if (error || !data.user) {
      console.log('BEFORELOAD redirecting to /auth — auto-signOut disabled for debug');
      throw redirect({ to: "/auth" });
    }
    return { user: data.user };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});