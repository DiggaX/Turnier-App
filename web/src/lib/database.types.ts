export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "admin" | "organizer" | "referee";
export type TournamentFormat =
  | "single_elim"
  | "round_robin"
  | "double_elim"
  | "swiss"
  | "groups_playoffs";
export type TournamentMode = "lan" | "online" | "hybrid";
export type TournamentStatus = "draft" | "registration" | "running" | "finished";
export type ParticipantType = "solo" | "team";
export type ConsentGrantor = "self" | "guardian";
export type CheckinMethod = "qr_scan" | "station" | "online";
export type MatchStatus = "pending" | "live" | "done" | "bye";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; role: UserRole; display_name: string | null; created_at: string };
        Insert: { id: string; role?: UserRole; display_name?: string | null; created_at?: string };
        Update: { id?: string; role?: UserRole; display_name?: string | null; created_at?: string };
        Relationships: [];
      };
      games: {
        Row: { id: string; name: string; team_size: number; created_at: string };
        Insert: { id?: string; name: string; team_size?: number; created_at?: string };
        Update: { id?: string; name?: string; team_size?: number; created_at?: string };
        Relationships: [];
      };
      tournaments: {
        Row: {
          id: string; name: string; game_id: string; format: TournamentFormat;
          mode: TournamentMode; status: TournamentStatus; starts_at: string | null;
          created_by: string | null; created_at: string;
        };
        Insert: {
          id?: string; name: string; game_id: string; format: TournamentFormat;
          mode?: TournamentMode; status?: TournamentStatus; starts_at?: string | null;
          created_by?: string | null; created_at?: string;
        };
        Update: {
          id?: string; name?: string; game_id?: string; format?: TournamentFormat;
          mode?: TournamentMode; status?: TournamentStatus; starts_at?: string | null;
          created_by?: string | null; created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "tournaments_game_id_fkey"; columns: ["game_id"]; referencedRelation: "games"; referencedColumns: ["id"] }
        ];
      };
      participants: {
        Row: {
          id: string; tournament_id: string; user_id: string | null; type: ParticipantType;
          display_name: string; gamertag: string | null; birthdate: string;
          seed: number | null; checked_in_at: string | null; created_at: string;
          qr_token: string;
        };
        Insert: {
          id?: string; tournament_id: string; user_id?: string | null; type?: ParticipantType;
          display_name: string; gamertag?: string | null; birthdate: string;
          seed?: number | null; checked_in_at?: string | null; created_at?: string;
          qr_token?: string;
        };
        Update: {
          id?: string; tournament_id?: string; user_id?: string | null; type?: ParticipantType;
          display_name?: string; gamertag?: string | null; birthdate?: string;
          seed?: number | null; checked_in_at?: string | null; created_at?: string;
          qr_token?: string;
        };
        Relationships: [
          { foreignKeyName: "participants_tournament_id_fkey"; columns: ["tournament_id"]; referencedRelation: "tournaments"; referencedColumns: ["id"] }
        ];
      };
      team_members: {
        Row: {
          id: string; participant_id: string; name: string; gamertag: string | null;
          is_captain: boolean; created_at: string;
        };
        Insert: {
          id?: string; participant_id: string; name: string; gamertag?: string | null;
          is_captain?: boolean; created_at?: string;
        };
        Update: {
          id?: string; participant_id?: string; name?: string; gamertag?: string | null;
          is_captain?: boolean; created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "team_members_participant_id_fkey"; columns: ["participant_id"]; referencedRelation: "participants"; referencedColumns: ["id"] }
        ];
      };
      consents: {
        Row: {
          id: string; participant_id: string; grantor: ConsentGrantor;
          grantor_name: string; method: string; signature_path: string | null; granted_at: string;
        };
        Insert: {
          id?: string; participant_id: string; grantor: ConsentGrantor;
          grantor_name: string; method: string; signature_path?: string | null; granted_at?: string;
        };
        Update: {
          id?: string; participant_id?: string; grantor?: ConsentGrantor;
          grantor_name?: string; method?: string; signature_path?: string | null; granted_at?: string;
        };
        Relationships: [
          { foreignKeyName: "consents_participant_id_fkey"; columns: ["participant_id"]; referencedRelation: "participants"; referencedColumns: ["id"] }
        ];
      };
      check_ins: {
        Row: {
          id: string; participant_id: string; method: CheckinMethod;
          checked_in_by: string | null; created_at: string;
        };
        Insert: {
          id?: string; participant_id: string; method: CheckinMethod;
          checked_in_by?: string | null; created_at?: string;
        };
        Update: {
          id?: string; participant_id?: string; method?: CheckinMethod;
          checked_in_by?: string | null; created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "check_ins_participant_id_fkey"; columns: ["participant_id"]; referencedRelation: "participants"; referencedColumns: ["id"] }
        ];
      };
      matches: {
        Row: {
          id: string; tournament_id: string; round: number; slot: number;
          participant_a_id: string | null; participant_b_id: string | null;
          winner_id: string | null; next_match_id: string | null; next_slot: string | null;
          status: MatchStatus; score_a: number | null; score_b: number | null; created_at: string;
        };
        Insert: {
          id?: string; tournament_id: string; round: number; slot: number;
          participant_a_id?: string | null; participant_b_id?: string | null;
          winner_id?: string | null; next_match_id?: string | null; next_slot?: string | null;
          status?: MatchStatus; score_a?: number | null; score_b?: number | null; created_at?: string;
        };
        Update: {
          id?: string; tournament_id?: string; round?: number; slot?: number;
          participant_a_id?: string | null; participant_b_id?: string | null;
          winner_id?: string | null; next_match_id?: string | null; next_slot?: string | null;
          status?: MatchStatus; score_a?: number | null; score_b?: number | null; created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "matches_tournament_id_fkey"; columns: ["tournament_id"]; referencedRelation: "tournaments"; referencedColumns: ["id"] },
          { foreignKeyName: "matches_next_match_id_fkey"; columns: ["next_match_id"]; referencedRelation: "matches"; referencedColumns: ["id"] }
        ];
      };
      match_reports: {
        Row: { id: string; match_id: string; reported_by: string; score_a: number; score_b: number; created_at: string };
        Insert: { id?: string; match_id: string; reported_by: string; score_a: number; score_b: number; created_at?: string };
        Update: { id?: string; match_id?: string; reported_by?: string; score_a?: number; score_b?: number; created_at?: string };
        Relationships: [
          { foreignKeyName: "match_reports_match_id_fkey"; columns: ["match_id"]; referencedRelation: "matches"; referencedColumns: ["id"] },
          { foreignKeyName: "match_reports_reported_by_fkey"; columns: ["reported_by"]; referencedRelation: "participants"; referencedColumns: ["id"] }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      check_in: {
        Args: { p_participant_id: string; p_method: CheckinMethod };
        Returns: undefined;
      };
      report_match: {
        Args: { p_match_id: string; p_score_a: number; p_score_b: number };
        Returns: undefined;
      };
      confirm_match: {
        Args: { p_match_id: string; p_score_a: number; p_score_b: number };
        Returns: undefined;
      };
    };
    Enums: {
      user_role: UserRole;
      tournament_format: TournamentFormat;
      tournament_mode: TournamentMode;
      tournament_status: TournamentStatus;
      participant_type: ParticipantType;
      consent_grantor: ConsentGrantor;
      checkin_method: CheckinMethod;
      match_status: MatchStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
