export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      pb_play_steps: {
        Row: {
          created_at: string
          duration_ms: number
          id: string
          note: string | null
          payload: Json
          play_id: string
          position: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number
          id?: string
          note?: string | null
          payload: Json
          play_id: string
          position: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          duration_ms?: number
          id?: string
          note?: string | null
          payload?: Json
          play_id?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "play_steps_play_id_fkey"
            columns: ["play_id"]
            isOneToOne: false
            referencedRelation: "pb_plays"
            referencedColumns: ["id"]
          },
        ]
      }
      pb_plays: {
        Row: {
          created_at: string
          created_by: string
          field_type: string
          formation: string
          id: string
          name: string
          owner_id: string | null
          team_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          field_type?: string
          formation: string
          id?: string
          name: string
          owner_id?: string | null
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          field_type?: string
          formation?: string
          id?: string
          name?: string
          owner_id?: string | null
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plays_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plays_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plays_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "pb_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      pb_team_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["pb_team_role"]
          team_id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          role?: Database["public"]["Enums"]["pb_team_role"]
          team_id: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["pb_team_role"]
          team_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invites_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "pb_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      pb_team_members: {
        Row: {
          joined_at: string
          role: Database["public"]["Enums"]["pb_team_role"]
          team_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          role?: Database["public"]["Enums"]["pb_team_role"]
          team_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          role?: Database["public"]["Enums"]["pb_team_role"]
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "pb_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pb_teams: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          owner_id: string
          short_name: string
          updated_at: string
        }
        Insert: {
          color: string
          created_at?: string
          id?: string
          name: string
          owner_id: string
          short_name: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          short_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string
          id: string
          phone: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          id: string
          phone?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          phone?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      usau_event_teams: {
        Row: {
          event_id: string
          final_placement: number | null
          pool: string | null
          seed: number | null
          team_id: string
          usau_event_team_id: string
        }
        Insert: {
          event_id: string
          final_placement?: number | null
          pool?: string | null
          seed?: number | null
          team_id: string
          usau_event_team_id: string
        }
        Update: {
          event_id?: string
          final_placement?: number | null
          pool?: string | null
          seed?: number | null
          team_id?: string
          usau_event_team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usau_event_teams_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "usau_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usau_event_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "usau_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      usau_event_templates: {
        Row: {
          competition_level: Database["public"]["Enums"]["usau_competition_level"]
          created_at: string
          display_name: string
          gender_division: Database["public"]["Enums"]["usau_gender_division"] | null
          id: string
          key: string
          known_slugs: Json
          skip_years: number[]
          slug_pattern: string | null
          tried_slugs: Json
          updated_at: string
        }
        Insert: {
          competition_level?: Database["public"]["Enums"]["usau_competition_level"]
          created_at?: string
          display_name: string
          gender_division?: Database["public"]["Enums"]["usau_gender_division"] | null
          id?: string
          key: string
          known_slugs?: Json
          skip_years?: number[]
          slug_pattern?: string | null
          tried_slugs?: Json
          updated_at?: string
        }
        Update: {
          competition_level?: Database["public"]["Enums"]["usau_competition_level"]
          created_at?: string
          display_name?: string
          gender_division?: Database["public"]["Enums"]["usau_gender_division"] | null
          id?: string
          key?: string
          known_slugs?: Json
          skip_years?: number[]
          slug_pattern?: string | null
          tried_slugs?: Json
          updated_at?: string
        }
        Relationships: []
      }
      usau_events: {
        Row: {
          city: string | null
          competition_level: Database["public"]["Enums"]["usau_competition_level"]
          created_at: string
          end_date: string | null
          event_type: Database["public"]["Enums"]["usau_event_type"]
          id: string
          is_sanctioned: boolean
          last_scraped_at: string | null
          last_scraped_status: string | null
          name: string
          season: number
          start_date: string | null
          state: string | null
          updated_at: string
          url: string | null
          usau_slug: string
        }
        Insert: {
          city?: string | null
          competition_level?: Database["public"]["Enums"]["usau_competition_level"]
          created_at?: string
          end_date?: string | null
          event_type?: Database["public"]["Enums"]["usau_event_type"]
          id?: string
          is_sanctioned?: boolean
          last_scraped_at?: string | null
          last_scraped_status?: string | null
          name: string
          season: number
          start_date?: string | null
          state?: string | null
          updated_at?: string
          url?: string | null
          usau_slug: string
        }
        Update: {
          city?: string | null
          competition_level?: Database["public"]["Enums"]["usau_competition_level"]
          created_at?: string
          end_date?: string | null
          event_type?: Database["public"]["Enums"]["usau_event_type"]
          id?: string
          is_sanctioned?: boolean
          last_scraped_at?: string | null
          last_scraped_status?: string | null
          name?: string
          season?: number
          start_date?: string | null
          state?: string | null
          updated_at?: string
          url?: string | null
          usau_slug?: string
        }
        Relationships: []
      }
      usau_games: {
        Row: {
          bracket_name: string | null
          created_at: string
          event_id: string
          id: string
          location: string | null
          played_at: string | null
          round: Database["public"]["Enums"]["usau_game_round"]
          scheduled_at: string | null
          score_a: number | null
          score_b: number | null
          seed_a: number | null
          seed_b: number | null
          source_url: string | null
          status: Database["public"]["Enums"]["usau_game_status"]
          team_a_id: string | null
          team_b_id: string | null
          updated_at: string
          usau_event_game_id: string | null
          usau_game_id: string | null
        }
        Insert: {
          bracket_name?: string | null
          created_at?: string
          event_id: string
          id?: string
          location?: string | null
          played_at?: string | null
          round?: Database["public"]["Enums"]["usau_game_round"]
          scheduled_at?: string | null
          score_a?: number | null
          score_b?: number | null
          seed_a?: number | null
          seed_b?: number | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["usau_game_status"]
          team_a_id?: string | null
          team_b_id?: string | null
          updated_at?: string
          usau_event_game_id?: string | null
          usau_game_id?: string | null
        }
        Update: {
          bracket_name?: string | null
          created_at?: string
          event_id?: string
          id?: string
          location?: string | null
          played_at?: string | null
          round?: Database["public"]["Enums"]["usau_game_round"]
          scheduled_at?: string | null
          score_a?: number | null
          score_b?: number | null
          seed_a?: number | null
          seed_b?: number | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["usau_game_status"]
          team_a_id?: string | null
          team_b_id?: string | null
          updated_at?: string
          usau_event_game_id?: string | null
          usau_game_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usau_games_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "usau_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usau_games_team_a_id_fkey"
            columns: ["team_a_id"]
            isOneToOne: false
            referencedRelation: "usau_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usau_games_team_b_id_fkey"
            columns: ["team_b_id"]
            isOneToOne: false
            referencedRelation: "usau_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      usau_player_event_stats: {
        Row: {
          assists: number | null
          event_id: string
          goals: number | null
          player_id: string
          scraped_at: string
          team_id: string | null
        }
        Insert: {
          assists?: number | null
          event_id: string
          goals?: number | null
          player_id: string
          scraped_at?: string
          team_id?: string | null
        }
        Update: {
          assists?: number | null
          event_id?: string
          goals?: number | null
          player_id?: string
          scraped_at?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usau_player_event_stats_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "usau_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usau_player_event_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "usau_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usau_player_event_stats_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "usau_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      usau_players: {
        Row: {
          created_at: string
          display_name: string
          id: string
          usau_player_id: string | null
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          usau_player_id?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          usau_player_id?: string | null
        }
        Relationships: []
      }
      usau_rankings: {
        Row: {
          conference: string | null
          division: string
          losses: number | null
          rank: number
          rating: number | null
          region: string | null
          scraped_at: string
          season: number
          team_id: string
          week: number
          wins: number | null
        }
        Insert: {
          conference?: string | null
          division: string
          losses?: number | null
          rank: number
          rating?: number | null
          region?: string | null
          scraped_at?: string
          season: number
          team_id: string
          week: number
          wins?: number | null
        }
        Update: {
          conference?: string | null
          division?: string
          losses?: number | null
          rank?: number
          rating?: number | null
          region?: string | null
          scraped_at?: string
          season?: number
          team_id?: string
          week?: number
          wins?: number | null
        }
        Relationships: []
      }
      usau_rosters: {
        Row: {
          jersey_number: string | null
          player_id: string
          season: number
          team_id: string
        }
        Insert: {
          jersey_number?: string | null
          player_id: string
          season: number
          team_id: string
        }
        Update: {
          jersey_number?: string | null
          player_id?: string
          season?: number
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usau_rosters_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "usau_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usau_rosters_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "usau_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      usau_scrape_runs: {
        Row: {
          completed_at: string | null
          error: string | null
          id: string
          job_name: string
          metadata: Json | null
          rows_processed: number | null
          started_at: string
        }
        Insert: {
          completed_at?: string | null
          error?: string | null
          id?: string
          job_name: string
          metadata?: Json | null
          rows_processed?: number | null
          started_at?: string
        }
        Update: {
          completed_at?: string | null
          error?: string | null
          id?: string
          job_name?: string
          metadata?: Json | null
          rows_processed?: number | null
          started_at?: string
        }
        Relationships: []
      }
      usau_seasons: {
        Row: {
          is_active: boolean
          year: number
        }
        Insert: {
          is_active?: boolean
          year: number
        }
        Update: {
          is_active?: boolean
          year?: number
        }
        Relationships: []
      }
      usau_teams: {
        Row: {
          city: string | null
          competition_division: string | null
          competition_level: Database["public"]["Enums"]["usau_competition_level"] | null
          created_at: string
          gender_division: Database["public"]["Enums"]["usau_gender_division"] | null
          id: string
          last_scraped_at: string | null
          name: string
          school_or_club_name: string | null
          state: string | null
          team_designation: string | null
          updated_at: string
          usau_event_team_ids: string[]
          usau_team_id: string | null
        }
        Insert: {
          city?: string | null
          competition_division?: string | null
          competition_level?: Database["public"]["Enums"]["usau_competition_level"] | null
          created_at?: string
          gender_division?: Database["public"]["Enums"]["usau_gender_division"] | null
          id?: string
          last_scraped_at?: string | null
          name: string
          school_or_club_name?: string | null
          state?: string | null
          team_designation?: string | null
          updated_at?: string
          usau_event_team_ids?: string[]
          usau_team_id?: string | null
        }
        Update: {
          city?: string | null
          competition_division?: string | null
          competition_level?: Database["public"]["Enums"]["usau_competition_level"] | null
          created_at?: string
          gender_division?: Database["public"]["Enums"]["usau_gender_division"] | null
          id?: string
          last_scraped_at?: string | null
          name?: string
          school_or_club_name?: string | null
          state?: string | null
          team_designation?: string | null
          updated_at?: string
          usau_event_team_ids?: string[]
          usau_team_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_team_invite: {
        Args: { p_token: string }
        Returns: {
          role: Database["public"]["Enums"]["pb_team_role"]
          team_id: string
          team_name: string
        }[]
      }
      can_edit_play: { Args: { p_play_id: string }; Returns: boolean }
      can_view_play: { Args: { p_play_id: string }; Returns: boolean }
      create_team_invite: {
        Args: {
          p_email: string
          p_role?: Database["public"]["Enums"]["pb_team_role"]
          p_team_id: string
        }
        Returns: {
          expires_at: string
          token: string
        }[]
      }
      is_team_editor: { Args: { p_team_id: string }; Returns: boolean }
      is_team_member: { Args: { p_team_id: string }; Returns: boolean }
    }
    Enums: {
      pb_team_role: "owner" | "coach" | "member"
      usau_competition_level:
        | "CLUB"
        | "COLLEGE_D1"
        | "COLLEGE_D3"
        | "HS"
        | "MS"
        | "YC"
        | "MASTERS"
        | "GRAND_MASTERS"
        | "BEACH"
        | "OTHER"
      usau_event_type:
        | "regular_season"
        | "sectional"
        | "regional"
        | "national"
        | "masters"
        | "youth_club"
        | "beach"
        | "pro"
        | "unaffiliated"
        | "other"
      usau_game_round:
        | "pool"
        | "prequarter"
        | "quarter"
        | "semi"
        | "final"
        | "placement"
        | "consolation"
        | "other"
      usau_game_status:
        | "scheduled"
        | "in_progress"
        | "final"
        | "forfeit"
        | "cancelled"
      usau_gender_division: "Men" | "Women" | "Mixed" | "Open"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
