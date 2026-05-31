import { type LucideIcon } from 'lucide-react'
import { Card } from '../ui/Card'
import { formatCurrency } from '../../lib/utils'

interface StatCardProps {
  title: string
  value: number
  icon?: LucideIcon
  isCurrency?: boolean
  className?: string
  accent?: boolean
}

export function StatCard({ title, value, icon: Icon, isCurrency = true, className, accent }: StatCardProps) {
  return (
    <Card className={className}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</p>
          <p className={`text-2xl font-bold mt-1 ${accent ? 'text-[#b8973a]' : 'text-[#1a3a2a]'}`}>
            {isCurrency ? formatCurrency(value) : value}
          </p>
        </div>
        {Icon && (
          <div className="p-2 bg-[#1a3a2a]/10 rounded-lg">
            <Icon size={20} className="text-[#1a3a2a]" />
          </div>
        )}
      </div>
    </Card>
  )
}
