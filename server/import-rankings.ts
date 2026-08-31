import fs from 'node:fs';
import path from 'node:path';
import { aliases, getPlayers, normalizeName, replaceEntries, replacePlayers } from './database.js';
import { consensus } from './consensus.js';
import { parseAllMarkdown } from './markdown.js';
import type { Player, Position, SourceEntry } from './types.js';

type SleeperPlayer = { full_name?: string; position?: string; team?: string; active?: boolean; fantasy_positions?: string[] };
const positions = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']);
const positionOf = (p: SleeperPlayer): Position | null => {
  const value = p.position === 'DST' ? 'DEF' : p.position;
  return positions.has(value ?? '') ? value as Position : null;
};

export async function refreshPlayerCatalog() {
  const response = await fetch('https://api.sleeper.app/v1/players/nfl');
  if (!response.ok) throw new Error(`Sleeper oyuncu kataloğu alınamadı (${response.status})`);
  const raw = await response.json() as Record<string, SleeperPlayer>;
  const players: Player[] = Object.entries(raw)
    .filter(([, p]) => Boolean(p.full_name) && Boolean(positionOf(p)))
    .map(([sleeperId, p]) => ({ sleeperId, fullName: p.full_name!, normalizedName: normalizeName(p.full_name!), position: positionOf(p), team: p.team ?? null, active: p.active !== false }));
  replacePlayers(players);
  return players;
}

export function resolveEntries(entries: SourceEntry[], players = getPlayers()) {
  const aliasesByName = aliases();
  const exact = new Map(players.map(p => [p.normalizedName, p]));
  return entries.map(entry => {
    const alias = aliasesByName.get(entry.normalizedText);
    let found = alias ? players.find(p => p.sleeperId === alias) : exact.get(entry.normalizedText);
    let confidence = found ? 1 : 0;
    if (!found) {
      const initials = entry.normalizedText.split(' ');
      const candidates = players.filter(p => {
        const name = p.normalizedName.split(' ');
        return name.at(-1) === initials.at(-1) && (!entry.positionHint || p.position === entry.positionHint);
      });
      if (candidates.length === 1) { found = candidates[0]; confidence = 0.9; }
    }
    return { ...entry, sleeperId: found?.sleeperId ?? null, confidence };
  });
}

export async function importRankings(downloadCatalog = false) {
  const players = downloadCatalog || getPlayers().length === 0 ? await refreshPlayerCatalog() : getPlayers();
  const entries = resolveEntries(parseAllMarkdown(), players);
  replaceEntries(entries);
  const outputDir = path.resolve('data', 'final-rankings');
  fs.mkdirSync(outputDir, { recursive: true });
  for (const scoringType of ['ppr', 'half_ppr', 'standard']) {
    fs.writeFileSync(path.join(outputDir, `consensus-${scoringType}.json`), JSON.stringify({
      generatedAt: new Date().toISOString(), scoringType, players: consensus(scoringType),
    }, null, 2));
  }
  return { entries: entries.length, resolved: entries.filter(e => e.sleeperId).length, review: entries.filter(e => !e.sleeperId || e.confidence < 0.8).length, players: players.length };
}

if (process.argv[1]?.endsWith('import-rankings.ts')) {
  importRankings(true).then(result => console.log(`Import tamamlandı: ${result.entries} kayıt, ${result.resolved} eşleşme, ${result.review} inceleme.`)).catch(error => { console.error(error); process.exitCode = 1; });
}
