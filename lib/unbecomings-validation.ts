// Shared input validators for the Unbecomings API routes.

export const VALID_STATUS = ["pending", "upheld", "dismissed"] as const;
export const TITLE_MAX = 200;
export const BODY_MAX = 50000;
export const FIELD_MAX = 5000;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type CreatePayload = {
  member_id: string;
  incident_date: string;
  title: string;
  body: string;
  status: "pending" | "upheld" | "dismissed";
  decision: string | null;
  decision_date: string | null;
  sanction: string | null;
};

export function validateCreate(body: unknown): CreatePayload | { error: string } {
  if (!body || typeof body !== "object") return { error: "Invalid body" };
  const b = body as Record<string, unknown>;

  const member_id = typeof b.member_id === "string" ? b.member_id.trim() : "";
  if (!UUID_RE.test(member_id)) return { error: "Invalid member_id" };

  const incident_date = typeof b.incident_date === "string" ? b.incident_date : "";
  if (!DATE_RE.test(incident_date)) return { error: "Invalid incident_date (expected YYYY-MM-DD)" };

  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (!title) return { error: "Title is required" };
  if (title.length > TITLE_MAX) return { error: `Title must be ${TITLE_MAX} chars or fewer` };

  const bodyText = typeof b.body === "string" ? b.body : "";
  if (bodyText.length > BODY_MAX) return { error: `Body must be ${BODY_MAX} chars or fewer` };

  const status = typeof b.status === "string" ? b.status : "pending";
  if (!(VALID_STATUS as readonly string[]).includes(status)) return { error: "Invalid status" };

  const decisionVal = nullableString(b.decision, "decision");
  if (isErr(decisionVal)) return decisionVal;

  const decisionDateVal = nullableDate(b.decision_date, "decision_date");
  if (isErr(decisionDateVal)) return decisionDateVal;

  const sanctionVal = nullableString(b.sanction, "sanction");
  if (isErr(sanctionVal)) return sanctionVal;

  return {
    member_id,
    incident_date,
    title,
    body: bodyText,
    status: status as CreatePayload["status"],
    decision: decisionVal,
    decision_date: decisionDateVal,
    sanction: sanctionVal,
  };
}

export type UpdatePayload = Partial<CreatePayload> & { member_id?: string };

export function validateUpdate(body: unknown): UpdatePayload | { error: string } {
  if (!body || typeof body !== "object") return { error: "Invalid body" };
  const b = body as Record<string, unknown>;
  const out: UpdatePayload = {};

  if (b.member_id !== undefined) {
    if (typeof b.member_id !== "string" || !UUID_RE.test(b.member_id)) return { error: "Invalid member_id" };
    out.member_id = b.member_id;
  }
  if (b.incident_date !== undefined) {
    if (typeof b.incident_date !== "string" || !DATE_RE.test(b.incident_date)) return { error: "Invalid incident_date" };
    out.incident_date = b.incident_date;
  }
  if (b.title !== undefined) {
    if (typeof b.title !== "string") return { error: "Title must be a string" };
    const t = b.title.trim();
    if (!t) return { error: "Title cannot be empty" };
    if (t.length > TITLE_MAX) return { error: `Title must be ${TITLE_MAX} chars or fewer` };
    out.title = t;
  }
  if (b.body !== undefined) {
    if (typeof b.body !== "string") return { error: "Body must be a string" };
    if (b.body.length > BODY_MAX) return { error: `Body must be ${BODY_MAX} chars or fewer` };
    out.body = b.body;
  }
  if (b.status !== undefined) {
    if (typeof b.status !== "string" || !(VALID_STATUS as readonly string[]).includes(b.status)) {
      return { error: "Invalid status" };
    }
    out.status = b.status as CreatePayload["status"];
  }
  if (b.decision !== undefined) {
    const v = nullableString(b.decision, "decision");
    if (isErr(v)) return v;
    out.decision = v;
  }
  if (b.decision_date !== undefined) {
    const v = nullableDate(b.decision_date, "decision_date");
    if (isErr(v)) return v;
    out.decision_date = v;
  }
  if (b.sanction !== undefined) {
    const v = nullableString(b.sanction, "sanction");
    if (isErr(v)) return v;
    out.sanction = v;
  }

  return out;
}

function nullableString(v: unknown, field: string): string | null | { error: string } {
  if (v == null || v === "") return null;
  if (typeof v !== "string") return { error: `${field} must be a string or null` };
  if (v.length > FIELD_MAX) return { error: `${field} must be ${FIELD_MAX} chars or fewer` };
  return v;
}

function nullableDate(v: unknown, field: string): string | null | { error: string } {
  if (v == null || v === "") return null;
  if (typeof v !== "string" || !DATE_RE.test(v)) return { error: `${field} must be YYYY-MM-DD or null` };
  return v;
}

function isErr<T>(v: T | { error: string }): v is { error: string } {
  return typeof v === "object" && v !== null && "error" in v;
}

export function sanitizeFilename(name: string): string {
  return name
    .replace(/[\\/]/g, "_")        // drop path separators
    .replace(/\s+/g, "_")          // collapse whitespace
    .replace(/[\x00-\x1f\x7f]/g, "") // drop control chars
    .slice(0, 200);
}
