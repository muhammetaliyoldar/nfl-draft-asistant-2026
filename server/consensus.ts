import { getEntries, getPlayers } from './database.js';
import type { ConsensusPlayer, SourceEntry } from './types.js';

const formatWeight = (source: string, target: string) => source === 'unknown' || source === target ? 1 :
  (source === 'half_ppr' || target === 'half_ppr') ? 0.8 : 0.6;
const avg = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

const nflTeams = ['ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND','JAX','KC','LV','LAC','LAR','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SF','SEA','TB','TEN','WAS'];

function ensureKickerDefense(rows: ConsensusPlayer[], players: Map<string, any>): ConsensusPlayer[] {
  const hasK = rows.some(r => r.position === 'K');
  const hasDef = rows.some(r => r.position === 'DEF');
  if (hasK && hasDef) return rows;
  const existingIds = new Set(rows.map(r => r.sleeperId));
  const fallback: ConsensusPlayer[] = [];
  let baseScore = rows.length ? rows[rows.length - 1].score - 5 : 40;
  for (const team of nflTeams) {
    if (!hasK) {
      const k = Array.from(players.values()).find(p => p.position === 'K' && p.team === team && p.active && !existingIds.has(p.sleeperId));
      if (k) {
        fallback.push({ ...k, score: Math.max(5, baseScore - 10), tier: 'K/DEF', mockAdp: null, evidenceCount: 0, confidence: 0.5 });
        existingIds.add(k.sleeperId);
      }
    }
    if (!hasDef) {
      const def = Array.from(players.values()).find(p => p.position === 'DEF' && p.team === team && p.active && !existingIds.has(p.sleeperId));
      if (def) {
        fallback.push({ ...def, score: Math.max(5, baseScore - 12), tier: 'K/DEF', mockAdp: null, evidenceCount: 0, confidence: 0.5 });
        existingIds.add(def.sleeperId);
      }
    }
  }
  return [...rows, ...fallback];
}

export function consensus(scoringType = 'ppr'): ConsensusPlayer[] {
  const players = new Map(getPlayers().map(p => [p.sleeperId, p]));
  const entries = getEntries().filter(e => e.sleeperId && players.has(e.sleeperId));
  const byPlayer = new Map<string, SourceEntry[]>();
  for (const entry of entries) {
    const list = byPlayer.get(entry.sleeperId!) ?? []; list.push(entry); byPlayer.set(entry.sleeperId!, list);
  }
  const rows: Array<Omit<ConsensusPlayer, 'consensusRank'>> = [];
  for (const [id, list] of byPlayer) {
    const sourceKindScore = (kind: string) => {
      const selected = list.filter(e => e.kind === kind && (e.rank ?? e.pickNumber));
      if (!selected.length) return null;
      const bySource = new Map<string, number[]>();
      for (const e of selected) {
        const value = 100 - Math.min(99, ((e.rank ?? e.pickNumber ?? 250) - 1) / 2.5);
        const weighted = value * formatWeight(e.format, scoringType);
        bySource.set(e.source, [...(bySource.get(e.source) ?? []), weighted]);
      }
      return avg([...bySource.values()].map(avg));
    };
    const overall = sourceKindScore('overall');
    const mock = sourceKindScore('mock');
    const positional = sourceKindScore('position');
    const parts = [[overall, .5], [mock, .3], [positional, .2]].filter((part): part is [number, number] => part[0] !== null);
    const score = parts.reduce((sum, [value, weight]) => sum + value * weight, 0) / parts.reduce((sum, [, weight]) => sum + weight, 0);
    const ranks = list.map(e => e.pickNumber ?? e.rank).filter((v): v is number => v !== null);
    const tiers = list.map(e => e.tier).filter((v): v is string => Boolean(v));
    const tier = tiers.sort((a, b) => tiers.filter(x => x === b).length - tiers.filter(x => x === a).length)[0] ?? null;
    const player = players.get(id)!;
    rows.push({ ...player, score, tier, mockAdp: ranks.length ? Math.round(avg(ranks) * 10) / 10 : null, evidenceCount: list.length, confidence: avg(list.map(e => e.confidence)) });
  }
  const ranked = rows.sort((a, b) => b.score - a.score).map((row, index) => ({ ...row, consensusRank: index + 1 }));
  return ensureKickerDefense(ranked, players);
}
