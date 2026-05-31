export type Role = 'admin' | 'comercial'

export interface Profile {
  id: string
  role: Role
  name: string
  zone: string
  commission_direct: number
  commission_reseller: number
  active: boolean
}

export interface Product {
  id: string
  name: string
  code: string
  category: string
  catalog_price: number
  cost_price: number
  expiry_date: string
  cycle: string
  created_at: string
}

export interface Purchase {
  id: string
  product_id: string
  quantity: number
  unit_price: number
  date: string
}

export interface Sale {
  id: string
  product_id: string
  customer_id: string
  quantity: number
  sale_price: number
  payment_method: string
  profit: number
  date: string
}

export interface Customer {
  id: string
  name: string
  phone: string
  email: string
}

export interface CreditSale {
  id: string
  sale_id: string
  amount: number
  due_date: string
  status: 'pendente' | 'pago'
}

export interface Reseller {
  id: string
  salon_name: string
  contact_name: string
  address: string
  phone: string
  commission_rate: number
  comercial_id: string
  last_visit_date: string
  active: boolean
}

export interface ResellerStock {
  id: string
  reseller_id: string
  product_id: string
  quantity: number
  date: string
}

export interface ResellerSale {
  id: string
  reseller_id: string
  product_id: string
  quantity: number
  sale_price: number
  comercial_id: string
  date: string
}

export interface ResellerReturn {
  id: string
  reseller_id: string
  product_id: string
  quantity: number
  date: string
}

export interface StockAdjustment {
  id: string
  product_id: string
  type: 'entrada' | 'saida'
  reason: string
  quantity: number
  notes: string
  date: string
}

export interface Order {
  id: string
  comercial_id: string
  reseller_id: string
  product_id: string
  quantity: number
  notes: string
  status: 'pendente' | 'aprovado' | 'rejeitado'
  created_at: string
}

export interface ComercialDirectSale {
  id: string
  comercial_id: string
  product_id: string
  customer_name: string
  quantity: number
  sale_price: number
  commission_25: number
  date: string
}
