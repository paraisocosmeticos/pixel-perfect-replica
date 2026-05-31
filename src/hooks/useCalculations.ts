import { useMemo } from 'react'
import type { ResellerSale, ComercialDirectSale } from '../types'

export function useComercialEarnings(
  resellerSales: ResellerSale[],
  directSales: ComercialDirectSale[]
) {
  return useMemo(() => {
    const fromResellers = resellerSales.reduce(
      (sum, s) => sum + s.sale_price * s.quantity * 0.1,
      0
    )
    const fromDirect = directSales.reduce((sum, s) => sum + s.commission_25, 0)
    return { fromResellers, fromDirect, total: fromResellers + fromDirect }
  }, [resellerSales, directSales])
}

export function useResellerDistribution(salePrice: number, quantity: number) {
  const total = salePrice * quantity
  return {
    salon: total * 0.25,
    comercial: total * 0.1,
    admin: total * 0.65,
    total,
  }
}
