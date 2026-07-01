// ─── Player classification ───────────────────────────────────────────────────
// Every player that appears anywhere in the tournament UI is classified into
// one of four buckets so staff can tell at a glance who's a paying socio,
// who's using the app without being a member, who's a paper/legacy roster
// entry, and who registered via the app but hasn't been linked to a roster
// yet. The classification is computed entirely client-side from the data the
// tournament detail and bracket endpoints already return (plus the
// `memberships` array stamped onto every roster entry by the API).

export type PlayerType = 'SOCIO' | 'CASUAL' | 'EXTERNO' | 'SIN_VINCULAR';

export interface RosterLike {
  id?: string;
  linkedPlayerProfileId?: string | null;
  linkedPlayerProfile?: { id?: string; displayName?: string; user?: { id?: string; email?: string } | null } | null;
  memberships?: Array<{ id?: string; status?: string }>;
}

export interface PlayerTypeInfo {
  type: PlayerType;
  label: string;
  /** Tailwind-compatible background / text color classes. */
  color: string;
  /** Short tooltip text. */
  hint: string;
}

const COLORS: Record<PlayerType, string> = {
  SOCIO: 'bg-green-50 text-green-700 ring-1 ring-green-200',
  CASUAL: 'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200',
  EXTERNO: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  SIN_VINCULAR: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200',
};

/**
 * Classify a roster-shaped object. Returns the EXTERNO bucket as a safe
 * default whenever the input is missing or undefined — that mirrors the
 * "staff-added with no app account" reality on the back end.
 */
export function classifyRoster(roster?: RosterLike | null): PlayerTypeInfo {
  if (!roster) {
    return info('SIN_VINCULAR');
  }
  const hasActiveMembershipHere = (roster.memberships ?? []).some(
    m => (m.status ?? '').toUpperCase() === 'ACTIVE',
  );
  if (hasActiveMembershipHere) return info('SOCIO');
  if (roster.linkedPlayerProfileId || roster.linkedPlayerProfile?.id) {
    return info('CASUAL');
  }
  return info('EXTERNO');
}

function info(type: PlayerType): PlayerTypeInfo {
  switch (type) {
    case 'SOCIO':
      return { type, label: 'Socio', color: COLORS.SOCIO, hint: 'Socio activo del club (membresía vigente)' };
    case 'CASUAL':
      return { type, label: 'Casual', color: COLORS.CASUAL, hint: 'Tiene cuenta en la app pero no es socio del club' };
    case 'EXTERNO':
      return { type, label: 'Externo', color: COLORS.EXTERNO, hint: 'Inscrito por staff — sin cuenta en la app' };
    case 'SIN_VINCULAR':
      return { type, label: 'Sin vincular', color: COLORS.SIN_VINCULAR, hint: 'Registrado por app, sin roster confirmado' };
  }
}

/**
 * Convenience helper for the tournament cards/list pages: returns the same
 * string we render in the chip but without any markup. Used when we only
 * need to count buckets ("8 socios · 3 casuals · 2 externos").
 */
export function classifyLabel(roster?: RosterLike | null): string {
  return classifyRoster(roster).label;
}

/**
 * Whether a roster entry can receive push notifications through the
 * `notifyOpen` flow. EXTERNO players have no linked user account so the
 * mobile app push will never reach them; staff has to follow up manually.
 */
export function hasAppAccount(roster?: RosterLike | null): boolean {
  if (!roster) return false;
  return Boolean(roster.linkedPlayerProfileId || roster.linkedPlayerProfile?.id);
}