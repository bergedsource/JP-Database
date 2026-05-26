export type FineStatus = "pending" | "upheld" | "dismissed" | "paid" | "labor" | "overturned" | "added_to_dues";

export type SocialProbationReason =
  | "Outstanding Fines (§10-270)"
  | "Academic - GPA Below 3.0 (§14-020)"
  | "Academic - Cumulative GPA Below 2.0 (§14-060)"
  | "Financial - Unpaid Dues (§9-140)"
  | "Failure to Attend Ritual (§15-010)"
  | "Failure to Complete Service Hours (§16-010)"
  | "Missing House Philanthropy Event (§11-270)"
  | "Other";

export interface SocialProbation {
  id: string;
  member_id: string;
  member_name?: string;
  reason: SocialProbationReason;
  notes: string | null;
  start_date: string;
  end_date: string | null;
  source: "manual" | "auto";
  created_at: string;
}

import type { FineType } from "./fine-types";
export type { FineType };

export interface Member {
  id: string;
  name: string;
  status: "active" | "pledge" | "alumni" | "live-out" | "inactive" | "resident-advisor";
  created_at: string;
  roll?: number | null;
}

export interface AuditLog {
  id: string;
  admin_email: string;
  action: string;
  details: string;
  created_at: string;
}

export interface Fine {
  id: string;
  member_id: string;
  member_name?: string;
  fine_type: FineType;
  description: string;
  amount: number | null;
  status: FineStatus;
  term: string;
  date_issued: string;
  date_resolved: string | null;
  notes: string | null;
  fining_officer: string | null;
  created_by_user_id: string | null;
  created_at: string;
}

export interface JpSession {
  id: string;
  date_held: string;       // "YYYY-MM-DD"
  closed_at: string | null;
  created_at: string;
  fine_count?: number;     // populated by list route via count join
}

export interface JpSessionFine {
  session_id: string;
  fine_id: string;
  snapshot_status: string;
  // joined fine fields:
  fine_type: string;
  description: string;
  amount: number | null;
  status: string;          // current status (may differ from snapshot)
  term: string;
  date_issued: string;
  fining_officer: string | null;
  notes: string | null;
  created_by_user_id: string | null;
  member_id: string;
  member_name: string;
}

export interface JpSessionChange {
  id: string;
  session_id: string;
  fine_id: string;
  changed_by_user_id: string;
  changed_by_email: string;
  old_status: string;
  new_status: string;
  changed_at: string;
  // joined fine fields for display:
  member_name?: string;
  fine_type?: string;
}

export type UnbecomingStatus = "pending" | "upheld" | "dismissed";

export interface Unbecoming {
  id: string;
  member_id: string;
  member_name?: string;
  incident_date: string;
  title: string;
  body: string;
  status: UnbecomingStatus;
  decision: string | null;
  decision_date: string | null;
  sanction: string | null;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
  attachments?: UnbecomingAttachment[];
  attachment_count?: number;
}

export interface UnbecomingAttachment {
  id: string;
  unbecoming_id: string;
  file_path: string;
  file_name: string;
  file_size_bytes: number;
  mime_type: string | null;
  uploaded_at: string;
  uploaded_by: string;
}

export interface ChapterRosterEntry {
  roll: number;
  name: string;
  initiation_class: string | null;
  initiation_date: string | null;
  big_brother_roll: number | null;
  notes: string | null;
  created_at?: string;
}

export interface LeaderboardEntry {
  id: string;
  username: string;
  score: number;
  time_seconds: number;
  created_at: string;
}

export type GameQuestionType = "bigbro" | "roll";

export interface GameQuestion {
  member_name: string;
  type: GameQuestionType;
  // For bigbro: 4 options pre-shuffled (correct + 3 distractors). For roll: omitted.
  options?: Array<{ roll: number; name: string }>;
  // Roll # of correct big bro (bigbro questions), OR the member's own roll # (roll questions).
  correct_answer: number;
}

export interface GameStartResponse {
  questions: GameQuestion[];
  is_creator?: boolean;
  session_token: string;
}
