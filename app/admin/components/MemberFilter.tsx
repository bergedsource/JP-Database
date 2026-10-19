"use client";

import { useRef, useState } from "react";
import type { Member } from "@/lib/types";

interface MemberFilterProps {
  members: Member[];
  value: string; // member id, or "all"
  onChange: (id: string) => void;
}

// Type-ahead member filter (active + pledge), same feel as the Issue Fine member search.
export default function MemberFilter({ members, value, onChange }: MemberFilterProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = value !== "all" ? members.find((m) => m.id === value) : undefined;

  // .adm-filters scrolls horizontally on mobile, which would clip an absolute dropdown — position it fixed instead.
  function openList() {
    if (inputRef.current) setRect(inputRef.current.getBoundingClientRect());
    setOpen(true);
  }

  const suggestions = members
    .filter((m) =>
      (m.status === "active" || m.status === "pledge") &&
      m.name.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 50);

  if (selected) {
    return (
      <span className="adm-member-tag" style={{ padding: "6px 10px" }}>
        {selected.name}
        <button type="button" className="adm-member-tag-remove" onClick={() => onChange("all")} aria-label="Clear member filter">×</button>
      </span>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <input
        ref={inputRef}
        type="text"
        value={search}
        onChange={(e) => { setSearch(e.target.value); openList(); }}
        onFocus={openList}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="All members"
        autoComplete="off"
        className="adm-input"
        style={{ width: 180 }}
      />
      {open && search.trim() && suggestions.length > 0 && rect && (
        <ul
          className="adm-suggestions"
          style={{ position: "fixed", top: rect.bottom + 4, left: rect.left, right: "auto", width: Math.max(rect.width, 240) }}
        >
          {suggestions.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onMouseDown={() => { onChange(m.id); setSearch(""); setOpen(false); }}
                className="adm-suggestion-btn"
              >
                <span className="adm-suggestion-name">{m.name}</span>
                <span className="adm-suggestion-status">{m.status}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
