/**
 * Cria o utilizador admin e atribui o role.
 *
 * Pré-requisito: adiciona ao .env (nunca commites este valor):
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *
 * Execução:
 *   bun run scripts/fix-auth.ts
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "❌  Faltam variáveis de ambiente.\n" +
      "   Adiciona SUPABASE_SERVICE_ROLE_KEY ao ficheiro .env e tenta novamente."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EMAIL = "90moser@gmail.com";
const PASSWORD = "Boticario2026";
const NOME = "Moser Admin";

async function main() {
  console.log(`⏳  A criar utilizador ${EMAIL}…`);

  // Verificar se já existe
  const { data: existing } = await supabase.auth.admin.listUsers();
  const alreadyExists = existing?.users?.find((u) => u.email === EMAIL);

  let userId: string;

  if (alreadyExists) {
    console.log("ℹ️   Utilizador já existe — a actualizar password e metadata…");
    const { data: updated, error: updErr } = await supabase.auth.admin.updateUserById(
      alreadyExists.id,
      {
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { nome: NOME },
      }
    );
    if (updErr) { console.error("❌  Erro ao actualizar:", updErr.message); process.exit(1); }
    userId = updated.user!.id;
    console.log("✅  Utilizador actualizado:", userId);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { nome: NOME },
    });
    if (error) { console.error("❌  Erro ao criar utilizador:", error.message); process.exit(1); }
    userId = data.user!.id;
    console.log("✅  Utilizador criado:", userId);
  }

  // Garantir role admin
  const { data: existingRole } = await supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (existingRole) {
    console.log("ℹ️   Role admin já atribuído.");
  } else {
    const { error: roleError } = await supabase
      .from("user_roles")
      .insert({ user_id: userId, role: "admin" });
    if (roleError) {
      console.error("❌  Erro ao atribuir role admin:", roleError.message);
      process.exit(1);
    }
    console.log("✅  Role admin atribuído.");
  }

  console.log("\n🎉  Concluído. Credenciais:");
  console.log(`   Email:    ${EMAIL}`);
  console.log(`   Password: ${PASSWORD}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
