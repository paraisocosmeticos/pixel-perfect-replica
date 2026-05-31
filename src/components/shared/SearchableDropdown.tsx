import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'

interface Option {
  value: string
  label: string
}

interface SearchableDropdownProps {
  options: Option[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
}

export function SearchableDropdown({ options, value, onChange, placeholder = 'Selecionar...', label }: SearchableDropdownProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.value === value)
  const filtered = options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="flex flex-col gap-1" ref={ref}>
      {label && <label className="text-sm font-medium text-gray-700">{label}</label>}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-left flex items-center justify-between bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a2a]"
        >
          <span className={selected ? 'text-gray-900' : 'text-gray-400'}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDown size={16} className="text-gray-400" />
        </button>
        {open && (
          <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar..."
              className="w-full px-3 py-2 text-sm border-b border-gray-200 focus:outline-none"
            />
            <ul className="max-h-48 overflow-y-auto">
              {filtered.map((o) => (
                <li
                  key={o.value}
                  onClick={() => { onChange(o.value); setOpen(false); setSearch('') }}
                  className={cn(
                    'px-3 py-2 text-sm cursor-pointer hover:bg-[#1a3a2a]/5',
                    o.value === value && 'bg-[#1a3a2a]/10 font-medium'
                  )}
                >
                  {o.label}
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="px-3 py-2 text-sm text-gray-400">Sem resultados</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
