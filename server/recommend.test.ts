import { describe, expect, it } from 'vitest';
import { nextPickForRoster } from './recommend.js';
import type { LeagueConfig } from './types.js';

const base: LeagueConfig = { draftId: 'x', name: 'test', teams: 10, rounds: 15, rosterPositions: [], scoringType: 'ppr', receptionPoints: 1, pickTimer: null, myRosterId: 5, slotToRosterId: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i + 1), i + 1])), rosterNames: {}, draftOrder: {} };
describe('snake draft sıra hesaplaması', () => {
  it('5. slot için 1.05 ve 2.06 dönüşünü hesaplar', () => {
    expect(nextPickForRoster([], base)).toBe(5);
    const picks = Array.from({ length: 5 }, (_, i) => ({ playerId: String(i), playerName: '', position: null, team: null, pickNo: i + 1, round: 1, draftSlot: i + 1, rosterId: i + 1 }));
    expect(nextPickForRoster(picks, base)).toBe(16);
  });
});
