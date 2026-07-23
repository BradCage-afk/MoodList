"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";

export interface HistoryEntry {
  id: number;
  query_text: string | null;
  selected_tags: string[];
  summary: string | null;
  created_at: string;
  track_count: number;
}

/**
 * Slide-down panel listing the user's last snapshots (cap 15, unexported
 * only — exporting removes an entry). Clicking an entry restores that exact
 * snapshot; each row has a delete, plus clear-all with a confirm step.
 */
export function HistoryPanel({
  open,
  onClose,
  onRestore,
}: {
  open: boolean;
  onClose: () => void;
  onRestore: (id: number) => void;
}) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [cap, setCap] = useState(15);
  const [confirmClear, setConfirmClear] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetch("/api/history")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Sign in to see history"))))
      .then((d) => {
        setEntries(d.entries);
        setCap(d.cap ?? 15);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (open) {
      setError(null);
      setConfirmClear(false);
      refresh();
    }
  }, [open, refresh]);

  async function deleteOne(id: number) {
    setEntries((prev) => prev?.filter((e) => e.id !== id) ?? null);
    await fetch(`/api/history?id=${id}`, { method: "DELETE" }).catch(() => {});
  }

  async function clearAll() {
    setEntries([]);
    setConfirmClear(false);
    await fetch("/api/history?all=1", { method: "DELETE" }).catch(() => {});
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="overflow-hidden"
        >
          <div className="mt-4 rounded-2xl border border-line bg-bg-raised/60 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-[0.15em] text-ink-dim">
                History{" "}
                {entries && (
                  <span className="tabular-nums normal-case tracking-normal">
                    {entries.length}/{cap}
                  </span>
                )}
              </p>
              <div className="flex items-center gap-2">
                {entries && entries.length > 0 &&
                  (confirmClear ? (
                    <>
                      <button
                        onClick={clearAll}
                        className="cursor-pointer rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs text-red-300"
                      >
                        Really clear all
                      </button>
                      <button
                        onClick={() => setConfirmClear(false)}
                        className="cursor-pointer rounded-full border border-line px-3 py-1 text-xs text-ink-dim"
                      >
                        Keep
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmClear(true)}
                      className="cursor-pointer rounded-full border border-line px-3 py-1 text-xs text-ink-dim hover:text-red-300 hover:border-red-500/40 transition-colors"
                    >
                      Clear all
                    </button>
                  ))}
                <button
                  onClick={onClose}
                  className="cursor-pointer rounded-full border border-line px-3 py-1 text-xs text-ink-dim hover:text-ink"
                >
                  Close
                </button>
              </div>
            </div>

            {error && <p className="mt-3 text-sm text-ink-dim">{error}</p>}
            {entries && entries.length === 0 && !error && (
              <p className="mt-3 text-sm text-ink-dim">
                Nothing saved yet — curate a playlist and it&apos;ll wait for you here.
              </p>
            )}

            {entries && entries.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1.5">
                {entries.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center gap-3 rounded-xl border border-line/60 bg-bg/40 px-3 py-2"
                  >
                    <button
                      onClick={() => onRestore(e.id)}
                      className="min-w-0 flex-1 cursor-pointer text-left"
                      title="Restore this snapshot"
                    >
                      <p className="truncate text-sm">{e.summary ?? e.query_text ?? "Custom mix"}</p>
                      <p className="text-[11px] text-ink-dim">
                        {e.track_count} tracks · {new Date(e.created_at).toLocaleString()}
                        {e.selected_tags.length > 0 && ` · ${e.selected_tags.slice(0, 3).join(", ")}`}
                      </p>
                    </button>
                    <button
                      onClick={() => deleteOne(e.id)}
                      aria-label="Delete this snapshot"
                      className="cursor-pointer rounded-full px-2 py-1 text-ink-dim/70 hover:text-red-300 transition-colors"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-3 text-[11px] text-ink-dim/70">
              Only your last {cap} unsaved playlists are kept — export the ones you want to keep
              permanently. Exported playlists leave history automatically.
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
