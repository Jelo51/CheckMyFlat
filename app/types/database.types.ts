export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '13'
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          value: NonNullable<Json>
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          value: NonNullable<Json>
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          value?: NonNullable<Json>
        }
        Relationships: []
      }
      criteria: {
        Row: {
          active: boolean
          block_id: string
          code: string
          id: string
          label: string
          position: number
          short_label: string
        }
        Insert: {
          active?: boolean
          block_id: string
          code: string
          id?: string
          label: string
          position: number
          short_label: string
        }
        Update: {
          active?: boolean
          block_id?: string
          code?: string
          id?: string
          label?: string
          position?: number
          short_label?: string
        }
        Relationships: [
          {
            foreignKeyName: 'criteria_block_id_fkey'
            columns: ['block_id']
            isOneToOne: false
            referencedRelation: 'criteria_blocks'
            referencedColumns: ['id']
          },
        ]
      }
      criteria_blocks: {
        Row: {
          code: string
          icon: string
          id: string
          label: string
          position: number
          subtitle: string | null
          weight: number
        }
        Insert: {
          code: string
          icon: string
          id?: string
          label: string
          position: number
          subtitle?: string | null
          weight: number
        }
        Update: {
          code?: string
          icon?: string
          id?: string
          label?: string
          position?: number
          subtitle?: string | null
          weight?: number
        }
        Relationships: []
      }
      messages: {
        Row: {
          author_id: string | null
          author_side: Database['public']['Enums']['party_side']
          body: string
          created_at: string
          id: string
          offer_id: string | null
          request_id: string
        }
        Insert: {
          author_id?: string | null
          author_side: Database['public']['Enums']['party_side']
          body: string
          created_at?: string
          id?: string
          offer_id?: string | null
          request_id: string
        }
        Update: {
          author_id?: string | null
          author_side?: Database['public']['Enums']['party_side']
          body?: string
          created_at?: string
          id?: string
          offer_id?: string | null
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'messages_author_id_fkey'
            columns: ['author_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'messages_offer_id_fkey'
            columns: ['offer_id']
            isOneToOne: false
            referencedRelation: 'price_offers'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'messages_request_id_fkey'
            columns: ['request_id']
            isOneToOne: false
            referencedRelation: 'visit_requests'
            referencedColumns: ['id']
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          capture_before: string | null
          captured_at: string | null
          captured_cents: number
          created_at: string
          id: string
          refunded_cents: number
          request_id: string
          status: Database['public']['Enums']['payment_status']
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          capture_before?: string | null
          captured_at?: string | null
          captured_cents?: number
          created_at?: string
          id?: string
          refunded_cents?: number
          request_id: string
          status?: Database['public']['Enums']['payment_status']
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          capture_before?: string | null
          captured_at?: string | null
          captured_cents?: number
          created_at?: string
          id?: string
          refunded_cents?: number
          request_id?: string
          status?: Database['public']['Enums']['payment_status']
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'payments_request_id_fkey'
            columns: ['request_id']
            isOneToOne: false
            referencedRelation: 'visit_requests'
            referencedColumns: ['id']
          },
        ]
      }
      price_offers: {
        Row: {
          amount_cents: number
          author_id: string | null
          author_side: Database['public']['Enums']['party_side']
          created_at: string
          expires_at: string
          id: string
          note: string | null
          request_id: string
          responded_at: string | null
          status: Database['public']['Enums']['offer_status']
        }
        Insert: {
          amount_cents: number
          author_id?: string | null
          author_side: Database['public']['Enums']['party_side']
          created_at?: string
          expires_at: string
          id?: string
          note?: string | null
          request_id: string
          responded_at?: string | null
          status?: Database['public']['Enums']['offer_status']
        }
        Update: {
          amount_cents?: number
          author_id?: string | null
          author_side?: Database['public']['Enums']['party_side']
          created_at?: string
          expires_at?: string
          id?: string
          note?: string | null
          request_id?: string
          responded_at?: string | null
          status?: Database['public']['Enums']['offer_status']
        }
        Relationships: [
          {
            foreignKeyName: 'price_offers_author_id_fkey'
            columns: ['author_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'price_offers_request_id_fkey'
            columns: ['request_id']
            isOneToOne: false
            referencedRelation: 'visit_requests'
            referencedColumns: ['id']
          },
        ]
      }
      pricing_zone_rules: {
        Row: {
          created_at: string
          id: string
          priority: number
          rule: NonNullable<Json>
          zone_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          priority?: number
          rule: NonNullable<Json>
          zone_id: string
        }
        Update: {
          created_at?: string
          id?: string
          priority?: number
          rule?: NonNullable<Json>
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'pricing_zone_rules_zone_id_fkey'
            columns: ['zone_id']
            isOneToOne: false
            referencedRelation: 'pricing_zones'
            referencedColumns: ['id']
          },
        ]
      }
      pricing_zones: {
        Row: {
          active: boolean
          base_price_cents: number
          code: string
          created_at: string
          description: string | null
          id: string
          label: string
          late_penalty_pct: number
          position: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          base_price_cents: number
          code: string
          created_at?: string
          description?: string | null
          id?: string
          label: string
          late_penalty_pct?: number
          position?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          base_price_cents?: number
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          label?: string
          late_penalty_pct?: number
          position?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          phone: string | null
          role: Database['public']['Enums']['role']
          suspended_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          phone?: string | null
          role?: Database['public']['Enums']['role']
          suspended_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: Database['public']['Enums']['role']
          suspended_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reference_counters: {
        Row: {
          last_value: number
          year: number
        }
        Insert: {
          last_value?: number
          year: number
        }
        Update: {
          last_value?: number
          year?: number
        }
        Relationships: []
      }
      report_media: {
        Row: {
          created_at: string
          duration_seconds: number | null
          height: number | null
          id: string
          kind: Database['public']['Enums']['media_kind']
          mime: string
          position: number
          report_id: string
          size_bytes: number
          storage_path: string
          width: number | null
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          height?: number | null
          id?: string
          kind: Database['public']['Enums']['media_kind']
          mime: string
          position?: number
          report_id: string
          size_bytes: number
          storage_path: string
          width?: number | null
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          height?: number | null
          id?: string
          kind?: Database['public']['Enums']['media_kind']
          mime?: string
          position?: number
          report_id?: string
          size_bytes?: number
          storage_path?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'report_media_report_id_fkey'
            columns: ['report_id']
            isOneToOne: false
            referencedRelation: 'visit_reports'
            referencedColumns: ['id']
          },
        ]
      }
      report_reserves: {
        Row: {
          id: string
          media_id: string | null
          position: number
          report_id: string
          text: string
        }
        Insert: {
          id?: string
          media_id?: string | null
          position?: number
          report_id: string
          text: string
        }
        Update: {
          id?: string
          media_id?: string | null
          position?: number
          report_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: 'report_reserves_media_id_fkey'
            columns: ['media_id']
            isOneToOne: false
            referencedRelation: 'report_media'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'report_reserves_report_id_fkey'
            columns: ['report_id']
            isOneToOne: false
            referencedRelation: 'visit_reports'
            referencedColumns: ['id']
          },
        ]
      }
      report_scores: {
        Row: {
          comment: string | null
          criterion_id: string
          report_id: string
          score: number | null
        }
        Insert: {
          comment?: string | null
          criterion_id: string
          report_id: string
          score?: number | null
        }
        Update: {
          comment?: string | null
          criterion_id?: string
          report_id?: string
          score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'report_scores_criterion_id_fkey'
            columns: ['criterion_id']
            isOneToOne: false
            referencedRelation: 'criteria'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'report_scores_report_id_fkey'
            columns: ['report_id']
            isOneToOne: false
            referencedRelation: 'visit_reports'
            referencedColumns: ['id']
          },
        ]
      }
      request_transitions: {
        Row: {
          actors: Database['public']['Enums']['transition_actor'][]
          from_status: Database['public']['Enums']['request_status']
          to_status: Database['public']['Enums']['request_status']
        }
        Insert: {
          actors: Database['public']['Enums']['transition_actor'][]
          from_status: Database['public']['Enums']['request_status']
          to_status: Database['public']['Enums']['request_status']
        }
        Update: {
          actors?: Database['public']['Enums']['transition_actor'][]
          from_status?: Database['public']['Enums']['request_status']
          to_status?: Database['public']['Enums']['request_status']
        }
        Relationships: []
      }
      stripe_events: {
        Row: {
          id: string
          processed_at: string | null
          received_at: string
          type: string
        }
        Insert: {
          id: string
          processed_at?: string | null
          received_at?: string
          type: string
        }
        Update: {
          id?: string
          processed_at?: string | null
          received_at?: string
          type?: string
        }
        Relationships: []
      }
      visit_reports: {
        Row: {
          agent_id: string | null
          conclusion: string | null
          created_at: string
          delivered_at: string | null
          filming_refused: boolean
          global_score: number | null
          id: string
          justification: string | null
          negotiation_points: NonNullable<Json>
          pdf_path: string | null
          pdf_size_bytes: number | null
          recommendation: Database['public']['Enums']['recommendation'] | null
          request_id: string
          status: Database['public']['Enums']['report_status']
          submitted_at: string | null
          updated_at: string
          weighted_score: number | null
        }
        Insert: {
          agent_id?: string | null
          conclusion?: string | null
          created_at?: string
          delivered_at?: string | null
          filming_refused?: boolean
          global_score?: number | null
          id?: string
          justification?: string | null
          negotiation_points?: NonNullable<Json>
          pdf_path?: string | null
          pdf_size_bytes?: number | null
          recommendation?: Database['public']['Enums']['recommendation'] | null
          request_id: string
          status?: Database['public']['Enums']['report_status']
          submitted_at?: string | null
          updated_at?: string
          weighted_score?: number | null
        }
        Update: {
          agent_id?: string | null
          conclusion?: string | null
          created_at?: string
          delivered_at?: string | null
          filming_refused?: boolean
          global_score?: number | null
          id?: string
          justification?: string | null
          negotiation_points?: NonNullable<Json>
          pdf_path?: string | null
          pdf_size_bytes?: number | null
          recommendation?: Database['public']['Enums']['recommendation'] | null
          request_id?: string
          status?: Database['public']['Enums']['report_status']
          submitted_at?: string | null
          updated_at?: string
          weighted_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'visit_reports_agent_id_fkey'
            columns: ['agent_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'visit_reports_request_id_fkey'
            columns: ['request_id']
            isOneToOne: true
            referencedRelation: 'visit_requests'
            referencedColumns: ['id']
          },
        ]
      }
      visit_request_events: {
        Row: {
          actor_id: string | null
          actor_kind: Database['public']['Enums']['transition_actor']
          created_at: string
          from_status: Database['public']['Enums']['request_status'] | null
          id: number
          reason: string | null
          request_id: string
          to_status: Database['public']['Enums']['request_status']
        }
        Insert: {
          actor_id?: string | null
          actor_kind: Database['public']['Enums']['transition_actor']
          created_at?: string
          from_status?: Database['public']['Enums']['request_status'] | null
          id?: never
          reason?: string | null
          request_id: string
          to_status: Database['public']['Enums']['request_status']
        }
        Update: {
          actor_id?: string | null
          actor_kind?: Database['public']['Enums']['transition_actor']
          created_at?: string
          from_status?: Database['public']['Enums']['request_status'] | null
          id?: never
          reason?: string | null
          request_id?: string
          to_status?: Database['public']['Enums']['request_status']
        }
        Relationships: [
          {
            foreignKeyName: 'visit_request_events_actor_id_fkey'
            columns: ['actor_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'visit_request_events_request_id_fkey'
            columns: ['request_id']
            isOneToOne: false
            referencedRelation: 'visit_requests'
            referencedColumns: ['id']
          },
        ]
      }
      visit_requests: {
        Row: {
          address: string | null
          agency_email: string | null
          agency_name: string | null
          agency_phone: string | null
          agreed_price_cents: number | null
          assigned_agent_id: string | null
          city: string | null
          consent_at: string | null
          created_at: string
          deleted_at: string | null
          id: string
          lat: number | null
          listing_url: string | null
          lng: number | null
          payment_open_notified_at: string | null
          postal_code: string | null
          priorities: string | null
          property_type: Database['public']['Enums']['property_type'] | null
          proposed_price_cents: number | null
          published_at: string | null
          reference: string
          slot_at: string | null
          status: Database['public']['Enums']['request_status']
          updated_at: string
          urgent_fee_cents: number
          user_id: string
          zone_id: string | null
          caller_side: Database['public']['Enums']['party_side'] | null
          request_actors: Database['public']['Enums']['transition_actor'][] | null
        }
        Insert: {
          address?: string | null
          agency_email?: string | null
          agency_name?: string | null
          agency_phone?: string | null
          agreed_price_cents?: number | null
          assigned_agent_id?: string | null
          city?: string | null
          consent_at?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          lat?: number | null
          listing_url?: string | null
          lng?: number | null
          payment_open_notified_at?: string | null
          postal_code?: string | null
          priorities?: string | null
          property_type?: Database['public']['Enums']['property_type'] | null
          proposed_price_cents?: number | null
          published_at?: string | null
          reference: string
          slot_at?: string | null
          status?: Database['public']['Enums']['request_status']
          updated_at?: string
          urgent_fee_cents?: number
          user_id?: string
          zone_id?: string | null
        }
        Update: {
          address?: string | null
          agency_email?: string | null
          agency_name?: string | null
          agency_phone?: string | null
          agreed_price_cents?: number | null
          assigned_agent_id?: string | null
          city?: string | null
          consent_at?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          lat?: number | null
          listing_url?: string | null
          lng?: number | null
          payment_open_notified_at?: string | null
          postal_code?: string | null
          priorities?: string | null
          property_type?: Database['public']['Enums']['property_type'] | null
          proposed_price_cents?: number | null
          published_at?: string | null
          reference?: string
          slot_at?: string | null
          status?: Database['public']['Enums']['request_status']
          updated_at?: string
          urgent_fee_cents?: number
          user_id?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'visit_requests_assigned_agent_id_fkey'
            columns: ['assigned_agent_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'visit_requests_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'visit_requests_zone_id_fkey'
            columns: ['zone_id']
            isOneToOne: false
            referencedRelation: 'pricing_zones'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_stats: { Args: Record<PropertyKey, never>; Returns: Json }
      assign_agent: {
        Args: { p_agent_id: string; p_request_id: string }
        Returns: {
          address: string | null
          agency_email: string | null
          agency_name: string | null
          agency_phone: string | null
          agreed_price_cents: number | null
          assigned_agent_id: string | null
          city: string | null
          consent_at: string | null
          created_at: string
          deleted_at: string | null
          id: string
          lat: number | null
          listing_url: string | null
          lng: number | null
          payment_open_notified_at: string | null
          postal_code: string | null
          priorities: string | null
          property_type: Database['public']['Enums']['property_type'] | null
          proposed_price_cents: number | null
          published_at: string | null
          reference: string
          slot_at: string | null
          status: Database['public']['Enums']['request_status']
          updated_at: string
          urgent_fee_cents: number
          user_id: string
          zone_id: string | null
        }
        SetofOptions: {
          from: '*'
          to: 'visit_requests'
          isOneToOne: true
          isSetofReturn: false
        }
      }
      caller_side: {
        Args: { r: Database['public']['Tables']['visit_requests']['Row'] }
        Returns: Database['public']['Enums']['party_side']
      }
      can_read_report: { Args: { p_request_id: string }; Returns: boolean }
      can_read_request: { Args: { p_request_id: string }; Returns: boolean }
      can_write_report: { Args: { p_report_id: string }; Returns: boolean }
      create_offer: {
        Args: { p_amount_cents: number; p_note?: string; p_request_id: string }
        Returns: {
          amount_cents: number
          author_id: string | null
          author_side: Database['public']['Enums']['party_side']
          created_at: string
          expires_at: string
          id: string
          note: string | null
          request_id: string
          responded_at: string | null
          status: Database['public']['Enums']['offer_status']
        }
        SetofOptions: {
          from: '*'
          to: 'price_offers'
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_request: { Args: { p_request_id: string }; Returns: string }
      expire_offers: { Args: Record<PropertyKey, never>; Returns: number }
      insert_offer: {
        Args: {
          p_amount_cents: number
          p_default_body: string
          p_note: string
          p_side: Database['public']['Enums']['party_side']
          r: Database['public']['Tables']['visit_requests']['Row']
        }
        Returns: {
          amount_cents: number
          author_id: string | null
          author_side: Database['public']['Enums']['party_side']
          created_at: string
          expires_at: string
          id: string
          note: string | null
          request_id: string
          responded_at: string | null
          status: Database['public']['Enums']['offer_status']
        }
        SetofOptions: {
          from: '*'
          to: 'price_offers'
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_active_account: { Args: Record<PropertyKey, never>; Returns: boolean }
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean }
      is_assigned_agent: { Args: { p_request_id: string }; Returns: boolean }
      is_request_owner: { Args: { p_request_id: string }; Returns: boolean }
      is_system: { Args: Record<PropertyKey, never>; Returns: boolean }
      publish_request: {
        Args: { p_request_id: string }
        Returns: {
          address: string | null
          agency_email: string | null
          agency_name: string | null
          agency_phone: string | null
          agreed_price_cents: number | null
          assigned_agent_id: string | null
          city: string | null
          consent_at: string | null
          created_at: string
          deleted_at: string | null
          id: string
          lat: number | null
          listing_url: string | null
          lng: number | null
          payment_open_notified_at: string | null
          postal_code: string | null
          priorities: string | null
          property_type: Database['public']['Enums']['property_type'] | null
          proposed_price_cents: number | null
          published_at: string | null
          reference: string
          slot_at: string | null
          status: Database['public']['Enums']['request_status']
          updated_at: string
          urgent_fee_cents: number
          user_id: string
          zone_id: string | null
        }
        SetofOptions: {
          from: '*'
          to: 'visit_requests'
          isOneToOne: true
          isSetofReturn: false
        }
      }
      report_weighted_score: { Args: { p_report_id: string }; Returns: number }
      request_actors: {
        Args: { r: Database['public']['Tables']['visit_requests']['Row'] }
        Returns: Database['public']['Enums']['transition_actor'][]
      }
      respond_offer: {
        Args: { p_accept: boolean; p_offer_id: string }
        Returns: {
          address: string | null
          agency_email: string | null
          agency_name: string | null
          agency_phone: string | null
          agreed_price_cents: number | null
          assigned_agent_id: string | null
          city: string | null
          consent_at: string | null
          created_at: string
          deleted_at: string | null
          id: string
          lat: number | null
          listing_url: string | null
          lng: number | null
          payment_open_notified_at: string | null
          postal_code: string | null
          priorities: string | null
          property_type: Database['public']['Enums']['property_type'] | null
          proposed_price_cents: number | null
          published_at: string | null
          reference: string
          slot_at: string | null
          status: Database['public']['Enums']['request_status']
          updated_at: string
          urgent_fee_cents: number
          user_id: string
          zone_id: string | null
        }
        SetofOptions: {
          from: '*'
          to: 'visit_requests'
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_request_zone: {
        Args: { p_request_id: string; p_zone_id: string }
        Returns: {
          address: string | null
          agency_email: string | null
          agency_name: string | null
          agency_phone: string | null
          agreed_price_cents: number | null
          assigned_agent_id: string | null
          city: string | null
          consent_at: string | null
          created_at: string
          deleted_at: string | null
          id: string
          lat: number | null
          listing_url: string | null
          lng: number | null
          payment_open_notified_at: string | null
          postal_code: string | null
          priorities: string | null
          property_type: Database['public']['Enums']['property_type'] | null
          proposed_price_cents: number | null
          published_at: string | null
          reference: string
          slot_at: string | null
          status: Database['public']['Enums']['request_status']
          updated_at: string
          urgent_fee_cents: number
          user_id: string
          zone_id: string | null
        }
        SetofOptions: {
          from: '*'
          to: 'visit_requests'
          isOneToOne: true
          isSetofReturn: false
        }
      }
      setting_int: { Args: { p_key: string }; Returns: number }
      submit_report: {
        Args: { p_request_id: string }
        Returns: {
          agent_id: string | null
          conclusion: string | null
          created_at: string
          delivered_at: string | null
          filming_refused: boolean
          global_score: number | null
          id: string
          justification: string | null
          negotiation_points: NonNullable<Json>
          pdf_path: string | null
          pdf_size_bytes: number | null
          recommendation: Database['public']['Enums']['recommendation'] | null
          request_id: string
          status: Database['public']['Enums']['report_status']
          submitted_at: string | null
          updated_at: string
          weighted_score: number | null
        }
        SetofOptions: {
          from: '*'
          to: 'visit_reports'
          isOneToOne: true
          isSetofReturn: false
        }
      }
      transition_request: {
        Args: {
          p_reason?: string
          p_request_id: string
          p_to: Database['public']['Enums']['request_status']
        }
        Returns: {
          address: string | null
          agency_email: string | null
          agency_name: string | null
          agency_phone: string | null
          agreed_price_cents: number | null
          assigned_agent_id: string | null
          city: string | null
          consent_at: string | null
          created_at: string
          deleted_at: string | null
          id: string
          lat: number | null
          listing_url: string | null
          lng: number | null
          payment_open_notified_at: string | null
          postal_code: string | null
          priorities: string | null
          property_type: Database['public']['Enums']['property_type'] | null
          proposed_price_cents: number | null
          published_at: string | null
          reference: string
          slot_at: string | null
          status: Database['public']['Enums']['request_status']
          updated_at: string
          urgent_fee_cents: number
          user_id: string
          zone_id: string | null
        }
        SetofOptions: {
          from: '*'
          to: 'visit_requests'
          isOneToOne: true
          isSetofReturn: false
        }
      }
      try_uuid: { Args: { p_value: string }; Returns: string }
    }
    Enums: {
      media_kind: 'photo' | 'video'
      offer_status: 'pending' | 'accepted' | 'rejected' | 'superseded' | 'expired'
      party_side: 'client' | 'checkmyflat' | 'system'
      payment_status:
        'pending' | 'authorized' | 'captured' | 'partially_refunded' | 'refunded' | 'canceled' | 'failed'
      property_type: 'studio' | 't1' | 't2' | 't3' | 't4' | 't5_plus' | 'maison' | 'autre'
      recommendation: 'deposer' | 'option' | 'refuser'
      report_status: 'draft' | 'submitted'
      request_status:
        | 'brouillon'
        | 'publiee'
        | 'en_negociation'
        | 'acceptee'
        | 'payee'
        | 'planifiee'
        | 'realisee'
        | 'rapport_livre'
        | 'annulee'
        | 'litige'
      role: 'visitor' | 'user' | 'agent' | 'admin'
      transition_actor: 'owner' | 'assigned_agent' | 'admin' | 'system'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema['Tables'] & DefaultSchema['Views']) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      media_kind: ['photo', 'video'],
      offer_status: ['pending', 'accepted', 'rejected', 'superseded', 'expired'],
      party_side: ['client', 'checkmyflat', 'system'],
      payment_status: [
        'pending',
        'authorized',
        'captured',
        'partially_refunded',
        'refunded',
        'canceled',
        'failed',
      ],
      property_type: ['studio', 't1', 't2', 't3', 't4', 't5_plus', 'maison', 'autre'],
      recommendation: ['deposer', 'option', 'refuser'],
      report_status: ['draft', 'submitted'],
      request_status: [
        'brouillon',
        'publiee',
        'en_negociation',
        'acceptee',
        'payee',
        'planifiee',
        'realisee',
        'rapport_livre',
        'annulee',
        'litige',
      ],
      role: ['visitor', 'user', 'agent', 'admin'],
      transition_actor: ['owner', 'assigned_agent', 'admin', 'system'],
    },
  },
} as const
