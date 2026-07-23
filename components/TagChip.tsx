"use client";

import type { TagAxis } from "@/data/tags";

/**
 * One quiet style for every category: unselected chips are a whisper,
 * the selected state is the single warm-amber loud element.
 */
export function TagChip({
  label,
  selected,
  onToggle,
}: {
  label: string;
  axis?: TagAxis;
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
          ? "border-accent bg-accent/15 font-medium text-ink shadow-[0_0_12px_rgba(232,155,75,0.25)]"
          : "border-line/70 bg-bg-raised/40 font-normal text-ink-dim hover:border-accent/50 hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}
