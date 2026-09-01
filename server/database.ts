import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import type { Player, SourceEntry } from './types.js';

const dataDir = path.resolve('data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'draft-assistant.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS players (
    sleeper_id TEXT PRIMARY KEY, full_name TEXT NOT NULL, normalized_name TEXT NOT NULL,
    position TEXT, team TEXT, active INTEGER NOT NULL, bye_week INTEGER
  );
  CREATE TABLE IF NOT EXISTS source_entries (
    id INTEGER PRIMARY KEY, source TEXT NOT NULL, file_name TEXT NOT NULL, kind TEXT NOT NULL,
    format TEXT NOT NULL, player_text TEXT NOT NULL, normalized_text TEXT NOT NULL,
    position_hint TEXT, tier TEXT, rank_value REAL, pick_number REAL, sleeper_id TEXT,
    confidence REAL NOT NULL
  );
  CREATE TABLE IF NOT EXISTS player_aliases (
    normalized_alias TEXT PRIMARY KEY, sleeper_id TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS manual_picks (
    draft_id TEXT NOT NULL, pick_no INTEGER NOT NULL, sleeper_id TEXT NOT NULL,
    roster_id INTEGER NOT NULL, round INTEGER NOT NULL, draft_slot INTEGER NOT NULL,
    PRIMARY KEY (draft_id, pick_no)
  );
`);

// Migration: add bye_week column if missing
try { db.exec('ALTER TABLE players ADD COLUMN bye_week INTEGER'); } catch (_) { /* column exists */ }

export const normalizeName = (value: string) => value
  .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

export function replacePlayers(players: Player[]) {
  db.exec('DELETE FROM players');
  const stmt = db.prepare('INSERT INTO players VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const p of players) stmt.run(p.sleeperId, p.fullName, p.normalizedName, p.position, p.team, Number(p.active), p.byeWeek ?? null);
}

export function getPlayers(): Player[] {
  return db.prepare('SELECT sleeper_id, full_name, normalized_name, position, team, active, bye_week FROM players').all().map((r: any) => ({
    sleeperId: r.sleeper_id, fullName: r.full_name, normalizedName: r.normalized_name,
    position: r.position, team: r.team, active: Boolean(r.active), byeWeek: r.bye_week,
  }));
}

export function replaceEntries(entries: SourceEntry[]) {
  db.exec('DELETE FROM source_entries');
  const stmt = db.prepare(`INSERT INTO source_entries
    (source,file_name,kind,format,player_text,normalized_text,position_hint,tier,rank_value,pick_number,sleeper_id,confidence)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const e of entries) stmt.run(e.source, e.fileName, e.kind, e.format, e.playerText, e.normalizedText, e.positionHint, e.tier, e.rank, e.pickNumber, e.sleeperId, e.confidence);
}

export function getEntries(): SourceEntry[] {
  return db.prepare('SELECT * FROM source_entries').all().map((r: any) => ({
    id: r.id, source: r.source, fileName: r.file_name, kind: r.kind, format: r.format,
    playerText: r.player_text, normalizedText: r.normalized_text, positionHint: r.position_hint,
    tier: r.tier, rank: r.rank_value, pickNumber: r.pick_number, sleeperId: r.sleeper_id, confidence: r.confidence,
  }));
}

export function saveAlias(alias: string, sleeperId: string) {
  db.prepare('INSERT OR REPLACE INTO player_aliases VALUES (?, ?)').run(normalizeName(alias), sleeperId);
}
export function aliases(): Map<string, string> {
  return new Map(db.prepare('SELECT * FROM player_aliases').all().map((r: any) => [r.normalized_alias, r.sleeper_id]));
}
export function saveManualPick(draftId: string, pickNo: number, sleeperId: string, rosterId: number, round: number, draftSlot: number) {
  db.prepare('INSERT OR REPLACE INTO manual_picks VALUES (?,?,?,?,?,?)').run(draftId, pickNo, sleeperId, rosterId, round, draftSlot);
}
export function getManualPicks(draftId: string) {
  return db.prepare('SELECT * FROM manual_picks WHERE draft_id = ?').all(draftId);
}
export function clearManualPicks(draftId: string) {
  db.prepare('DELETE FROM manual_picks WHERE draft_id = ?').run(draftId);
}
