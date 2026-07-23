// Postgres access + schema for the indexing pipeline. Checkpointing lives in
// the status columns: every step marks rows as it completes them, so any
// script can be killed and re-run without repeating finished work.
import { Pool } from "pg";
import { requireEnv } from "./env";

export const pool = new Pool({
  connectionString: requireEnv("DATABASE_URL"),
  ssl: { rejectUnauthorized: false },
  max: 5,
});

export async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sources (
      id SERIAL PRIMARY KEY,
      query TEXT NOT NULL UNIQUE,
      markets TEXT[] NOT NULL DEFAULT '{US}',
      category TEXT NOT NULL,
      hints JSONB NOT NULL DEFAULT '{}',
      tags JSONB,
      status TEXT NOT NULL DEFAULT 'sourced',
      pages_done INT NOT NULL DEFAULT 0,
      tracks_found INT NOT NULL DEFAULT 0,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      artists JSONB NOT NULL,
      album TEXT,
      album_art TEXT,
      release_date TEXT,
      duration_ms INT,
      explicit BOOLEAN,
      language TEXT,
      genre_family TEXT,
      energy TEXT,
      valence TEXT,
      instrumental BOOLEAN,
      context_tags TEXT[] NOT NULL DEFAULT '{}',
      confidence REAL,
      axis_confidence JSONB,
      confidence_source TEXT NOT NULL DEFAULT 'pending',
      status TEXT NOT NULL DEFAULT 'collected',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS track_sources (
      track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      source_id INT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      best_rank INT NOT NULL,
      PRIMARY KEY (track_id, source_id)
    );

    CREATE TABLE IF NOT EXISTS history (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      query_text TEXT,
      selected_tags TEXT[] NOT NULL DEFAULT '{}',
      track_ids TEXT[] NOT NULL,
      summary TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      display_name TEXT,
      action TEXT NOT NULL,
      detail JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS history_user_idx ON history (user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS activity_time_idx ON activity_log (created_at DESC);
    CREATE INDEX IF NOT EXISTS tracks_status_idx ON tracks (status);
    CREATE INDEX IF NOT EXISTS tracks_axes_idx ON tracks (language, genre_family, energy, valence);
    CREATE INDEX IF NOT EXISTS track_sources_source_idx ON track_sources (source_id);
  `);
}

export async function closePool() {
  await pool.end();
}
