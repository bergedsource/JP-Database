export type FineStatus = "pending" | "upheld" | "dismissed" | "paid" | "labor";

export type FineType =
  | "Conduct Unbecoming"
  | "General Misconduct"
  | "Misconduct Under Influence"
  | "Missing Security at Function"
  | "Missing Required Event"
  | "Missing Recruitment/Work Week"
  | "Missing Chapter Meeting"
  | "Missing Exec Meeting"
  | "Missing Yearbook/Composite"
  | "Kitchen Duties"
  | "House Clean"
  | "Event House Clean"
  | "Chores"
  | "Missing Philanthropy Event"
  | "Smoking"
  | "Fire Alarm"
  | "Formal Dinner Attire"
  | "Grazers"
  | "Social Probation Violation"
  | "Committee Meeting Absence"
  | "Missing JP Meeting"
  | "Removal/Damage to House Property"
  | "Removal/Damage to Personal Property"
  | "Unauthorized Weapon Use"
  | "Other";

export interface Member {
  id: string;
  name: string;
  status: "active" | "pledge" | "alumni" | "live-out" | "inactive" | "resident-advisor";
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
  created_at: string;
}
