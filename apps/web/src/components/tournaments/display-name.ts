import type { RosterLike } from './player-type';

interface NameSource extends RosterLike {
  firstName?: string | null;
  lastName?: string | null;
}

/**
 * Best-effort display name for a roster entry. Matches the resolver used by
 * the API's `getBracket` so the web bracket shows the same names as the
 * mobile app — prefer `linkedPlayerProfile.displayName`, fall back to the
 * stored first/last name, then to "Jugador".
 */
export function rosterDisplayName(roster?: NameSource | null): string {
  if (!roster) return 'TBD';
  const fromProfile = roster.linkedPlayerProfile?.displayName?.trim();
  if (fromProfile) return fromProfile;
  const composed = `${roster.firstName ?? ''} ${roster.lastName ?? ''}`.trim();
  if (composed) return composed;
  return roster.id ? 'Jugador' : 'TBD';
}

interface TeamLike {
  id?: string;
  player1Roster?: NameSource | null;
  player2Roster?: NameSource | null;
}

/** "Player A / Player B" — used in doubles brackets and match cards. */
export function teamDisplayName(team?: TeamLike | null): string {
  if (!team) return 'TBD';
  return `${rosterDisplayName(team.player1Roster)} / ${rosterDisplayName(team.player2Roster)}`;
}