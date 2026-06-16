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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: UserRole;
      tournament_format: TournamentFormat;
      tournament_mode: TournamentMode;
      tournament_status: TournamentStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
