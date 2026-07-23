"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { useEffect, useState } from "react";
import type { RankedTrack } from "@/lib/query";

type ExportState =
  | { status: "idle" }
  | { status: "exporting"; stage: number }
  | { status: "done"; url: string }
  | { status: "error"; message: string };

const EXPORT_STAGES = ["Creating your playlist…", "Adding tracks…", "Almost done…"];

function TagPill({ children, tone = "dim" }: { children: React.ReactNode; tone?: "dim" | "accent" }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[11px] capitalize ${
        tone === "accent"
          ? "border-accent/40 bg-accent/10 text-accent"
          : "border-line/70 bg-bg-raised/80 text-ink-dim"
      }`}
    >
      {children}
    </span>
  );
}

export function ResultsList({
  tracks,
  summary,
  historyId,
  fromHistory,
  onReset,
  onExported,
}: {
  tracks: RankedTrack[];
  summary: string;
  historyId: number | null;
  /** True when restored from the history panel (affects header copy only). */
  fromHistory?: boolean;
  onReset: () => void;
  onExported?: (historyId: number | null) => void;
}) {
  const [exportState, setExportState] = useState<ExportState>({ status: "idle" });
  const [openId, setOpenId] = useState<string | null>(null);

  // Staged progress text while the export request is in flight (the create +
  // add-items calls happen server-side in one request).
  useEffect(() => {
    if (exportState.status !== "exporting") return;
    if (exportState.stage >= EXPORT_STAGES.length - 1) return;
    const t = setTimeout(
      () => setExportState({ status: "exporting", stage: exportState.stage + 1 }),
      1100
    );
    return () => clearTimeout(t);
  }, [exportState]);

  async function exportPlaylist() {
    setExportState({ status: "exporting", stage: 0 });
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uris: tracks.map((t) => t.uri), summary, historyId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Export failed");
      setExportState({ status: "done", url: data.url });
      onExported?.(historyId);
    } catch (err) {
      setExportState({
        status: "error",
        message: err instanceof Error ? err.message : "Export failed",
      });
    }
  }

  return (
    <div className="w-full max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            {fromHistory ? "From your history" : "Your mix"}
          </h2>
          <p className="text-sm text-ink-dim">
            {summary} · {tracks.length} tracks
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onReset}
            className="cursor-pointer rounded-full border border-line px-4 py-2 text-sm text-ink-dim hover:text-ink hover:border-accent/50 transition-colors"
          >
            Start over
          </button>
          {exportState.status === "done" ? (
            <a
              href={exportState.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-gradient-to-r from-accent to-accent-2 px-5 py-2 text-sm font-medium text-white shadow-lg shadow-accent/25 hover:shadow-accent/40 transition-shadow"
            >
              Open in Spotify ↗
            </a>
          ) : (
            <button
              onClick={exportPlaylist}
              disabled={exportState.status === "exporting"}
              className="cursor-pointer rounded-full bg-gradient-to-r from-accent to-accent-2 px-5 py-2 text-sm font-medium text-white shadow-lg shadow-accent/25 hover:shadow-accent/40 transition-shadow disabled:opacity-60 disabled:cursor-wait"
            >
              {exportState.status === "exporting"
                ? EXPORT_STAGES[exportState.stage]
                : "Export to Spotify"}
            </button>
          )}
        </div>
      </div>

      {exportState.status === "done" && historyId !== null && (
        <p className="mb-4 rounded-lg border border-accent/30 bg-accent/10 px-4 py-2 text-xs text-ink-dim">
          Saved to Spotify — this snapshot has left your history (exported playlists live in your
          account now).
        </p>
      )}
      {exportState.status === "error" && (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          {exportState.message}
        </p>
      )}

      <ol className="flex flex-col gap-1.5">
        {tracks.map((track, i) => (
          <motion.li
            key={track.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.04, 0.8), duration: 0.35 }}
            className="rounded-xl border border-line/60 bg-bg-raised/60 hover:border-accent/40 transition-colors"
          >
            <button
              type="button"
              onClick={() => setOpenId(openId === track.id ? null : track.id)}
              aria-expanded={openId === track.id}
              className="flex w-full cursor-pointer items-center gap-4 px-4 py-2.5 text-left"
            >
              <span className="w-5 text-right text-xs text-ink-dim tabular-nums">{i + 1}</span>
              {track.albumArt ? (
                <Image
                  src={track.albumArt}
                  alt=""
                  width={44}
                  height={44}
                  className="rounded-md"
                  unoptimized
                />
              ) : (
                <div className="h-11 w-11 rounded-md bg-gradient-to-br from-accent/40 to-accent-2/40" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">{track.name}</p>
                <p className="truncate text-xs text-ink-dim">{track.artists.join(", ")}</p>
              </div>
              {track.tags.instrumental && (
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-ink-dim/70">
                  inst
                </span>
              )}
              <span className="shrink-0 text-[11px] tabular-nums text-ink-dim" title="Tag confidence">
                {Math.round(track.confidence * 100)}%
              </span>
              <span
                className={`shrink-0 text-xs text-ink-dim/70 transition-transform ${openId === track.id ? "rotate-180" : ""}`}
                aria-hidden
              >
                ▾
              </span>
            </button>
            <AnimatePresence initial={false}>
              {openId === track.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-line/50 px-4 py-3 pl-[52px]">
                    <p className="text-xs text-ink-dim">{track.reason}</p>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {track.tags.language && <TagPill tone="accent">{track.tags.language}</TagPill>}
                      {track.tags.genre && <TagPill tone="accent">{track.tags.genre}</TagPill>}
                      {track.tags.energy && <TagPill>{track.tags.energy} energy</TagPill>}
                      {track.tags.valence && <TagPill>{track.tags.valence}</TagPill>}
                      {track.tags.instrumental && <TagPill>instrumental</TagPill>}
                      {track.tags.contexts.map((c) => (
                        <TagPill key={c}>{c}</TagPill>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] text-ink-dim/70">
                      Tag confidence: {Math.round(track.confidence * 100)}%
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
