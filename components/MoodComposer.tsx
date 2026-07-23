"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { AXES, TAGS } from "@/data/tags";
import type { RankedTrack } from "@/lib/query";
import { TagChip } from "@/components/TagChip";
import { LoadingVinyl } from "@/components/LoadingVinyl";
import { ResultsList } from "@/components/ResultsList";
import { SizeDial } from "@/components/SizeDial";
import { HistoryPanel } from "@/components/HistoryPanel";

type Phase = "compose" | "loading" | "results";

export function MoodComposer() {
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [size, setSize] = useState(24);
  const [instrumentalOnly, setInstrumentalOnly] = useState(false);
  const [phase, setPhase] = useState<Phase>("compose");
  const [tracks, setTracks] = useState<RankedTrack[]>([]);
  const [summary, setSummary] = useState("");
  const [historyId, setHistoryId] = useState<number | null>(null);
  const [fromHistory, setFromHistory] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = text.trim().length > 0 || selected.size > 0 || instrumentalOnly;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function reset() {
    setPhase("compose");
    setError(null);
    setFromHistory(false);
  }

  async function submit() {
    if (!canSubmit) return;
    setError(null);
    setPhase("loading");
    try {
      const res = await fetch("/api/curate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, tagIds: [...selected], size, instrumentalOnly }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      if (!data.tracks?.length) {
        throw new Error("No matches in the index for that vibe — try different tags or words.");
      }
      setTracks(data.tracks);
      setSummary(data.summary);
      setHistoryId(data.historyId ?? null);
      setFromHistory(false);
      setPhase("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPhase("compose");
    }
  }

  async function restoreFromHistory(id: number) {
    setHistoryOpen(false);
    setError(null);
    setPhase("loading");
    try {
      const res = await fetch(`/api/history?id=${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't load that snapshot");
      setTracks(data.tracks);
      setSummary(data.summary ?? data.queryText ?? "From history");
      setHistoryId(data.id);
      setFromHistory(true);
      setPhase("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load that snapshot");
      setPhase("compose");
    }
  }

  if (phase === "loading") {
    return <LoadingVinyl stageText="Matching your vibe…" />;
  }

  if (phase === "results") {
    return (
      <div className="mt-10 w-full flex justify-center">
        <ResultsList
          tracks={tracks}
          summary={summary}
          historyId={historyId}
          fromHistory={fromHistory}
          onReset={reset}
          onExported={() => setHistoryId(null)}
        />
      </div>
    );
  }

  return (
    <motion.div
      className="mt-10 w-full max-w-2xl"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="rounded-2xl border border-line bg-bg-raised/70 p-2 shadow-2xl shadow-black/40 backdrop-blur">
        <textarea
          value={text}
          // Collapse runs of whitespace and strip leading spaces as you type
          // so blanks don't eat into the character budget
          onChange={(e) => setText(e.target.value.replace(/\s{2,}/g, " ").trimStart())}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          maxLength={80}
          placeholder="Describe the vibe… “rainy sunday, missing someone, but hopeful”"
          className="w-full resize-none bg-transparent px-4 py-3 text-base placeholder:text-ink-dim/60 focus:outline-none"
        />
        <div className="flex items-center justify-between px-2 pb-1">
          <span className="text-xs text-ink-dim/70 tabular-nums">
            {text.length > 0 && (
              <span className={text.length >= 70 ? "text-accent-3" : ""}>
                {text.length}/80
              </span>
            )}
            {text.length > 0 && selected.size > 0 && " · "}
            {selected.size > 0 && `${selected.size} tag${selected.size > 1 ? "s" : ""} selected`}
          </span>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="cursor-pointer rounded-full bg-gradient-to-r from-accent to-accent-2 px-6 py-2 text-sm font-medium text-white shadow-lg shadow-accent/25 transition-all hover:shadow-accent/40 hover:scale-[1.02] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            Curate ✦
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="mt-6 flex items-center justify-between gap-4 rounded-2xl border border-line bg-bg-raised/50 px-5 py-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.15em] text-ink-dim">
            Playlist length
          </p>
          <p className="mt-1 text-xs text-ink-dim/70">
            Spin it clockwise for more — drag, scroll, or tap ±
          </p>
        </div>
        <SizeDial value={size} onChange={setSize} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={instrumentalOnly}
          onClick={() => setInstrumentalOnly((v) => !v)}
          className={`flex cursor-pointer items-center gap-2.5 rounded-full border px-4 py-2 text-sm transition-colors ${
            instrumentalOnly
              ? "border-accent/60 bg-accent/15 text-ink"
              : "border-line bg-bg-raised/50 text-ink-dim hover:text-ink"
          }`}
        >
          <span
            className={`inline-block h-4 w-7 rounded-full p-0.5 transition-colors ${
              instrumentalOnly ? "bg-accent" : "bg-line"
            }`}
          >
            <span
              className={`block h-3 w-3 rounded-full bg-white transition-transform ${
                instrumentalOnly ? "translate-x-3" : ""
              }`}
            />
          </span>
          Instrumental only
        </button>

        <button
          type="button"
          onClick={() => setHistoryOpen((v) => !v)}
          className="cursor-pointer rounded-full border border-line bg-bg-raised/50 px-4 py-2 text-sm text-ink-dim hover:text-ink hover:border-accent/50 transition-colors"
        >
          ♻ History
        </button>
      </div>

      <HistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onRestore={restoreFromHistory}
      />

      <div className="mt-8 flex flex-col gap-5">
        {AXES.map(({ axis, title }) => (
          <div key={axis}>
            <p className="mb-2.5 text-xs font-medium uppercase tracking-[0.15em] text-ink-dim">
              {title}
            </p>
            <div className="flex flex-wrap gap-2">
              {TAGS.filter((t) => t.axis === axis).map((tag) => (
                <TagChip
                  key={tag.id}
                  label={tag.label}
                  axis={tag.axis}
                  selected={selected.has(tag.id)}
                  onToggle={() => toggle(tag.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
