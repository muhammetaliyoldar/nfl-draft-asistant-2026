import type { DraftPick, DraftState, LeagueConfig, Position } from './types.js';

const position = (value?: string): Position | null => value === 'DST' ? 'DEF' : ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].includes(value ?? '') ? value as Position : null;
const sleeper = async (url: string) => {
  const r = await fetch(`https://api.sleeper.app/v1${url}`);
  if (!r.ok) throw new Error(`Sleeper isteği başarısız (${r.status}): ${url}`);
  return r.json() as Promise<any>;
};

export interface UserLeague {
  leagueId: string;
  name: string;
  season: string;
  scoringType: 'ppr' | 'half_ppr' | 'standard' | 'custom';
  receptionPoints: number;
  totalRosters: number;
  rosterPositions: string[];
  draftId?: string;
  draftStatus?: string;
}

export async function getUserLeagues(username: string, season = String(new Date().getFullYear())): Promise<UserLeague[]> {
  const user = await sleeper(`/user/${username}`);
  if (!user?.user_id) throw new Error('Kullanıcı bulunamadı.');
  const leagues = await sleeper(`/user/${user.user_id}/leagues/nfl/${season}`);
  return leagues
    .filter((l: any) => l.status !== 'pre_draft' || l.draft_id)
    .map((l: any) => {
      const reception = Number(l.scoring_settings?.rec ?? 1);
      const scoringType = reception >= .75 ? 'ppr' : reception >= .25 ? 'half_ppr' : reception === 0 ? 'standard' : 'custom';
      return {
        leagueId: l.league_id,
        name: l.name,
        season: l.season,
        scoringType,
        receptionPoints: reception,
        totalRosters: l.total_rosters,
        rosterPositions: l.roster_positions ?? [],
        draftId: l.draft_id,
        draftStatus: l.status,
      };
    });
}

export async function connect(input: { leagueId?: string; draftId?: string; username?: string; myRosterId?: number }) {
  let league: any = null; let draft: any;
  if (input.leagueId) {
    league = await sleeper(`/league/${input.leagueId}`);
    const drafts = await sleeper(`/league/${input.leagueId}/drafts`);
    const activeDraft = drafts.find((d: any) => d.status !== 'complete');
    if (!activeDraft) throw new Error('Bu ligde aktif (devam eden) draft yok. Tüm draftlar tamamlanmış. Mock Draft Testi kullanın.');
    draft = activeDraft;
  } else if (input.draftId) draft = await sleeper(`/draft/${input.draftId}`);
  else throw new Error('League ID veya Draft ID gerekli.');
  const detailed = await sleeper(`/draft/${draft.draft_id}`);
  if (detailed.status === 'complete') throw new Error('Bu draft zaten tamamlanmış. Canlı takip yapılamaz.');
  let myUserId: string | undefined;
  let myRosterId = input.myRosterId;
  const users = detailed.league_id ? await sleeper(`/league/${detailed.league_id}/users`) : [];
  if (input.username && detailed.league_id) {
    const target = input.username.toLowerCase();
    // Lig üyeleri listesinde username çoğu zaman null gelir; display_name ve metadata.team_name ile de eşleştir.
    const user = users.find((u: any) => [u.username, u.display_name, u.metadata?.team_name].some((v: any) => v?.toLowerCase?.() === target));
    if (!user) throw new Error(`"${input.username}" ligde bulunamadı. Ligdeki isimler: ${users.map((u: any) => u.display_name || u.username).filter(Boolean).join(', ')}`);
    const foundUserId = String(user.user_id);
    myUserId = foundUserId;
    const slot = detailed.draft_order?.[foundUserId];
    myRosterId = slot ? Number(detailed.slot_to_roster_id?.[slot]) : myRosterId;
  }
  if (!myRosterId) throw new Error('Kendi takımın bulunamadı. Draft ID yolunda roster ID gir.');
  const reception = Number(league?.scoring_settings?.rec ?? 1);
  const scoringType = reception >= .75 ? 'ppr' : reception >= .25 ? 'half_ppr' : reception === 0 ? 'standard' : 'custom';
  // Ligsiz (mock) draftlarda roster slotlarını draft.settings.slots_* alanlarından türet.
  const s = detailed.settings ?? {};
  const rosterPositionsFromDraft = [
    ...Array(s.slots_qb ?? 0).fill('QB'),
    ...Array(s.slots_rb ?? 0).fill('RB'),
    ...Array(s.slots_wr ?? 0).fill('WR'),
    ...Array(s.slots_te ?? 0).fill('TE'),
    ...Array(s.slots_flex ?? 0).fill('FLEX'),
    ...Array(s.slots_super_flex ?? 0).fill('SUPER_FLEX'),
    ...Array(s.slots_k ?? 0).fill('K'),
    ...Array(s.slots_def ?? 0).fill('DEF'),
    ...Array(s.slots_bn ?? 0).fill('BN'),
  ];
  const rosterPositions = league?.roster_positions?.length ? league.roster_positions : rosterPositionsFromDraft;
  const rosterNames: Record<string, string> = {};
  for (const user of users) {
    const slot = detailed.draft_order?.[user.user_id];
    const rosterId = slot ? detailed.slot_to_roster_id?.[slot] : undefined;
    if (rosterId) rosterNames[String(rosterId)] = user.metadata?.team_name || user.display_name || user.username || `Takım ${slot}`;
  }
  return { config: { leagueId: detailed.league_id, draftId: detailed.draft_id, name: league?.name ?? detailed.metadata?.name ?? 'Sleeper Draft', teams: detailed.settings?.teams ?? league?.total_rosters ?? 12, rounds: detailed.settings?.rounds ?? 15, rosterPositions, scoringType, receptionPoints: reception, pickTimer: detailed.settings?.pick_timer ?? null, myRosterId, myUserId, draftOrder: detailed.draft_order ?? {}, slotToRosterId: detailed.slot_to_roster_id ?? {}, rosterNames, mode: 'live' } satisfies LeagueConfig };
}

export async function getPicks(draftId: string, slotToRosterId: Record<string, number> = {}): Promise<DraftPick[]> {
  const picks = await sleeper(`/draft/${draftId}/picks`);
  return picks.map((p: any) => ({ playerId: String(p.player_id), playerName: [p.metadata?.first_name, p.metadata?.last_name].filter(Boolean).join(' ') || p.player_id, position: position(p.metadata?.position), team: p.metadata?.team ?? null, pickNo: p.pick_no, round: p.round, draftSlot: p.draft_slot, rosterId: Number(slotToRosterId[String(p.draft_slot)] ?? p.roster_id) }));
}

export function publicState(config: LeagueConfig, picks: DraftPick[], live = true, error?: string, finished = false): DraftState {
  return { config, picks: picks.sort((a, b) => a.pickNo - b.pickNo), refreshedAt: new Date().toISOString(), live, error, finished };
}
