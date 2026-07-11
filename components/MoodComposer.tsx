"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { AXES, TAGS } from "@/data/tags";
import type { CuratedTrack, ProgressEvent } from "@/lib/curate";
import { TagChip } from "@/components/TagChip";
import { LoadingVinyl } from "@/components/LoadingVinyl";
import { ResultsList } from "@/components/ResultsList";
import { SizeDial } from "@/components/SizeDial";

type Phase = "compose" | "loading" | "results";

function stageToText(e: ProgressEvent | null): string {
  if (!e) return "Warming up…";
  switch (e.stage) {
    case "searching":
      return `Searching the catalog (${e.queries} queries)…`;
    case "pool":
      return `Found ${e.candidates} candidates…`;
    case "lyrics":
      return `Reading lyrics — ${e.done} of ${e.total} tracks…`;
    case "ranking":
      return "Matching your vibe…";
    case "done":
      return "Almost there…";
    default:
      return "Working…";
  }
}

export function MoodComposer() {
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [size, setSize] = useState(24);
  const [phase, setPhase] = useState<Phase>("compose");
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [tracks, setTracks] = useState<CuratedTrack[]>([]);
  const [summary, setSummary] = useState("");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const canSubmit = text.trim().length > 0 || selected.size > 0;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function reset() {
    abortRef.current?.abort();
    setPhase("compose");
    setProgress(null);
    setError(null);
  }

  async function submit() {
    if (!canSubmit) return;
    setError(null);
    setPhase("loading");
    setProgress(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/curate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, tagIds: [...selected], size }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }

      // Parse the SSE stream: events arrive as "data: {json}\n\n"
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const raw of events) {
          const line = raw.trim();
          if (!line.startsWith("data:")) continue;
          const event: ProgressEvent = JSON.parse(line.slice(5).trim());
          if (event.stage === "error") throw new Error(event.message);
          if (event.stage === "done") {
            setTracks(event.tracks);
            setSummary(event.summary);
            finished = true;
          } else {
            setProgress(event);
          }
        }
      }

      if (!finished) throw new Error("The stream ended early — please try again.");
      setPhase("results");
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPhase("compose");
    }
  }

  if (phase === "loading") {
    return <LoadingVinyl stageText={stageToText(progress)} />;
  }

  if (phase === "results") {
    return (
      <div className="mt-10 w-full flex justify-center">
        <ResultsList tracks={tracks} summary={summary} onReset={reset} />
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
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          maxLength={300}
          placeholder="Describe the vibe… “rainy sunday, missing someone, but hopeful”"
          className="w-full resize-none bg-transparent px-4 py-3 text-base placeholder:text-ink-dim/60 focus:outline-none"
        />
        <div className="flex items-center justify-between px-2 pb-1">
          <span className="text-xs text-ink-dim/70">
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
            Spin the record — scroll, drag, or tap ±
          </p>
        </div>
        <SizeDial value={size} onChange={setSize} />
      </div>

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
