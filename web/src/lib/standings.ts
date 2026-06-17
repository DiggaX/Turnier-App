export interface StandingRow {
  participantId: string
  played: number
  wins: number
  losses: number
  scoreFor: number
  scoreAgainst: number
  diff: number
}

export interface DoneMatch {
  participantAId: string
  participantBId: string
  scoreA: number
  scoreB: number
}

export function computeStandings(matches: DoneMatch[]): StandingRow[] {
  const rowMap = new Map<string, StandingRow>()
  const insertionOrder: string[] = []

  function getOrCreate(id: string): StandingRow {
    if (!rowMap.has(id)) {
      insertionOrder.push(id)
      rowMap.set(id, {
        participantId: id,
        played: 0,
        wins: 0,
        losses: 0,
        scoreFor: 0,
        scoreAgainst: 0,
        diff: 0,
      })
    }
    return rowMap.get(id)!
  }

  for (const match of matches) {
    const a = getOrCreate(match.participantAId)
    const b = getOrCreate(match.participantBId)

    a.played += 1
    b.played += 1

    a.scoreFor += match.scoreA
    a.scoreAgainst += match.scoreB
    b.scoreFor += match.scoreB
    b.scoreAgainst += match.scoreA

    if (match.scoreA > match.scoreB) {
      a.wins += 1
      b.losses += 1
    } else {
      b.wins += 1
      a.losses += 1
    }

    a.diff = a.scoreFor - a.scoreAgainst
    b.diff = b.scoreFor - b.scoreAgainst
  }

  // Stable sort: JS Array.prototype.sort is stable, so equal keys preserve insertion order
  const rows = insertionOrder.map((id) => rowMap.get(id)!)
  rows.sort((x, y) => {
    if (y.wins !== x.wins) return y.wins - x.wins
    if (y.diff !== x.diff) return y.diff - x.diff
    return y.scoreFor - x.scoreFor
  })

  return rows
}
