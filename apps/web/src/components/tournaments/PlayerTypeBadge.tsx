'use client';

import { classifyRoster, type RosterLike } from './player-type';

interface Props {
  roster?: RosterLike | null;
  /** Optional override label (e.g. "Sin app" for the EXTERNO badge in the app-status column). */
  label?: string;
  /** Hide the tooltip wrapper if you're rendering the badge in a tight list. */
  showHint?: boolean;
  /** Render a slightly larger / more prominent pill (used in standings tables). */
  size?: 'sm' | 'md';
}

/**
 * Color-coded player-type pill. Used everywhere a player name shows up in the
 * tournament UI — inscriptions, bracket, matches, standings, challenge lists.
 * Color rules (kept consistent with the mobile app):
 *   SOCIO      → green   (active membership at this club)
 *   CASUAL     → yellow  (linked app account, no membership)
 *   EXTERNO    → blue    (roster entry, no app account)
 *   SIN_VINCULAR → grey  (registered via app, no roster link)
 */
export default function PlayerTypeBadge({ roster, label, showHint = true, size = 'sm' }: Props) {
  const info = classifyRoster(roster);
  const text = label ?? info.label;
  const sizeClasses =
    size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[11px]';

  const pill = (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${info.color} ${sizeClasses}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {text}
    </span>
  );

  if (!showHint) return pill;
  return (
    <span className="inline-flex" title={info.hint}>
      {pill}
    </span>
  );
}