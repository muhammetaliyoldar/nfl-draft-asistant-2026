import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { clearManualPicks, getEntries, getManualPicks, getPlayers, replaceEntries, saveAlias, saveManualPick } from './database.js';
import { importRankings, resolveEntries } from './import-rankings.js';
import { parseAllMarkdown } from './markdown.js';
import { consensus } from './consensus.js';
import { recommendations, recommendationsForPick, draftSlotForPick, detectStrategy, findAdpBargains } from './recommend.js';
import { connect, getPicks, publicState, getUserLeagues, type UserLeague } from './sleeper.js';
import type { DraftPick, LeagueConfig } from './types.js';
const pickSlot = draftSlotForPick;

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
app.get('/api/user-leagues', async (req, res, next) => { try { const username = String(req.query.username ?? '').trim(); if (!username) return res.status(400).json({ error: 'username gerekli' }); const leagues = await getUserLeagues(username); res.json(leagues); } catch (e) { next(e); } });
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
app.post('/api/connect', async (req, res, next) => { try { await ensureRankings(); const { leagueId, draftId, username, myRosterId } = req.body ?? {}; if (leagueId) { config = (await connect({ leagueId, username, myRosterId })).config; } else if (draftId) { config = (await connect({ draftId, username, myRosterId })).config; } else { throw new Error('League ID veya Draft ID gerekli'); } demoFinished = false; cachedPicks = []; lastFetch = 0; res.json(await liveState()); } catch (e) { next(e); } });
app.post('/api/demo', async (req, res) => {
  await ensureRankings();
  const { leagueId, username, scoringType = 'ppr', receptionPoints = 1, rosterPositions = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'], totalRosters = 12 } = req.body ?? {};
  const teams = totalRosters;
  const slotToRosterId = Object.fromEntries(Array.from({ length: teams }, (_, i) => [String(i + 1), i + 1]));
  const draftId = leagueId ? `mock-${leagueId}` : 'local-demo';
  const name = leagueId ? `Mock Draft: ${leagueId}` : 'Local Demo Draft';
  config = { draftId, name, teams, rounds: 15, rosterPositions, scoringType, receptionPoints, pickTimer: 90, myRosterId: 1, draftOrder: {}, slotToRosterId, rosterNames: Object.fromEntries(Array.from({ length: teams }, (_, i) => [String(i + 1), i === 0 ? 'Senin Takımın' : `Mock Takım ${i + 1}`])), mode: 'demo' };
  demoFinished = false; cachedPicks = []; clearManualPicks(draftId); lastFetch = Date.now(); res.json(await liveState());
});
app.post('/api/demo/reset', async (_req, res, next) => { try { if (!config || config.mode !== 'demo') throw new Error('Önce Demo draftı aç.'); demoFinished = false; cachedPicks = []; clearManualPicks('local-demo'); res.json(await liveState()); } catch (e) { next(e); } });
app.post('/api/demo/finish', async (_req, res, next) => { try { if (!config || config.mode !== 'demo') throw new Error('Gerçek canlı draft sıfırlanamaz veya elle bitirilemez.'); demoFinished = true; res.json(await liveState()); } catch (e) { next(e); } });
app.get('/api/draft-state', async (_req, res, next) => { try { res.json(await liveState()); } catch (e) { next(e); } });
app.get('/api/recommendations', async (_req, res, next) => { try { const state = await liveState(); res.json(recommendations(state.picks, state.config)); } catch (e) { next(e); } });
app.get('/api/recommendations-for-pick', async (req, res, next) => { try { const state = await liveState(); const pickNo = Number(req.query.pickNo ?? state.picks.length + 1); res.json(recommendationsForPick(state.picks, state.config, pickNo)); } catch (e) { next(e); } });
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
app.post('/api/auto-pick', async (req, res, next) => { try { const state = await liveState(); const { rosterId } = req.body ?? {}; if (!rosterId) return res.status(400).json({ error: 'rosterId gerekli' }); const result = recommendations(state.picks, { ...state.config, myRosterId: Number(rosterId) }); const top = result.recommendations[0]; if (!top) return res.status(404).json({ error: 'Oyuncu kalmadı' }); res.json({ playerId: top.player.sleeperId, playerName: top.player.fullName, position: top.player.position, team: top.player.team, consensusRank: top.player.consensusRank, reason: top.reason }); } catch (e) { next(e); } });
app.post('/api/mock-simulate', async (req, res, next) => { try { const state = await liveState(); if (state.config.mode !== 'demo') return res.status(400).json({ error: 'Sadece demo modunda çalışır' }); let currentPicks = [...state.picks]; const config = state.config; const totalPicks = config.teams * config.rounds; for (let pickNo = currentPicks.length + 1; pickNo <= totalPicks; pickNo++) { const slot = pickSlot(pickNo, config.teams); const rosterId = config.slotToRosterId[String(slot)]; const result = recommendations(currentPicks, { ...config, myRosterId: Number(rosterId) }); const top = result.recommendations[0]; if (!top) break; const pick: DraftPick = { playerId: top.player.sleeperId, playerName: top.player.fullName, position: top.player.position, team: top.player.team, pickNo, round: Math.ceil(pickNo / config.teams), draftSlot: slot, rosterId: Number(rosterId), isManual: false }; currentPicks.push(pick); saveManualPick(config.draftId, pickNo, top.player.sleeperId, Number(rosterId), pick.round, slot); } res.json(await liveState()); } catch (e) { next(e); } });
app.post('/api/manual-picks', (req, res) => {
  if (!config) return res.status(400).json({ error: 'Önce drafta bağlan.' });
  const { pickNo, sleeperId, rosterId, round, draftSlot } = req.body ?? {};
  if (![pickNo, sleeperId, rosterId, round, draftSlot].every(Boolean)) return res.status(400).json({ error: 'Tüm seçim alanları gerekli.' });
  saveManualPick(config.draftId, Number(pickNo), String(sleeperId), Number(rosterId), Number(round), Number(draftSlot)); res.json({ ok: true });
});
app.get('/api/strategy', async (_req, res, next) => { try { const state = await liveState(); res.json(detectStrategy(state.picks, state.config)); } catch (e) { next(e); } });
app.get('/api/adp-bargains', async (_req, res, next) => { try { const state = await liveState(); res.json(findAdpBargains(state.picks, state.config)); } catch (e) { next(e); } });
app.get('/api/player-search', (req, res) => {
  const query = String(req.query.q ?? '').toLowerCase().trim();
  const posFilter = String(req.query.position ?? '').toUpperCase().trim();
  let players = consensus('ppr').filter(p => p.active);
  if (posFilter && ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].includes(posFilter)) players = players.filter(p => p.position === posFilter);
  if (query) players = players.filter(p => p.fullName.toLowerCase().includes(query) || p.normalizedName.includes(query) || (p.team && p.team.toLowerCase().includes(query)));
  res.json({ players: players.slice(0, 50) });
});
app.get('/api/bye-weeks', async (_req, res, next) => { try { const state = await liveState(); const myPicks = state.picks.filter(p => p.rosterId === state.config.myRosterId); const players = getPlayers(); const playerMap = new Map(players.map(p => [p.sleeperId, p])); const byeMap: Record<number, string[]> = {}; for (const pick of myPicks) { const player = playerMap.get(pick.playerId); if (player?.byeWeek && player.position !== 'K' && player.position !== 'DEF') { const week = player.byeWeek; if (!byeMap[week]) byeMap[week] = []; byeMap[week].push(`${player.fullName} (${player.position})`); } } const conflicts = Object.entries(byeMap).filter(([, names]) => names.length >= 2).map(([week, names]) => ({ week: Number(week), players: names, warning: `${names.length} starting player aynı hafta bye!` })); res.json({ byeMap, conflicts }); } catch (e) { next(e); } });
app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(500).json({ error: error.message }));

const dist = path.resolve('dist');
if (fs.existsSync(dist)) { app.use(express.static(dist)); app.get('/{*splat}', (_req, res) => res.sendFile(path.join(dist, 'index.html'))); }
app.listen(3031, () => console.log('Draft asistanı API: http://localhost:3031'));
void ensureRankings().then(() => console.log(`Ranking verisi hazır: ${getEntries().length} kaynak kaydı.`)).catch(error => console.error('Otomatik ranking importu başarısız:', error));
