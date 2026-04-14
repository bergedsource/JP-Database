"use client";

import "./admin.css";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { AuditLog, Fine, Member, SocialProbation } from "@/lib/types";
import FinesTab from "./components/FinesTab";
import OutstandingTab from "./components/OutstandingTab";
import MembersTab from "./components/MembersTab";
import SocialProbationTab from "./components/SocialProbationTab";
import AuditTab from "./components/AuditTab";
import EventsTab from "./components/EventsTab";
import SessionsTab from "./components/SessionsTab";
import TransitionTab from "./components/TransitionTab";
import LoadingSkeleton from "./components/LoadingSkeleton";

type Tab = "fines" | "outstanding" | "members" | "soc pro" | "audit" | "sessions" | "transition" | "events";

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("fines");
  const [members, setMembers] = useState<Member[]>([]);
  const [fines, setFines] = useState<Fine[]>([]);
  const [socialProbations, setSocialProbations] = useState<SocialProbation[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [eventLog, setEventLog] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminEmail, setAdminEmail] = useState("");
  const [userRole, setUserRole] = useState<"owner" | "admin" | "root" | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const isPrivileged = userRole === "owner" || userRole === "root";

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    loadData();
    supabase.auth.getUser().then(({ data }) => {
      setAdminEmail(data.user?.email ?? "unknown");
    });
    fetch("/api/admin/me")
      .then((r) => r.json())
      .then((d) => { setUserRole(d.role ?? null); setCurrentUserId(d.userId ?? null); })
      .catch(() => {});
  }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: m }, { data: f }, { data: a }, { data: sp }] = await Promise.all([
      supabase.from("members").select("*").order("roll", { ascending: true, nullsFirst: false }).order("name"),
      supabase.from("fines").select("*, members(name)").order("date_issued", { ascending: false }),
      supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("social_probation").select("*, members(name)").order("created_at", { ascending: false }),
    ]);
    setMembers(m ?? []);
    setFines(
      (f ?? []).map((fine: Fine & { members?: { name: string } }) => ({
        ...fine,
        member_name: fine.members?.name,
      }))
    );
    setAuditLogs(a ?? []);
    setSocialProbations(
      (sp ?? []).map((s: SocialProbation & { members?: { name: string } }) => ({
        ...s,
        member_name: s.members?.name,
      }))
    );
    setLoading(false);
  }

  async function loadEventLog() {
    const { data } = await supabase
      .from("system_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    setEventLog(data ?? []);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=IBM+Plex+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap"
        rel="stylesheet"
      />

      <div className="adm-page">
        <header className="adm-header">
          <div className="adm-header-left">
            <div className="adm-gold-bar" />
            <div>
              <div className="adm-title">JP Admin</div>
              <div className="adm-subtitle">Acacia · Oregon State</div>
            </div>
            <a
              href={`mailto:bergedillon@gmail.com?subject=JP Admin Bug Report&body=Reported by: ${adminEmail}%0A%0ADescribe the bug:%0A`}
              style={{ marginLeft: 8, fontSize: 11, color: "var(--text-dim)", fontFamily: "'IBM Plex Mono', monospace", border: "1px solid var(--border)", borderRadius: 5, padding: "3px 8px", textDecoration: "none", cursor: "pointer" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--gold)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-dim)")}
            >
              bugs?
            </a>
          </div>
          <button onClick={signOut} className="adm-signout">Sign out</button>
        </header>

        <div className="adm-body">
          {userRole === "admin" && (
            <div className="adm-view-only-banner">View Only — Contact JP Chair to make changes</div>
          )}

          <div className="adm-tabs">
            {(["fines", "outstanding", "members", "soc pro"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`adm-tab${tab === t ? " active" : ""}`}
              >
                {t}
              </button>
            ))}
            {isPrivileged && (
              <button
                className={`adm-tab${tab === "audit" ? " active" : ""}`}
                onClick={() => setTab("audit")}
              >
                audit
              </button>
            )}
            <button
              className={`adm-tab${tab === "sessions" ? " active" : ""}`}
              onClick={() => setTab("sessions")}
            >
              sessions
            </button>
            {isPrivileged && (
              <button
                className={`adm-tab${tab === "transition" ? " active" : ""}`}
                onClick={() => setTab("transition")}
              >
                Transition
              </button>
            )}
            {userRole === "root" && (
              <button
                className={`adm-tab${tab === "events" ? " active" : ""}`}
                onClick={() => { setTab("events"); loadEventLog(); }}
              >
                creator log
              </button>
            )}
          </div>

          {loading ? (
            <div className="adm-card"><LoadingSkeleton /></div>
          ) : (
            <>
              {tab === "fines" && (
                <FinesTab members={members} fines={fines} isPrivileged={isPrivileged} currentUserId={currentUserId} userRole={userRole} refresh={loadData} />
              )}
              {tab === "outstanding" && (
                <OutstandingTab members={members} fines={fines} isPrivileged={isPrivileged} currentUserId={currentUserId} userRole={userRole} refresh={loadData} />
              )}
              {tab === "members" && (
                <MembersTab members={members} fines={fines} isPrivileged={isPrivileged} refresh={loadData} />
              )}
              {tab === "soc pro" && (
                <SocialProbationTab members={members} socialProbations={socialProbations} isPrivileged={isPrivileged} refresh={loadData} />
              )}
              {tab === "audit" && isPrivileged && <AuditTab auditLogs={auditLogs} />}
              {tab === "events" && userRole === "root" && <EventsTab eventLog={eventLog} />}
              {tab === "sessions" && <SessionsTab isPrivileged={isPrivileged} />}
              {tab === "transition" && isPrivileged && (
                <TransitionTab fines={fines} currentUserId={currentUserId} userRole={userRole} setUserRole={setUserRole} />
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
