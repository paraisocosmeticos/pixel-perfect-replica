import { useState, type ReactNode } from 'react'
import { useNavigate, useLocation } from '@tanstack/react-router'
import {
  LayoutDashboard, Package, Store, ShoppingBag, TrendingUp,
  ShoppingCart, Users, CreditCard, BarChart3, UserCog, Settings,
  LogOut, Menu
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { cn } from '../../lib/utils'

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { label: 'Stock', icon: Package, path: '/stock' },
  { label: 'Salões', icon: Store, path: '/saloes' },
  { label: 'Produtos', icon: ShoppingBag, path: '/produtos' },
  { label: 'Vendas', icon: TrendingUp, path: '/vendas' },
  { label: 'Compras', icon: ShoppingCart, path: '/compras' },
  { label: 'Clientes', icon: Users, path: '/clientes' },
  { label: 'Fiado', icon: CreditCard, path: '/fiado' },
  { label: 'Relatórios', icon: BarChart3, path: '/relatorios' },
  { label: 'Equipa', icon: UserCog, path: '/equipa' },
  { label: 'Config', icon: Settings, path: '/config' },
]

export function AdminLayout({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    navigate({ to: '/' })
  }

  const Sidebar = ({ mobile = false }) => (
    <nav className={cn(
      'flex flex-col h-full bg-[#1a3a2a] text-white',
      mobile ? 'w-64' : 'w-56'
    )}>
      <div className="p-4 border-b border-white/10">
        <h1 className="text-[#b8973a] font-bold text-lg leading-tight">Secrets VIP</h1>
        <p className="text-white/50 text-xs mt-0.5">O Boticário</p>
      </div>
      <ul className="flex-1 overflow-y-auto py-2">
        {navItems.map((item) => {
          const active = location.pathname === item.path
          return (
            <li key={item.path}>
              <button
                onClick={() => { navigate({ to: item.path }); setMobileOpen(false) }}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left',
                  active
                    ? 'bg-[#b8973a] text-white font-medium'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                )}
              >
                <item.icon size={18} />
                {item.label}
              </button>
            </li>
          )
        })}
      </ul>
      <div className="p-4 border-t border-white/10">
        <p className="text-white/50 text-xs truncate mb-2">{profile?.name}</p>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 text-white/70 hover:text-white text-sm transition-colors"
        >
          <LogOut size={16} /> Sair
        </button>
      </div>
    </nav>
  )

  return (
    <div className="flex h-screen bg-[#faf7f0]">
      {/* Desktop sidebar */}
      <div className="hidden md:flex flex-col flex-shrink-0">
        <Sidebar />
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="relative z-50">
            <Sidebar mobile />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-[#1a3a2a] text-white flex-shrink-0">
          <button onClick={() => setMobileOpen(true)}>
            <Menu size={22} />
          </button>
          <h1 className="text-[#b8973a] font-bold">Secrets VIP</h1>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
