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
// "qr_scan" is the historical value both readers wrote before they were told
// apart; rows from that era keep it.
export type CheckinMethod =
  | "qr_scan"
  | "camera_scan"
  | "hardware_scan"
  | "station"
  | "online";
export type MatchStatus = "pending" | "live" | "done" | "bye";

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: { id: string; name: string; slug: string; created_at: string };
        Insert: { id?: string; name: string; slug: string; created_at?: string };
        Update: { id?: string; name?: string; slug?: string; created_at?: string };
        Relationships: [];
      };
      profiles: {
        Row: { id: string; role: UserRole; display_name: string | null; created_at: string; org_id: string | null };
        Insert: { id: string; role?: UserRole; display_name?: string | null; created_at?: string; org_id?: string | null };
        Update: { id?: string; role?: UserRole; display_name?: string | null; created_at?: string; org_id?: string | null };
        Relationships: [
          { foreignKeyName: "profiles_org_id_fkey"; columns: ["org_id"]; referencedRelation: "organizations"; referencedColumns: ["id"] }
        ];
      };
      device_pairings: {
        Row: {
          id: string; token_hash: string; user_id: string; org_id: string;
          created_at: string; expires_at: string; claimed_at: string | null;
          claimed_user_agent: string | null; session_id: string | null;
        };
        Insert: {
          id?: string; token_hash: string; user_id: string; org_id: string;
          created_at?: string; expires_at: string; claimed_at?: string | null;
          claimed_user_agent?: string | null; session_id?: string | null;
        };
        Update: {
          id?: string; token_hash?: string; user_id?: string; org_id?: string;
          created_at?: string; expires_at?: string; claimed_at?: string | null;
          claimed_user_agent?: string | null; session_id?: string | null;
        };
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
          created_by: string | null; created_at: string; team_size: number;
          org_id: string; archived_at: string | null;
        };
        Insert: {
          id?: string; name: string; game_id: string; format: TournamentFormat;
          mode?: TournamentMode; status?: TournamentStatus; starts_at?: string | null;
          created_by?: string | null; created_at?: string; team_size?: number;
          org_id: string; archived_at?: string | null;
        };
        Update: {
          id?: string; name?: string; game_id?: string; format?: TournamentFormat;
          mode?: TournamentMode; status?: TournamentStatus; starts_at?: string | null;
          created_by?: string | null; created_at?: string; team_size?: number;
          org_id?: string; archived_at?: string | null;
        };
        Relationships: [
          { foreignKeyName: "tournaments_game_id_fkey"; columns: ["game_id"]; referencedRelation: "games"; referencedColumns: ["id"] },
          { foreignKeyName: "tournaments_org_id_fkey"; columns: ["org_id"]; referencedRelation: "organizations"; referencedColumns: ["id"] }
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
          bracket: string;
          participant_a_id: string | null; participant_b_id: string | null;
          winner_id: string | null; next_match_id: string | null; next_slot: string | null;
          loser_next_match_id: string | null; loser_next_slot: string | null;
          status: MatchStatus; score_a: number | null; score_b: number | null; created_at: string;
          live_score_a: number | null; live_score_b: number | null; live_started_at: string | null; live_ended_at: string | null; live_updated_at: string | null;
          group_no: number | null;
        };
        Insert: {
          id?: string; tournament_id: string; round: number; slot: number;
          bracket?: string;
          participant_a_id?: string | null; participant_b_id?: string | null;
          winner_id?: string | null; next_match_id?: string | null; next_slot?: string | null;
          loser_next_match_id?: string | null; loser_next_slot?: string | null;
          status?: MatchStatus; score_a?: number | null; score_b?: number | null; created_at?: string;
          live_score_a?: number | null; live_score_b?: number | null; live_started_at?: string | null; live_ended_at?: string | null; live_updated_at?: string | null;
          group_no?: number | null;
        };
        Update: {
          id?: string; tournament_id?: string; round?: number; slot?: number;
          bracket?: string;
          participant_a_id?: string | null; participant_b_id?: string | null;
          winner_id?: string | null; next_match_id?: string | null; next_slot?: string | null;
          loser_next_match_id?: string | null; loser_next_slot?: string | null;
          status?: MatchStatus; score_a?: number | null; score_b?: number | null; created_at?: string;
          live_score_a?: number | null; live_score_b?: number | null; live_started_at?: string | null; live_ended_at?: string | null; live_updated_at?: string | null;
          group_no?: number | null;
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
      push_subscriptions: {
        Row: {
          id: string;
          participant_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          participant_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          participant_id?: string;
          endpoint?: string;
          p256dh?: string;
          auth?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      org_invites: {
        Row: {
          id: string;
          org_id: string;
          code: string;
          role: "organizer" | "referee";
          created_by: string | null;
          expires_at: string;
          accepted_at: string | null;
          accepted_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          code: string;
          role: "organizer" | "referee";
          created_by?: string | null;
          expires_at: string;
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          code?: string;
          role?: "organizer" | "referee";
          created_by?: string | null;
          expires_at?: string;
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      my_sessions: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          created_at: string;
          last_seen_at: string | null;
          user_agent: string | null;
          paired: boolean;
          is_current: boolean;
        }[];
      };
      revoke_session: {
        Args: { p_session_id: string };
        Returns: undefined;
      };
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
      get_scorekeeper_match: {
        Args: { p_token: string };
        Returns: {
          match_id: string;
          tournament_name: string;
          participant_a_name: string | null;
          participant_b_name: string | null;
          status: MatchStatus;
          live_score_a: number | null;
          live_score_b: number | null;
          live_started_at: string | null;
          live_ended_at: string | null;
          live_updated_at: string | null;
          score_a: number | null;
          score_b: number | null;
        }[];
      };
      start_live_match: {
        Args: { p_token: string };
        Returns: undefined;
      };
      update_live_score: {
        Args: { p_token: string; p_score_a: number; p_score_b: number };
        Returns: undefined;
      };
      finish_live_match: {
        Args: { p_token: string; p_score_a: number; p_score_b: number };
        Returns: undefined;
      };
      reopen_live_match: {
        Args: { p_token: string };
        Returns: undefined;
      };
      get_scorekeeper_tokens: {
        Args: { p_match_ids: string[] };
        Returns: { match_id: string; token: string }[];
      };
      bootstrap_org: {
        Args: { p_name: string; p_slug: string };
        Returns: string;
      };
      accept_invite: {
        Args: { p_code: string };
        Returns: string;
      };
      peek_invite: {
        Args: { p_code: string };
        Returns: { org_name: string; member_role: string }[];
      };
      set_member_role: {
        Args: { p_member: string; p_role: string };
        Returns: undefined;
      };
      remove_member: {
        Args: { p_member: string };
        Returns: undefined;
      };
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      get_participant_by_qr_token: {
        Args: { p_qr_token: string };
        Returns: {
          id: string;
          tournament_id: string;
          display_name: string;
          qr_token: string;
          checked_in_at: string | null;
          has_consent: boolean;
        }[];
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
