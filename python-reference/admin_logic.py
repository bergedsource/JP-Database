"""
Equivalent of the server-side logic in app/admin/page.tsx

Contains all Supabase read/write operations extracted from the React component:
  - load_data()
  - auto_escalate_overdue_fines()
  - auto_detect_social_probation()
  - submit_fine()
  - update_fine_status()
  - delete_fine()
  - submit_outstanding_fine()
  - submit_member()
  - update_member_status()
  - delete_member()
  - add_social_probation()
  - remove_social_probation()
  - log_action()

None of this renders UI — it is purely the data layer.

Usage:
    from admin_logic import AdminLogic
    from supabase_client import create_supabase_service_client

    client = create_supabase_service_client()
    admin = AdminLogic(client, admin_email="you@example.com")
    data = admin.load_data()
    admin.auto_escalate_overdue_fines()
    admin.auto_detect_social_probation()
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from supabase import Client

from export_fine import export_fine_to_sheet


class AdminLogic:
    def __init__(self, client: Client, admin_email: str):
        self.db = client
        self.admin_email = admin_email

    # ------------------------------------------------------------------
    # Data loading
    # ------------------------------------------------------------------

    def load_data(self) -> dict:
        """
        Fetch members, fines (with member name), audit logs, and social
        probation records in parallel — mirrors loadData() in the TSX.
        Returns a dict with keys: members, fines, audit_logs, social_probations.
        """
        members = self.db.from_("members").select("*").order("name").execute().data or []

        raw_fines = (
            self.db.from_("fines")
            .select("*, members(name)")
            .order("date_issued", desc=True)
            .execute()
            .data
            or []
        )
        fines = [
            {**f, "member_name": (f.get("members") or {}).get("name")}
            for f in raw_fines
        ]

        audit_logs = (
            self.db.from_("audit_logs")
            .select("*")
            .order("created_at", desc=True)
            .limit(200)
            .execute()
            .data
            or []
        )

        raw_sp = (
            self.db.from_("social_probation")
            .select("*, members(name)")
            .order("created_at", desc=True)
            .execute()
            .data
            or []
        )
        social_probations = [
            {**s, "member_name": (s.get("members") or {}).get("name")}
            for s in raw_sp
        ]

        return {
            "members": members,
            "fines": fines,
            "audit_logs": audit_logs,
            "social_probations": social_probations,
        }

    # ------------------------------------------------------------------
    # Auto-behaviors (run on admin page load)
    # ------------------------------------------------------------------

    def auto_escalate_overdue_fines(self) -> None:
        """
        Mirrors autoEscalateOverdueFines():
        Pending fines older than 2 weeks are set to 'upheld' automatically.
        """
        two_weeks_ago = (datetime.now(timezone.utc) - timedelta(weeks=2)).isoformat()

        result = (
            self.db.from_("fines")
            .select("id, fine_type, members(name)")
            .eq("status", "pending")
            .lt("created_at", two_weeks_ago)
            .execute()
        )
        overdue = result.data or []
        if not overdue:
            return

        ids = [f["id"] for f in overdue]
        self.db.from_("fines").update({"status": "upheld"}).in_("id", ids).execute()

        for fine in overdue:
            member_name = (fine.get("members") or {}).get("name", "Unknown")
            self._log(
                "Auto-Escalated Fine",
                f'{member_name} — {fine["fine_type"]} auto-escalated to "upheld" (pending > 2 weeks)',
            )

    def auto_detect_social_probation(self) -> None:
        """
        Mirrors autoDetectSocialProbation():
        §10-270 — members with any upheld fine older than 1 week, or total
        upheld > $20, are placed on social probation automatically.
        Members who no longer qualify are lifted automatically.
        """
        one_week_ago = (datetime.now(timezone.utc) - timedelta(weeks=1)).isoformat()
        today = datetime.now(timezone.utc).date().isoformat()

        upheld_fines = (
            self.db.from_("fines")
            .select("member_id, amount, created_at")
            .eq("status", "upheld")
            .execute()
            .data
            or []
        )

        auto_sp = (
            self.db.from_("social_probation")
            .select("id, member_id")
            .eq("source", "auto")
            .eq("reason", "Outstanding Fines (§10-270)")
            .is_("end_date", "null")
            .execute()
            .data
            or []
        )

        # Group upheld fines by member
        member_data: dict[str, dict] = {}
        for fine in upheld_fines:
            mid = fine["member_id"]
            amount = fine.get("amount") or 0
            created = fine["created_at"]
            if mid not in member_data:
                member_data[mid] = {"total_owed": amount, "oldest_created": created}
            else:
                member_data[mid]["total_owed"] += amount
                if created < member_data[mid]["oldest_created"]:
                    member_data[mid]["oldest_created"] = created

        # §10-270: upheld fine older than 1 week OR total > $20
        qualifying: set[str] = set()
        for member_id, data in member_data.items():
            if data["total_owed"] > 20 or data["oldest_created"] < one_week_ago:
                qualifying.add(member_id)

        already_on: set[str] = {sp["member_id"] for sp in auto_sp}
        to_add = qualifying - already_on
        to_remove = [sp for sp in auto_sp if sp["member_id"] not in qualifying]

        if not to_add and not to_remove:
            return

        # Fetch names for audit logs
        all_ids = list(to_add) + [sp["member_id"] for sp in to_remove]
        name_rows = (
            self.db.from_("members").select("id, name").in_("id", all_ids).execute().data or []
        )
        name_map = {m["id"]: m["name"] for m in name_rows}

        for member_id in to_add:
            self.db.from_("social_probation").insert(
                {
                    "member_id": member_id,
                    "reason": "Outstanding Fines (§10-270)",
                    "start_date": today,
                    "source": "auto",
                }
            ).execute()
            self._log(
                "Auto Social Probation",
                f'{name_map.get(member_id, "Unknown")} placed on social probation — outstanding fines per §10-270',
            )

        for sp in to_remove:
            self.db.from_("social_probation").update({"end_date": today}).eq("id", sp["id"]).execute()
            self._log(
                "Auto Social Probation Lifted",
                f'{name_map.get(sp["member_id"], "Unknown")} removed from social probation — fines resolved',
            )

    # ------------------------------------------------------------------
    # Fine operations
    # ------------------------------------------------------------------

    def submit_fine(
        self,
        member_ids: list[str],
        fine_type: str,
        description: str,
        term: str,
        date_issued: str,
        amount: Optional[float] = None,
        notes: Optional[str] = None,
    ) -> None:
        """Issue a pending fine against one or more members. Mirrors submitFine()."""
        rows = [
            {
                "member_id": mid,
                "fine_type": fine_type,
                "description": description,
                "amount": amount,
                "status": "pending",
                "term": term,
                "date_issued": date_issued,
                "notes": notes,
            }
            for mid in member_ids
        ]
        self.db.from_("fines").insert(rows).execute()
        self._log(
            "Issued Fine",
            f'{fine_type} against {len(member_ids)} member(s) — "{description}" ({term})'
            + (f", ${amount:.2f}" if amount is not None else ""),
        )

    def update_fine_status(self, fine_id: str, status: str, fine: Optional[dict] = None) -> None:
        """
        Update a fine's status and, if resolved, set date_resolved.
        If status == 'paid', exports the fine to Google Sheets.
        Mirrors updateFineStatus().
        """
        date_resolved = (
            datetime.now(timezone.utc).date().isoformat()
            if status in ("paid", "dismissed", "labor")
            else None
        )
        self.db.from_("fines").update(
            {"status": status, "date_resolved": date_resolved}
        ).eq("id", fine_id).execute()

        if fine:
            self._log(
                "Updated Fine Status",
                f'{fine.get("member_name", "Unknown")} — {fine["fine_type"]} changed to "{status}"',
            )
            if status == "paid":
                export_fine_to_sheet(
                    member_name=fine.get("member_name"),
                    fine_type=fine.get("fine_type"),
                    description=fine.get("description"),
                    amount=fine.get("amount"),
                    date_resolved=date_resolved,
                )

    def delete_fine(self, fine_id: str, fine: Optional[dict] = None) -> None:
        """Delete a fine. Mirrors deleteFine()."""
        self.db.from_("fines").delete().eq("id", fine_id).execute()
        if fine:
            self._log(
                "Deleted Fine",
                f'{fine.get("member_name", "Unknown")} — {fine["fine_type"]} ({fine["term"]})',
            )

    def submit_outstanding_fine(
        self,
        member_id: str,
        member_name: str,
        fine_type: str,
        description: str,
        term: str,
        date_issued: str,
        amount: Optional[float] = None,
        notes: Optional[str] = None,
        place_on_soc_pro: bool = False,
    ) -> None:
        """
        Issue an upheld (outstanding) fine directly. Optionally place member
        on social probation at the same time. Mirrors submitOutstandingFine().
        """
        self.db.from_("fines").insert(
            {
                "member_id": member_id,
                "fine_type": fine_type,
                "description": description,
                "amount": amount,
                "status": "upheld",
                "term": term,
                "date_issued": date_issued,
                "notes": notes,
            }
        ).execute()
        self._log(
            "Issued Outstanding Fine",
            f'{member_name} — {fine_type}'
            + (f" ${amount:.2f}" if amount is not None else "")
            + f" ({term})",
        )

        if place_on_soc_pro:
            today = datetime.now(timezone.utc).date().isoformat()
            self.db.from_("social_probation").insert(
                {
                    "member_id": member_id,
                    "reason": "Outstanding Fines (§10-270)",
                    "start_date": today,
                    "source": "manual",
                    "notes": notes,
                }
            ).execute()
            self._log(
                "Added Social Probation",
                f"{member_name} — Outstanding Fines (§10-270) (manual, issued with fine)",
            )

    # ------------------------------------------------------------------
    # Member operations
    # ------------------------------------------------------------------

    def submit_member(self, name: str, status: str) -> None:
        """Add a new member. Mirrors submitMember()."""
        self.db.from_("members").insert({"name": name.strip(), "status": status}).execute()
        self._log("Added Member", f"{name.strip()} ({status})")

    def update_member_status(self, member_id: str, status: str, old_status: str = "", name: str = "") -> None:
        """Change a member's status. Mirrors updateMemberStatus()."""
        self.db.from_("members").update({"status": status}).eq("id", member_id).execute()
        if name:
            self._log("Updated Member Status", f'{name} changed from "{old_status}" to "{status}"')

    def delete_member(self, member_id: str, member: Optional[dict] = None) -> None:
        """Delete a member and all their fines. Mirrors deleteMember()."""
        self.db.from_("fines").delete().eq("member_id", member_id).execute()
        self.db.from_("members").delete().eq("id", member_id).execute()
        if member:
            self._log("Deleted Member", f'{member["name"]} ({member["status"]})')

    # ------------------------------------------------------------------
    # Social probation operations
    # ------------------------------------------------------------------

    def add_social_probation(
        self,
        member_id: str,
        member_name: str,
        reason: str,
        start_date: str,
        notes: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> None:
        """Manually place a member on social probation. Mirrors addSocialProbation()."""
        self.db.from_("social_probation").insert(
            {
                "member_id": member_id,
                "reason": reason,
                "notes": notes,
                "start_date": start_date,
                "end_date": end_date or None,
                "source": "manual",
            }
        ).execute()
        self._log("Added Social Probation", f"{member_name} — {reason}")

    def remove_social_probation(self, sp_id: str, member_name: str, reason: str) -> None:
        """Lift a social probation record. Mirrors removeSocialProbation()."""
        today = datetime.now(timezone.utc).date().isoformat()
        self.db.from_("social_probation").update({"end_date": today}).eq("id", sp_id).execute()
        self._log("Removed Social Probation", f"{member_name} — {reason} lifted")

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _log(self, action: str, details: str) -> None:
        """Insert an audit log entry. Mirrors log() in the TSX."""
        self.db.from_("audit_logs").insert(
            {
                "admin_email": self.admin_email,
                "action": action,
                "details": details,
            }
        ).execute()
