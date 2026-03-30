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
      airport_pickups: {
        Row: {
          arrival_datetime: string | null
          assigned_at: string | null
          assigned_by: string | null
          booking_id: string
          completed_at: string | null
          completed_by: string | null
          confirmed_at: string | null
          created_at: string
          driver_id: string | null
          fee: number
          fee_override: boolean
          fee_override_by: string | null
          fee_override_reason: string | null
          flight_number: string | null
          guest_landed_at: string | null
          id: string
          luggage_notes: string | null
          passenger_count: number | null
          special_instructions: string | null
          status: string
          updated_at: string
        }
        Insert: {
          arrival_datetime?: string | null
          assigned_at?: string | null
          assigned_by?: string | null
          booking_id: string
          completed_at?: string | null
          completed_by?: string | null
          confirmed_at?: string | null
          created_at?: string
          driver_id?: string | null
          fee?: number
          fee_override?: boolean
          fee_override_by?: string | null
          fee_override_reason?: string | null
          flight_number?: string | null
          guest_landed_at?: string | null
          id?: string
          luggage_notes?: string | null
          passenger_count?: number | null
          special_instructions?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          arrival_datetime?: string | null
          assigned_at?: string | null
          assigned_by?: string | null
          booking_id?: string
          completed_at?: string | null
          completed_by?: string | null
          confirmed_at?: string | null
          created_at?: string
          driver_id?: string | null
          fee?: number
          fee_override?: boolean
          fee_override_by?: string | null
          fee_override_reason?: string | null
          flight_number?: string | null
          guest_landed_at?: string | null
          id?: string
          luggage_notes?: string | null
          passenger_count?: number | null
          special_instructions?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "airport_pickups_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "airport_pickups_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
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
      booking_training_links: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          notes: string | null
          package_id: string
          start_date: string | null
          trainer_name: string | null
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          notes?: string | null
          package_id: string
          start_date?: string | null
          trainer_name?: string | null
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          package_id?: string
          start_date?: string | null
          trainer_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_training_links_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_training_links_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "training_packages"
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
      drivers: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          license_plate: string | null
          name: string
          notes: string | null
          phone: string | null
          photo_url: string | null
          updated_at: string
          vehicle_type: string | null
          whatsapp: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          license_plate?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          updated_at?: string
          vehicle_type?: string | null
          whatsapp?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          license_plate?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          updated_at?: string
          vehicle_type?: string | null
          whatsapp?: string | null
        }
        Relationships: []
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
      email_log: {
        Row: {
          booking_id: string | null
          id: string
          provider_message_id: string | null
          recipient_email: string
          sent_at: string
          status: string
          template_key: string
        }
        Insert: {
          booking_id?: string | null
          id?: string
          provider_message_id?: string | null
          recipient_email: string
          sent_at?: string
          status?: string
          template_key: string
        }
        Update: {
          booking_id?: string | null
          id?: string
          provider_message_id?: string | null
          recipient_email?: string
          sent_at?: string
          status?: string
          template_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_log_booking_id_fkey"
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
      housekeeping_tasks: {
        Row: {
          assigned_to: string | null
          booking_in_id: string | null
          booking_out_id: string
          completed_at: string | null
          created_at: string
          due_by: string | null
          id: string
          notes: string | null
          status: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          booking_in_id?: string | null
          booking_out_id: string
          completed_at?: string | null
          created_at?: string
          due_by?: string | null
          id?: string
          notes?: string | null
          status?: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          booking_in_id?: string | null
          booking_out_id?: string
          completed_at?: string | null
          created_at?: string
          due_by?: string | null
          id?: string
          notes?: string | null
          status?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "housekeeping_tasks_booking_in_id_fkey"
            columns: ["booking_in_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_tasks_booking_out_id_fkey"
            columns: ["booking_out_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_tasks_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
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
          approved_by: string | null
          booking_id: string
          content: string
          created_at: string
          draft: boolean
          id: string
          is_internal: boolean
          read_at: string | null
          sender_id: string | null
        }
        Insert: {
          approved_by?: string | null
          booking_id: string
          content: string
          created_at?: string
          draft?: boolean
          id?: string
          is_internal?: boolean
          read_at?: string | null
          sender_id?: string | null
        }
        Update: {
          approved_by?: string | null
          booking_id?: string
          content?: string
          created_at?: string
          draft?: boolean
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
      payment_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          payload: Json
          payment_id: string | null
          processed: boolean
          provider: string
          provider_event_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          payment_id?: string | null
          processed?: boolean
          provider: string
          provider_event_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          payment_id?: string | null
          processed?: boolean
          provider?: string
          provider_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          booking_id: string
          created_at: string
          description: string | null
          expires_at: string | null
          id: string
          idempotency_key: string | null
          method: string
          notes: string | null
          payment_type: string
          provider: string
          provider_session_id: string | null
          provider_status: string
          provider_transaction_id: string | null
          receipt_url: string | null
          recorded_by: string | null
          refund_amount: number | null
          refund_reason: string | null
          source_channel: string
          status: string
        }
        Insert: {
          amount: number
          booking_id: string
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          idempotency_key?: string | null
          method?: string
          notes?: string | null
          payment_type?: string
          provider?: string
          provider_session_id?: string | null
          provider_status?: string
          provider_transaction_id?: string | null
          receipt_url?: string | null
          recorded_by?: string | null
          refund_amount?: number | null
          refund_reason?: string | null
          source_channel?: string
          status?: string
        }
        Update: {
          amount?: number
          booking_id?: string
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          idempotency_key?: string | null
          method?: string
          notes?: string | null
          payment_type?: string
          provider?: string
          provider_session_id?: string | null
          provider_status?: string
          provider_transaction_id?: string | null
          receipt_url?: string | null
          recorded_by?: string | null
          refund_amount?: number | null
          refund_reason?: string | null
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
          adjustment_type: string
          adjustment_value: number | null
          created_at: string
          end_date: string
          id: string
          min_nights: number | null
          name: string
          price: number
          start_date: string
          unit_id: string
          weekend_price: number | null
        }
        Insert: {
          adjustment_type?: string
          adjustment_value?: number | null
          created_at?: string
          end_date: string
          id?: string
          min_nights?: number | null
          name: string
          price: number
          start_date: string
          unit_id: string
          weekend_price?: number | null
        }
        Update: {
          adjustment_type?: string
          adjustment_value?: number | null
          created_at?: string
          end_date?: string
          id?: string
          min_nights?: number | null
          name?: string
          price?: number
          start_date?: string
          unit_id?: string
          weekend_price?: number | null
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
          tutorial_completed: boolean
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
          tutorial_completed?: boolean
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
          tutorial_completed?: boolean
          updated_at?: string
          user_id?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      review_audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json | null
          performed_by: string
          reason: string | null
          review_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json | null
          performed_by: string
          reason?: string | null
          review_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          performed_by?: string
          reason?: string | null
          review_id?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          admin_note: string | null
          admin_response: string | null
          admin_response_at: string | null
          body: string
          booking_id: string
          created_at: string
          guest_display_name: string | null
          guest_id: string
          id: string
          rating: number
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          stay_check_in: string | null
          stay_check_out: string | null
          stay_nights: number | null
          stay_unit_name: string | null
          title: string
          updated_at: string
        }
        Insert: {
          admin_note?: string | null
          admin_response?: string | null
          admin_response_at?: string | null
          body: string
          booking_id: string
          created_at?: string
          guest_display_name?: string | null
          guest_id: string
          id?: string
          rating: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          stay_check_in?: string | null
          stay_check_out?: string | null
          stay_nights?: number | null
          stay_unit_name?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          admin_note?: string | null
          admin_response?: string | null
          admin_response_at?: string | null
          body?: string
          booking_id?: string
          created_at?: string
          guest_display_name?: string | null
          guest_id?: string
          id?: string
          rating?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          stay_check_in?: string | null
          stay_check_out?: string | null
          stay_nights?: number | null
          stay_unit_name?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      security_deposits: {
        Row: {
          amount_deducted: number | null
          amount_held: number
          booking_id: string
          created_at: string
          deduction_reason: string | null
          held_at: string
          id: string
          inspected_at: string | null
          inspected_by: string | null
          notes: string | null
          released_at: string | null
          released_by: string | null
          status: string
        }
        Insert: {
          amount_deducted?: number | null
          amount_held?: number
          booking_id: string
          created_at?: string
          deduction_reason?: string | null
          held_at?: string
          id?: string
          inspected_at?: string | null
          inspected_by?: string | null
          notes?: string | null
          released_at?: string | null
          released_by?: string | null
          status?: string
        }
        Update: {
          amount_deducted?: number | null
          amount_held?: number
          booking_id?: string
          created_at?: string
          deduction_reason?: string | null
          held_at?: string
          id?: string
          inspected_at?: string | null
          inspected_by?: string | null
          notes?: string | null
          released_at?: string | null
          released_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_deposits_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      security_events: {
        Row: {
          actor_email: string | null
          actor_id: string | null
          actor_role: string | null
          confidence_score: number | null
          created_at: string
          details: Json | null
          event_type: string
          id: string
          severity: string
          source_ip: string | null
        }
        Insert: {
          actor_email?: string | null
          actor_id?: string | null
          actor_role?: string | null
          confidence_score?: number | null
          created_at?: string
          details?: Json | null
          event_type: string
          id?: string
          severity?: string
          source_ip?: string | null
        }
        Update: {
          actor_email?: string | null
          actor_id?: string | null
          actor_role?: string | null
          confidence_score?: number | null
          created_at?: string
          details?: Json | null
          event_type?: string
          id?: string
          severity?: string
          source_ip?: string | null
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
      training_packages: {
        Row: {
          created_at: string
          description: string | null
          duration_days: number
          id: string
          is_active: boolean
          name: string
          price: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration_days?: number
          id?: string
          is_active?: boolean
          name: string
          price?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          duration_days?: number
          id?: string
          is_active?: boolean
          name?: string
          price?: number
        }
        Relationships: []
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
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          extra_bed_fee: number | null
          group_id: string | null
          house_rules_detail: string | null
          id: string
          is_active: boolean
          max_extra_beds: number
          min_nights: number
          monthly_rate: number | null
          name: string
          photos: string[] | null
          pricing_type: string
          reviews_enabled: boolean
          rules: string | null
          sort_order: number
          updated_at: string
          weekend_price: number | null
          weekly_rate: number | null
          wifi_network: string | null
          wifi_password: string | null
        }
        Insert: {
          amenities?: string[] | null
          base_price?: number
          capacity?: number
          cleaning_fee?: number | null
          created_at?: string
          description?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          extra_bed_fee?: number | null
          group_id?: string | null
          house_rules_detail?: string | null
          id?: string
          is_active?: boolean
          max_extra_beds?: number
          min_nights?: number
          monthly_rate?: number | null
          name: string
          photos?: string[] | null
          pricing_type?: string
          reviews_enabled?: boolean
          rules?: string | null
          sort_order?: number
          updated_at?: string
          weekend_price?: number | null
          weekly_rate?: number | null
          wifi_network?: string | null
          wifi_password?: string | null
        }
        Update: {
          amenities?: string[] | null
          base_price?: number
          capacity?: number
          cleaning_fee?: number | null
          created_at?: string
          description?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          extra_bed_fee?: number | null
          group_id?: string | null
          house_rules_detail?: string | null
          id?: string
          is_active?: boolean
          max_extra_beds?: number
          min_nights?: number
          monthly_rate?: number | null
          name?: string
          photos?: string[] | null
          pricing_type?: string
          reviews_enabled?: boolean
          rules?: string | null
          sort_order?: number
          updated_at?: string
          weekend_price?: number | null
          weekly_rate?: number | null
          wifi_network?: string | null
          wifi_password?: string | null
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
