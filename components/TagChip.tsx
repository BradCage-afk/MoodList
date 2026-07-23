"use client";

import type { TagAxis } from "@/data/tags";

/**
 * Unselected chips stay quiet and neutral; the selected state glows in its
 * category's own color — mood purple, activity pink, genre amber.
 */
const AXIS_ON: Record<TagAxis, string> = {
  mood: "border-accent bg-accent/20 text-white shadow-[0_0_14px_rgba(168,85,247,0.35)]",
  activity: "border-accent-2 bg-accent-2/20 text-white shadow-[0_0_14px_rgba(236,72,153,0.35)]",
  genre: "border-accent-3 bg-accent-3/20 text-white shadow-[0_0_14px_rgba(245,158,11,0.3)]",
};

const AXIS_HOVER: Record<TagAxis, string> = {
  mood: "hover:border-accent/60",
  activity: "hover:border-accent-2/60",
  genre: "hover:border-accent-3/60",
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
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={`cursor-pointer justify-self-start rounded-full border px-4 py-1.5 text-sm transition-all active:scale-95 ${
        selected
          ? `font-medium ${AXIS_ON[axis]}`
          : `border-line bg-bg-raised/70 font-normal text-ink/75 hover:text-ink ${AXIS_HOVER[axis]}`
      }`}
    >
      {label}
    </button>
  );
}
