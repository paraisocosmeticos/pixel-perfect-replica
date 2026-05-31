# Secrets VIP O Boticário

Plataforma de gestão para a loja Secrets VIP O Boticário.

## Stack
- React + TypeScript + Vite
- TanStack Router
- Supabase (Auth + Database)
- Tailwind CSS v4

## Setup

### 1. Clonar e instalar
```bash
git clone <repo>
cd secrets-vip-boticario
npm install
```

### 2. Configurar variáveis de ambiente
Copia `.env.example` para `.env` e preenche com as tuas credenciais do Supabase.

### 3. Base de dados
No Supabase SQL Editor, executa `supabase/schema.sql`.

### 4. Conta admin
No Supabase > Authentication > Users, cria o utilizador admin.
O sistema cria automaticamente o perfil como `admin`.

### 5. Comerciais
Usa Admin > Equipa para criar as contas das comerciais.

### 6. Executar
```bash
npm run dev
```
