export interface DemoUser {
  id: string;
  display_name: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: 'bearer';
  user: DemoUser;
}

export type SessionStatus = 'active' | 'paused' | 'completed' | 'stopped';
export type FinishReason = 'completed' | 'manual' | 'logout' | 'error';

export interface SessionRecord {
  id: string;
  user_id: string;
  duration_seconds: number;
  status: SessionStatus;
  started_at: string;
  ended_at: string | null;
  total_paused_seconds: number;
  warning_count: number;
}
