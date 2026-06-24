/**
 * Tennis scoring validator.
 *
 * Rules implemented (standard ATP/WTA):
 *  - Set won at 6 games with 2-game lead, or 7-5
 *  - Tiebreak at 6-6 in every set except the final set of best-of-5 (where applicable)
 *  - Tiebreak: first to 7 points, win by 2
 *  - Match: best-of-3 (first to 2 sets) or best-of-5 (first to 3 sets)
 *  - For simple "final score" entry the tiebreak score is optional metadata
 */

export interface SetResult {
  p1: number; // games won by player 1
  p2: number; // games won by player 2
  tb?: { p1: number; p2: number }; // tiebreak points (optional, for recordkeeping)
}

export interface ScoreValidationResult {
  valid: boolean;
  error?: string;
  winner?: 1 | 2; // 1 = player, 2 = opponent
  setsWonByP1: number;
  setsWonByP2: number;
}

export function validateTennisScore(sets: SetResult[], bestOf: 3 | 5 = 3): ScoreValidationResult {
  if (!sets || sets.length === 0) {
    return { valid: false, error: 'At least one set is required', setsWonByP1: 0, setsWonByP2: 0 };
  }

  const setsToWin = Math.ceil(bestOf / 2); // 2 for best-of-3, 3 for best-of-5

  let setsWonByP1 = 0;
  let setsWonByP2 = 0;

  for (let i = 0; i < sets.length; i++) {
    const set = sets[i];
    const { p1, p2 } = set;

    if (!Number.isInteger(p1) || !Number.isInteger(p2) || p1 < 0 || p2 < 0) {
      return { valid: false, error: `Set ${i + 1}: game counts must be non-negative integers`, setsWonByP1, setsWonByP2 };
    }

    // Check for early termination: match should have ended before this set
    if (setsWonByP1 >= setsToWin || setsWonByP2 >= setsToWin) {
      return { valid: false, error: `Set ${i + 1}: match already decided — too many sets played`, setsWonByP1, setsWonByP2 };
    }

    const setWinner = validateSet(set, i, sets.length, bestOf);
    if (setWinner === null) {
      return {
        valid: false,
        error: `Set ${i + 1}: invalid score ${p1}-${p2}. Legal results: 6-x (x≤4), 7-5, 7-6 (tiebreak), or in a final set 6-x (x≤4) or 7-5`,
        setsWonByP1,
        setsWonByP2,
      };
    }

    if (setWinner === 1) setsWonByP1++;
    else setsWonByP2++;
  }

  // Verify that the match was actually completed (one player reached setsToWin)
  if (setsWonByP1 < setsToWin && setsWonByP2 < setsToWin) {
    return {
      valid: false,
      error: `Match incomplete: p1 won ${setsWonByP1} set(s), p2 won ${setsWonByP2} set(s); ${setsToWin} needed to win`,
      setsWonByP1,
      setsWonByP2,
    };
  }

  const winner = setsWonByP1 >= setsToWin ? 1 : 2;
  return { valid: true, winner, setsWonByP1, setsWonByP2 };
}

/**
 * Returns 1 or 2 (set winner) or null if the set score is illegal.
 * isFinalSet = set index (0-based) is the last possible set of the match.
 */
function validateSet(
  set: SetResult,
  setIndex: number,
  totalSets: number,
  bestOf: number,
): 1 | 2 | null {
  const { p1, p2 } = set;
  const maxGames = Math.max(p1, p2);
  const minGames = Math.min(p1, p2);
  const diff = maxGames - minGames;

  // Tiebreak set: 7-6
  if (maxGames === 7 && minGames === 6) {
    // Validate optional tiebreak score
    if (set.tb) {
      const tbErr = validateTiebreak(set.tb);
      if (tbErr) return null;
    }
    return p1 > p2 ? 1 : 2;
  }

  // Normal 7-5 or 6-x (x ≤ 4)
  if (maxGames === 7 && minGames === 5) return p1 > p2 ? 1 : 2;
  if (maxGames === 6 && minGames <= 4) return p1 > p2 ? 1 : 2;

  // 6-6 without a tiebreak is only illegal in standard play (should have tiebreak)
  // We treat 6-6 as invalid (the set must resolve to 7-6 or higher)
  return null;
}

function validateTiebreak(tb: { p1: number; p2: number }): string | null {
  const { p1, p2 } = tb;
  if (!Number.isInteger(p1) || !Number.isInteger(p2) || p1 < 0 || p2 < 0) {
    return 'Tiebreak points must be non-negative integers';
  }
  const maxPts = Math.max(p1, p2);
  const minPts = Math.min(p1, p2);
  const diff = maxPts - minPts;
  // First to 7, win by 2; OR extended (8-6, 9-7, etc.)
  if (maxPts < 7) return 'Tiebreak winner must reach at least 7 points';
  if (diff < 2) return 'Tiebreak must be won by at least 2 points';
  return null;
}
