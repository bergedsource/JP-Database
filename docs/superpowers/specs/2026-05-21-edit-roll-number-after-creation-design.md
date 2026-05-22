# Edit Member Roll # After Creation — Design

## Problem

The Members tab lets admins set a chapter Roll # when creating a new member, but once the row exists there's no way to add or change it. If a JP officer creates a member and forgets the Roll #, or enters the wrong one, they have to delete and re-add the member (which also deletes their fines via cascade — destructive and lossy).

## Goal

Let owner/root users edit the `roll` field on any existing member from the Members tab, using a deliberate (not accidental) edit interaction, with full audit logging that matches the existing per-field-edit pattern in this codebase.

## Non-Goals

- Bulk-editing Roll #s
- Enforcing uniqueness of Roll #s across members (matches current POST behavior; flagged separately as future work)
- Editing other fields inline (name, status already has its own pattern)
- Letting `admin`-role users edit Roll # — read-only for them, mirroring how status is read-only

## Approach

A per-field PUT route plus a pencil-icon inline editor in the table cell. This mirrors `app/api/admin/members/[id]/status/route.ts` and the existing inline status `<select>` in `MembersTab.tsx`. No refactor of existing code.

## API

**New file:** `app/api/admin/members/[id]/roll/route.ts`

- Handler: `PUT`
- Auth: `requireOwner()` → 403 if not owner/root; then `getCurrentRole()` for the audit email
- Body: `{ roll: number | null }`
- Validation:
  - `roll === null` is allowed (clears the field)
  - Otherwise must be a finite integer with `Number.isInteger(roll) && roll >= 1 && roll <= 99999`
  - On invalid input: `400 { error: "Roll # must be an integer between 1 and 99999, or null" }`
- DB:
  1. Pre-read `service.from("members").select("name, roll").eq("id", id).single()` so the audit message has the old value
  2. `service.from("members").update({ roll }).eq("id", id)`
  3. If `error` from update → `500 { error: error.message }`
- Audit:
  - Table: `system_events` if `current.role === "root"`, else `audit_logs`
  - Action: `"Updated Member Roll #"`
  - Details: `` `${member.name} changed Roll # from ${member.roll ?? "—"} to ${roll ?? "—"}` ``
- Response: `200 { success: true }`
- No rate limiter (matches the sibling `/status` route; the destructive members POST has `adminLimiter` but per-field edits do not)

## UI

**File:** `app/admin/components/MembersTab.tsx`

**New state in the component:**
```ts
const [editingRollId, setEditingRollId] = useState<string | null>(null);
const [rollDraft, setRollDraft] = useState("");
const [rollSaving, setRollSaving] = useState(false);
const [rollError, setRollError] = useState("");
```

**New handler:**
```ts
async function saveRoll(id: string) {
  setRollSaving(true);
  setRollError("");
  const parsed = rollDraft.trim() === "" ? null : parseInt(rollDraft, 10);
  const res = await fetch(`/api/admin/members/${id}/roll`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roll: parsed }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    setRollError(data.error ?? "Failed to update Roll #");
  } else {
    setEditingRollId(null);
    setRollDraft("");
    await refresh();
  }
  setRollSaving(false);
}

function startEditRoll(m: Member) {
  setEditingRollId(m.id);
  setRollDraft(m.roll != null ? String(m.roll) : "");
  setRollError("");
}

function cancelEditRoll() {
  setEditingRollId(null);
  setRollDraft("");
  setRollError("");
}
```

**Roll # `<td>` markup (replaces lines 137–139):**

- When `editingRollId !== m.id`:
  - Render the current value (`m.roll ?? "—"`) styled as today
  - If `isPrivileged`, render a small pencil-icon `<button>` next to the value
    - Inline SVG (12px), `var(--text-dim)` color → `var(--gold)` on hover
    - `aria-label="Edit Roll #"`
    - `onClick={() => startEditRoll(m)}`
- When `editingRollId === m.id`:
  - Render a narrow `<input type="number" min="1" max="99999">` (~70px wide), `value={rollDraft}`, `onChange` sets `rollDraft`, autofocus, `disabled={rollSaving}`
  - `onKeyDown`: `Enter` → `saveRoll(m.id)`, `Escape` → `cancelEditRoll()`
  - Two icon buttons after the input:
    - ✓ save (calls `saveRoll(m.id)`, disabled while saving)
    - ✕ cancel (calls `cancelEditRoll()`)
  - If `rollError`, render a small red text under or beside the input (`adm-error` class, font size 11)

**Why pencil icon over inline-click-to-edit:** A Roll # rarely changes after it's set, and accidentally turning the cell into an input on a casual click would be annoying. A deliberate pencil click makes "I'm editing now" explicit, matching the user's stated preference.

## Permissions

- `owner`, `root`: see pencil, can edit
- `admin`: sees Roll # value, no pencil — same model as the status column which renders a read-only badge for them (line 153 today)
- Backend enforces with `requireOwner()` regardless of what the UI shows

## Audit Log Examples

| Event | Table | Details |
|---|---|---|
| Owner adds Roll # to member who had none | `audit_logs` | `John Smith changed Roll # from — to 1392` |
| Owner changes existing Roll # | `audit_logs` | `John Smith changed Roll # from 1391 to 1392` |
| Owner clears Roll # | `audit_logs` | `John Smith changed Roll # from 1391 to —` |
| Root makes any of the above | `system_events` | (same details format) |

## Error Handling

- Invalid input (non-integer, out of range): 400 from server, surfaced as `rollError` text near the input. User can fix and retry without losing the row.
- DB error: 500 from server with the supabase error message, surfaced the same way.
- Network error: `fetch` throw is not caught explicitly — the unhandled rejection lands in the existing Sentry capture. UI will leave `rollSaving=true` until reload. *(Acceptable for v1; can add a try/catch + generic error later if it becomes a problem.)*

## Testing

Manual verification checklist (no automated tests exist in this codebase for the admin pages):

1. As `owner`: pencil appears, click it, input is focused with current value pre-filled
2. Type a new number, press Enter → cell shows new value, no page reload
3. Open audit log → entry present with correct old → new values
4. Edit again, press Esc → input disappears, value unchanged
5. Edit, clear the input, save → cell shows `—`, audit entry shows `... to —`
6. Edit, enter `0` or `-5` or `100000` → 400 error displayed, value unchanged in DB
7. As `admin`: no pencil visible; even hitting the API directly with curl returns 403
8. As `root`: edit works, audit entry lands in `system_events` not `audit_logs`

## Open Items / Follow-Ups

- **Uniqueness:** Not enforced today, not added by this change. If two members end up with the same Roll # and it causes confusion, add a unique partial index on `members.roll WHERE roll IS NOT NULL` in a future migration and a 409 conflict check in the API.
- **Name editing:** Currently no way to fix a misspelled member name post-creation either. Same architectural pattern would apply (`/members/[id]/name`). Not in scope here.

## Files Touched

| File | Change |
|---|---|
| `app/api/admin/members/[id]/roll/route.ts` | New |
| `app/admin/components/MembersTab.tsx` | Modified — new state, handlers, conditional `<td>` rendering |

No schema migration needed — `roll` column already exists on `members` table per `lib/types.ts:33`.
