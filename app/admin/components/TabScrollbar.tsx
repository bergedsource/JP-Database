"use client";

import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";

const MIN_THUMB = 32;

// Draggable scrollbar for the tab strip. The strip hides its native scrollbar,
// so on desktop (no touch swipe) this is the visible way to reach tabs off-screen.
export default function TabScrollbar({ target }: { target: RefObject<HTMLDivElement | null> }) {
  const [thumb, setThumb] = useState({ width: 0, left: 0 });
  const [overflowing, setOverflowing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startX: number; startScroll: number } | null>(null);

  useEffect(() => {
    const el = target.current;
    if (!el) return;
    const update = () => {
      const { scrollWidth, clientWidth, scrollLeft } = el;
      const over = scrollWidth > clientWidth + 1;
      setOverflowing(over);
      if (!over) return;
      const width = Math.max(MIN_THUMB, (clientWidth / scrollWidth) * clientWidth);
      const left = (scrollLeft / (scrollWidth - clientWidth)) * (clientWidth - width);
      setThumb({ width, left });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    // Role-gated tabs appear after the user's role loads, changing scrollWidth without resizing the strip.
    const mo = new MutationObserver(update);
    mo.observe(el, { childList: true });
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
      mo.disconnect();
    };
  }, [target]);

  // Pixels of tab-strip scroll per pixel of thumb movement.
  function ratio(el: HTMLDivElement) {
    const trackSpace = el.clientWidth - thumb.width;
    return trackSpace > 0 ? (el.scrollWidth - el.clientWidth) / trackSpace : 0;
  }

  function startDrag(e: PointerEvent<HTMLDivElement>, startScroll: number) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startScroll };
    setDragging(true);
  }

  function onTrackDown(e: PointerEvent<HTMLDivElement>) {
    const el = target.current;
    if (!el || e.button !== 0) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let startScroll = el.scrollLeft;
    // Clicking the track (not the thumb) jumps the thumb's center to the click, then keeps dragging.
    if (x < thumb.left || x > thumb.left + thumb.width) {
      startScroll = (x - thumb.width / 2) * ratio(el);
      el.scrollTo({ left: startScroll, behavior: "instant" });
    }
    startDrag(e, startScroll);
  }

  function onMove(e: PointerEvent<HTMLDivElement>) {
    const el = target.current;
    if (!el || !drag.current) return;
    const left = drag.current.startScroll + (e.clientX - drag.current.startX) * ratio(el);
    el.scrollTo({ left, behavior: "instant" });
  }

  function endDrag() {
    drag.current = null;
    setDragging(false);
  }

  if (!overflowing) return null;

  return (
    <div
      className={`adm-tabs-scroll${dragging ? " dragging" : ""}`}
      aria-hidden="true"
      onPointerDown={onTrackDown}
      onPointerMove={onMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="adm-tabs-scroll-track">
        <div className="adm-tabs-scroll-thumb" style={{ width: thumb.width, transform: `translateX(${thumb.left}px)` }} />
      </div>
    </div>
  );
}
