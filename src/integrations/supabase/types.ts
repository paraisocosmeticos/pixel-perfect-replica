export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      boticario_cycles: {
        Row: {
          ativo: boolean
          created_at: string
          data_fim: string | null
          data_inicio: string | null
          id: string
          nome: string
          numero_ciclo: number | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          id?: string
          nome: string
          numero_ciclo?: number | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          id?: string
          nome?: string
          numero_ciclo?: number | null
        }
        Relationships: []
      }
      commission_payments: {
        Row: {
          created_at: string
          data_pagamento: string | null
          destinatario_id: string
          destinatario_tipo: string
          id: string
          periodo: string | null
          status: Database["public"]["Enums"]["commission_status"]
          valor: number
        }
        Insert: {
          created_at?: string
          data_pagamento?: string | null
          destinatario_id: string
          destinatario_tipo: string
          id?: string
          periodo?: string | null
          status?: Database["public"]["Enums"]["commission_status"]
          valor: number
        }
        Update: {
          created_at?: string
          data_pagamento?: string | null
          destinatario_id?: string
          destinatario_tipo?: string
          id?: string
          periodo?: string | null
          status?: Database["public"]["Enums"]["commission_status"]
          valor?: number
        }
        Relationships: []
      }
      products: {
        Row: {
          ativo: boolean
          categoria: string
          created_at: string
          id: string
          nome: string
          preco_custo: number
          preco_venda: number
          slug: string
          unidade_min_stock: number
          validade_meses: number
        }
        Insert: {
          ativo?: boolean
          categoria: string
          created_at?: string
          id?: string
          nome: string
          preco_custo: number
          preco_venda: number
          slug: string
          unidade_min_stock?: number
          validade_meses?: number
        }
        Update: {
          ativo?: boolean
          categoria?: string
          created_at?: string
          id?: string
          nome?: string
          preco_custo?: number
          preco_venda?: number
          slug?: string
          unidade_min_stock?: number
          validade_meses?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          nome: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          nome: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      promotions: {
        Row: {
          ativo: boolean
          created_at: string
          data_fim: string
          data_inicio: string
          desconto_percentual: number | null
          id: string
          preco_fixo: number | null
          produto_id: string
          tipo: Database["public"]["Enums"]["promotion_type"]
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          data_fim: string
          data_inicio: string
          desconto_percentual?: number | null
          id?: string
          preco_fixo?: number | null
          produto_id: string
          tipo: Database["public"]["Enums"]["promotion_type"]
        }
        Update: {
          ativo?: boolean
          created_at?: string
          data_fim?: string
          data_inicio?: string
          desconto_percentual?: number | null
          id?: string
          preco_fixo?: number | null
          produto_id?: string
          tipo?: Database["public"]["Enums"]["promotion_type"]
        }
        Relationships: [
          {
            foreignKeyName: "promotions_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "stock_central"
            referencedColumns: ["produto_id"]
          },
        ]
      }
      purchases: {
        Row: {
          created_at: string
          cycle_id: string | null
          data_compra: string
          id: string
          nota: string | null
          preco_custo_unit: number
          produto_id: string
          quantidade: number
        }
        Insert: {
          created_at?: string
          cycle_id?: string | null
          data_compra?: string
          id?: string
          nota?: string | null
          preco_custo_unit: number
          produto_id: string
          quantidade: number
        }
        Update: {
          created_at?: string
          cycle_id?: string | null
          data_compra?: string
          id?: string
          nota?: string | null
          preco_custo_unit?: number
          produto_id?: string
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchases_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "boticario_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "stock_central"
            referencedColumns: ["produto_id"]
          },
        ]
      }
      rep_direct_sales: {
        Row: {
          cliente_nome: string | null
          comissao_rep: number
          created_at: string
          data: string
          id: string
          preco_final: number
          preco_venda: number
          produto_id: string
          quantidade: number
          representante_id: string
        }
        Insert: {
          cliente_nome?: string | null
          comissao_rep?: number
          created_at?: string
          data?: string
          id?: string
          preco_final?: number
          preco_venda: number
          produto_id: string
          quantidade: number
          representante_id: string
        }
        Update: {
          cliente_nome?: string | null
          comissao_rep?: number
          created_at?: string
          data?: string
          id?: string
          preco_final?: number
          preco_venda?: number
          produto_id?: string
          quantidade?: number
          representante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rep_direct_sales_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_direct_sales_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "stock_central"
            referencedColumns: ["produto_id"]
          },
          {
            foreignKeyName: "rep_direct_sales_representante_id_fkey"
            columns: ["representante_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      returns: {
        Row: {
          created_at: string
          data: string
          id: string
          motivo: string | null
          produto_id: string
          quantidade: number
          representante_id: string | null
          salon_id: string
        }
        Insert: {
          created_at?: string
          data?: string
          id?: string
          motivo?: string | null
          produto_id: string
          quantidade: number
          representante_id?: string | null
          salon_id: string
        }
        Update: {
          created_at?: string
          data?: string
          id?: string
          motivo?: string | null
          produto_id?: string
          quantidade?: number
          representante_id?: string | null
          salon_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "returns_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "stock_central"
            referencedColumns: ["produto_id"]
          },
          {
            foreignKeyName: "returns_representante_id_fkey"
            columns: ["representante_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      salon_sales: {
        Row: {
          cliente_nome: string | null
          comissao_rep: number
          comissao_salao: number
          created_at: string
          data: string
          id: string
          preco_final: number
          preco_venda: number
          produto_id: string
          quantidade: number
          representante_id: string | null
          salon_id: string
        }
        Insert: {
          cliente_nome?: string | null
          comissao_rep?: number
          comissao_salao?: number
          created_at?: string
          data?: string
          id?: string
          preco_final?: number
          preco_venda: number
          produto_id: string
          quantidade: number
          representante_id?: string | null
          salon_id: string
        }
        Update: {
          cliente_nome?: string | null
          comissao_rep?: number
          comissao_salao?: number
          created_at?: string
          data?: string
          id?: string
          preco_final?: number
          preco_venda?: number
          produto_id?: string
          quantidade?: number
          representante_id?: string | null
          salon_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "salon_sales_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salon_sales_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "stock_central"
            referencedColumns: ["produto_id"]
          },
          {
            foreignKeyName: "salon_sales_representante_id_fkey"
            columns: ["representante_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salon_sales_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      salon_visit_log: {
        Row: {
          created_at: string
          data: string
          id: string
          notas: string | null
          representante_id: string
          salon_id: string
        }
        Insert: {
          created_at?: string
          data?: string
          id?: string
          notas?: string | null
          representante_id: string
          salon_id: string
        }
        Update: {
          created_at?: string
          data?: string
          id?: string
          notas?: string | null
          representante_id?: string
          salon_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "salon_visit_log_representante_id_fkey"
            columns: ["representante_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salon_visit_log_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      salons: {
        Row: {
          ativo: boolean
          contacto_nome: string | null
          created_at: string
          data_inicio_parceria: string | null
          id: string
          morada: string | null
          nome: string
          nota_interna: string | null
          representante_id: string | null
          telefone: string | null
        }
        Insert: {
          ativo?: boolean
          contacto_nome?: string | null
          created_at?: string
          data_inicio_parceria?: string | null
          id?: string
          morada?: string | null
          nome: string
          nota_interna?: string | null
          representante_id?: string | null
          telefone?: string | null
        }
        Update: {
          ativo?: boolean
          contacto_nome?: string | null
          created_at?: string
          data_inicio_parceria?: string | null
          id?: string
          morada?: string | null
          nome?: string
          nota_interna?: string | null
          representante_id?: string | null
          telefone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salons_representante_id_fkey"
            columns: ["representante_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_adjustments: {
        Row: {
          created_at: string
          data: string
          id: string
          motivo: string | null
          produto_id: string
          quantidade: number
          tipo: Database["public"]["Enums"]["stock_adjustment_type"]
        }
        Insert: {
          created_at?: string
          data?: string
          id?: string
          motivo?: string | null
          produto_id: string
          quantidade: number
          tipo: Database["public"]["Enums"]["stock_adjustment_type"]
        }
        Update: {
          created_at?: string
          data?: string
          id?: string
          motivo?: string | null
          produto_id?: string
          quantidade?: number
          tipo?: Database["public"]["Enums"]["stock_adjustment_type"]
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustments_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "stock_central"
            referencedColumns: ["produto_id"]
          },
        ]
      }
      transfers: {
        Row: {
          created_at: string
          data: string
          id: string
          nota: string | null
          produto_id: string
          quantidade: number
          representante_id: string | null
          salon_id: string
        }
        Insert: {
          created_at?: string
          data?: string
          id?: string
          nota?: string | null
          produto_id: string
          quantidade: number
          representante_id?: string | null
          salon_id: string
        }
        Update: {
          created_at?: string
          data?: string
          id?: string
          nota?: string | null
          produto_id?: string
          quantidade?: number
          representante_id?: string | null
          salon_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfers_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "stock_central"
            referencedColumns: ["produto_id"]
          },
          {
            foreignKeyName: "transfers_representante_id_fkey"
            columns: ["representante_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      stock_central: {
        Row: {
          categoria: string | null
          nome: string | null
          produto_id: string | null
          stock_qg: number | null
          unidade_min_stock: number | null
          validade_meses: number | null
        }
        Insert: {
          categoria?: string | null
          nome?: string | null
          produto_id?: string | null
          stock_qg?: never
          unidade_min_stock?: number | null
          validade_meses?: number | null
        }
        Update: {
          categoria?: string | null
          nome?: string | null
          produto_id?: string | null
          stock_qg?: never
          unidade_min_stock?: number | null
          validade_meses?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "representante"
      commission_status: "pendente" | "pago"
      promotion_type: "percentual" | "preco_fixo"
      stock_adjustment_type: "entrada" | "saida" | "quebra"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "representante"],
      commission_status: ["pendente", "pago"],
      promotion_type: ["percentual", "preco_fixo"],
      stock_adjustment_type: ["entrada", "saida", "quebra"],
    },
  },
} as const
