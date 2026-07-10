"use client";

import type { TagAxis } from "@/data/tags";

const AXIS_STYLES: Record<TagAxis, { on: string; off: string }> = {
  mood: {
    on: "border-accent bg-accent/20 text-white shadow-[0_0_14px_rgba(168,85,247,0.35)]",
    off: "border-line text-ink-dim hover:border-accent/60 hover:text-ink",
  },
  activity: {
    on: "border-accent-2 bg-accent-2/20 text-white shadow-[0_0_14px_rgba(236,72,153,0.35)]",
    off: "border-line text-ink-dim hover:border-accent-2/60 hover:text-ink",
  },
  genre: {
    on: "border-accent-3 bg-accent-3/20 text-white shadow-[0_0_14px_rgba(245,158,11,0.3)]",
    off: "border-line text-ink-dim hover:border-accent-3/60 hover:text-ink",
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
      className={`cursor-pointer rounded-full border px-4 py-1.5 text-sm font-medium transition-all active:scale-95 ${
        selected ? style.on : style.off
      }`}
    >
      {label}
    </button>
  );
}
