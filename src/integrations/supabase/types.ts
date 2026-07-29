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
      calificaciones: {
        Row: {
          calificado_id: string
          created_at: string
          id: string
          nota: number
          partido_id: string
          votante_id: string
        }
        Insert: {
          calificado_id: string
          created_at?: string
          id?: string
          nota: number
          partido_id: string
          votante_id: string
        }
        Update: {
          calificado_id?: string
          created_at?: string
          id?: string
          nota?: number
          partido_id?: string
          votante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calificaciones_calificado_id_fkey"
            columns: ["calificado_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calificaciones_calificado_id_fkey"
            columns: ["calificado_id"]
            isOneToOne: false
            referencedRelation: "ranking_jugadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calificaciones_partido_id_fkey"
            columns: ["partido_id"]
            isOneToOne: false
            referencedRelation: "partidos"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracion_global: {
        Row: {
          clave: string
          updated_at: string
          valor: Json
        }
        Insert: {
          clave: string
          updated_at?: string
          valor: Json
        }
        Update: {
          clave?: string
          updated_at?: string
          valor?: Json
        }
        Relationships: []
      }
      estadisticas_partido: {
        Row: {
          asistencias: number
          created_at: string
          declarado: boolean
          equipo: Database["public"]["Enums"]["equipo_color"]
          goles: number
          id: string
          jugador_id: string
          pagado: boolean
          pagado_at: string | null
          partido_id: string
          posicion: Database["public"]["Enums"]["sector_cancha"] | null
          updated_at: string
        }
        Insert: {
          asistencias?: number
          created_at?: string
          declarado?: boolean
          equipo: Database["public"]["Enums"]["equipo_color"]
          goles?: number
          id?: string
          jugador_id: string
          pagado?: boolean
          pagado_at?: string | null
          partido_id: string
          posicion?: Database["public"]["Enums"]["sector_cancha"] | null
          updated_at?: string
        }
        Update: {
          asistencias?: number
          created_at?: string
          declarado?: boolean
          equipo?: Database["public"]["Enums"]["equipo_color"]
          goles?: number
          id?: string
          jugador_id?: string
          pagado?: boolean
          pagado_at?: string | null
          partido_id?: string
          posicion?: Database["public"]["Enums"]["sector_cancha"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "estadisticas_partido_jugador_id_fkey"
            columns: ["jugador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estadisticas_partido_jugador_id_fkey"
            columns: ["jugador_id"]
            isOneToOne: false
            referencedRelation: "ranking_jugadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estadisticas_partido_partido_id_fkey"
            columns: ["partido_id"]
            isOneToOne: false
            referencedRelation: "partidos"
            referencedColumns: ["id"]
          },
        ]
      }
      partidos: {
        Row: {
          creado_por: string | null
          created_at: string
          equipo_blanco: Json
          equipo_negro: Json
          estado: Database["public"]["Enums"]["estado_partido"]
          fecha: string
          ganador: Database["public"]["Enums"]["resultado_partido"] | null
          goles_blanco_total: number
          goles_negro_total: number
          id: string
          updated_at: string
        }
        Insert: {
          creado_por?: string | null
          created_at?: string
          equipo_blanco?: Json
          equipo_negro?: Json
          estado?: Database["public"]["Enums"]["estado_partido"]
          fecha?: string
          ganador?: Database["public"]["Enums"]["resultado_partido"] | null
          goles_blanco_total?: number
          goles_negro_total?: number
          id?: string
          updated_at?: string
        }
        Update: {
          creado_por?: string | null
          created_at?: string
          equipo_blanco?: Json
          equipo_negro?: Json
          estado?: Database["public"]["Enums"]["estado_partido"]
          fecha?: string
          ganador?: Database["public"]["Enums"]["resultado_partido"] | null
          goles_blanco_total?: number
          goles_negro_total?: number
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          es_parche: boolean
          id: string
          nota_manual: number | null
          sector_1: Database["public"]["Enums"]["sector_cancha"] | null
          sector_2: Database["public"]["Enums"]["sector_cancha"] | null
          sector_3: Database["public"]["Enums"]["sector_cancha"] | null
          sobrenombre: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          es_parche?: boolean
          id: string
          nota_manual?: number | null
          sector_1?: Database["public"]["Enums"]["sector_cancha"] | null
          sector_2?: Database["public"]["Enums"]["sector_cancha"] | null
          sector_3?: Database["public"]["Enums"]["sector_cancha"] | null
          sobrenombre: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          es_parche?: boolean
          id?: string
          nota_manual?: number | null
          sector_1?: Database["public"]["Enums"]["sector_cancha"] | null
          sector_2?: Database["public"]["Enums"]["sector_cancha"] | null
          sector_3?: Database["public"]["Enums"]["sector_cancha"] | null
          sobrenombre?: string
          updated_at?: string
        }
        Relationships: []
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
      ranking_jugadores: {
        Row: {
          asistencias: number | null
          goles: number | null
          id: string | null
          pe: number | null
          pg: number | null
          pj: number | null
          pp: number | null
          puntos: number | null
          sobrenombre: string | null
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
      is_participant: {
        Args: { _partido_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "jugador" | "parche"
      equipo_color: "blanco" | "negro"
      estado_partido: "abierto" | "stats" | "cerrado" | "conflicto"
      resultado_partido: "blanco" | "negro" | "empate"
      sector_cancha:
        | "DEL_IZQ"
        | "DEL_CEN"
        | "DEL_DER"
        | "MED_IZQ"
        | "MED_CEN"
        | "MED_DER"
        | "DEF_IZQ"
        | "DEF_CEN"
        | "DEF_DER"
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
      app_role: ["admin", "jugador", "parche"],
      equipo_color: ["blanco", "negro"],
      estado_partido: ["abierto", "stats", "cerrado", "conflicto"],
      resultado_partido: ["blanco", "negro", "empate"],
      sector_cancha: [
        "DEL_IZQ",
        "DEL_CEN",
        "DEL_DER",
        "MED_IZQ",
        "MED_CEN",
        "MED_DER",
        "DEF_IZQ",
        "DEF_CEN",
        "DEF_DER",
      ],
    },
  },
} as const
