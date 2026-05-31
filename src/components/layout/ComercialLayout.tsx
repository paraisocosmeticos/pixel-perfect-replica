import { type ReactNode } from 'react'
import { useNavigate, useLocation } from '@tanstack/react-router'
import { Home, Store, TrendingUp, ClipboardList, LogOut } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { cn } from '../../lib/utils'

const navItems = [
  { label: 'Home', icon: Home, path: '/comercial' },
  { label: 'Salões', icon: Store, path: '/comercial/saloes' },
  { label: 'Vendas', icon: TrendingUp, path: '/comercial/vendas' },
  { label: 'Encomendas', icon: ClipboardList, path: '/comercial/encomendas' },
]

export function ComercialLayout({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const handleSignOut = async () => {
    await signOut()
    navigate({ to: '/' })
  }

  return (
    <div className="flex flex-col h-screen bg-[#faf7f0]">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-[#1a3a2a] text-white flex-shrink-0">
        <h1 className="text-[#b8973a] font-bold">Secrets VIP</h1>
        <div className="flex items-center gap-3">
          <span className="text-white/70 text-sm">{profile?.name}</span>
          <button onClick={handleSignOut} className="text-white/70 hover:text-white">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-4 pb-20">
        {children}
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 flex bg-white border-t border-gray-200 z-30">
        {navItems.map((item) => {
          const active = location.pathname === item.path
          return (
            <button
              key={item.path}
              onClick={() => navigate({ to: item.path })}
              className={cn(
                'flex-1 flex flex-col items-center gap-1 py-2 text-xs font-medium transition-colors',
                active ? 'text-[#b8973a]' : 'text-gray-400 hover:text-gray-600'
              )}
            >
              <item.icon size={20} />
              {item.label}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
