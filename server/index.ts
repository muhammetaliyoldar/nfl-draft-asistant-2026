import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { clearManualPicks, getEntries, getManualPicks, getPlayers, replaceEntries, saveAlias, saveManualPick } from './database.js';
import { importRankings, resolveEntries } from './import-rankings.js';
import { parseAllMarkdown } from './markdown.js';
import { consensus } from './consensus.js';
import { recommendations } from './recommend.js';
import { connect, getPicks, publicState } from './sleeper.js';
import type { DraftPick, LeagueConfig } from './types.js';

const app = express(); app.use(express.json());
let config: LeagueConfig | null = null;
let cachedPicks: DraftPick[] = [];
let lastFetch = 0;
let dataLoad: Promise<unknown> | null = null;
let demoFinished = false;

async function ensureRankings() {
  if (getEntries().length) return;
  dataLoad ??= importRankings(false);
  await dataLoad;
}

async function liveState() {
  if (!config) throw new Error('Önce bir Sleeper draftına bağlan.');
  let live = true; let error: string | undefined;
  if (Date.now() - lastFetch > 1800) {
    try { cachedPicks = await getPicks(config.draftId, config.slotToRosterId); lastFetch = Date.now(); }
    catch (e) { live = false; error = e instanceof Error ? e.message : 'Sleeper bağlantısı kesildi'; }
  }
  const manual = getManualPicks(config.draftId).map((p: any) => {
    const player = getPlayers().find(x => x.sleeperId === p.sleeper_id);
    return { playerId: p.sleeper_id, playerName: player?.fullName ?? p.sleeper_id, position: player?.position ?? null, team: player?.team ?? null, pickNo: p.pick_no, round: p.round, draftSlot: p.draft_slot, rosterId: p.roster_id, isManual: true } as DraftPick;
  });
  const byPick = new Map(cachedPicks.map(p => [p.pickNo, p])); manual.forEach(p => byPick.set(p.pickNo, p));
  return publicState(config, [...byPick.values()], live, error, demoFinished);
}

app.get('/api/health', (_req, res) => res.json({ ok: true, ready: getEntries().length > 0, players: getPlayers().length, entries: getEntries().length }));
app.post('/api/import', async (_req, res, next) => { try { dataLoad = importRankings(false); res.json(await dataLoad); } catch (e) { next(e); } });
app.get('/api/review', (_req, res) => {
  const players = getPlayers();
  const unresolved = getEntries().filter(e => !e.sleeperId || e.confidence < .8).map(e => {
    const tokens = e.normalizedText.split(' ').filter(Boolean); const last = tokens.at(-1) ?? ''; const initial = tokens[0]?.[0];
    const candidates = players.map(p => {
      let score = 0; const nameTokens = p.normalizedName.split(' '); const pLast = nameTokens.at(-1) ?? '';
      if (pLast === last) score += 6; else if (pLast.includes(last) || last.includes(pLast)) score += 3;
      if (initial && nameTokens[0]?.startsWith(initial)) score += 2;
      if (e.positionHint && p.position === e.positionHint) score += 3;
      return { p, score };
    }).filter(x => x.score >= 3).sort((a, b) => b.score - a.score).slice(0, 8).map(x => x.p);
    return { ...e, candidates };
  });
  res.json(unresolved);
});
app.post('/api/review', (req, res) => {
  const { alias, sleeperId } = req.body ?? {}; if (!alias || !sleeperId) return res.status(400).json({ error: 'alias ve sleeperId gerekli' });
  saveAlias(alias, sleeperId); replaceEntries(resolveEntries(parseAllMarkdown(), getPlayers())); res.json({ ok: true, message: 'Eşleşme kaydedildi ve ranking güncellendi.' });
});
app.get('/api/consensus', (req, res) => res.json(consensus(String(req.query.scoringType ?? 'ppr'))));
app.post('/api/connect', async (req, res, next) => { try { await ensureRankings(); config = (await connect(req.body)).config; demoFinished = false; cachedPicks = []; lastFetch = 0; res.json(await liveState()); } catch (e) { next(e); } });
app.post('/api/demo', async (_req, res) => {
  await ensureRankings();
  const teams = 12; const slotToRosterId = Object.fromEntries(Array.from({ length: teams }, (_, i) => [String(i + 1), i + 1]));
  config = { draftId: 'local-demo', name: 'Local Demo Draft', teams, rounds: 15, rosterPositions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'], scoringType: 'ppr', receptionPoints: 1, pickTimer: 90, myRosterId: 1, draftOrder: {}, slotToRosterId, rosterNames: Object.fromEntries(Array.from({ length: teams }, (_, i) => [String(i + 1), i === 0 ? 'Senin Takımın' : `Demo Takım ${i + 1}`])), mode: 'demo' };
  demoFinished = false; cachedPicks = []; clearManualPicks('local-demo'); lastFetch = Date.now(); res.json(await liveState());
});
app.post('/api/demo/reset', async (_req, res, next) => { try { if (!config || config.mode !== 'demo') throw new Error('Önce Demo draftı aç.'); demoFinished = false; cachedPicks = []; clearManualPicks('local-demo'); res.json(await liveState()); } catch (e) { next(e); } });
app.post('/api/demo/finish', async (_req, res, next) => { try { if (!config || config.mode !== 'demo') throw new Error('Gerçek canlı draft sıfırlanamaz veya elle bitirilemez.'); demoFinished = true; res.json(await liveState()); } catch (e) { next(e); } });
app.get('/api/draft-state', async (_req, res, next) => { try { res.json(await liveState()); } catch (e) { next(e); } });
app.get('/api/recommendations', async (_req, res, next) => { try { const state = await liveState(); res.json(recommendations(state.picks, state.config)); } catch (e) { next(e); } });
app.get('/api/board-suggestions', async (_req, res, next) => {
  try {
    const state = await liveState(); const suggestions: Record<string, unknown> = {};
    for (const rosterId of Object.values(state.config.slotToRosterId)) {
      const result = recommendations(state.picks, { ...state.config, myRosterId: Number(rosterId) }); const top = result.recommendations[0];
      if (top) suggestions[String(rosterId)] = { rosterId, playerId: top.player.sleeperId, playerName: top.player.fullName, position: top.player.position, team: top.player.team, consensusRank: top.player.consensusRank, reason: top.reason };
    }
    res.json(suggestions);
  } catch (e) { next(e); }
});
app.post('/api/manual-picks', (req, res) => {
  if (!config) return res.status(400).json({ error: 'Önce drafta bağlan.' });
  const { pickNo, sleeperId, rosterId, round, draftSlot } = req.body ?? {};
  if (![pickNo, sleeperId, rosterId, round, draftSlot].every(Boolean)) return res.status(400).json({ error: 'Tüm seçim alanları gerekli.' });
  saveManualPick(config.draftId, Number(pickNo), String(sleeperId), Number(rosterId), Number(round), Number(draftSlot)); res.json({ ok: true });
});
app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(500).json({ error: error.message }));

const dist = path.resolve('dist');
if (fs.existsSync(dist)) { app.use(express.static(dist)); app.get('/{*splat}', (_req, res) => res.sendFile(path.join(dist, 'index.html'))); }
app.listen(3031, () => console.log('Draft asistanı API: http://localhost:3031'));
void ensureRankings().then(() => console.log(`Ranking verisi hazır: ${getEntries().length} kaynak kaydı.`)).catch(error => console.error('Otomatik ranking importu başarısız:', error));
