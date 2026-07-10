"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { useState } from "react";
import type { CuratedTrack } from "@/lib/curate";

type ExportState =
  | { status: "idle" }
  | { status: "exporting" }
  | { status: "done"; url: string }
  | { status: "error"; message: string };

export function ResultsList({
  tracks,
  summary,
  onReset,
}: {
  tracks: CuratedTrack[];
  summary: string;
  onReset: () => void;
}) {
  const [exportState, setExportState] = useState<ExportState>({ status: "idle" });

  async function exportPlaylist() {
    setExportState({ status: "exporting" });
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uris: tracks.map((t) => t.uri), summary }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Export failed");
      setExportState({ status: "done", url: data.url });
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
          <h2 className="text-xl font-semibold tracking-tight">Your mix</h2>
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
              {exportState.status === "exporting" ? "Creating playlist…" : "Export to Spotify"}
            </button>
          )}
        </div>
      </div>

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
            className="flex items-center gap-4 rounded-xl border border-line/60 bg-bg-raised/60 px-4 py-2.5 hover:border-accent/40 transition-colors"
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
            <span
              className="shrink-0 text-[11px] tabular-nums text-ink-dim"
              title={track.scoredFromLyrics ? "Lyrics-scored mood match" : "No lyrics found — popularity ranked"}
            >
              {track.scoredFromLyrics ? `${Math.round(track.score * 100)}%` : "—"}
            </span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
