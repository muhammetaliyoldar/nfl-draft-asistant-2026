import { consensus } from './consensus.js';
import type { AdpBargain, ConsensusPlayer, DraftPick, LeagueConfig, Position, Recommendation, StrategyInfo, StrategyOption } from './types.js';

export const STRATEGIES: StrategyOption[] = [
  { id: 'bpa', name: 'Taktik Yok (BPA)', description: 'En iyi mevcut oyuncu. Değer, ihtiyaç ve pozisyon nadirliği dengelenir; pozisyon zorlaması yok. Kararsızsan bununla başla.' },
  { id: 'robust_rb', name: 'Robust RB', description: 'İlk 2-3 turda RB pozisyonunu kilitle. RB erken tükendiği için güvenli taban; sonra WR/TE ile dengele.' },
  { id: 'hero_rb', name: 'Hero RB', description: '1. turda tek bir elite RB al, sonra 4-5 tur WR/TE ağırlık ver, RB derinliğine geç dön. Tek RB\'ye bağımlılık riski var.' },
  { id: 'zero_rb', name: 'Zero RB', description: 'İlk ~5 tur RB alma; elite WR/TE (ve gerekirse QB) yığ. RB\'leri 5. turdan sonra düşen değerden ve yüksek-upside isimlerden topla.' },
  { id: 'wr_heavy', name: 'WR Ağırlıklı', description: 'PPR\'de WR öncelikli kadro kur. RB\'yi FLEX ve bench derinliğinden idare et. WR bolluğunu kullanır.' },
  { id: 'te_premium', name: 'TE Premium', description: 'İlk 3-4 turda elite bir TE (McBride, Bowers, LaPorta vb.) al ve haftalık pozisyon avantajı yarat. Tek TE alıp geçersin.' },
];

// Stratejiye göre pozisyon skoruna çarpan. round: sıradaki pickin turu, counts: kendi kadrondaki pozisyon sayıları, rank: oyuncunun consensus sırası.
function strategyMultiplier(strategyId: string | undefined, position: Position | null, round: number, counts: Record<string, number>, rank = 999): number {
  if (!strategyId || strategyId === 'bpa' || !position) return 1;
  const rb = counts.RB ?? 0, wr = counts.WR ?? 0, te = counts.TE ?? 0;
  switch (strategyId) {
    case 'robust_rb':
      if (position === 'RB') return rb >= 3 ? 0.82 : round <= 3 ? 1.28 : 1.08;
      if (round <= 3 && (position === 'WR' || position === 'TE')) return 0.9;
      return 1;
    case 'hero_rb':
      if (position === 'RB') { if (round === 1) return 1.22; if (rb >= 1 && round <= 5) return 0.65; return 1.18; }
      if ((position === 'WR' || position === 'TE') && round >= 2 && round <= 5) return 1.15;
      return 1;
    case 'zero_rb':
      if (position === 'RB') return round <= 5 ? 0.5 : 1.3;
      if ((position === 'WR' || position === 'TE') && round <= 5) return 1.18;
      return 1;
    case 'wr_heavy':
      if (position === 'WR') return wr >= 5 ? 1.0 : 1.2;
      if (position === 'RB') return rb >= 2 ? 1.05 : 0.85;
      return 1;
    case 'te_premium':
      if (position === 'TE') { if (te >= 1) return 0.6; if (round <= 4 && rank <= 45) return 1.22; if (round <= 6 && rank <= 70) return 1.1; return 1.0; }
      return 1;
    default:
      return 1;
  }
}
export { strategyMultiplier };

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
  const myRound = nextPick ? Math.ceil(nextPick / config.teams) : myPicks.length + 1;
  const counts = Object.fromEntries(['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].map(p => [p, 0])) as Record<string, number>;
  myPicks.forEach(p => { if (p.position) counts[p.position]++; });
  const rows = available.map(player => {
    const valueScore = player.score;
    const needScore = player.position ? positionNeeded(player.position, myPicks, config) : 0;
    const scarcityScore = scarcity(player, available);
    const chanceToSurvive = survivalChance(player, available, picksUntilNext);
    const survivalScore = (1 - chanceToSurvive) * 100;
    const base = valueScore * .45 + needScore * .2 + scarcityScore * .2 + survivalScore * .15;
    const stratMult = strategyMultiplier(config.strategy, player.position, myRound, counts, player.consensusRank);
    const score = base * stratMult;
    const needText = needScore >= 55 ? `${player.position} başlangıç kadrosunda açık var` : 'değer ve tier avantajı';
    const riskText = chanceToSurvive < .35 ? 'bir sonraki seçimine kalma ihtimali düşük' : 'bir tur bekleyebilir';
    const stratText = stratMult >= 1.1 ? ` (${config.strategy} planına uygun)` : stratMult <= 0.9 ? ` (${config.strategy} planına ters)` : '';
    return { player, score, valueScore, needScore, scarcityScore, survivalScore, survivalChance: chanceToSurvive, reason: `${needText}; ${riskText}${stratText}.` };
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
