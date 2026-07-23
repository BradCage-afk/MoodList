"use client";

import type { TagAxis } from "@/data/tags";

/**
 * Selected chips are the only loud element in the grid; unselected chips are
 * a whisper — near-invisible border, muted text, and a faint per-category
 * tint so the section's color family reads before any text does
 * (mood = purple, activity = blue, genre = green).
 */
const AXIS_STYLES: Record<TagAxis, { on: string; off: string }> = {
  mood: {
    on: "border-cat-mood bg-cat-mood/20 text-white shadow-[0_0_14px_rgba(168,85,247,0.35)]",
    off: "border-cat-mood/15 bg-cat-mood/[0.05] text-ink-dim hover:border-cat-mood/50 hover:text-ink",
  },
  activity: {
    on: "border-cat-activity bg-cat-activity/20 text-white shadow-[0_0_14px_rgba(56,189,248,0.35)]",
    off: "border-cat-activity/15 bg-cat-activity/[0.05] text-ink-dim hover:border-cat-activity/50 hover:text-ink",
  },
  genre: {
    on: "border-cat-genre bg-cat-genre/20 text-white shadow-[0_0_14px_rgba(52,211,153,0.3)]",
    off: "border-cat-genre/15 bg-cat-genre/[0.05] text-ink-dim hover:border-cat-genre/50 hover:text-ink",
  },
};

export function TagChip({
  label,
  axis,
  selected,
  onToggle,
}: {
  label: string;
  axis: TagAxis;
  selected: boolean;
  onToggle: () => void;
}) {
  const style = AXIS_STYLES[axis];
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={`cursor-pointer justify-self-start rounded-full border px-4 py-1.5 text-sm transition-all active:scale-95 ${
        selected ? `font-medium ${style.on}` : `font-normal ${style.off}`
      }`}
    >
      {label}
    </button>
  );
}
