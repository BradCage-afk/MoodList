"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const MIN = 5;
const MAX = 50;
/** Degrees of record rotation per song — 45 steps sweep one full turn. */
const DEG_PER_STEP = 8;
const NOTES = ["♪", "♫", "♩", "♬"];

/**
 * Pointer angle in degrees around a center, or null when too close to the
 * center for the direction to be meaningful. Screen y grows downward, so
 * atan2 increases clockwise — matching the disc's visual rotation.
 */
function pointAngle(
  point: { x: number; y: number },
  center: { x: number; y: number }
): number | null {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  if (Math.hypot(dx, dy) < 12) return null;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

interface SizeDialProps {
  value: number;
  onChange: (next: number) => void;
}

/**
 * A vinyl record you spin to pick the playlist length: mouse wheel /
 * trackpad scroll, drag (like scratching), keyboard arrows, or the
 * +/- buttons. The disc rotates 8° per song; a note pops off the
 * edge every time the value changes.
 */
export function SizeDial({ value, onChange }: SizeDialProps) {
  const discRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  const wheelAcc = useRef(0);
  const panDeg = useRef(0);
  const panCenter = useRef({ x: 0, y: 0 });
  const panLastAngle = useRef<number | null>(null);
  const [noteBurst, setNoteBurst] = useState<{ id: number; dir: 1 | -1 } | null>(null);

  const step = (delta: number) => {
    const { value: v, onChange: change } = latest.current;
    const next = Math.min(MAX, Math.max(MIN, v + delta));
    if (next !== v) {
      change(next);
      setNoteBurst({ id: Date.now() + Math.random(), dir: delta > 0 ? 1 : -1 });
    }
  };

  // React's onWheel can't preventDefault (passive), so attach manually —
  // otherwise spinning the record also scrolls the page.
  useEffect(() => {
    const el = discRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      wheelAcc.current += e.deltaY;
      // Batch into ONE step() call — repeated ±1 steps in a loop would all
      // read the same pre-render value and collapse into a single change
      const steps = Math.trunc(wheelAcc.current / 24);
      if (steps !== 0) {
        wheelAcc.current -= steps * 24;
        step(-steps);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const rotation = (value - MIN) * DEG_PER_STEP;

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        aria-label="Fewer songs"
        onClick={() => step(-1)}
        className="cursor-pointer rounded-full border border-line bg-bg-raised/80 px-3 py-1.5 text-sm text-ink-dim transition-colors hover:text-ink hover:border-accent/50"
      >
        −
      </button>

      <div
        ref={discRef}
        role="slider"
        aria-label="Playlist length"
        aria-valuemin={MIN}
        aria-valuemax={MAX}
        aria-valuenow={value}
        aria-valuetext={`${value} songs`}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowRight") { e.preventDefault(); step(1); }
          if (e.key === "ArrowDown" || e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
          if (e.key === "PageUp") { e.preventDefault(); step(5); }
          if (e.key === "PageDown") { e.preventDefault(); step(-5); }
          if (e.key === "Home") { e.preventDefault(); step(MIN - value); }
          if (e.key === "End") { e.preventDefault(); step(MAX - value); }
        }}
        className="relative h-28 w-28 shrink-0 cursor-grab select-none touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent/70 active:cursor-grabbing"
      >
        {/* The record itself — rotates with the value */}
        <motion.div
          className="absolute inset-0 rounded-full border border-white/10 shadow-xl shadow-black/50"
          style={{
            background:
              "repeating-radial-gradient(circle at 50% 50%, #16161d 0px, #16161d 2px, #1e1e28 3px, #16161d 4px)",
          }}
          animate={{ rotate: rotation }}
          transition={{ type: "spring", stiffness: 260, damping: 26 }}
          onPanStart={(_, info) => {
            // Rotational drag: track the pointer's angle around the disc
            // center; clockwise = more songs. info.point is page-based, so
            // convert the rect to page coordinates too.
            const rect = discRef.current?.getBoundingClientRect();
            if (!rect) return;
            panCenter.current = {
              x: rect.left + window.scrollX + rect.width / 2,
              y: rect.top + window.scrollY + rect.height / 2,
            };
            panDeg.current = 0;
            panLastAngle.current = pointAngle(info.point, panCenter.current);
          }}
          onPan={(_, info) => {
            const angle = pointAngle(info.point, panCenter.current);
            if (angle === null || panLastAngle.current === null) {
              panLastAngle.current = angle;
              return;
            }
            // Shortest signed difference, so crossing the ±180° seam
            // doesn't cause a jump
            let delta = angle - panLastAngle.current;
            if (delta > 180) delta -= 360;
            if (delta < -180) delta += 360;
            panLastAngle.current = angle;
            panDeg.current += delta;
            const steps = Math.trunc(panDeg.current / DEG_PER_STEP);
            if (steps !== 0) {
              panDeg.current -= steps * DEG_PER_STEP;
              step(steps);
            }
          }}
          onPanEnd={() => {
            panLastAngle.current = null;
          }}
        >
          {/* Sheen so the spin reads visually */}
          <div
            className="absolute inset-0 rounded-full opacity-40"
            style={{
              background:
                "conic-gradient(from 0deg, transparent 0deg, rgba(255,255,255,0.10) 30deg, transparent 70deg, transparent 180deg, rgba(255,255,255,0.06) 220deg, transparent 260deg)",
            }}
          />
          {/* Position marker dot near the rim */}
          <div className="absolute left-1/2 top-[7px] h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-accent shadow-[0_0_6px_2px_rgba(168,85,247,0.5)]" />
        </motion.div>

        {/* Static center label — the number doesn't spin with the disc */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex h-14 w-14 flex-col items-center justify-center rounded-full bg-gradient-to-br from-accent/90 to-accent-2/90 shadow-inner shadow-black/30">
            <span className="text-lg font-semibold leading-none text-white tabular-nums">
              {value}
            </span>
            <span className="mt-0.5 text-[9px] uppercase tracking-widest text-white/80">
              songs
            </span>
          </div>
          <div className="absolute h-1.5 w-1.5 rounded-full bg-bg" />
        </div>

        {/* A note pops off the record whenever the value changes */}
        <AnimatePresence>
          {noteBurst && (
            <motion.span
              key={noteBurst.id}
              className="pointer-events-none absolute -right-1 top-1 text-base text-accent-2"
              initial={{ opacity: 0, y: 6, scale: 0.6, rotate: -10 }}
              animate={{ opacity: 1, y: -14, scale: 1, rotate: 10 }}
              exit={{ opacity: 0, y: -26, scale: 0.8 }}
              transition={{ duration: 0.35 }}
              onAnimationComplete={() => setNoteBurst(null)}
            >
              {NOTES[Math.abs(value) % NOTES.length]}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <button
        type="button"
        aria-label="More songs"
        onClick={() => step(1)}
        className="cursor-pointer rounded-full border border-line bg-bg-raised/80 px-3 py-1.5 text-sm text-ink-dim transition-colors hover:text-ink hover:border-accent/50"
      >
        +
      </button>
    </div>
  );
}
