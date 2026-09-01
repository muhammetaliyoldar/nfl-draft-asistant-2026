import { consensus } from './consensus.js';
import type { AdpBargain, ConsensusPlayer, DraftPick, LeagueConfig, Position, Recommendation, StrategyInfo } from './types.js';

const draftSlotForPick = (pickNo: number, teams: number) => {
  const round = Math.ceil(pickNo / teams); const within = (pickNo - 1) % teams + 1;
  return round % 2 ? within : teams - within + 1;
};
export { draftSlotForPick };
export const nextPickForRoster = (picks: DraftPick[], config: LeagueConfig) => {
  const mySlots = Object.entries(config.slotToRosterId).filter(([, roster]) => Number(roster) === config.myRosterId).map(([slot]) => Number(slot));
  const mySlot = mySlots[0] ?? Object.entries(config.draftOrder).find(([, slot]) => config.slotToRosterId[String(slot)] === config.myRosterId)?.[1];
  if (!mySlot) return null;
  const current = picks.length + 1;
  for (let n = current; n <= config.teams * config.rounds; n++) if (draftSlotForPick(n, config.teams) === Number(mySlot)) return n;
  return null;
};

const positionNeeded = (position: Position, myPicks: DraftPick[], config: LeagueConfig) => {
  const counts = Object.fromEntries(['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].map(p => [p, 0])) as Record<Position, number>;
  myPicks.forEach(p => { if (p.position) counts[p.position]++; });
  const direct = config.rosterPositions.filter(p => p === position).length;
  const openDirect = Math.max(0, direct - counts[position]);
  const flexPositions = config.rosterPositions.filter(p => p === 'FLEX' || p === 'SUPER_FLEX');
  const eligibleFlex = position === 'QB' ? config.rosterPositions.filter(p => p === 'SUPER_FLEX').length : flexPositions.length;
  const starters = ['QB', 'RB', 'WR', 'TE'].reduce((sum, p) => sum + Math.min(counts[p as Position], config.rosterPositions.filter(slot => slot === p).length), 0);
  const draftedFlexEligible = ['RB', 'WR', 'TE'].reduce((sum, p) => sum + Math.max(0, counts[p as Position] - config.rosterPositions.filter(slot => slot === p).length), 0) + Math.max(0, counts.QB - config.rosterPositions.filter(slot => slot === 'QB').length);
  const openFlex = Math.max(0, eligibleFlex - draftedFlexEligible);
  const bench = myPicks.length - starters;
  return Math.min(100, openDirect * 45 + openFlex * 18 + (bench < 2 && myPicks.length > 6 ? 8 : 0));
};

const scarcity = (player: ConsensusPlayer, available: ConsensusPlayer[]) => {
  if (!player.position || ['K', 'DEF'].includes(player.position)) return 0;
  const same = available.filter(p => p.position === player.position);
  const next = same.filter(p => p.consensusRank > player.consensusRank).slice(0, 4);
  if (!next.length) return 20;
  const gap = player.score - next.reduce((sum, p) => sum + p.score, 0) / next.length;
  return Math.max(0, Math.min(100, gap * 2.5));
};

function survivalChance(player: ConsensusPlayer, available: ConsensusPlayer[], picksUntilNext: number) {
  if (picksUntilNext <= 0) return 1;
  const rank = available.findIndex(p => p.sleeperId === player.sleeperId) + 1;
  const valuePressure = Math.max(.05, 0.38 - rank / Math.max(available.length, 1) * .28);
  const simulations = 500; let survives = 0;
  for (let i = 0; i < simulations; i++) {
    let taken = false;
    for (let pick = 0; pick < picksUntilNext; pick++) {
      const variance = ((i * 31 + pick * 17) % 100) / 100;
      if (variance < valuePressure) { taken = true; break; }
    }
    if (!taken) survives++;
  }
  return survives / simulations;
}

export function recommendations(picks: DraftPick[], config: LeagueConfig): { nextPick: number | null; recommendations: Recommendation[] } {
  return recommendationsForPick(picks, config, nextPickForRoster(picks, config));
}

export function recommendationsForPick(picks: DraftPick[], config: LeagueConfig, targetPick: number | null): { nextPick: number | null; recommendations: Recommendation[] } {
  const ranked = consensus(config.scoringType);
  const taken = new Set(picks.map(p => p.playerId));
  const available = ranked.filter(p => !taken.has(p.sleeperId) && p.active).slice(0, 180);
  const nextPick = targetPick ?? nextPickForRoster(picks, config);
  const myPicks = picks.filter(p => p.rosterId === config.myRosterId);
  const afterMyPick = nextPick ? nextPick + (config.teams * 2 - 1) : picks.length;
  const picksUntilNext = Math.max(0, afterMyPick - (nextPick ?? picks.length) - 1);
  const rows = available.map(player => {
    const valueScore = player.score;
    const needScore = player.position ? positionNeeded(player.position, myPicks, config) : 0;
    const scarcityScore = scarcity(player, available);
    const chanceToSurvive = survivalChance(player, available, picksUntilNext);
    const survivalScore = (1 - chanceToSurvive) * 100;
    const score = valueScore * .45 + needScore * .2 + scarcityScore * .2 + survivalScore * .15;
    const needText = needScore >= 55 ? `${player.position} başlangıç kadrosunda açık var` : 'değer ve tier avantajı';
    const riskText = chanceToSurvive < .35 ? 'bir sonraki seçimine kalma ihtimali düşük' : 'bir tur bekleyebilir';
    return { player, score, valueScore, needScore, scarcityScore, survivalScore, survivalChance: chanceToSurvive, reason: `${needText}; ${riskText}.` };
  });
  return { nextPick, recommendations: rows.sort((a, b) => b.score - a.score).slice(0, 5) };
}

export function detectStrategy(picks: DraftPick[], config: LeagueConfig): StrategyInfo {
  const myPicks = picks.filter(p => p.rosterId === config.myRosterId);
  const counts = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 } as Record<Position, number>;
  myPicks.forEach(p => { if (p.position) counts[p.position]++; });
  const total = myPicks.length || 1;
  const rbPct = counts.RB / total;
  const wrPct = counts.WR / total;
  const tePct = counts.TE / total;
  const qbPct = counts.QB / total;
  const earlyPicks = myPicks.filter(p => p.round <= 3);
  const earlyRB = earlyPicks.filter(p => p.position === 'RB').length;
  const earlyWR = earlyPicks.filter(p => p.position === 'WR').length;

  if (earlyRB >= 2 && counts.RB >= 3) return { name: 'Hero RB', description: 'Erken roundlarda 2+ RB seçip sonra WR ağırlıklı devam ediyorsun.', strength: Math.min(100, Math.round(rbPct * 200)), nextPickAdvice: 'WR veya TE cozyoglari tamamla, elite WR hedefle.' };
  if (earlyRB === 0 && earlyWR >= 2 && counts.RB <= 1) return { name: 'Zero RB', description: 'RB geç başladın, WR ağırlıklı gidiyorsun.', strength: Math.min(100, Math.round(wrPct * 200)), nextPickAdvice: 'Değerli RB\'ler düşmüş olabilir, fırsat kovala.' };
  if (earlyRB === 1 && earlyWR >= 2) return { name: 'Modified Zero RB', description: '1 erken RB ile başladın, ağırlık WR\'de.', strength: Math.min(100, Math.round(wrPct * 180)), nextPickAdvice: 'RB derinliği tükendiğindeprise queenkeeper.' };
  if (counts.WR >= 4 && counts.RB <= 2) return { name: 'WR Heavy', description: 'Çok fazla WR seçtin, RB zayıf kalabilir.', strength: Math.min(100, Math.round(wrPct * 200)), nextPickAdvice: 'Artık RB odaklan, değerli RB\'leri yakala.' };
  if (counts.TE >= 2 && earlyPicks.some(p => p.position === 'TE')) return { name: 'TE Premium', description: 'Erken TE seçtin, avantajı kullan.', strength: Math.min(100, Math.round(tePct * 300 + 30)), nextPickAdvice: 'TE avantajını koru, diğer pozisyonları dengele.' };
  if (counts.QB >= 2) return { name: 'QB Heavy', description: 'Çok fazla QB seçtin, diğer pozisyonlar zayıf.', strength: Math.min(100, Math.round(qbPct * 250 + 20)), nextPickAdvice: 'QB sayısını azalt, RB/WR odaklan.' };
  if (rbPct >= .3 && wrPct >= .3) return { name: 'Balanced', description: 'RB ve WR arasında dengeli gidiyorsun.', strength: 60, nextPickAdvice: 'BPA stratejisi ile devam et, ihtiyaç-based karar ver.' };
  return { name: 'Early Rounds', description: 'Henüz yeterli pick yok, strateji belirleniyor.', strength: 20, nextPickAdvice: 'İlk 3-4 pick\'e kadar strateji netleşmez.' };
}

export function findAdpBargains(picks: DraftPick[], config: LeagueConfig): AdpBargain[] {
  const ranked = consensus(config.scoringType);
  const taken = new Set(picks.map(p => p.playerId));
  const available = ranked.filter(p => !taken.has(p.sleeperId) && p.active && p.mockAdp);
  const bargains: AdpBargain[] = [];
  for (const player of available.slice(0, 80)) {
    const adpDiff = player.consensusRank - (player.mockAdp ?? player.consensusRank);
    if (adpDiff >= 8) {
      let label = 'Büyük Fırsat';
      if (adpDiff >= 20) label = 'Devasa Fırsat';
      else if (adpDiff >= 12) label = 'Büyük Fırsat';
      else label = 'Fırsat';
      bargains.push({ player, adpDiff: Math.round(adpDiff), label });
    }
  }
  return bargains.sort((a, b) => b.adpDiff - a.adpDiff).slice(0, 8);
}
