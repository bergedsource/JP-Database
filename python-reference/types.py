"""
Equivalent of lib/types.ts
Python dataclasses and Literal types mirroring the TypeScript interfaces.
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Literal, Optional

FineStatus = Literal["pending", "upheld", "dismissed", "paid", "labor"]

SocialProbationReason = Literal[
    "Outstanding Fines (§10-270)",
    "Academic - GPA Below 3.0 (§14-020)",
    "Academic - Cumulative GPA Below 2.0 (§14-060)",
    "Financial - Unpaid Dues (§9-140)",
    "Failure to Attend Ritual (§15-010)",
    "Failure to Complete Service Hours (§16-010)",
    "Missing House Philanthropy Event (§11-270)",
    "Other",
]

FineType = Literal[
    "Conduct Unbecoming (§11-010)",
    "General Misconduct (§11-020)",
    "Misconduct Under Influence (§11-030)",
    "Missing Security at Function (§11-050)",
    "Missing Required Event (§11-060)",
    "Missing Recruitment/Work Week (§11-070)",
    "Removal/Damage to House Property (§11-080)",
    "Removal/Damage to Personal Property (§11-090)",
    "Missing Chapter Meeting (§11-100)",
    "Missing Exec Meeting (§11-110)",
    "Missing Yearbook/Composite (§11-120)",
    "Kitchen Duties (§11-130)",
    "House Clean (§11-140)",
    "Event House Clean (§11-150)",
    "Chores (§11-160)",
    "Missing Philanthropy Event (§11-170)",
    "Smoking (§11-190)",
    "Fire Alarm (§11-200)",
    "Drop Testing Cleanup (§11-210)",
    "Unauthorized Weapon Use (§11-220)",
    "Sexual Relations on Sleeping Porch (§11-230)",
    "Formal Dinner Attire (§11-240)",
    "Grazers (§11-250)",
    "Social Probation Violation (§11-260)",
    "Missing House Philanthropy Event (§11-270)",
    "Missing Signed-Up Philanthropy Event (§11-280)",
    "Bathroom Trash Violation (§11-290)",
    "Physical Violence (§11-300)",
    "Committee Meeting Absence (§7-005)",
    "Missing JP Meeting (§10-220)",
    "Cell Phone in Exec Meeting (§8-060)",
    "Grievance Committee No-Show (§7-030)",
    "Guest Misconduct (§12-030)",
    "Breathalyzer Misuse (§12-080)",
    "Silent Sleeping Porch Violation (§18-350)",
    "Missing Blood Drive (§16-010)",
    "Missing Philanthropy Hours (§16-010)",
    "Vacant Room (§17-020)",
    "Room Improvement Removal (§17-240)",
    "Inadequate Room Space (§17-360)",
    "Failure to Vacate Room (§17-370)",
    "Other",
]

MemberStatus = Literal["active", "pledge", "alumni", "live-out", "inactive", "resident-advisor"]


@dataclass
class Member:
    id: str
    name: str
    status: MemberStatus
    created_at: str


@dataclass
class Fine:
    id: str
    member_id: str
    fine_type: str  # FineType
    description: str
    status: str     # FineStatus
    term: str
    date_issued: str
    created_at: str
    member_name: Optional[str] = None
    amount: Optional[float] = None
    date_resolved: Optional[str] = None
    notes: Optional[str] = None


@dataclass
class AuditLog:
    id: str
    admin_email: str
    action: str
    details: str
    created_at: str


@dataclass
class SocialProbation:
    id: str
    member_id: str
    reason: str     # SocialProbationReason
    start_date: str
    source: Literal["manual", "auto"]
    created_at: str
    member_name: Optional[str] = None
    notes: Optional[str] = None
    end_date: Optional[str] = None
