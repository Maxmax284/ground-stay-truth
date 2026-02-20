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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      booking_state_log: {
        Row: {
          booking_id: string
          changed_by: string | null
          created_at: string
          from_state: Database["public"]["Enums"]["booking_state"] | null
          id: string
          reason: string | null
          to_state: Database["public"]["Enums"]["booking_state"]
        }
        Insert: {
          booking_id: string
          changed_by?: string | null
          created_at?: string
          from_state?: Database["public"]["Enums"]["booking_state"] | null
          id?: string
          reason?: string | null
          to_state: Database["public"]["Enums"]["booking_state"]
        }
        Update: {
          booking_id?: string
          changed_by?: string | null
          created_at?: string
          from_state?: Database["public"]["Enums"]["booking_state"] | null
          id?: string
          reason?: string | null
          to_state?: Database["public"]["Enums"]["booking_state"]
        }
        Relationships: [
          {
            foreignKeyName: "booking_state_log_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          arrival_details: Json | null
          check_in: string
          check_out: string
          created_at: string
          created_by: string | null
          guest_id: string | null
          guest_type: string | null
          id: string
          notes: string | null
          num_guests: number
          pre_arrival_status: string
          price_override: number | null
          state: Database["public"]["Enums"]["booking_state"]
          total_price: number | null
          unit_id: string
          updated_at: string
        }
        Insert: {
          arrival_details?: Json | null
          check_in: string
          check_out: string
          created_at?: string
          created_by?: string | null
          guest_id?: string | null
          guest_type?: string | null
          id?: string
          notes?: string | null
          num_guests?: number
          pre_arrival_status?: string
          price_override?: number | null
          state?: Database["public"]["Enums"]["booking_state"]
          total_price?: number | null
          unit_id: string
          updated_at?: string
        }
        Update: {
          arrival_details?: Json | null
          check_in?: string
          check_out?: string
          created_at?: string
          created_by?: string | null
          guest_id?: string | null
          guest_type?: string | null
          id?: string
          notes?: string | null
          num_guests?: number
          pre_arrival_status?: string
          price_override?: number | null
          state?: Database["public"]["Enums"]["booking_state"]
          total_price?: number | null
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_guest_id_profiles_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "bookings_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      early_checkin_requests: {
        Row: {
          approved_by: string | null
          booking_id: string
          buffer_violation_hours: number | null
          created_at: string
          id: string
          reason: string
          requested_by: string | null
          resolved_at: string | null
          response_note: string | null
          status: string
        }
        Insert: {
          approved_by?: string | null
          booking_id: string
          buffer_violation_hours?: number | null
          created_at?: string
          id?: string
          reason: string
          requested_by?: string | null
          resolved_at?: string | null
          response_note?: string | null
          status?: string
        }
        Update: {
          approved_by?: string | null
          booking_id?: string
          buffer_violation_hours?: number | null
          created_at?: string
          id?: string
          reason?: string
          requested_by?: string | null
          resolved_at?: string | null
          response_note?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "early_checkin_requests_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_documents: {
        Row: {
          booking_id: string
          created_at: string
          file_name: string
          file_path: string
          id: string
          uploaded_by: string | null
          verification_notes: Json | null
          verification_status: string | null
          verified_at: string | null
        }
        Insert: {
          booking_id: string
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          uploaded_by?: string | null
          verification_notes?: Json | null
          verification_status?: string | null
          verified_at?: string | null
        }
        Update: {
          booking_id?: string
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          uploaded_by?: string | null
          verification_notes?: Json | null
          verification_status?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_documents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      laundry_requests: {
        Row: {
          bag_count: number | null
          booking_id: string
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          status: string
          unit_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bag_count?: number | null
          booking_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          status?: string
          unit_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bag_count?: number | null
          booking_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          status?: string
          unit_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "laundry_requests_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "laundry_requests_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_blocks: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          reason: string | null
          start_date: string
          unit_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          reason?: string | null
          start_date: string
          unit_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          reason?: string | null
          start_date?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_blocks_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_requests: {
        Row: {
          booking_id: string
          category: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          photo_url: string | null
          priority: string
          resolution_note: string | null
          resolved_by: string | null
          status: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          booking_id: string
          category: string
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          photo_url?: string | null
          priority?: string
          resolution_note?: string | null
          resolved_by?: string | null
          status?: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          booking_id?: string
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          photo_url?: string | null
          priority?: string
          resolution_note?: string | null
          resolved_by?: string | null
          status?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_requests_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          booking_id: string
          content: string
          created_at: string
          id: string
          is_internal: boolean
          read_at: string | null
          sender_id: string | null
        }
        Insert: {
          booking_id: string
          content: string
          created_at?: string
          id?: string
          is_internal?: boolean
          read_at?: string | null
          sender_id?: string | null
        }
        Update: {
          booking_id?: string
          content?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          read_at?: string | null
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          read: boolean
          reference_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          read?: boolean
          reference_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          read?: boolean
          reference_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          booking_id: string
          created_at: string
          id: string
          method: string
          notes: string | null
          recorded_by: string | null
          source_channel: string
          status: string
        }
        Insert: {
          amount: number
          booking_id: string
          created_at?: string
          id?: string
          method?: string
          notes?: string | null
          recorded_by?: string | null
          source_channel?: string
          status?: string
        }
        Update: {
          amount?: number
          booking_id?: string
          created_at?: string
          id?: string
          method?: string
          notes?: string | null
          recorded_by?: string | null
          source_channel?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_settings: {
        Row: {
          description: string | null
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      pre_arrival_checklist: {
        Row: {
          booking_id: string
          completed: boolean
          completed_at: string | null
          created_at: string
          data: Json | null
          id: string
          item_key: string
          updated_at: string
        }
        Insert: {
          booking_id: string
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          item_key: string
          updated_at?: string
        }
        Update: {
          booking_id?: string
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          item_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pre_arrival_checklist_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_rules: {
        Row: {
          created_at: string
          end_date: string
          id: string
          name: string
          price: number
          start_date: string
          unit_id: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          name: string
          price: number
          start_date: string
          unit_id: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          name?: string
          price?: number
          start_date?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rules_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          last_sign_in_at: string | null
          line_id: string | null
          phone: string | null
          preferred_language: string
          updated_at: string
          user_id: string
          whatsapp: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          last_sign_in_at?: string | null
          line_id?: string | null
          phone?: string | null
          preferred_language?: string
          updated_at?: string
          user_id: string
          whatsapp?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          last_sign_in_at?: string | null
          line_id?: string | null
          phone?: string | null
          preferred_language?: string
          updated_at?: string
          user_id?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      stay_support_log: {
        Row: {
          action: string
          booking_id: string
          change_type: string
          changed_by: string | null
          created_at: string
          from_status: string | null
          id: string
          note: string | null
          request_id: string
          request_type: string
          to_status: string | null
        }
        Insert: {
          action: string
          booking_id: string
          change_type?: string
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          request_id: string
          request_type: string
          to_status?: string | null
        }
        Update: {
          action?: string
          booking_id?: string
          change_type?: string
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          request_id?: string
          request_type?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stay_support_log_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_groups: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      units: {
        Row: {
          amenities: string[] | null
          base_price: number
          capacity: number
          cleaning_fee: number | null
          created_at: string
          description: string | null
          group_id: string | null
          id: string
          is_active: boolean
          min_nights: number
          name: string
          photos: string[] | null
          rules: string | null
          updated_at: string
          weekend_price: number | null
        }
        Insert: {
          amenities?: string[] | null
          base_price?: number
          capacity?: number
          cleaning_fee?: number | null
          created_at?: string
          description?: string | null
          group_id?: string | null
          id?: string
          is_active?: boolean
          min_nights?: number
          name: string
          photos?: string[] | null
          rules?: string | null
          updated_at?: string
          weekend_price?: number | null
        }
        Update: {
          amenities?: string[] | null
          base_price?: number
          capacity?: number
          cleaning_fee?: number | null
          created_at?: string
          description?: string | null
          group_id?: string | null
          id?: string
          is_active?: boolean
          min_nights?: number
          name?: string
          photos?: string[] | null
          rules?: string | null
          updated_at?: string
          weekend_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "units_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "unit_groups"
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
    }
    Enums: {
      app_role:
        | "admin"
        | "manager"
        | "front_desk_supervisor"
        | "front_desk"
        | "maintenance"
        | "viewer"
        | "guest"
      booking_state:
        | "inquiry"
        | "soft_hold"
        | "pending_approval"
        | "pending_deposit"
        | "confirmed"
        | "checked_in"
        | "completed"
        | "cancelled"
        | "no_show"
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
      app_role: [
        "admin",
        "manager",
        "front_desk_supervisor",
        "front_desk",
        "maintenance",
        "viewer",
        "guest",
      ],
      booking_state: [
        "inquiry",
        "soft_hold",
        "pending_approval",
        "pending_deposit",
        "confirmed",
        "checked_in",
        "completed",
        "cancelled",
        "no_show",
      ],
    },
  },
} as const
