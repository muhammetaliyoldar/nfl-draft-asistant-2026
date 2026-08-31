export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF';
export type SourceKind = 'overall' | 'position' | 'mock' | 'unknown';

export interface Player {
  sleeperId: string;
  fullName: string;
  normalizedName: string;
  position: Position | null;
  team: string | null;
  active: boolean;
}

export interface SourceEntry {
  id?: number;
  source: string;
  fileName: string;
  kind: SourceKind;
  format: 'ppr' | 'half_ppr' | 'standard' | 'unknown';
  playerText: string;
  normalizedText: string;
  positionHint: Position | null;
  tier: string | null;
  rank: number | null;
  pickNumber: number | null;
  sleeperId: string | null;
  confidence: number;
}

export interface ConsensusPlayer extends Player {
  consensusRank: number;
  score: number;
  tier: string | null;
  mockAdp: number | null;
  evidenceCount: number;
  confidence: number;
}

export interface DraftPick {
  playerId: string;
  playerName: string;
  position: Position | null;
  team: string | null;
  pickNo: number;
  round: number;
  draftSlot: number;
  rosterId: number;
  isManual?: boolean;
}

export interface LeagueConfig {
  leagueId?: string;
  draftId: string;
  name: string;
  teams: number;
  rounds: number;
  rosterPositions: string[];
  scoringType: 'ppr' | 'half_ppr' | 'standard' | 'custom';
  receptionPoints: number;
  pickTimer: number | null;
  myRosterId: number;
  myUserId?: string;
  draftOrder: Record<string, number>;
  slotToRosterId: Record<string, number>;
  rosterNames: Record<string, string>;
  mode?: 'live' | 'demo';
}

export interface DraftState {
  config: LeagueConfig;
  picks: DraftPick[];
  refreshedAt: string;
  live: boolean;
  error?: string;
  finished?: boolean;
}

export interface BoardSuggestion {
  rosterId: number;
  playerId: string;
  playerName: string;
  position: Position | null;
  team: string | null;
  consensusRank: number;
  reason: string;
}

export interface Recommendation {
  player: ConsensusPlayer;
  score: number;
  valueScore: number;
  needScore: number;
  scarcityScore: number;
  survivalScore: number;
  survivalChance: number;
  reason: string;
}
