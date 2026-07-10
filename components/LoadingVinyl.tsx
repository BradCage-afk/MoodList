"use client";

import { motion, AnimatePresence } from "framer-motion";

const NOTES = [
  { char: "♪", x: -110, delay: 0 },
  { char: "♫", x: 110, delay: 0.6 },
  { char: "♩", x: -75, delay: 1.2 },
  { char: "♬", x: 75, delay: 1.8 },
  { char: "♪", x: 0, delay: 2.4 },
];

/**
 * Abstract vinyl-record loader (pure CSS/Framer Motion — no brand assets)
 * with dancing notes and stage text driven by real pipeline progress.
 */
export function LoadingVinyl({ stageText }: { stageText: string }) {
  return (
    <div className="flex flex-col items-center gap-10 py-16">
      <div className="relative h-52 w-52">
        {/* dancing notes */}
        {NOTES.map((n, i) => (
          <motion.span
            key={i}
            className="absolute left-1/2 top-1/2 text-2xl text-accent-2/80 select-none"
            initial={{ opacity: 0, x: n.x, y: 30 }}
            animate={{ opacity: [0, 1, 0], y: [30, -110], x: n.x }}
            transition={{
              duration: 3,
              delay: n.delay,
              repeat: Infinity,
              ease: "easeOut",
            }}
          >
            {n.char}
          </motion.span>
        ))}

        {/* pulsing glow */}
        <motion.div
          className="absolute inset-0 rounded-full bg-accent/25 blur-2xl"
          animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.85, 0.5] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* rotating record */}
        <motion.div
          className="absolute inset-0 rounded-full border border-white/10 opacity-90"
          style={{
            background:
              "repeating-radial-gradient(circle at 50% 50%, #17171f 0px, #17171f 3px, #1f1f2b 4px, #17171f 5px)",
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        >
          {/* label */}
          <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-accent via-accent-2 to-accent-3 opacity-90" />
          <div className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-bg" />
          {/* light sheen */}
          <div className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,rgba(255,255,255,0.07)_40deg,transparent_90deg,transparent_180deg,rgba(255,255,255,0.05)_220deg,transparent_270deg)]" />
        </motion.div>
      </div>

      <AnimatePresence mode="wait">
        <motion.p
          key={stageText}
          className="text-ink-dim text-base tracking-wide"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3 }}
        >
          {stageText}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
