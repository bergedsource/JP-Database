export type NavIconName =
  | "fines" | "sessions" | "outstanding" | "labor"
  | "members" | "socpro" | "history"
  | "audit" | "lock" | "events" | "transition";

const PATHS: Record<NavIconName, React.ReactNode> = {
  fines: <><path d="M6 3h9l4 4v14H6z" /><path d="M9 12h7M9 16h7" /></>,
  sessions: <><path d="M14 4l6 6M4 20l8-8M11 7l6 6M9 9l6 6" /><path d="M3 21h8" /></>,
  outstanding: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
  labor: <path d="M4 20l7-7M13 4l7 7-4 4-7-7z" />,
  members: <><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21 20c0-2.6-1.6-4.8-4-5.6" /></>,
  socpro: <><circle cx="12" cy="12" r="8" /><path d="M6.5 6.5l11 11" /></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 3" /></>,
  audit: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  events: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  transition: <path d="M4 7h13l-3-3M20 17H7l3 3" />,
};

export default function NavIcon({ name }: { name: NavIconName }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="adm-nav-icon"
    >
      {PATHS[name]}
    </svg>
  );
}
