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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          important: boolean
          title: string
        }
        Insert: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          important?: boolean
          title: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          important?: boolean
          title?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          company_name: string
          id: number
          logo_url: string | null
          updated_at: string
        }
        Insert: {
          company_name?: string
          id?: number
          logo_url?: string | null
          updated_at?: string
        }
        Update: {
          company_name?: string
          id?: number
          logo_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      banners: {
        Row: {
          active: boolean
          created_at: string
          id: string
          image_url: string
          link: string | null
          title: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          image_url: string
          link?: string | null
          title?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          image_url?: string
          link?: string | null
          title?: string | null
        }
        Relationships: []
      }
      departments: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          category: string | null
          created_at: string
          file_name: string | null
          file_path: string
          file_size: number | null
          id: string
          title: string
          uploaded_by: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          file_name?: string | null
          file_path: string
          file_size?: number | null
          id?: string
          title: string
          uploaded_by?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          file_name?: string | null
          file_path?: string
          file_size?: number | null
          id?: string
          title?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      meetings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          link: string | null
          location: string | null
          organizer_id: string | null
          starts_at: string
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          link?: string | null
          location?: string | null
          organizer_id?: string | null
          starts_at: string
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          link?: string | null
          location?: string | null
          organizer_id?: string | null
          starts_at?: string
          title?: string
        }
        Relationships: []
      }
      positions: {
        Row: {
          created_at: string
          id: string
          name: string
          permissions: string[]
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          permissions?: string[]
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          permissions?: string[]
        }
        Relationships: []
      }
      posts: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          image_url: string | null
          title: string
        }
        Insert: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          image_url?: string | null
          title: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          image_url?: string | null
          title?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          avatar_url: string | null
          created_at: string
          department_id: string | null
          description: string | null
          email: string | null
          extension: string | null
          full_name: string
          id: string
          joined_at: string | null
          last_seen_at: string | null
          phone: string | null
          position_id: string | null
          status: Database["public"]["Enums"]["user_status"]
          unit: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          avatar_url?: string | null
          created_at?: string
          department_id?: string | null
          description?: string | null
          email?: string | null
          extension?: string | null
          full_name?: string
          id: string
          joined_at?: string | null
          last_seen_at?: string | null
          phone?: string | null
          position_id?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          unit?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          avatar_url?: string | null
          created_at?: string
          department_id?: string | null
          description?: string | null
          email?: string | null
          extension?: string | null
          full_name?: string
          id?: string
          joined_at?: string | null
          last_seen_at?: string | null
          phone?: string | null
          position_id?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_manager: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "diretor" | "gerente" | "funcionario"
      user_status: "online" | "offline" | "ausente" | "ocupado"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "diretor", "gerente", "funcionario"],
      user_status: ["online", "offline", "ausente", "ocupado"],
    },
  },
} as const
