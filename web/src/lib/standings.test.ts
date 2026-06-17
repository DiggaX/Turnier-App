import { describe, it, expect } from 'vitest'
import { computeStandings, type DoneMatch, type StandingRow } from './standings'

describe('computeStandings', () => {
  it('returns [] for empty input', () => {
    expect(computeStandings([])).toEqual([])
  })

  it('3-player round-robin: A beats B 2:0, A beats C 2:1, B beats C 2:1', () => {
    const matches: DoneMatch[] = [
      { participantAId: 'A', participantBId: 'B', scoreA: 2, scoreB: 0 },
      { participantAId: 'A', participantBId: 'C', scoreA: 2, scoreB: 1 },
      { participantAId: 'B', participantBId: 'C', scoreA: 2, scoreB: 1 },
    ]
    const rows = computeStandings(matches)

    expect(rows).toHaveLength(3)

    const [first, second, third] = rows

    // A: 2 wins, 0 losses, scored 4 for, 1 against
    expect(first).toMatchObject<Partial<StandingRow>>({
      participantId: 'A',
      played: 2,
      wins: 2,
      losses: 0,
      scoreFor: 4,
      scoreAgainst: 1,
      diff: 3,
    })

    // B: 1 win, 1 loss, scored 2 for, 3 against
    expect(second).toMatchObject<Partial<StandingRow>>({
      participantId: 'B',
      played: 2,
      wins: 1,
      losses: 1,
      scoreFor: 2,
      scoreAgainst: 3,
      diff: -1,
    })

    // C: 0 wins, 2 losses, scored 2 for, 4 against
    expect(third).toMatchObject<Partial<StandingRow>>({
      participantId: 'C',
      played: 2,
      wins: 0,
      losses: 2,
      scoreFor: 2,
      scoreAgainst: 4,
      diff: -2,
    })
  })

  it('tie-break: higher diff comes before equal-wins player', () => {
    // X beats Y 3:0 (X: wins=1 diff=3, Y: wins=0 diff=-3)
    // W beats Z 3:2 (W: wins=1 diff=1, Z: wins=0 diff=-1)
    // No cross matches so X and W both have wins=1; X diff=3 > W diff=1 → X first
    const matches: DoneMatch[] = [
      { participantAId: 'X', participantBId: 'Y', scoreA: 3, scoreB: 0 },
      { participantAId: 'W', participantBId: 'Z', scoreA: 3, scoreB: 2 },
    ]
    const rows = computeStandings(matches)
    expect(rows[0].participantId).toBe('X')
    expect(rows[1].participantId).toBe('W')
  })

  it('tie-break: equal wins+diff, higher scoreFor comes first', () => {
    // P beats Q 5:2 (P: wins=1 diff=3 for=5, Q: wins=0)
    // R beats S 4:1 (R: wins=1 diff=3 for=4, S: wins=0)
    // P and R equal wins+diff, P.scoreFor=5 > R.scoreFor=4 → P first
    const matches: DoneMatch[] = [
      { participantAId: 'P', participantBId: 'Q', scoreA: 5, scoreB: 2 },
      { participantAId: 'R', participantBId: 'S', scoreA: 4, scoreB: 1 },
    ]
    const rows = computeStandings(matches)
    expect(rows[0].participantId).toBe('P')
    expect(rows[1].participantId).toBe('R')
  })

  it('property: wins + losses === played for every row', () => {
    const matches: DoneMatch[] = [
      { participantAId: 'A', participantBId: 'B', scoreA: 2, scoreB: 0 },
      { participantAId: 'A', participantBId: 'C', scoreA: 2, scoreB: 1 },
      { participantAId: 'B', participantBId: 'C', scoreA: 2, scoreB: 1 },
    ]
    const rows = computeStandings(matches)
    for (const row of rows) {
      expect(row.wins + row.losses).toBe(row.played)
    }
  })

  it('property: sum of all played === 2 * matches.length', () => {
    const matches: DoneMatch[] = [
      { participantAId: 'A', participantBId: 'B', scoreA: 2, scoreB: 0 },
      { participantAId: 'A', participantBId: 'C', scoreA: 2, scoreB: 1 },
      { participantAId: 'B', participantBId: 'C', scoreA: 2, scoreB: 1 },
    ]
    const rows = computeStandings(matches)
    const totalPlayed = rows.reduce((sum, r) => sum + r.played, 0)
    expect(totalPlayed).toBe(2 * matches.length)
  })
})
