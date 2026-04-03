export type FineStatus = "pending" | "upheld" | "dismissed" | "paid" | "labor" | "overturned";

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

export type FineType =
  | "Conduct Unbecoming (§11-010)"
  | "General Misconduct (§11-020)"
  | "Misconduct Under Influence (§11-030)"
  | "Missing Security at Function (§11-050)"
  | "Missing Required Event (§11-060)"
  | "Missing Recruitment/Work Week (§11-070)"
  | "Removal/Damage to House Property (§11-080)"
  | "Removal/Damage to Personal Property (§11-090)"
  | "Missing Chapter Meeting (§11-100)"
  | "Missing Exec Meeting (§11-110)"
  | "Missing Yearbook/Composite (§11-120)"
  | "Kitchen Duties (§11-130)"
  | "House Clean (§11-140)"
  | "Event House Clean (§11-150)"
  | "Chores (§11-160)"
  | "Missing Philanthropy Event (§11-170)"
  | "Smoking (§11-190)"
  | "Fire Alarm (§11-200)"
  | "Drop Testing Cleanup (§11-210)"
  | "Unauthorized Weapon Use (§11-220)"
  | "Sexual Relations on Sleeping Porch (§11-230)"
  | "Formal Dinner Attire (§11-240)"
  | "Grazers (§11-250)"
  | "Social Probation Violation (§11-260)"
  | "Missing House Philanthropy Event (§11-270)"
  | "Missing Signed-Up Philanthropy Event (§11-280)"
  | "Bathroom Trash Violation (§11-290)"
  | "Physical Violence (§11-300)"
  | "Committee Meeting Absence (§7-005)"
  | "Missing JP Meeting (§10-220)"
  | "Cell Phone in Exec Meeting (§8-060)"
  | "Grievance Committee No-Show (§7-030)"
  | "Guest Misconduct (§12-030)"
  | "Breathalyzer Misuse (§12-080)"
  | "Silent Sleeping Porch Violation (§18-350)"
  | "Missing Blood Drive (§16-010)"
  | "Missing Philanthropy Hours (§16-010)"
  | "Vacant Room (§17-020)"
  | "Room Improvement Removal (§17-240)"
  | "Inadequate Room Space (§17-360)"
  | "Failure to Vacate Room (§17-370)"
  | "Other";

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
  created_at: string;
}
