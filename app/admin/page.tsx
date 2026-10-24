"use client";

import "./admin.css";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { AuditLog, Fine, Member, SocialProbation } from "@/lib/types";
import FinesTab from "./components/FinesTab";
import OutstandingTab from "./components/OutstandingTab";
import LaborTab from "./components/LaborTab";
import MembersTab from "./components/MembersTab";
import SocialProbationTab from "./components/SocialProbationTab";
import SocProHistoryTab from "./components/SocProHistoryTab";
import AuditTab from "./components/AuditTab";
import EventsTab from "./components/EventsTab";
import SessionsTab from "./components/SessionsTab";
import TransitionTab from "./components/TransitionTab";
import UnbecomingsTab from "./components/UnbecomingsTab";
import LoadingSkeleton from "./components/LoadingSkeleton";
import NavIcon, { type NavIconName } from "./components/NavIcon";

type Tab = "fines" | "outstanding" | "labor" | "members" | "soc pro" | "soc pro history" | "audit" | "sessions" | "transition" | "events" | "unbecomings";

type NavItem = {
  tab: Tab;
  label: string;
  icon: NavIconName;
  count?: number;
  // "alert" counts are things waiting on someone (coral); plain counts are just totals.
  countTone?: "gold" | "alert" | "plain";
  locked?: boolean;
  show: boolean;
};

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("fines");
  const [menuOpen, setMenuOpen] = useState(false);
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

  async function loadData() {
    const [{ data: m }, { data: f }, { data: a }, spRes] = await Promise.all([
      supabase.from("members").select("*").order("roll", { ascending: true, nullsFirst: false }).order("name"),
      supabase.from("fines").select("*, members(name)").order("date_issued", { ascending: false }),
      supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(200),
      fetch("/api/admin/social-probation").then((r) => r.ok ? r.json() : []),
    ]);
    setMembers(m ?? []);
    setFines(
      (f ?? []).map((fine: Fine & { members?: { name: string } }) => ({
        ...fine,
        member_name: fine.members?.name,
      }))
    );
    setAuditLogs(a ?? []);
    const sp: (SocialProbation & { members?: { name: string } })[] = Array.isArray(spRes) ? spRes : [];
    setSocialProbations(
      sp.map((s) => ({
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

  function openTab(t: Tab) {
    setTab(t);
    setMenuOpen(false);
    if (t === "events") loadEventLog();
  }

  // loadData is deferred one microtask so its setState calls don't run during the
  // effect's synchronous phase; the other two already settle in promise callbacks.
  useEffect(() => {
    void Promise.resolve().then(loadData);
    supabase.auth.getUser().then(({ data }) => {
      setAdminEmail(data.user?.email ?? "unknown");
    });
    fetch("/api/admin/me")
      .then((r) => r.json())
      .then((d) => { setUserRole(d.role ?? null); setCurrentUserId(d.userId ?? null); })
      .catch(() => {});
  }, []);

  // Escape closes the phone menu.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const pendingCount = fines.filter((f) => f.status === "pending").length;
  const owingCount = new Set(fines.filter((f) => f.status === "upheld").map((f) => f.member_id)).size;
  const laborCount = fines.filter((f) => f.status === "labor" && !f.labor_completed_at).length;

  const groups: { name: string; items: NavItem[] }[] = [
    {
      name: "Docket",
      items: [
        { tab: "fines", label: "Fines", icon: "fines", count: pendingCount, countTone: "gold", show: true },
        { tab: "sessions", label: "Sessions", icon: "sessions", show: true },
        { tab: "outstanding", label: "Outstanding", icon: "outstanding", count: owingCount, countTone: "alert", show: true },
        { tab: "labor", label: "Labor owed", icon: "labor", count: laborCount, countTone: "plain", show: true },
      ],
    },
    {
      name: "Brothers",
      items: [
        { tab: "members", label: "Members", icon: "members", show: true },
        { tab: "soc pro", label: "Social probation", icon: "socpro", count: socialProbations.length, countTone: "alert", show: true },
        { tab: "soc pro history", label: "Probation history", icon: "history", show: true },
      ],
    },
    {
      name: "Records",
      items: [
        { tab: "audit", label: "Audit log", icon: "audit", show: isPrivileged },
        { tab: "unbecomings", label: "Unbecomings", icon: "lock", locked: true, show: isPrivileged },
        { tab: "events", label: "Creator log", icon: "events", show: userRole === "root" },
      ],
    },
    {
      name: "Chapter",
      items: [
        { tab: "transition", label: "Chair transition", icon: "transition", show: isPrivileged },
      ],
    },
  ];

  const activeLabel = groups.flatMap((g) => g.items).find((i) => i.tab === tab)?.label ?? "";
  const roleLabel = userRole ? userRole[0].toUpperCase() + userRole.slice(1) : "";

  return (
    <div className="adm-page">
      <div className="adm-topbar">
        <button
          type="button"
          className="adm-icon-btn"
          aria-label="Open menu"
          aria-expanded={menuOpen}
          aria-controls="adm-sidebar"
          onClick={() => setMenuOpen(true)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        <span className="adm-topbar-title">{activeLabel}</span>
      </div>

      {menuOpen && (
        <button type="button" className="adm-scrim" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
      )}

      <aside id="adm-sidebar" className={`adm-sidebar${menuOpen ? " open" : ""}`}>
        <div className="adm-brand">
          <div className="adm-crest" aria-hidden="true">J</div>
          <div className="adm-brand-text">
            <span className="adm-brand-name">Acacia JP</span>
            <span className="adm-brand-sub">Oregon State</span>
          </div>
          <button
            type="button"
            className="adm-icon-btn adm-sidebar-close"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <nav className="adm-nav" aria-label="Admin sections">
          {groups.map((g) => {
            const items = g.items.filter((i) => i.show);
            if (items.length === 0) return null;
            return (
              <div key={g.name} className="adm-nav-group">
                <span className="adm-nav-heading">{g.name}</span>
                {items.map((item) => {
                  const active = tab === item.tab;
                  return (
                    <button
                      key={item.tab}
                      type="button"
                      className={`adm-nav-item${active ? " active" : ""}`}
                      aria-current={active ? "page" : undefined}
                      onClick={() => openTab(item.tab)}
                    >
                      <NavIcon name={item.icon} />
                      <span className="adm-nav-label">{item.label}</span>
                      {!loading && item.count != null && item.count > 0 && (
                        <span className={`adm-nav-count tone-${item.countTone ?? "plain"}`}>{item.count}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="adm-account">
          <div className="adm-account-text">
            <span className="adm-account-email" title={adminEmail}>{adminEmail}</span>
            <span className="adm-account-role">{roleLabel}</span>
          </div>
          <div className="adm-account-actions">
            <a
              className="adm-account-link"
              href={`mailto:bergedillon@gmail.com?subject=JP Admin Bug Report&body=Reported by: ${adminEmail}%0A%0ADescribe the bug:%0A`}
            >
              Report a bug
            </a>
            <button type="button" onClick={signOut} className="adm-signout">Sign out</button>
          </div>
        </div>
      </aside>

      <main className="adm-main">
        <div className="adm-body">
          <h1 className="adm-page-title">{activeLabel}</h1>

          {userRole === "admin" && (
            <div className="adm-view-only-banner">View only. Ask the JP Chair to make changes.</div>
          )}

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
              {tab === "labor" && (
                <LaborTab members={members} fines={fines} isPrivileged={isPrivileged} refresh={loadData} />
              )}
              {tab === "members" && (
                <MembersTab members={members} fines={fines} isPrivileged={isPrivileged} refresh={loadData} />
              )}
              {tab === "soc pro" && (
                <SocialProbationTab members={members} socialProbations={socialProbations} isPrivileged={isPrivileged} userRole={userRole} refresh={loadData} />
              )}
              {tab === "soc pro history" && <SocProHistoryTab />}
              {tab === "audit" && isPrivileged && <AuditTab auditLogs={auditLogs} />}
              {tab === "events" && userRole === "root" && <EventsTab eventLog={eventLog} />}
              {tab === "sessions" && <SessionsTab members={members} isPrivileged={isPrivileged} refresh={loadData} />}
              {tab === "transition" && isPrivileged && (
                <TransitionTab fines={fines} currentUserId={currentUserId} userRole={userRole} setUserRole={setUserRole} />
              )}
              {tab === "unbecomings" && isPrivileged && (
                <UnbecomingsTab members={members} />
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
