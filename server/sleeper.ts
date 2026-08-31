import type { DraftPick, DraftState, LeagueConfig, Position } from './types.js';

const position = (value?: string): Position | null => value === 'DST' ? 'DEF' : ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].includes(value ?? '') ? value as Position : null;
const sleeper = async (url: string) => {
  const r = await fetch(`https://api.sleeper.app/v1${url}`);
  if (!r.ok) throw new Error(`Sleeper isteği başarısız (${r.status}): ${url}`);
  return r.json() as Promise<any>;
};

export async function connect(input: { leagueId?: string; draftId?: string; username?: string; myRosterId?: number }) {
  let league: any = null; let draft: any;
  if (input.leagueId) {
    league = await sleeper(`/league/${input.leagueId}`);
    const drafts = await sleeper(`/league/${input.leagueId}/drafts`);
    draft = drafts.find((d: any) => d.status !== 'complete') ?? drafts[0];
    if (!draft) throw new Error('Bu lig için draft bulunamadı.');
  } else if (input.draftId) draft = await sleeper(`/draft/${input.draftId}`);
  else throw new Error('League ID veya Draft ID gerekli.');
  const detailed = await sleeper(`/draft/${draft.draft_id}`);
  let myUserId: string | undefined;
  let myRosterId = input.myRosterId;
  const users = detailed.league_id ? await sleeper(`/league/${detailed.league_id}/users`) : [];
  if (input.username && detailed.league_id) {
    const user = users.find((u: any) => u.username?.toLowerCase() === input.username!.toLowerCase());
    if (!user) throw new Error('Bu kullanıcı ligde bulunamadı. Sleeper kullanıcı adını kontrol et.');
    const foundUserId = String(user.user_id);
    myUserId = foundUserId;
    const slot = detailed.draft_order?.[foundUserId];
    myRosterId = slot ? Number(detailed.slot_to_roster_id?.[slot]) : undefined;
  }
  if (!myRosterId) throw new Error('Kendi takımın bulunamadı. Draft ID yolunda roster ID gir.');
  const reception = Number(league?.scoring_settings?.rec ?? 1);
  const scoringType = reception >= .75 ? 'ppr' : reception >= .25 ? 'half_ppr' : reception === 0 ? 'standard' : 'custom';
  const rosterNames: Record<string, string> = {};
  for (const user of users) {
    const slot = detailed.draft_order?.[user.user_id];
    const rosterId = slot ? detailed.slot_to_roster_id?.[slot] : undefined;
    if (rosterId) rosterNames[String(rosterId)] = user.metadata?.team_name || user.display_name || user.username || `Takım ${slot}`;
  }
  return { config: { leagueId: detailed.league_id, draftId: detailed.draft_id, name: league?.name ?? detailed.metadata?.name ?? 'Sleeper Draft', teams: detailed.settings?.teams ?? league?.total_rosters ?? 12, rounds: detailed.settings?.rounds ?? 15, rosterPositions: league?.roster_positions ?? [], scoringType, receptionPoints: reception, pickTimer: detailed.settings?.pick_timer ?? null, myRosterId, myUserId, draftOrder: detailed.draft_order ?? {}, slotToRosterId: detailed.slot_to_roster_id ?? {}, rosterNames, mode: 'live' } satisfies LeagueConfig };
}

export async function getPicks(draftId: string, slotToRosterId: Record<string, number> = {}): Promise<DraftPick[]> {
  const picks = await sleeper(`/draft/${draftId}/picks`);
  return picks.map((p: any) => ({ playerId: String(p.player_id), playerName: [p.metadata?.first_name, p.metadata?.last_name].filter(Boolean).join(' ') || p.player_id, position: position(p.metadata?.position), team: p.metadata?.team ?? null, pickNo: p.pick_no, round: p.round, draftSlot: p.draft_slot, rosterId: Number(slotToRosterId[String(p.draft_slot)] ?? p.roster_id) }));
}

export function publicState(config: LeagueConfig, picks: DraftPick[], live = true, error?: string, finished = false): DraftState {
  return { config, picks: picks.sort((a, b) => a.pickNo - b.pickNo), refreshedAt: new Date().toISOString(), live, error, finished };
}
