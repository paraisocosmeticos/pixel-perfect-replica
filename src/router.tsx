import { createRouter, createRoute, createRootRoute, redirect } from '@tanstack/react-router'
import { supabase } from './lib/supabase'

import Login from './pages/Login'

import { AdminLayout } from './components/layout/AdminLayout'
import Dashboard from './pages/admin/Dashboard'
import Stock from './pages/admin/Stock'
import AdminSaloes from './pages/admin/Saloes'
import Produtos from './pages/admin/Produtos'
import Vendas from './pages/admin/Vendas'
import Compras from './pages/admin/Compras'
import Clientes from './pages/admin/Clientes'
import Fiado from './pages/admin/Fiado'
import Relatorios from './pages/admin/Relatorios'
import Equipa from './pages/admin/Equipa'
import Config from './pages/admin/Config'

import { ComercialLayout } from './components/layout/ComercialLayout'
import ComercialHome from './pages/comercial/Home'
import ComercialSaloes from './pages/comercial/Saloes'
import ComercialVendas from './pages/comercial/Vendas'
import ComercialEncomendas from './pages/comercial/Encomendas'

const getProfile = async () => {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const { data } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
  return data
}

const rootRoute = createRootRoute()

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: async () => {
    const profile = await getProfile()
    if (profile?.role === 'admin') throw redirect({ to: '/dashboard' })
    if (profile?.role === 'comercial') throw redirect({ to: '/comercial' })
  },
  component: Login,
})

// Admin routes
const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  beforeLoad: async () => {
    const profile = await getProfile()
    if (!profile) throw redirect({ to: '/' })
    if (profile.role !== 'admin') throw redirect({ to: '/comercial' })
  },
  component: () => <AdminLayout><Dashboard /></AdminLayout>,
})

const stockRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/stock',
  beforeLoad: async () => {
    const profile = await getProfile()
    if (!profile || profile.role !== 'admin') throw redirect({ to: '/' })
  },
  component: () => <AdminLayout><Stock /></AdminLayout>,
})

const saloesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/saloes',
  beforeLoad: async () => {
    const profile = await getProfile()
    if (!profile || profile.role !== 'admin') throw redirect({ to: '/' })
  },
  component: () => <AdminLayout><AdminSaloes /></AdminLayout>,
})

const produtosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/produtos',
  beforeLoad: async () => {
    const profile = await getProfile()
    if (!profile || profile.role !== 'admin') throw redirect({ to: '/' })
  },
  component: () => <AdminLayout><Produtos /></AdminLayout>,
})

const vendasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/vendas',
  beforeLoad: async () => {
    const profile = await getProfile()
    if (!profile || profile.role !== 'admin') throw redirect({ to: '/' })
  },
  component: () => <AdminLayout><Vendas /></AdminLayout>,
})

const comprasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/compras',
  beforeLoad: async () => {
    const profile = await getProfile()
    if (!profile || profile.role !== 'admin') throw redirect({ to: '/' })
  },
  component: () => <AdminLayout><Compras /></AdminLayout>,
})

const clientesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/clientes',
  beforeLoad: async () => {
    const profile = await getProfile()
    if (!profile || profile.role !== 'admin') throw redirect({ to: '/' })
  },
  component: () => <AdminLayout><Clientes /></AdminLayout>,
})

const fiadoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/fiado',
  beforeLoad: async () => {
    const profile = await getProfile()
    if (!profile || profile.role !== 'admin') throw redirect({ to: '/' })
  },
  component: () => <AdminLayout><Fiado /></AdminLayout>,
})

const relatoriosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/relatorios',
  beforeLoad: async () => {
    const profile = await getProfile()
    if (!profile || profile.role !== 'admin') throw redirect({ to: '/' })
  },
  component: () => <AdminLayout><Relatorios /></AdminLayout>,
})

const equipaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/equipa',
  beforeLoad: async () => {
    const profile = await getProfile()
    if (!profile || profile.role !== 'admin') throw redirect({ to: '/' })
  },
  component: () => <AdminLayout><Equipa /></AdminLayout>,
})

const configRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/config',
  beforeLoad: async () => {
    const profile = await getProfile()
    if (!profile || profile.role !== 'admin') throw redirect({ to: '/' })
  },
  component: () => <AdminLayout><Config /></AdminLayout>,
})

// Comercial routes
const comercialRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/comercial',
  beforeLoad: async () => {
    const profile = await getProfile()
    if (!profile) throw redirect({ to: '/' })
    if (profile.role !== 'comercial') throw redirect({ to: '/dashboard' })
  },
  component: () => <ComercialLayout><ComercialHome /></ComercialLayout>,
})

const comercialSaloesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/comercial/saloes',
  beforeLoad: async () => {
    const profile = await getProfile()
    if (!profile || profile.role !== 'comercial') throw redirect({ to: '/' })
  },
  component: () => <ComercialLayout><ComercialSaloes /></ComercialLayout>,
})

const comercialVendasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/comercial/vendas',
  beforeLoad: async () => {
    const profile = await getProfile()
    if (!profile || profile.role !== 'comercial') throw redirect({ to: '/' })
  },
  component: () => <ComercialLayout><ComercialVendas /></ComercialLayout>,
})

const comercialEncomendasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/comercial/encomendas',
  beforeLoad: async () => {
    const profile = await getProfile()
    if (!profile || profile.role !== 'comercial') throw redirect({ to: '/' })
  },
  component: () => <ComercialLayout><ComercialEncomendas /></ComercialLayout>,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  dashboardRoute, stockRoute, saloesRoute, produtosRoute,
  vendasRoute, comprasRoute, clientesRoute, fiadoRoute,
  relatoriosRoute, equipaRoute, configRoute,
  comercialRoute, comercialSaloesRoute, comercialVendasRoute, comercialEncomendasRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
