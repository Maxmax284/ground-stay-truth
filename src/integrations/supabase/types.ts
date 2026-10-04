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
      admin_alert_log: {
        Row: {
          booking_id: string | null
          category: string | null
          channel: string
          created_at: string
          event_id: string | null
          event_type: string
          failure_reason: string | null
          guest_id: string | null
          id: string
          is_test: boolean
          recipient_email: string | null
          recipient_user_id: string | null
          retry_count: number
          severity: string | null
          status: string
          template_key: string | null
          triggered_by: string | null
        }
        Insert: {
          booking_id?: string | null
          category?: string | null
          channel?: string
          created_at?: string
          event_id?: string | null
          event_type: string
          failure_reason?: string | null
          guest_id?: string | null
          id?: string
          is_test?: boolean
          recipient_email?: string | null
          recipient_user_id?: string | null
          retry_count?: number
          severity?: string | null
          status?: string
          template_key?: string | null
          triggered_by?: string | null
        }
        Update: {
          booking_id?: string | null
          category?: string | null
          channel?: string
          created_at?: string
          event_id?: string | null
          event_type?: string
          failure_reason?: string | null
          guest_id?: string | null
          id?: string
          is_test?: boolean
          recipient_email?: string | null
          recipient_user_id?: string | null
          retry_count?: number
          severity?: string | null
          status?: string
          template_key?: string | null
          triggered_by?: string | null
        }
        Relationships: []
      }
      admin_elevation_grants: {
        Row: {
          created_at: string
          expires_at: string
          granted_by_user_id: string
          id: string
          minutes: number
          reason: string
          revoked_at: string | null
          revoked_by_user_id: string | null
          self_issued: boolean
          subject_user_id: string
          used_count: number
        }
        Insert: {
          created_at?: string
          expires_at: string
          granted_by_user_id: string
          id?: string
          minutes: number
          reason: string
          revoked_at?: string | null
          revoked_by_user_id?: string | null
          self_issued?: boolean
          subject_user_id: string
          used_count?: number
        }
        Update: {
          created_at?: string
          expires_at?: string
          granted_by_user_id?: string
          id?: string
          minutes?: number
          reason?: string
          revoked_at?: string | null
          revoked_by_user_id?: string | null
          self_issued?: boolean
          subject_user_id?: string
          used_count?: number
        }
        Relationships: []
      }
      ai_action_drafts: {
        Row: {
          action_type: string
          booking_id: string | null
          created_at: string
          created_by_user_id: string | null
          id: string
          payload: Json
          property_id: string | null
          rationale: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by_user_id: string | null
          status: string
          summary: string
        }
        Insert: {
          action_type: string
          booking_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          payload?: Json
          property_id?: string | null
          rationale?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          status?: string
          summary: string
        }
        Update: {
          action_type?: string
          booking_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          payload?: Json
          property_id?: string | null
          rationale?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          status?: string
          summary?: string
        }
        Relationships: []
      }
      ai_assistant_audit: {
        Row: {
          assistant_response_at: string
          created_at: string
          focus_booking_id: string | null
          focus_kind: string | null
          id: string
          missing: string[]
          mode: string | null
          notes: string | null
          session_id: string
          sources: string[]
          uncertain: boolean
          user_id: string
        }
        Insert: {
          assistant_response_at: string
          created_at?: string
          focus_booking_id?: string | null
          focus_kind?: string | null
          id?: string
          missing?: string[]
          mode?: string | null
          notes?: string | null
          session_id: string
          sources?: string[]
          uncertain?: boolean
          user_id: string
        }
        Update: {
          assistant_response_at?: string
          created_at?: string
          focus_booking_id?: string | null
          focus_kind?: string | null
          id?: string
          missing?: string[]
          mode?: string | null
          notes?: string | null
          session_id?: string
          sources?: string[]
          uncertain?: boolean
          user_id?: string
        }
        Relationships: []
      }
      ai_model_costs: {
        Row: {
          input_micro_usd_per_1k: number
          model: string
          notes: string | null
          output_micro_usd_per_1k: number
          updated_at: string
        }
        Insert: {
          input_micro_usd_per_1k?: number
          model: string
          notes?: string | null
          output_micro_usd_per_1k?: number
          updated_at?: string
        }
        Update: {
          input_micro_usd_per_1k?: number
          model?: string
          notes?: string | null
          output_micro_usd_per_1k?: number
          updated_at?: string
        }
        Relationships: []
      }
      ai_usage_events: {
        Row: {
          actor_id: string | null
          actor_role: string | null
          channel: string | null
          cost_estimate_micro_usd: number | null
          created_at: string
          error_code: string | null
          function_name: string
          id: string
          ip_hash: string | null
          latency_ms: number | null
          mode: string | null
          model: string | null
          property_id: string | null
          request_hash: string | null
          status: string
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          actor_id?: string | null
          actor_role?: string | null
          channel?: string | null
          cost_estimate_micro_usd?: number | null
          created_at?: string
          error_code?: string | null
          function_name: string
          id?: string
          ip_hash?: string | null
          latency_ms?: number | null
          mode?: string | null
          model?: string | null
          property_id?: string | null
          request_hash?: string | null
          status?: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          actor_id?: string | null
          actor_role?: string | null
          channel?: string | null
          cost_estimate_micro_usd?: number | null
          created_at?: string
          error_code?: string | null
          function_name?: string
          id?: string
          ip_hash?: string | null
          latency_ms?: number | null
          mode?: string | null
          model?: string | null
          property_id?: string | null
          request_hash?: string | null
          status?: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Relationships: []
      }
      airport_pickups: {
        Row: {
          arrival_confidence: string
          arrival_datetime: string | null
          arrival_location_name: string | null
          arrival_location_type: string
          arrival_type: string
          assigned_at: string | null
          assigned_by: string | null
          assist_activated_at: string | null
          assist_activated_by: string | null
          assist_mode: string
          assist_reason: string | null
          assist_resolved_at: string | null
          assist_resolved_by: string | null
          booking_id: string
          collected_at: string | null
          collected_by: string | null
          completed_at: string | null
          completed_by: string | null
          confirmed_airport: string | null
          confirmed_at: string | null
          created_at: string
          driver_id: string | null
          fee: number
          fee_override: boolean
          fee_override_by: string | null
          fee_override_reason: string | null
          final_flight_confirmed: boolean
          flight_number: string | null
          guest_landed_at: string | null
          guest_ready_at: string | null
          guest_ready_by: string | null
          id: string
          international_flight_number: string | null
          luggage_notes: string | null
          passenger_count: number | null
          pickup_enabled: boolean
          property_id: string | null
          special_instructions: string | null
          status: string
          transport_intent: string
          updated_at: string
        }
        Insert: {
          arrival_confidence?: string
          arrival_datetime?: string | null
          arrival_location_name?: string | null
          arrival_location_type?: string
          arrival_type?: string
          assigned_at?: string | null
          assigned_by?: string | null
          assist_activated_at?: string | null
          assist_activated_by?: string | null
          assist_mode?: string
          assist_reason?: string | null
          assist_resolved_at?: string | null
          assist_resolved_by?: string | null
          booking_id: string
          collected_at?: string | null
          collected_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          confirmed_airport?: string | null
          confirmed_at?: string | null
          created_at?: string
          driver_id?: string | null
          fee?: number
          fee_override?: boolean
          fee_override_by?: string | null
          fee_override_reason?: string | null
          final_flight_confirmed?: boolean
          flight_number?: string | null
          guest_landed_at?: string | null
          guest_ready_at?: string | null
          guest_ready_by?: string | null
          id?: string
          international_flight_number?: string | null
          luggage_notes?: string | null
          passenger_count?: number | null
          pickup_enabled?: boolean
          property_id?: string | null
          special_instructions?: string | null
          status?: string
          transport_intent?: string
          updated_at?: string
        }
        Update: {
          arrival_confidence?: string
          arrival_datetime?: string | null
          arrival_location_name?: string | null
          arrival_location_type?: string
          arrival_type?: string
          assigned_at?: string | null
          assigned_by?: string | null
          assist_activated_at?: string | null
          assist_activated_by?: string | null
          assist_mode?: string
          assist_reason?: string | null
          assist_resolved_at?: string | null
          assist_resolved_by?: string | null
          booking_id?: string
          collected_at?: string | null
          collected_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          confirmed_airport?: string | null
          confirmed_at?: string | null
          created_at?: string
          driver_id?: string | null
          fee?: number
          fee_override?: boolean
          fee_override_by?: string | null
          fee_override_reason?: string | null
          final_flight_confirmed?: boolean
          flight_number?: string | null
          guest_landed_at?: string | null
          guest_ready_at?: string | null
          guest_ready_by?: string | null
          id?: string
          international_flight_number?: string | null
          luggage_notes?: string | null
          passenger_count?: number | null
          pickup_enabled?: boolean
          property_id?: string | null
          special_instructions?: string | null
          status?: string
          transport_intent?: string
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
          {
            foreignKeyName: "airport_pickups_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      airport_traffic: {
        Row: {
          actual_arrival: string | null
          airline_name: string | null
          airport_iata: string
          arrival_airport: string | null
          arrival_iata: string | null
          created_at: string
          delay_minutes: number | null
          departure_airport: string | null
          departure_iata: string | null
          direction: string
          estimated_arrival: string | null
          flight_date: string
          flight_iata: string
          flight_status: string
          gate: string | null
          id: string
          last_checked_at: string
          linked_pickup_id: string | null
          raw_response: Json | null
          scheduled_arrival: string | null
          scheduled_departure: string | null
          terminal: string | null
          updated_at: string
        }
        Insert: {
          actual_arrival?: string | null
          airline_name?: string | null
          airport_iata: string
          arrival_airport?: string | null
          arrival_iata?: string | null
          created_at?: string
          delay_minutes?: number | null
          departure_airport?: string | null
          departure_iata?: string | null
          direction: string
          estimated_arrival?: string | null
          flight_date?: string
          flight_iata: string
          flight_status?: string
          gate?: string | null
          id?: string
          last_checked_at?: string
          linked_pickup_id?: string | null
          raw_response?: Json | null
          scheduled_arrival?: string | null
          scheduled_departure?: string | null
          terminal?: string | null
          updated_at?: string
        }
        Update: {
          actual_arrival?: string | null
          airline_name?: string | null
          airport_iata?: string
          arrival_airport?: string | null
          arrival_iata?: string | null
          created_at?: string
          delay_minutes?: number | null
          departure_airport?: string | null
          departure_iata?: string | null
          direction?: string
          estimated_arrival?: string | null
          flight_date?: string
          flight_iata?: string
          flight_status?: string
          gate?: string | null
          id?: string
          last_checked_at?: string
          linked_pickup_id?: string | null
          raw_response?: Json | null
          scheduled_arrival?: string | null
          scheduled_departure?: string | null
          terminal?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "airport_traffic_linked_pickup_id_fkey"
            columns: ["linked_pickup_id"]
            isOneToOne: false
            referencedRelation: "airport_pickups"
            referencedColumns: ["id"]
          },
        ]
      }
      arrival_conflicts: {
        Row: {
          booking_id: string
          detected_at: string
          existing_source: string | null
          existing_value: string | null
          field_name: string
          id: string
          incoming_source: string | null
          incoming_value: string | null
          leg_id: string | null
          note: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
        }
        Insert: {
          booking_id: string
          detected_at?: string
          existing_source?: string | null
          existing_value?: string | null
          field_name: string
          id?: string
          incoming_source?: string | null
          incoming_value?: string | null
          leg_id?: string | null
          note?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
        }
        Update: {
          booking_id?: string
          detected_at?: string
          existing_source?: string | null
          existing_value?: string | null
          field_name?: string
          id?: string
          incoming_source?: string | null
          incoming_value?: string | null
          leg_id?: string | null
          note?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "arrival_conflicts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arrival_conflicts_leg_id_fkey"
            columns: ["leg_id"]
            isOneToOne: false
            referencedRelation: "journey_legs"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_adjustments: {
        Row: {
          adjustment_type: string
          amount_calculated: number
          applied_at: string
          applied_by: string | null
          applies_to: string
          booking_id: string
          created_at: string
          id: string
          internal_note: string | null
          label: string
          modification_id: string | null
          status: string
          value: number
          value_type: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          adjustment_type?: string
          amount_calculated: number
          applied_at?: string
          applied_by?: string | null
          applies_to?: string
          booking_id: string
          created_at?: string
          id?: string
          internal_note?: string | null
          label: string
          modification_id?: string | null
          status?: string
          value: number
          value_type: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          adjustment_type?: string
          amount_calculated?: number
          applied_at?: string
          applied_by?: string | null
          applies_to?: string
          booking_id?: string
          created_at?: string
          id?: string
          internal_note?: string | null
          label?: string
          modification_id?: string | null
          status?: string
          value?: number
          value_type?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_adjustments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_adjustments_modification_id_fkey"
            columns: ["modification_id"]
            isOneToOne: false
            referencedRelation: "stay_modifications"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_confirmation_log: {
        Row: {
          actor_id: string | null
          actor_role: string | null
          booking_id: string
          channel: string
          confirmation_number: string | null
          created_at: string
          id: string
          language: string
          mode: string
          path: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_role?: string | null
          booking_id: string
          channel?: string
          confirmation_number?: string | null
          created_at?: string
          id?: string
          language?: string
          mode?: string
          path?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_role?: string | null
          booking_id?: string
          channel?: string
          confirmation_number?: string | null
          created_at?: string
          id?: string
          language?: string
          mode?: string
          path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_confirmation_log_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_segments: {
        Row: {
          booking_id: string
          created_at: string
          created_by: string | null
          ends_on: string
          hold_expires_at: string | null
          id: string
          modification_id: string | null
          property_id: string | null
          starts_on: string
          status: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          created_by?: string | null
          ends_on: string
          hold_expires_at?: string | null
          id?: string
          modification_id?: string | null
          property_id?: string | null
          starts_on: string
          status?: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          created_by?: string | null
          ends_on?: string
          hold_expires_at?: string | null
          id?: string
          modification_id?: string | null
          property_id?: string | null
          starts_on?: string
          status?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_segments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_segments_modification_id_fkey"
            columns: ["modification_id"]
            isOneToOne: false
            referencedRelation: "stay_modifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_segments_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_segments_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_segments_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units_public"
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
          seq: number
          to_state: Database["public"]["Enums"]["booking_state"]
        }
        Insert: {
          booking_id: string
          changed_by?: string | null
          created_at?: string
          from_state?: Database["public"]["Enums"]["booking_state"] | null
          id?: string
          reason?: string | null
          seq?: never
          to_state: Database["public"]["Enums"]["booking_state"]
        }
        Update: {
          booking_id?: string
          changed_by?: string | null
          created_at?: string
          from_state?: Database["public"]["Enums"]["booking_state"] | null
          id?: string
          reason?: string | null
          seq?: never
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
          arrival_note: string | null
          arrived_at: string | null
          arrived_by: string | null
          check_in: string
          check_out: string
          confirmation_first_generated_at: string | null
          confirmation_last_sent_at: string | null
          confirmation_number: string | null
          confirmation_regeneration_count: number
          created_at: string
          created_by: string | null
          deadline_override_at: string | null
          deadline_override_by: string | null
          deadline_override_reason: string | null
          flight_number: string | null
          guest_id: string | null
          guest_tax_id: string | null
          guest_type: string | null
          hold_deadline_at: string | null
          id: string
          manual_guest_email: string | null
          manual_guest_name: string | null
          manual_guest_note: string | null
          manual_guest_phone: string | null
          notes: string | null
          num_guests: number
          offline_acknowledgements: Json
          original_total: number | null
          pay_on_arrival: boolean
          pre_arrival_status: string
          price_override: number | null
          property_id: string | null
          state: Database["public"]["Enums"]["booking_state"]
          total_price: number | null
          unit_id: string
          updated_at: string
        }
        Insert: {
          arrival_details?: Json | null
          arrival_note?: string | null
          arrived_at?: string | null
          arrived_by?: string | null
          check_in: string
          check_out: string
          confirmation_first_generated_at?: string | null
          confirmation_last_sent_at?: string | null
          confirmation_number?: string | null
          confirmation_regeneration_count?: number
          created_at?: string
          created_by?: string | null
          deadline_override_at?: string | null
          deadline_override_by?: string | null
          deadline_override_reason?: string | null
          flight_number?: string | null
          guest_id?: string | null
          guest_tax_id?: string | null
          guest_type?: string | null
          hold_deadline_at?: string | null
          id?: string
          manual_guest_email?: string | null
          manual_guest_name?: string | null
          manual_guest_note?: string | null
          manual_guest_phone?: string | null
          notes?: string | null
          num_guests?: number
          offline_acknowledgements?: Json
          original_total?: number | null
          pay_on_arrival?: boolean
          pre_arrival_status?: string
          price_override?: number | null
          property_id?: string | null
          state?: Database["public"]["Enums"]["booking_state"]
          total_price?: number | null
          unit_id: string
          updated_at?: string
        }
        Update: {
          arrival_details?: Json | null
          arrival_note?: string | null
          arrived_at?: string | null
          arrived_by?: string | null
          check_in?: string
          check_out?: string
          confirmation_first_generated_at?: string | null
          confirmation_last_sent_at?: string | null
          confirmation_number?: string | null
          confirmation_regeneration_count?: number
          created_at?: string
          created_by?: string | null
          deadline_override_at?: string | null
          deadline_override_by?: string | null
          deadline_override_reason?: string | null
          flight_number?: string | null
          guest_id?: string | null
          guest_tax_id?: string | null
          guest_type?: string | null
          hold_deadline_at?: string | null
          id?: string
          manual_guest_email?: string | null
          manual_guest_name?: string | null
          manual_guest_note?: string | null
          manual_guest_phone?: string | null
          notes?: string | null
          num_guests?: number
          offline_acknowledgements?: Json
          original_total?: number | null
          pay_on_arrival?: boolean
          pre_arrival_status?: string
          price_override?: number | null
          property_id?: string | null
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
            foreignKeyName: "bookings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units_public"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_property_assignments: {
        Row: {
          created_at: string
          driver_id: string
          id: string
          property_id: string
        }
        Insert: {
          created_at?: string
          driver_id: string
          id?: string
          property_id: string
        }
        Update: {
          created_at?: string
          driver_id?: string
          id?: string
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_property_assignments_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_property_assignments_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
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
          correlation_id: string | null
          error_message: string | null
          failure_category: string | null
          failure_reason: string | null
          id: string
          last_retry_at: string | null
          provider_message_id: string | null
          provider_response: Json | null
          recipient_email: string
          retry_count: number
          sent_at: string
          status: string
          template_key: string
        }
        Insert: {
          booking_id?: string | null
          correlation_id?: string | null
          error_message?: string | null
          failure_category?: string | null
          failure_reason?: string | null
          id?: string
          last_retry_at?: string | null
          provider_message_id?: string | null
          provider_response?: Json | null
          recipient_email: string
          retry_count?: number
          sent_at?: string
          status?: string
          template_key: string
        }
        Update: {
          booking_id?: string | null
          correlation_id?: string | null
          error_message?: string | null
          failure_category?: string | null
          failure_reason?: string | null
          id?: string
          last_retry_at?: string | null
          provider_message_id?: string | null
          provider_response?: Json | null
          recipient_email?: string
          retry_count?: number
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
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      flight_budget_grants: {
        Row: {
          created_at: string
          extra_reads: number
          granted_by: string | null
          id: string
          read_day: string
          reason: string
        }
        Insert: {
          created_at?: string
          extra_reads: number
          granted_by?: string | null
          id?: string
          read_day?: string
          reason: string
        }
        Update: {
          created_at?: string
          extra_reads?: number
          granted_by?: string | null
          id?: string
          read_day?: string
          reason?: string
        }
        Relationships: []
      }
      flight_facts: {
        Row: {
          actual_arrival: string | null
          actual_departure: string | null
          airline_name: string | null
          arrival_airport: string | null
          arrival_iata: string | null
          arrival_timezone: string | null
          created_at: string
          delay_minutes: number
          departure_airport: string | null
          departure_iata: string | null
          departure_timezone: string | null
          estimated_arrival: string | null
          estimated_departure: string | null
          flight_date: string
          flight_key: string
          flight_status: string
          gate: string | null
          id: string
          last_checked_at: string
          lookup_count: number
          marketed_carrier: string | null
          marketed_flight_number: string | null
          operating_carrier: string | null
          operating_flight_number: string | null
          provider: string
          raw_response: Json | null
          scheduled_arrival: string | null
          scheduled_departure: string | null
          terminal: string | null
          updated_at: string
        }
        Insert: {
          actual_arrival?: string | null
          actual_departure?: string | null
          airline_name?: string | null
          arrival_airport?: string | null
          arrival_iata?: string | null
          arrival_timezone?: string | null
          created_at?: string
          delay_minutes?: number
          departure_airport?: string | null
          departure_iata?: string | null
          departure_timezone?: string | null
          estimated_arrival?: string | null
          estimated_departure?: string | null
          flight_date: string
          flight_key: string
          flight_status?: string
          gate?: string | null
          id?: string
          last_checked_at?: string
          lookup_count?: number
          marketed_carrier?: string | null
          marketed_flight_number?: string | null
          operating_carrier?: string | null
          operating_flight_number?: string | null
          provider?: string
          raw_response?: Json | null
          scheduled_arrival?: string | null
          scheduled_departure?: string | null
          terminal?: string | null
          updated_at?: string
        }
        Update: {
          actual_arrival?: string | null
          actual_departure?: string | null
          airline_name?: string | null
          arrival_airport?: string | null
          arrival_iata?: string | null
          arrival_timezone?: string | null
          created_at?: string
          delay_minutes?: number
          departure_airport?: string | null
          departure_iata?: string | null
          departure_timezone?: string | null
          estimated_arrival?: string | null
          estimated_departure?: string | null
          flight_date?: string
          flight_key?: string
          flight_status?: string
          gate?: string | null
          id?: string
          last_checked_at?: string
          lookup_count?: number
          marketed_carrier?: string | null
          marketed_flight_number?: string | null
          operating_carrier?: string | null
          operating_flight_number?: string | null
          provider?: string
          raw_response?: Json | null
          scheduled_arrival?: string | null
          scheduled_departure?: string | null
          terminal?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      flight_provider_reads: {
        Row: {
          booking_id: string | null
          created_at: string
          flight_key: string | null
          http_status: number | null
          id: string
          leg_id: string | null
          outcome: string
          paid: boolean
          provider: string
          read_day: string
          requested_by: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          flight_key?: string | null
          http_status?: number | null
          id?: string
          leg_id?: string | null
          outcome?: string
          paid?: boolean
          provider: string
          read_day?: string
          requested_by?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          flight_key?: string | null
          http_status?: number | null
          id?: string
          leg_id?: string | null
          outcome?: string
          paid?: boolean
          provider?: string
          read_day?: string
          requested_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flight_provider_reads_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_provider_reads_leg_id_fkey"
            columns: ["leg_id"]
            isOneToOne: false
            referencedRelation: "journey_legs"
            referencedColumns: ["id"]
          },
        ]
      }
      flight_read_locks: {
        Row: {
          flight_key: string
          locked_at: string
        }
        Insert: {
          flight_key: string
          locked_at?: string
        }
        Update: {
          flight_key?: string
          locked_at?: string
        }
        Relationships: []
      }
      flight_tracking: {
        Row: {
          actual_arrival: string | null
          actual_departure: string | null
          airline_name: string | null
          arrival_airport: string | null
          arrival_iata: string | null
          created_at: string
          delay_minutes: number | null
          departure_airport: string | null
          departure_iata: string | null
          estimated_arrival: string | null
          estimated_departure: string | null
          flight_number: string
          flight_status: string
          gate: string | null
          id: string
          last_checked_at: string
          pickup_id: string
          raw_response: Json | null
          scheduled_arrival: string | null
          scheduled_departure: string | null
          terminal: string | null
          updated_at: string
        }
        Insert: {
          actual_arrival?: string | null
          actual_departure?: string | null
          airline_name?: string | null
          arrival_airport?: string | null
          arrival_iata?: string | null
          created_at?: string
          delay_minutes?: number | null
          departure_airport?: string | null
          departure_iata?: string | null
          estimated_arrival?: string | null
          estimated_departure?: string | null
          flight_number: string
          flight_status?: string
          gate?: string | null
          id?: string
          last_checked_at?: string
          pickup_id: string
          raw_response?: Json | null
          scheduled_arrival?: string | null
          scheduled_departure?: string | null
          terminal?: string | null
          updated_at?: string
        }
        Update: {
          actual_arrival?: string | null
          actual_departure?: string | null
          airline_name?: string | null
          arrival_airport?: string | null
          arrival_iata?: string | null
          created_at?: string
          delay_minutes?: number | null
          departure_airport?: string | null
          departure_iata?: string | null
          estimated_arrival?: string | null
          estimated_departure?: string | null
          flight_number?: string
          flight_status?: string
          gate?: string | null
          id?: string
          last_checked_at?: string
          pickup_id?: string
          raw_response?: Json | null
          scheduled_arrival?: string | null
          scheduled_departure?: string | null
          terminal?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "flight_tracking_pickup_id_fkey"
            columns: ["pickup_id"]
            isOneToOne: true
            referencedRelation: "airport_pickups"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_arrival_stage_log: {
        Row: {
          booking_id: string
          context: Json | null
          fired_at: string
          id: string
          stage: string
          triggered_by: string
        }
        Insert: {
          booking_id: string
          context?: Json | null
          fired_at?: string
          id?: string
          stage: string
          triggered_by?: string
        }
        Update: {
          booking_id?: string
          context?: Json | null
          fired_at?: string
          id?: string
          stage?: string
          triggered_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_arrival_stage_log_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_document_access_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          booking_id: string | null
          created_at: string
          detail: string | null
          document_id: string | null
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          booking_id?: string | null
          created_at?: string
          detail?: string | null
          document_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          booking_id?: string | null
          created_at?: string
          detail?: string | null
          document_id?: string | null
          id?: string
        }
        Relationships: []
      }
      guest_documents: {
        Row: {
          booking_id: string
          created_at: string
          document_type: string
          file_name: string
          file_path: string
          id: string
          review_note: string | null
          review_reason: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          superseded: boolean
          tm30_marked_at: string | null
          tm30_marked_by: string | null
          uploaded_by: string | null
          used_for_tm30: boolean
          verification_notes: Json | null
          verification_status: string | null
          verified_at: string | null
        }
        Insert: {
          booking_id: string
          created_at?: string
          document_type?: string
          file_name: string
          file_path: string
          id?: string
          review_note?: string | null
          review_reason?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          superseded?: boolean
          tm30_marked_at?: string | null
          tm30_marked_by?: string | null
          uploaded_by?: string | null
          used_for_tm30?: boolean
          verification_notes?: Json | null
          verification_status?: string | null
          verified_at?: string | null
        }
        Update: {
          booking_id?: string
          created_at?: string
          document_type?: string
          file_name?: string
          file_path?: string
          id?: string
          review_note?: string | null
          review_reason?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          superseded?: boolean
          tm30_marked_at?: string | null
          tm30_marked_by?: string | null
          uploaded_by?: string | null
          used_for_tm30?: boolean
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
      guest_escalations: {
        Row: {
          channel: string
          chat_id: string
          created_at: string
          guest_user_id: string
          id: string
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          summary: string
        }
        Insert: {
          channel: string
          chat_id: string
          created_at?: string
          guest_user_id: string
          id?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          summary: string
        }
        Update: {
          channel?: string
          chat_id?: string
          created_at?: string
          guest_user_id?: string
          id?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          summary?: string
        }
        Relationships: []
      }
      guest_notes: {
        Row: {
          created_at: string
          created_by: string | null
          guest_id: string | null
          guest_key: string
          id: string
          note: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          guest_id?: string | null
          guest_key: string
          id?: string
          note: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          guest_id?: string | null
          guest_key?: string
          id?: string
          note?: string
          updated_at?: string
        }
        Relationships: []
      }
      guest_portal_activity: {
        Row: {
          action: string | null
          booking_id: string | null
          browser_name: string | null
          component: string | null
          correlation_id: string | null
          created_at: string
          device_type: string | null
          error_code: string | null
          error_message: string | null
          event_status: string
          event_type: string
          guest_id: string | null
          id: string
          is_in_app_browser: boolean
          message: string | null
          metadata: Json
          os_name: string | null
          route: string | null
          session_id: string | null
          severity: string
          source: string
          user_agent: string | null
        }
        Insert: {
          action?: string | null
          booking_id?: string | null
          browser_name?: string | null
          component?: string | null
          correlation_id?: string | null
          created_at?: string
          device_type?: string | null
          error_code?: string | null
          error_message?: string | null
          event_status?: string
          event_type: string
          guest_id?: string | null
          id?: string
          is_in_app_browser?: boolean
          message?: string | null
          metadata?: Json
          os_name?: string | null
          route?: string | null
          session_id?: string | null
          severity?: string
          source?: string
          user_agent?: string | null
        }
        Update: {
          action?: string | null
          booking_id?: string | null
          browser_name?: string | null
          component?: string | null
          correlation_id?: string | null
          created_at?: string
          device_type?: string | null
          error_code?: string | null
          error_message?: string | null
          event_status?: string
          event_type?: string
          guest_id?: string | null
          id?: string
          is_in_app_browser?: boolean
          message?: string | null
          metadata?: Json
          os_name?: string | null
          route?: string | null
          session_id?: string | null
          severity?: string
          source?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_portal_activity_booking_id_fkey"
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
          property_id: string | null
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
          property_id?: string | null
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
          property_id?: string | null
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
            foreignKeyName: "housekeeping_tasks_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_tasks_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_tasks_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units_public"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_secrets: {
        Row: {
          description: string | null
          encrypted_value: string
          id: string
          secret_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          description?: string | null
          encrypted_value: string
          id?: string
          secret_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          description?: string | null
          encrypted_value?: string
          id?: string
          secret_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      intelligence_entries: {
        Row: {
          approved_by: string | null
          audience: string[]
          body: string
          category: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          image_caption: string | null
          image_url: string | null
          location: string[] | null
          promoted_from: string | null
          property_id: string | null
          severity: string | null
          sort_order: number | null
          status: string
          title: string
          translations: Json
          type: string
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          audience?: string[]
          body: string
          category: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          image_caption?: string | null
          image_url?: string | null
          location?: string[] | null
          promoted_from?: string | null
          property_id?: string | null
          severity?: string | null
          sort_order?: number | null
          status?: string
          title: string
          translations?: Json
          type: string
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          audience?: string[]
          body?: string
          category?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          image_caption?: string | null
          image_url?: string | null
          location?: string[] | null
          promoted_from?: string | null
          property_id?: string | null
          severity?: string | null
          sort_order?: number | null
          status?: string
          title?: string
          translations?: Json
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_entries_promoted_from_fkey"
            columns: ["promoted_from"]
            isOneToOne: false
            referencedRelation: "intelligence_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_entries_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_evidence: {
        Row: {
          applied_fields: Json
          booking_id: string
          booking_reference_masked: string | null
          conflicts_created: number
          created_at: string
          error_message: string | null
          extracted_payload: Json | null
          extraction_status: string
          file_size: number | null
          id: string
          kind: string
          legs_created: number
          mime_type: string | null
          processed_at: string | null
          storage_path: string | null
          uploaded_by: string | null
          uploader_role: string
        }
        Insert: {
          applied_fields?: Json
          booking_id: string
          booking_reference_masked?: string | null
          conflicts_created?: number
          created_at?: string
          error_message?: string | null
          extracted_payload?: Json | null
          extraction_status?: string
          file_size?: number | null
          id?: string
          kind?: string
          legs_created?: number
          mime_type?: string | null
          processed_at?: string | null
          storage_path?: string | null
          uploaded_by?: string | null
          uploader_role?: string
        }
        Update: {
          applied_fields?: Json
          booking_id?: string
          booking_reference_masked?: string | null
          conflicts_created?: number
          created_at?: string
          error_message?: string | null
          extracted_payload?: Json | null
          extraction_status?: string
          file_size?: number | null
          id?: string
          kind?: string
          legs_created?: number
          mime_type?: string | null
          processed_at?: string | null
          storage_path?: string | null
          uploaded_by?: string | null
          uploader_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "journey_evidence_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_leg_field_provenance: {
        Row: {
          booking_id: string | null
          created_at: string
          field_name: string
          field_value: string | null
          id: string
          leg_id: string
          observed_at: string
          provider: string | null
          recorded_by: string | null
          source: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          field_name: string
          field_value?: string | null
          id?: string
          leg_id: string
          observed_at?: string
          provider?: string | null
          recorded_by?: string | null
          source: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          field_name?: string
          field_value?: string | null
          id?: string
          leg_id?: string
          observed_at?: string
          provider?: string | null
          recorded_by?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "journey_leg_field_provenance_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_leg_field_provenance_leg_id_fkey"
            columns: ["leg_id"]
            isOneToOne: false
            referencedRelation: "journey_legs"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_legs: {
        Row: {
          arrival_timezone: string | null
          booking_id: string
          confidence: string
          created_at: string
          departure_timezone: string | null
          flight_fact_id: string | null
          from_code: string | null
          from_name: string | null
          id: string
          is_final_leg: boolean
          leg_order: number
          leg_status: string
          leg_type: string
          marketed_carrier: string | null
          marketed_flight_number: string | null
          notes: string | null
          operating_carrier: string | null
          operating_flight_number: string | null
          pickup_id: string | null
          recorded_by: string | null
          scheduled_arrival: string | null
          scheduled_departure: string | null
          source: string
          to_code: string | null
          to_name: string | null
          updated_at: string
        }
        Insert: {
          arrival_timezone?: string | null
          booking_id: string
          confidence?: string
          created_at?: string
          departure_timezone?: string | null
          flight_fact_id?: string | null
          from_code?: string | null
          from_name?: string | null
          id?: string
          is_final_leg?: boolean
          leg_order?: number
          leg_status?: string
          leg_type?: string
          marketed_carrier?: string | null
          marketed_flight_number?: string | null
          notes?: string | null
          operating_carrier?: string | null
          operating_flight_number?: string | null
          pickup_id?: string | null
          recorded_by?: string | null
          scheduled_arrival?: string | null
          scheduled_departure?: string | null
          source?: string
          to_code?: string | null
          to_name?: string | null
          updated_at?: string
        }
        Update: {
          arrival_timezone?: string | null
          booking_id?: string
          confidence?: string
          created_at?: string
          departure_timezone?: string | null
          flight_fact_id?: string | null
          from_code?: string | null
          from_name?: string | null
          id?: string
          is_final_leg?: boolean
          leg_order?: number
          leg_status?: string
          leg_type?: string
          marketed_carrier?: string | null
          marketed_flight_number?: string | null
          notes?: string | null
          operating_carrier?: string | null
          operating_flight_number?: string | null
          pickup_id?: string | null
          recorded_by?: string | null
          scheduled_arrival?: string | null
          scheduled_departure?: string | null
          source?: string
          to_code?: string | null
          to_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journey_legs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_legs_flight_fact_id_fkey"
            columns: ["flight_fact_id"]
            isOneToOne: false
            referencedRelation: "flight_facts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_legs_pickup_id_fkey"
            columns: ["pickup_id"]
            isOneToOne: false
            referencedRelation: "airport_pickups"
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
          property_id: string | null
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
          property_id?: string | null
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
          property_id?: string | null
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
            foreignKeyName: "laundry_requests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "laundry_requests_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "laundry_requests_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units_public"
            referencedColumns: ["id"]
          },
        ]
      }
      local_recommendations: {
        Row: {
          address: string | null
          arrival_essential: boolean
          badges: string[]
          category: string
          closed_temporarily: boolean
          created_at: string
          created_by: string | null
          description: string | null
          distance_note: string | null
          featured: boolean
          id: string
          is_active: boolean
          last_reviewed_at: string | null
          last_reviewed_by: string | null
          maps_url: string | null
          name: string
          opening_hours: string | null
          phone: string | null
          photos: string[]
          property_id: string | null
          seasonal_note: string | null
          sort_order: number
          staff_notes: string | null
          updated_at: string
          website: string | null
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          arrival_essential?: boolean
          badges?: string[]
          category: string
          closed_temporarily?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          distance_note?: string | null
          featured?: boolean
          id?: string
          is_active?: boolean
          last_reviewed_at?: string | null
          last_reviewed_by?: string | null
          maps_url?: string | null
          name: string
          opening_hours?: string | null
          phone?: string | null
          photos?: string[]
          property_id?: string | null
          seasonal_note?: string | null
          sort_order?: number
          staff_notes?: string | null
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          arrival_essential?: boolean
          badges?: string[]
          category?: string
          closed_temporarily?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          distance_note?: string | null
          featured?: boolean
          id?: string
          is_active?: boolean
          last_reviewed_at?: string | null
          last_reviewed_by?: string | null
          maps_url?: string | null
          name?: string
          opening_hours?: string | null
          phone?: string | null
          photos?: string[]
          property_id?: string | null
          seasonal_note?: string | null
          sort_order?: number
          staff_notes?: string | null
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "local_recommendations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
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
          {
            foreignKeyName: "maintenance_blocks_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units_public"
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
          property_id: string | null
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
          property_id?: string | null
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
          property_id?: string | null
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
            foreignKeyName: "maintenance_requests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units_public"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_activity: {
        Row: {
          client_id: string | null
          client_name: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          input_summary: Json | null
          row_count: number | null
          success: boolean
          tool_name: string
          user_id: string | null
        }
        Insert: {
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input_summary?: Json | null
          row_count?: number | null
          success?: boolean
          tool_name: string
          user_id?: string | null
        }
        Update: {
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input_summary?: Json | null
          row_count?: number | null
          success?: boolean
          tool_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      media_library_assets: {
        Row: {
          alt_text: string | null
          caption: string | null
          created_at: string
          folder: string
          id: string
          original_filename: string | null
          property_id: string | null
          storage_path: string
          tags: string[]
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          alt_text?: string | null
          caption?: string | null
          created_at?: string
          folder?: string
          id?: string
          original_filename?: string | null
          property_id?: string | null
          storage_path: string
          tags?: string[]
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          alt_text?: string | null
          caption?: string | null
          created_at?: string
          folder?: string
          id?: string
          original_filename?: string | null
          property_id?: string | null
          storage_path?: string
          tags?: string[]
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          approved_by: string | null
          attachment_type: string | null
          attachment_url: string | null
          booking_id: string
          content: string
          created_at: string
          draft: boolean
          external_ref: string | null
          id: string
          is_internal: boolean
          property_id: string | null
          read_at: string | null
          sender_id: string | null
          source: string
        }
        Insert: {
          approved_by?: string | null
          attachment_type?: string | null
          attachment_url?: string | null
          booking_id: string
          content: string
          created_at?: string
          draft?: boolean
          external_ref?: string | null
          id?: string
          is_internal?: boolean
          property_id?: string | null
          read_at?: string | null
          sender_id?: string | null
          source?: string
        }
        Update: {
          approved_by?: string | null
          attachment_type?: string | null
          attachment_url?: string | null
          booking_id?: string
          content?: string
          created_at?: string
          draft?: boolean
          external_ref?: string | null
          id?: string
          is_internal?: boolean
          property_id?: string | null
          read_at?: string | null
          sender_id?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      messaging_chat_bindings: {
        Row: {
          channel: string
          chat_id: string
          created_at: string
          display_name: string | null
          id: string
          last_seen_at: string
          user_id: string
        }
        Insert: {
          channel: string
          chat_id: string
          created_at?: string
          display_name?: string | null
          id?: string
          last_seen_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          chat_id?: string
          created_at?: string
          display_name?: string | null
          id?: string
          last_seen_at?: string
          user_id?: string
        }
        Relationships: []
      }
      messaging_inbound_log: {
        Row: {
          channel: string
          chat_id: string
          created_at: string
          id: string
          inbound_text: string | null
          outbound_text: string | null
          outcome: string
          user_id: string | null
        }
        Insert: {
          channel: string
          chat_id: string
          created_at?: string
          id?: string
          inbound_text?: string | null
          outbound_text?: string | null
          outcome: string
          user_id?: string | null
        }
        Update: {
          channel?: string
          chat_id?: string
          created_at?: string
          id?: string
          inbound_text?: string | null
          outbound_text?: string | null
          outcome?: string
          user_id?: string | null
        }
        Relationships: []
      }
      messaging_link_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          id: string
          used_at: string | null
          used_channel: string | null
          used_chat_id: string | null
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          expires_at?: string
          id?: string
          used_at?: string | null
          used_channel?: string | null
          used_chat_id?: string | null
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          used_at?: string | null
          used_channel?: string | null
          used_chat_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      messaging_notification_log: {
        Row: {
          channel: string
          chat_id: string
          correlation_id: string | null
          created_at: string
          error: string | null
          error_category: string | null
          error_code: string | null
          id: string
          last_retry_at: string | null
          notification_type: string
          outcome: string
          provider_response: Json | null
          retry_count: number
          severity: string | null
          subject_id: string | null
          user_id: string
        }
        Insert: {
          channel: string
          chat_id: string
          correlation_id?: string | null
          created_at?: string
          error?: string | null
          error_category?: string | null
          error_code?: string | null
          id?: string
          last_retry_at?: string | null
          notification_type: string
          outcome: string
          provider_response?: Json | null
          retry_count?: number
          severity?: string | null
          subject_id?: string | null
          user_id: string
        }
        Update: {
          channel?: string
          chat_id?: string
          correlation_id?: string | null
          created_at?: string
          error?: string | null
          error_category?: string | null
          error_code?: string | null
          id?: string
          last_retry_at?: string | null
          notification_type?: string
          outcome?: string
          provider_response?: Json | null
          retry_count?: number
          severity?: string | null
          subject_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      messaging_notification_prefs: {
        Row: {
          channel: string
          created_at: string
          enabled: boolean
          id: string
          notification_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel: string
          created_at?: string
          enabled?: boolean
          id?: string
          notification_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          enabled?: boolean
          id?: string
          notification_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      messaging_thread_memory: {
        Row: {
          channel: string
          content: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          channel: string
          content: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          channel?: string
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      mfa_backup_codes: {
        Row: {
          code_hash: string
          created_at: string
          id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
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
      ops_passcode: {
        Row: {
          hash: string
          id: boolean
          iterations: number
          salt: string
          updated_at: string
          updated_by_user_id: string | null
        }
        Insert: {
          hash: string
          id?: boolean
          iterations?: number
          salt: string
          updated_at?: string
          updated_by_user_id?: string | null
        }
        Update: {
          hash?: string
          id?: boolean
          iterations?: number
          salt?: string
          updated_at?: string
          updated_by_user_id?: string | null
        }
        Relationships: []
      }
      ops_unlock_attempts: {
        Row: {
          created_at: string
          id: string
          reason: string | null
          succeeded: boolean
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          reason?: string | null
          succeeded: boolean
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string | null
          succeeded?: boolean
          user_id?: string | null
        }
        Relationships: []
      }
      ops_unlock_sessions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          last_used_at: string
          revoked_at: string | null
          token_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          last_used_at?: string
          revoked_at?: string | null
          token_hash: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          last_used_at?: string
          revoked_at?: string | null
          token_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      override_audit_log: {
        Row: {
          action_type: string
          actor_email: string | null
          actor_name: string | null
          actor_role: string | null
          actor_user_id: string | null
          after_state: Json
          attribution_missing: boolean
          before_state: Json
          booking_id: string | null
          created_at: string
          elevated: boolean
          elevation_grant_id: string | null
          id: string
          metadata: Json
          reason: string | null
          room_id: string | null
          source: string
          target_id: string | null
          target_type: string
        }
        Insert: {
          action_type: string
          actor_email?: string | null
          actor_name?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          after_state?: Json
          attribution_missing?: boolean
          before_state?: Json
          booking_id?: string | null
          created_at?: string
          elevated?: boolean
          elevation_grant_id?: string | null
          id?: string
          metadata?: Json
          reason?: string | null
          room_id?: string | null
          source?: string
          target_id?: string | null
          target_type: string
        }
        Update: {
          action_type?: string
          actor_email?: string | null
          actor_name?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          after_state?: Json
          attribution_missing?: boolean
          before_state?: Json
          booking_id?: string | null
          created_at?: string
          elevated?: boolean
          elevation_grant_id?: string | null
          id?: string
          metadata?: Json
          reason?: string | null
          room_id?: string | null
          source?: string
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      payment_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          last_error: string | null
          last_retry_at: string | null
          payload: Json
          payment_id: string | null
          processed: boolean
          provider: string
          provider_event_id: string
          retry_count: number
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          last_error?: string | null
          last_retry_at?: string | null
          payload?: Json
          payment_id?: string | null
          processed?: boolean
          provider: string
          provider_event_id: string
          retry_count?: number
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          last_error?: string | null
          last_retry_at?: string | null
          payload?: Json
          payment_id?: string | null
          processed?: boolean
          provider?: string
          provider_event_id?: string
          retry_count?: number
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
      payment_link_events: {
        Row: {
          actor_id: string | null
          actor_role: string | null
          booking_id: string | null
          context: Json
          created_at: string
          event_type: string
          id: string
          ip_hash: string | null
          payment_link_id: string | null
          user_agent: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_role?: string | null
          booking_id?: string | null
          context?: Json
          created_at?: string
          event_type: string
          id?: string
          ip_hash?: string | null
          payment_link_id?: string | null
          user_agent?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_role?: string | null
          booking_id?: string | null
          context?: Json
          created_at?: string
          event_type?: string
          id?: string
          ip_hash?: string | null
          payment_link_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_link_events_payment_link_id_fkey"
            columns: ["payment_link_id"]
            isOneToOne: false
            referencedRelation: "payment_links"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_links: {
        Row: {
          abuse_locked_at: string | null
          abuse_reason: string | null
          amount: number
          attempt_count: number
          booking_id: string
          checkout_session_id: string | null
          checkout_started_at: string | null
          created_at: string
          created_by: string
          currency: string
          expires_at: string
          id: string
          last_attempt_at: string | null
          metadata: Json
          revoked_at: string | null
          revoked_by: string | null
          token_hash: string
          used_at: string | null
          used_session_id: string | null
        }
        Insert: {
          abuse_locked_at?: string | null
          abuse_reason?: string | null
          amount: number
          attempt_count?: number
          booking_id: string
          checkout_session_id?: string | null
          checkout_started_at?: string | null
          created_at?: string
          created_by: string
          currency?: string
          expires_at: string
          id?: string
          last_attempt_at?: string | null
          metadata?: Json
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash: string
          used_at?: string | null
          used_session_id?: string | null
        }
        Update: {
          abuse_locked_at?: string | null
          abuse_reason?: string | null
          amount?: number
          attempt_count?: number
          booking_id?: string
          checkout_session_id?: string | null
          checkout_started_at?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          expires_at?: string
          id?: string
          last_attempt_at?: string | null
          metadata?: Json
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash?: string
          used_at?: string | null
          used_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_links_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_reconciliation_log: {
        Row: {
          actual: number | null
          created_at: string
          details: Json
          expected: number | null
          id: string
          kind: string
          payment_id: string | null
          run_at: string
          severity: string
          stripe_object_id: string | null
        }
        Insert: {
          actual?: number | null
          created_at?: string
          details?: Json
          expected?: number | null
          id?: string
          kind: string
          payment_id?: string | null
          run_at?: string
          severity?: string
          stripe_object_id?: string | null
        }
        Update: {
          actual?: number | null
          created_at?: string
          details?: Json
          expected?: number | null
          id?: string
          kind?: string
          payment_id?: string | null
          run_at?: string
          severity?: string
          stripe_object_id?: string | null
        }
        Relationships: []
      }
      payment_rejection_log: {
        Row: {
          actor_id: string | null
          actor_role: string | null
          attempted_amount: number
          booking_id: string | null
          computed_outstanding: number | null
          created_at: string
          id: string
          message: string | null
          method: string | null
          origin: string
          reason_code: string
          source_channel: string | null
          tolerance: number
        }
        Insert: {
          actor_id?: string | null
          actor_role?: string | null
          attempted_amount: number
          booking_id?: string | null
          computed_outstanding?: number | null
          created_at?: string
          id?: string
          message?: string | null
          method?: string | null
          origin?: string
          reason_code: string
          source_channel?: string | null
          tolerance?: number
        }
        Update: {
          actor_id?: string | null
          actor_role?: string | null
          attempted_amount?: number
          booking_id?: string | null
          computed_outstanding?: number | null
          created_at?: string
          id?: string
          message?: string | null
          method?: string | null
          origin?: string
          reason_code?: string
          source_channel?: string | null
          tolerance?: number
        }
        Relationships: [
          {
            foreignKeyName: "payment_rejection_log_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          archived_booking_snapshot: Json | null
          booking_id: string | null
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
          archived_booking_snapshot?: Json | null
          booking_id?: string | null
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
          archived_booking_snapshot?: Json | null
          booking_id?: string | null
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
      pickup_driver_links: {
        Row: {
          booking_id: string
          collected_at: string | null
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          last_viewed_at: string | null
          pickup_id: string
          revoked_at: string | null
          token: string
          view_count: number
        }
        Insert: {
          booking_id: string
          collected_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          last_viewed_at?: string | null
          pickup_id: string
          revoked_at?: string | null
          token: string
          view_count?: number
        }
        Update: {
          booking_id?: string
          collected_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          last_viewed_at?: string | null
          pickup_id?: string
          revoked_at?: string | null
          token?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "pickup_driver_links_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickup_driver_links_pickup_id_fkey"
            columns: ["pickup_id"]
            isOneToOne: false
            referencedRelation: "airport_pickups"
            referencedColumns: ["id"]
          },
        ]
      }
      pickup_driver_messages: {
        Row: {
          booking_id: string
          content: string
          created_at: string
          driver_link_id: string | null
          id: string
          pickup_id: string
          read_by_driver_at: string | null
          read_by_guest_at: string | null
          read_by_staff_at: string | null
          sender_type: string
          sender_user_id: string | null
        }
        Insert: {
          booking_id: string
          content: string
          created_at?: string
          driver_link_id?: string | null
          id?: string
          pickup_id: string
          read_by_driver_at?: string | null
          read_by_guest_at?: string | null
          read_by_staff_at?: string | null
          sender_type: string
          sender_user_id?: string | null
        }
        Update: {
          booking_id?: string
          content?: string
          created_at?: string
          driver_link_id?: string | null
          id?: string
          pickup_id?: string
          read_by_driver_at?: string | null
          read_by_guest_at?: string | null
          read_by_staff_at?: string | null
          sender_type?: string
          sender_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pickup_driver_messages_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickup_driver_messages_driver_link_id_fkey"
            columns: ["driver_link_id"]
            isOneToOne: false
            referencedRelation: "pickup_driver_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickup_driver_messages_pickup_id_fkey"
            columns: ["pickup_id"]
            isOneToOne: false
            referencedRelation: "airport_pickups"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_guidance: {
        Row: {
          ai_prompt_suggestions: string[]
          common_tasks: string[]
          created_at: string
          detailed_explanation: string | null
          feature_name: string
          guest_visible: boolean
          id: string
          internal_only: boolean
          key: string
          not_used_for: string[]
          page_help: string | null
          related_keys: string[]
          risk_level: Database["public"]["Enums"]["guidance_risk"]
          roles_allowed: string[]
          route: string | null
          section: string | null
          short_tooltip: string
          status: Database["public"]["Enums"]["guidance_status"]
          step_by_step: Json
          tone: Database["public"]["Enums"]["guidance_tone"]
          updated_at: string
          updated_by: string | null
          used_for: string[]
          warnings: string[]
        }
        Insert: {
          ai_prompt_suggestions?: string[]
          common_tasks?: string[]
          created_at?: string
          detailed_explanation?: string | null
          feature_name: string
          guest_visible?: boolean
          id?: string
          internal_only?: boolean
          key: string
          not_used_for?: string[]
          page_help?: string | null
          related_keys?: string[]
          risk_level?: Database["public"]["Enums"]["guidance_risk"]
          roles_allowed?: string[]
          route?: string | null
          section?: string | null
          short_tooltip: string
          status?: Database["public"]["Enums"]["guidance_status"]
          step_by_step?: Json
          tone?: Database["public"]["Enums"]["guidance_tone"]
          updated_at?: string
          updated_by?: string | null
          used_for?: string[]
          warnings?: string[]
        }
        Update: {
          ai_prompt_suggestions?: string[]
          common_tasks?: string[]
          created_at?: string
          detailed_explanation?: string | null
          feature_name?: string
          guest_visible?: boolean
          id?: string
          internal_only?: boolean
          key?: string
          not_used_for?: string[]
          page_help?: string | null
          related_keys?: string[]
          risk_level?: Database["public"]["Enums"]["guidance_risk"]
          roles_allowed?: string[]
          route?: string | null
          section?: string | null
          short_tooltip?: string
          status?: Database["public"]["Enums"]["guidance_status"]
          step_by_step?: Json
          tone?: Database["public"]["Enums"]["guidance_tone"]
          updated_at?: string
          updated_by?: string | null
          used_for?: string[]
          warnings?: string[]
        }
        Relationships: []
      }
      policy_settings: {
        Row: {
          description: string | null
          id: string
          key: string
          property_id: string | null
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          property_id?: string | null
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          property_id?: string | null
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "policy_settings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_settings_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          key: string
          new_value: Json | null
          old_value: Json | null
          property_id: string | null
          setting_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          key: string
          new_value?: Json | null
          old_value?: Json | null
          property_id?: string | null
          setting_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          key?: string
          new_value?: Json | null
          old_value?: Json | null
          property_id?: string | null
          setting_id?: string
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
          group_id: string | null
          id: string
          min_nights: number | null
          name: string
          price: number
          start_date: string
          unit_id: string | null
          weekend_price: number | null
        }
        Insert: {
          adjustment_type?: string
          adjustment_value?: number | null
          created_at?: string
          end_date: string
          group_id?: string | null
          id?: string
          min_nights?: number | null
          name: string
          price: number
          start_date: string
          unit_id?: string | null
          weekend_price?: number | null
        }
        Update: {
          adjustment_type?: string
          adjustment_value?: number | null
          created_at?: string
          end_date?: string
          group_id?: string | null
          id?: string
          min_nights?: number | null
          name?: string
          price?: number
          start_date?: string
          unit_id?: string | null
          weekend_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rules_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "unit_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_rules_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_rules_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units_public"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_audit_log: {
        Row: {
          changed_by: string | null
          created_at: string
          field_name: string
          id: string
          new_value: string | null
          old_value: string | null
          profile_user_id: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          field_name: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          profile_user_id: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          field_name?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          profile_user_id?: string
        }
        Relationships: []
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
      properties: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_sandbox: boolean
          name: string
          operational_mode: string
          settings: Json
          slug: string
          timezone: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_sandbox?: boolean
          name: string
          operational_mode?: string
          settings?: Json
          slug: string
          timezone?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_sandbox?: boolean
          name?: string
          operational_mode?: string
          settings?: Json
          slug?: string
          timezone?: string
        }
        Relationships: []
      }
      push_delivery_log: {
        Row: {
          created_at: string
          endpoint_tail: string | null
          error: string | null
          http_status: number | null
          id: string
          source: string | null
          status: string
          title: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          endpoint_tail?: string | null
          error?: string | null
          http_status?: number | null
          id?: string
          source?: string | null
          status: string
          title?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          endpoint_tail?: string | null
          error?: string | null
          http_status?: number | null
          id?: string
          source?: string | null
          status?: string
          title?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          failure_count: number
          id: string
          last_error: string | null
          last_success_at: string | null
          p256dh: string
          platform: string | null
          standalone: boolean | null
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          failure_count?: number
          id?: string
          last_error?: string | null
          last_success_at?: string | null
          p256dh: string
          platform?: string | null
          standalone?: boolean | null
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          failure_count?: number
          id?: string
          last_error?: string | null
          last_success_at?: string | null
          p256dh?: string
          platform?: string | null
          standalone?: boolean | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      recovery_audit_log: {
        Row: {
          action: string
          category: string
          created_at: string
          details: Json | null
          failure_reason: string | null
          id: string
          outcome: string
          user_id: string | null
          user_role: string | null
        }
        Insert: {
          action: string
          category?: string
          created_at?: string
          details?: Json | null
          failure_reason?: string | null
          id?: string
          outcome?: string
          user_id?: string | null
          user_role?: string | null
        }
        Update: {
          action?: string
          category?: string
          created_at?: string
          details?: Json | null
          failure_reason?: string | null
          id?: string
          outcome?: string
          user_id?: string | null
          user_role?: string | null
        }
        Relationships: []
      }
      recovery_snapshots: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_email: string | null
          id: string
          kind: string
          label: string
          notes: string | null
          payload: Json
          size_bytes: number
          table_counts: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          id?: string
          kind?: string
          label: string
          notes?: string | null
          payload?: Json
          size_bytes?: number
          table_counts?: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          id?: string
          kind?: string
          label?: string
          notes?: string | null
          payload?: Json
          size_bytes?: number
          table_counts?: Json
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
          deduction_evidence_urls: string[] | null
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
          deduction_evidence_urls?: string[] | null
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
          deduction_evidence_urls?: string[] | null
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
      staff_audit_events: {
        Row: {
          actor_email: string | null
          actor_id: string | null
          actor_role: string | null
          created_at: string
          event_type: string
          id: string
          ip_address: string | null
          metadata: Json
          reason: string | null
          severity: string
          target_user_id: string | null
          user_agent: string | null
        }
        Insert: {
          actor_email?: string | null
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          event_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          reason?: string | null
          severity?: string
          target_user_id?: string | null
          user_agent?: string | null
        }
        Update: {
          actor_email?: string | null
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          event_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          reason?: string | null
          severity?: string
          target_user_id?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      staff_phone_numbers: {
        Row: {
          channel: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          label: string
          phone_e164: string
          phone_raw: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label: string
          phone_e164: string
          phone_raw: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label?: string
          phone_e164?: string
          phone_raw?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      stay_modifications: {
        Row: {
          actor_email: string | null
          actor_id: string | null
          actor_role: string | null
          after_snapshot: Json
          before_snapshot: Json
          booking_id: string
          calculated_amount: number
          created_at: string
          final_amount: number
          hold_expires_at: string | null
          id: string
          kind: string
          notes: string | null
          payment_status: string
          pricing_after: number
          pricing_before: number
          reason_code: string
          status: string
          updated_at: string
          waived_amount: number
        }
        Insert: {
          actor_email?: string | null
          actor_id?: string | null
          actor_role?: string | null
          after_snapshot?: Json
          before_snapshot?: Json
          booking_id: string
          calculated_amount?: number
          created_at?: string
          final_amount?: number
          hold_expires_at?: string | null
          id?: string
          kind?: string
          notes?: string | null
          payment_status?: string
          pricing_after?: number
          pricing_before?: number
          reason_code?: string
          status?: string
          updated_at?: string
          waived_amount?: number
        }
        Update: {
          actor_email?: string | null
          actor_id?: string | null
          actor_role?: string | null
          after_snapshot?: Json
          before_snapshot?: Json
          booking_id?: string
          calculated_amount?: number
          created_at?: string
          final_amount?: number
          hold_expires_at?: string | null
          id?: string
          kind?: string
          notes?: string | null
          payment_status?: string
          pricing_after?: number
          pricing_before?: number
          reason_code?: string
          status?: string
          updated_at?: string
          waived_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "stay_modifications_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
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
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      tax_invoices: {
        Row: {
          booking_id: string | null
          buyer_email: string | null
          buyer_name: string | null
          buyer_tax_id: string | null
          created_at: string
          currency_code: string
          gross_amount: number
          id: string
          invoice_number: string
          issued_at: string
          issued_by: string | null
          net_amount: number
          payment_id: string | null
          pdf_storage_path: string | null
          seller_snapshot: Json | null
          tax_rate: number
          vat_amount: number
        }
        Insert: {
          booking_id?: string | null
          buyer_email?: string | null
          buyer_name?: string | null
          buyer_tax_id?: string | null
          created_at?: string
          currency_code?: string
          gross_amount: number
          id?: string
          invoice_number: string
          issued_at?: string
          issued_by?: string | null
          net_amount: number
          payment_id?: string | null
          pdf_storage_path?: string | null
          seller_snapshot?: Json | null
          tax_rate: number
          vat_amount: number
        }
        Update: {
          booking_id?: string | null
          buyer_email?: string | null
          buyer_name?: string | null
          buyer_tax_id?: string | null
          created_at?: string
          currency_code?: string
          gross_amount?: number
          id?: string
          invoice_number?: string
          issued_at?: string
          issued_by?: string | null
          net_amount?: number
          payment_id?: string | null
          pdf_storage_path?: string | null
          seller_snapshot?: Json | null
          tax_rate?: number
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "tax_invoices_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_bot_state: {
        Row: {
          id: number
          update_offset: number
          updated_at: string
        }
        Insert: {
          id: number
          update_offset?: number
          updated_at?: string
        }
        Update: {
          id?: number
          update_offset?: number
          updated_at?: string
        }
        Relationships: []
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
      trusted_devices: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          browser: string | null
          created_at: string
          device_key: string
          device_type: string
          expires_at: string | null
          first_seen_at: string
          id: string
          ip_address: string | null
          is_sandbox: boolean
          label: string
          last_mfa_verified_at: string | null
          last_seen_at: string
          os: string | null
          status: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          browser?: string | null
          created_at?: string
          device_key: string
          device_type?: string
          expires_at?: string | null
          first_seen_at?: string
          id?: string
          ip_address?: string | null
          is_sandbox?: boolean
          label?: string
          last_mfa_verified_at?: string | null
          last_seen_at?: string
          os?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          browser?: string | null
          created_at?: string
          device_key?: string
          device_type?: string
          expires_at?: string | null
          first_seen_at?: string
          id?: string
          ip_address?: string | null
          is_sandbox?: boolean
          label?: string
          last_mfa_verified_at?: string | null
          last_seen_at?: string
          os?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
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
          cleaning_mode: string
          created_at: string
          description: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          extra_bed_fee: number | null
          group_id: string | null
          house_rules_detail: string | null
          id: string
          is_active: boolean
          listing_category: string
          max_extra_beds: number
          min_billable_guests: number | null
          min_nights: number
          monthly_rate: number | null
          name: string
          photos: string[] | null
          pricing_type: string
          property_id: string | null
          region: string | null
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
          cleaning_mode?: string
          created_at?: string
          description?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          extra_bed_fee?: number | null
          group_id?: string | null
          house_rules_detail?: string | null
          id?: string
          is_active?: boolean
          listing_category?: string
          max_extra_beds?: number
          min_billable_guests?: number | null
          min_nights?: number
          monthly_rate?: number | null
          name: string
          photos?: string[] | null
          pricing_type?: string
          property_id?: string | null
          region?: string | null
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
          cleaning_mode?: string
          created_at?: string
          description?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          extra_bed_fee?: number | null
          group_id?: string | null
          house_rules_detail?: string | null
          id?: string
          is_active?: boolean
          listing_category?: string
          max_extra_beds?: number
          min_billable_guests?: number | null
          min_nights?: number
          monthly_rate?: number | null
          name?: string
          photos?: string[] | null
          pricing_type?: string
          property_id?: string | null
          region?: string | null
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
          {
            foreignKeyName: "units_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      user_consents: {
        Row: {
          consent_type: string
          granted_at: string
          id: string
          ip_address: string | null
          metadata: Json | null
          policy_version: string
          user_agent: string | null
          user_id: string
          withdrawn_at: string | null
        }
        Insert: {
          consent_type: string
          granted_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          policy_version: string
          user_agent?: string | null
          user_id: string
          withdrawn_at?: string | null
        }
        Update: {
          consent_type?: string
          granted_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          policy_version?: string
          user_agent?: string | null
          user_id?: string
          withdrawn_at?: string | null
        }
        Relationships: []
      }
      user_property_assignments: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          property_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          property_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          property_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_property_assignments_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
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
      vanta_event_log: {
        Row: {
          accepted_at: string | null
          created_at: string
          direction: string
          error_summary: string | null
          event_id: string
          event_type: string
          failed_at: string | null
          id: string
          idempotency_key: string
          payload_summary: Json
          retry_count: number
          sent_at: string | null
          status: string
          vanta_response_code: number | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          direction?: string
          error_summary?: string | null
          event_id: string
          event_type: string
          failed_at?: string | null
          id?: string
          idempotency_key: string
          payload_summary?: Json
          retry_count?: number
          sent_at?: string | null
          status?: string
          vanta_response_code?: number | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          direction?: string
          error_summary?: string | null
          event_id?: string
          event_type?: string
          failed_at?: string | null
          id?: string
          idempotency_key?: string
          payload_summary?: Json
          retry_count?: number
          sent_at?: string | null
          status?: string
          vanta_response_code?: number | null
        }
        Relationships: []
      }
      vanta_integration_session: {
        Row: {
          allowed_events: Json
          callback_mode: string
          created_at: string
          enabled: boolean
          environment: string
          failure_count: number
          id: string
          identity_strategy: string
          last_error_summary: string | null
          last_event_id: string | null
          last_event_sent_at: string | null
          last_failure_at: string | null
          last_response_code: number | null
          last_response_snippet: string | null
          last_success_at: string | null
          platform_key: string
          platform_name: string
          shared_secret_configured: boolean
          source_id: string
          status: string
          updated_at: string
          updated_by: string | null
          vanta_owner_identifier: string | null
          vanta_webhook_url: string | null
        }
        Insert: {
          allowed_events?: Json
          callback_mode?: string
          created_at?: string
          enabled?: boolean
          environment?: string
          failure_count?: number
          id?: string
          identity_strategy?: string
          last_error_summary?: string | null
          last_event_id?: string | null
          last_event_sent_at?: string | null
          last_failure_at?: string | null
          last_response_code?: number | null
          last_response_snippet?: string | null
          last_success_at?: string | null
          platform_key?: string
          platform_name?: string
          shared_secret_configured?: boolean
          source_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          vanta_owner_identifier?: string | null
          vanta_webhook_url?: string | null
        }
        Update: {
          allowed_events?: Json
          callback_mode?: string
          created_at?: string
          enabled?: boolean
          environment?: string
          failure_count?: number
          id?: string
          identity_strategy?: string
          last_error_summary?: string | null
          last_event_id?: string | null
          last_event_sent_at?: string | null
          last_failure_at?: string | null
          last_response_code?: number | null
          last_response_snippet?: string | null
          last_success_at?: string | null
          platform_key?: string
          platform_name?: string
          shared_secret_configured?: boolean
          source_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          vanta_owner_identifier?: string | null
          vanta_webhook_url?: string | null
        }
        Relationships: []
      }
      vanta_lookup_audit: {
        Row: {
          audit_id: string
          authorized: boolean
          created_at: string
          environment: string | null
          error_summary: string | null
          fields_returned: string[]
          id: string
          lookup_id: string | null
          lookup_type: string
          purpose: string | null
          request_id: string | null
          requester_source: string
          response_status: string
          sensitivity_level: string | null
          signature_valid: boolean
        }
        Insert: {
          audit_id: string
          authorized?: boolean
          created_at?: string
          environment?: string | null
          error_summary?: string | null
          fields_returned?: string[]
          id?: string
          lookup_id?: string | null
          lookup_type: string
          purpose?: string | null
          request_id?: string | null
          requester_source?: string
          response_status: string
          sensitivity_level?: string | null
          signature_valid?: boolean
        }
        Update: {
          audit_id?: string
          authorized?: boolean
          created_at?: string
          environment?: string | null
          error_summary?: string | null
          fields_returned?: string[]
          id?: string
          lookup_id?: string | null
          lookup_type?: string
          purpose?: string | null
          request_id?: string | null
          requester_source?: string
          response_status?: string
          sensitivity_level?: string | null
          signature_valid?: boolean
        }
        Relationships: []
      }
      webhook_health: {
        Row: {
          id: string
          last_event_id: string | null
          last_failure_at: string | null
          last_failure_reason: string | null
          last_received_at: string | null
          last_success_at: string | null
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          id?: string
          last_event_id?: string | null
          last_failure_at?: string | null
          last_failure_reason?: string | null
          last_received_at?: string | null
          last_success_at?: string | null
          provider: string
          status?: string
          updated_at?: string
        }
        Update: {
          id?: string
          last_event_id?: string | null
          last_failure_at?: string | null
          last_failure_reason?: string | null
          last_received_at?: string | null
          last_success_at?: string | null
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      email_failure_groups: {
        Row: {
          booking_id: string | null
          correlation_id: string | null
          failure_category: string | null
          first_failed_at: string | null
          last_failed_at: string | null
          latest_id: string | null
          max_retries: number | null
          occurrence_count: number | null
          reason: string | null
          recipient_email: string | null
          template_key: string | null
        }
        Relationships: []
      }
      units_public: {
        Row: {
          amenities: string[] | null
          base_price: number | null
          capacity: number | null
          cleaning_fee: number | null
          created_at: string | null
          description: string | null
          extra_bed_fee: number | null
          group_id: string | null
          house_rules_detail: string | null
          id: string | null
          is_active: boolean | null
          max_extra_beds: number | null
          min_nights: number | null
          monthly_rate: number | null
          name: string | null
          photos: string[] | null
          pricing_type: string | null
          property_id: string | null
          reviews_enabled: boolean | null
          rules: string | null
          sort_order: number | null
          updated_at: string | null
          weekend_price: number | null
          weekly_rate: number | null
        }
        Insert: {
          amenities?: string[] | null
          base_price?: number | null
          capacity?: number | null
          cleaning_fee?: number | null
          created_at?: string | null
          description?: string | null
          extra_bed_fee?: number | null
          group_id?: string | null
          house_rules_detail?: string | null
          id?: string | null
          is_active?: boolean | null
          max_extra_beds?: number | null
          min_nights?: number | null
          monthly_rate?: number | null
          name?: string | null
          photos?: string[] | null
          pricing_type?: string | null
          property_id?: string | null
          reviews_enabled?: boolean | null
          rules?: string | null
          sort_order?: number | null
          updated_at?: string | null
          weekend_price?: number | null
          weekly_rate?: number | null
        }
        Update: {
          amenities?: string[] | null
          base_price?: number | null
          capacity?: number | null
          cleaning_fee?: number | null
          created_at?: string | null
          description?: string | null
          extra_bed_fee?: number | null
          group_id?: string | null
          house_rules_detail?: string | null
          id?: string | null
          is_active?: boolean | null
          max_extra_beds?: number | null
          min_nights?: number | null
          monthly_rate?: number | null
          name?: string | null
          photos?: string[] | null
          pricing_type?: string | null
          property_id?: string | null
          reviews_enabled?: boolean | null
          rules?: string | null
          sort_order?: number | null
          updated_at?: string | null
          weekend_price?: number | null
          weekly_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "units_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "unit_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      assign_sandbox_to_caller: { Args: never; Returns: string }
      assign_unit_for_group: {
        Args: { _check_in: string; _check_out: string; _group_id: string }
        Returns: {
          available_count: number
          total_count: number
          unit_id: string
          unit_name: string
        }[]
      }
      can_read_payments: { Args: { _user_id: string }; Returns: boolean }
      can_record_offline_payment: {
        Args: { _user_id: string }
        Returns: boolean
      }
      can_view_guest_documents: { Args: { _user_id: string }; Returns: boolean }
      cleanup_expired_link_codes: { Args: never; Returns: undefined }
      count_overrides_missing_attribution: { Args: never; Returns: number }
      create_recovery_snapshot: {
        Args: { _kind?: string; _label: string; _notes?: string }
        Returns: string
      }
      device_self_approval_allowed: { Args: never; Returns: boolean }
      emit_admin_alert: {
        Args: {
          _context?: Json
          _deep_link?: string
          _event_type: string
          _message: string
          _reference_id?: string
        }
        Returns: undefined
      }
      get_booking_operational_timeline: {
        Args: { _booking_id: string }
        Returns: {
          actor: string
          category: string
          data: Json
          detail: string
          label: string
          occurred_at: string
        }[]
      }
      get_email_deliverability: {
        Args: { _email: string }
        Returns: {
          reason: string
          since: string
        }[]
      }
      get_guest_bookings: {
        Args: { _guest_key: string }
        Returns: {
          booking_id: string
          check_in: string
          check_out: string
          confirmation_number: string
          created_at: string
          num_guests: number
          owed: number
          paid: number
          state: string
          total_price: number
          unit_name: string
        }[]
      }
      get_guest_directory: {
        Args: never
        Returns: {
          cancelled_bookings: number
          completed_stays: number
          email: string
          first_seen: string
          full_name: string
          guest_id: string
          guest_key: string
          in_house: boolean
          is_linked: boolean
          last_check_out: string
          lifetime_spend: number
          next_check_in: string
          outstanding_balance: number
          phone: string
          preferred_language: string
          total_bookings: number
          total_nights: number
          upcoming_stays: number
        }[]
      }
      get_integration_secret: { Args: { _key: string }; Returns: string }
      get_message_sender_labels: {
        Args: { _booking_id: string }
        Returns: {
          display_name: string
          is_staff: boolean
          sender_id: string
          staff_label: string
        }[]
      }
      get_ops_exceptions: {
        Args: never
        Returns: {
          affected_system: string
          booking_id: string
          check_in: string
          detail: Json
          exception_key: string
          guest_name: string
          severity: string
          suggested_action: string
          unit_name: string
          what_failed: string
          why_matters: string
        }[]
      }
      get_ops_service_health: {
        Args: never
        Returns: {
          detail: Json
          key: string
          label: string
          last_error: string
          last_failure_at: string
          last_success_at: string
          source: string
          status: string
        }[]
      }
      get_unit_essentials: {
        Args: { _unit_id: string }
        Returns: {
          emergency_contact_name: string
          emergency_contact_phone: string
          house_rules_detail: string
          wifi_network: string
          wifi_password: string
        }[]
      }
      get_unit_private_fields: {
        Args: { _unit_id: string }
        Returns: {
          emergency_contact_name: string
          emergency_contact_phone: string
          wifi_network: string
          wifi_password: string
        }[]
      }
      grant_admin_elevation: {
        Args: { _minutes?: number; _reason?: string; _subject_user_id?: string }
        Returns: string
      }
      has_active_elevation: { Args: { _user_id: string }; Returns: boolean }
      has_ops_read: { Args: { _user_id: string }; Returns: boolean }
      has_ops_unlock: { Args: { _user_id: string }; Returns: boolean }
      has_ops_write: { Args: { _user_id: string }; Returns: boolean }
      has_property_access: {
        Args: { _property_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_payment_event_retry: {
        Args: { _error: string; _provider_event_id: string }
        Returns: undefined
      }
      increment_payment_link_attempt: {
        Args: { _link_id: string }
        Returns: number
      }
      is_manual_offline_payment_row: {
        Args: {
          _method: string
          _provider: string
          _provider_session_id: string
          _provider_status: string
          _provider_transaction_id: string
          _receipt_url: string
          _source_channel: string
          _status: string
        }
        Returns: boolean
      }
      is_offline_payment_method: { Args: { _method: string }; Returns: boolean }
      is_ops_passcode_set: { Args: never; Returns: boolean }
      is_sandbox_booking: { Args: { _booking_id: string }; Returns: boolean }
      is_sandbox_property: { Args: { _property_id: string }; Returns: boolean }
      is_secret_configured: { Args: { _key: string }; Returns: boolean }
      lock_payment_link_abuse: {
        Args: { _link_id: string; _reason: string }
        Returns: undefined
      }
      log_offline_payment_rejection: {
        Args: {
          _amount: number
          _booking_id: string
          _message?: string
          _method?: string
          _origin?: string
          _reason_code: string
          _source_channel?: string
        }
        Returns: string
      }
      log_override_event: {
        Args: {
          _action_type: string
          _after_state?: Json
          _before_state?: Json
          _booking_id?: string
          _metadata?: Json
          _reason?: string
          _room_id?: string
          _source?: string
          _target_id?: string
          _target_type: string
        }
        Returns: string
      }
      log_staff_audit_event: {
        Args: {
          _actor_id?: string
          _event_type: string
          _metadata?: Json
          _reason?: string
          _severity?: string
          _target_user_id?: string
        }
        Returns: string
      }
      merge_guest_records: {
        Args: { _source_key: string; _target_key: string }
        Returns: number
      }
      mfa_backup_codes_remaining: { Args: never; Returns: number }
      my_active_elevation: {
        Args: never
        Returns: {
          expires_at: string
          granted_by_user_id: string
          id: string
          minutes: number
          reason: string
          self_issued: boolean
        }[]
      }
      normalize_phone: { Args: { _raw: string }; Returns: string }
      record_offline_payment: {
        Args: {
          _amount: number
          _booking_id: string
          _method: string
          _notes?: string
          _payment_type?: string
          _recovery_note?: string
          _source_channel?: string
        }
        Returns: string
      }
      reset_sandbox: { Args: never; Returns: Json }
      resolve_staff_phone: {
        Args: { _raw: string }
        Returns: {
          full_name: string
          label: string
          user_id: string
        }[]
      }
      revoke_admin_elevation: { Args: { _grant_id: string }; Returns: boolean }
      swap_booking_rooms: {
        Args: { _booking_a: string; _booking_b: string; _reason?: string }
        Returns: Json
      }
      sync_booking_from_segments: {
        Args: { _booking_id: string }
        Returns: undefined
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
      guidance_risk: "low" | "medium" | "high"
      guidance_status: "draft" | "approved" | "archived"
      guidance_tone: "neutral" | "friendly" | "dry_humor" | "thai_east_coast"
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
      guidance_risk: ["low", "medium", "high"],
      guidance_status: ["draft", "approved", "archived"],
      guidance_tone: ["neutral", "friendly", "dry_humor", "thai_east_coast"],
    },
  },
} as const
