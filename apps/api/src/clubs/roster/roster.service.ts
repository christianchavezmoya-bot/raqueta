import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as XLSX from 'xlsx';
import {
  ClubMatchResultSource,
  MembershipRequestStatus,
  MembershipStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ActingUser, assertClubScope } from '../../common/utils/club-scope';
import { validateAndNormalizeRut } from '../../common/utils/rut';
import { PatchRosterEntryDto } from './dto/patch-roster-entry.dto';

type RosterRow = {
  firstName: string;
  lastName: string;
  dateOfBirth?: Date;
  rut?: string;
  phone?: string;
  address?: string;
  suburb?: string;
  postcode?: string;
  city?: string;
};

// Stage 16 — 6 point-sources from the spreadsheet-to-UI architecture doc.
// Each row auto-seeds per new club. Staff can change `points` per club, and
// can issue ad-hoc positive (bonus) or negative (penalty) awards via
// ClubBonusPointAward — the schema allows any integer points.
//
// Source layout, mapped to the Ranking General breakdown card:
//   PE3     — current escalerilla (ladder) round points
//   PE2     — historical escalerilla contribution
//   INTER   — intercategoría points
//   LIG     — promotion liguilla points
//   DESAFIO — challenge match points (stake is the configurable `points`)
//   PENALTY — penalty source (negative deltas)
//
// `BASE` (PR/PREA) is computed analytically (see
// ClubRankingsService.getPlayerBreakdown) from season start snapshots + rule
// base values, not stored on ClubBonusPointType.
const DEFAULT_BONUS_TYPES = [
  { key: 'PE3',      label: 'Escalerilla actual',      points: 25 },
  { key: 'PE2',      label: 'Escalerilla histórica',   points: 0  },
  { key: 'INTER',    label: 'Intercategoría',          points: 0  },
  { key: 'LIG',      label: 'Liga Promoción',          points: 0  },
  { key: 'DESAFIO',  label: 'Desafío',                  points: 25 }, // configurable per club
  { key: 'PENALTY',  label: 'Penalización (default)',  points: -10 }, // configurable per club
] as const;

const ARCHIVE_BLOCK_MESSAGE =
  'Este jugador tiene una membresía activa. Cancela la membresía antes de archivar.';

const ARCHIVE_LINKED_WARNING =
  'Este jugador tiene cuenta en la app. Será archivado del club pero mantendrá su cuenta.';

const NON_ARCHIVABLE_MEMBERSHIP_STATUSES = new Set<MembershipStatus>([
  'ACTIVE',
  'SUSPENDED',
  'PENDING',
]);

const MEMBERSHIP_PRIORITY: Record<MembershipStatus, number> = {
  ACTIVE: 0,
  SUSPENDED: 1,
  PENDING: 2,
  EXPIRED: 3,
  CANCELLED: 4,
};

@Injectable()
export class RosterService {
  constructor(private prisma: PrismaService) {}

  // ─── LIST ────────────────────────────────────────────────────────────────────

  async listRoster(clubId: string, actor: ActingUser, options: { includeArchived?: boolean } = {}) {
    await this.assertScope(clubId, actor);
    const entries = await this.prisma.clubPlayerRoster.findMany({
      where: {
        clubId,
        ...(options.includeArchived ? {} : { deletedAt: null }),
      },
      include: this.rosterInclude(clubId),
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    return entries.map(e => this.formatEntry(e));
  }

  // ─── IMPORT (Part A) ─────────────────────────────────────────────────────────

  async importRoster(clubId: string, file: Express.Multer.File | undefined, actor: ActingUser) {
    await this.assertScope(clubId, actor);
    if (!file) throw new BadRequestException('Upload a CSV or XLSX file');

    const rows = this.parseRosterWorkbook(file.buffer);
    if (!rows.length) throw new BadRequestException('No data rows found in the file');

    let created = 0;
    let updated = 0;
    let withRut = 0;
    let withoutRut = 0;
    const errors: Array<{ row: number; reason: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2;
      const row = rows[i];

      try {
        if (row.rut) {
          withRut++;
          // Upsert by RUT
          const existing = await this.prisma.clubPlayerRoster.findFirst({
            where: { clubId, rut: row.rut },
          });
          if (existing) {
            await this.prisma.clubPlayerRoster.update({
              where: { id: existing.id },
              data: {
                firstName:   row.firstName,
                lastName:    row.lastName,
                dateOfBirth: row.dateOfBirth,
                phone:       row.phone,
                address:     row.address,
                suburb:      row.suburb,
                postcode:    row.postcode,
                city:        row.city,
                deletedAt:   null,
              },
            });
            updated++;
          } else {
            const createdRoster = await this.prisma.clubPlayerRoster.create({
              data: { clubId, ...row },
            });
            created++;

            // Attempt identity-match auto-link when an existing PlayerProfile has
            // matching (firstName, lastName, dateOfBirth). RUT is **not** used —
            // the only way the new roster row links to a profile is via the
            // identity tuple. This is best-effort; failures are silent.
            try {
              const profile = await this.prisma.playerProfile.findFirst({
                where: {
                  firstName:   row.firstName,
                  lastName:    row.lastName,
                  dateOfBirth: row.dateOfBirth,
                  homeClubId:  clubId,
                },
                select: { id: true },
              });
              if (profile) {
                await this.prisma.clubPlayerRoster.update({
                  where: { id: createdRoster.id },
                  data: { linkedPlayerProfileId: profile.id },
                });
              }
            } catch {
              /* ignore race / id-shape mismatch */
            }
          }
        } else {
          // No RUT — always insert, no dedup possible
          withoutRut++;
          await this.prisma.clubPlayerRoster.create({
            data: { clubId, ...row },
          });
          created++;
        }
      } catch (err: any) {
        errors.push({ row: rowNum, reason: err?.message ?? 'Unknown error' });
      }
    }

    await this.ensureBonusTypesSeeded(clubId);

    return {
      created,
      updated,
      errors,
      warning: withoutRut
        ? `${withoutRut} row(s) imported without a RUT — duplicate detection was not possible for these entries`
        : undefined,
    };
  }

  // ─── PATCH ───────────────────────────────────────────────────────────────────

  async patchEntry(clubId: string, rosterId: string, dto: PatchRosterEntryDto, actor: ActingUser) {
    await this.assertScope(clubId, actor);
    const entry = await this.findEntry(clubId, rosterId);

    const updateData: Prisma.ClubPlayerRosterUpdateInput = {};
    if (dto.firstName !== undefined) updateData.firstName = dto.firstName.trim();
    if (dto.lastName  !== undefined) updateData.lastName  = dto.lastName.trim();
    if (dto.dateOfBirth !== undefined) updateData.dateOfBirth = new Date(dto.dateOfBirth);
    if (dto.phone    !== undefined) updateData.phone    = dto.phone;
    if (dto.address  !== undefined) updateData.address  = dto.address;
    if (dto.suburb   !== undefined) updateData.suburb   = dto.suburb;
    if (dto.postcode !== undefined) updateData.postcode = dto.postcode;
    if (dto.city     !== undefined) updateData.city     = dto.city;
    if (dto.division !== undefined) updateData.division = dto.division;

    if (dto.rut !== undefined) {
      const normalized = validateAndNormalizeRut(dto.rut);
      // Ensure no other entry in this club already has this RUT
      const clash = await this.prisma.clubPlayerRoster.findFirst({
        where: { clubId, rut: normalized, NOT: { id: rosterId } },
      });
      if (clash) throw new ConflictException('Another roster entry at this club already has that RUT');
      updateData.rut = normalized;
    }

    if (dto.unlink) {
      updateData.linkedPlayerProfile = { disconnect: true };
    } else if (dto.linkedPlayerProfileId !== undefined) {
      if (dto.linkedPlayerProfileId === null) {
        updateData.linkedPlayerProfile = { disconnect: true };
      } else {
        const profile = await this.prisma.playerProfile.findUnique({
          where: { id: dto.linkedPlayerProfileId },
        });
        if (!profile) throw new NotFoundException('Player profile not found');
        // Check no other entry in this club is already linked to this profile
        const clash = await this.prisma.clubPlayerRoster.findFirst({
          where: { clubId, linkedPlayerProfileId: dto.linkedPlayerProfileId, NOT: { id: rosterId } },
        });
        if (clash) throw new ConflictException('Another roster entry at this club is already linked to that player');
        updateData.linkedPlayerProfile = { connect: { id: dto.linkedPlayerProfileId } };
      }
    }

    const updated = await this.prisma.clubPlayerRoster.update({
      where: { id: entry.id },
      data: updateData,
      include: this.rosterInclude(clubId),
    });

    return this.formatEntry(updated);
  }

  async archiveEntry(clubId: string, rosterId: string, actor: ActingUser) {
    await this.assertScope(clubId, actor);
    const entry = await this.findEntry(clubId, rosterId, {
      includeArchived: true,
      include: this.rosterInclude(clubId),
    });

    const blockingMembership = this.pickBlockingMembership(entry.memberships ?? []);
    if (blockingMembership) {
      throw new BadRequestException(ARCHIVE_BLOCK_MESSAGE);
    }

    const archived = await this.prisma.clubPlayerRoster.update({
      where: { id: entry.id },
      data: { deletedAt: entry.deletedAt ?? new Date() },
      include: this.rosterInclude(clubId),
    });

    return {
      entry: this.formatEntry(archived),
      warning: archived.linkedPlayerProfileId ? ARCHIVE_LINKED_WARNING : null,
    };
  }

  async restoreEntry(clubId: string, rosterId: string, actor: ActingUser) {
    await this.assertScope(clubId, actor);
    const entry = await this.findEntry(clubId, rosterId, { includeArchived: true });
    const restored = await this.prisma.clubPlayerRoster.update({
      where: { id: entry.id },
      data: { deletedAt: null },
      include: this.rosterInclude(clubId),
    });

    return {
      entry: this.formatEntry(restored),
    };
  }

  // ─── LINKING (Stage 15: name+DOB identity, not RUT) ───────────────────────

  /**
   * Find every unlinked roster entry whose (firstName, lastName, dateOfBirth)
   * matches the player's profile, **across every club**. RUT is intentionally
   * not used (sensitive personal data).
   *
   * Returns an array of candidate matches with their club context so the
   * calling code can decide whether to auto-link (single match) or surface
   * the list for the player to pick from (multiple matches, e.g. duplicate
   * names across clubs).
   */
  async findIdentityMatches(playerProfileId: string): Promise<Array<{
    rosterId: string;
    clubId: string;
    clubName: string;
    firstName: string;
    lastName: string;
    dateOfBirth: Date | null;
    division: string | null;
  }>> {
    const profile = await this.prisma.playerProfile.findUnique({
      where: { id: playerProfileId },
      select: { firstName: true, lastName: true, dateOfBirth: true },
    });
    if (!profile?.firstName || !profile.lastName || !profile.dateOfBirth) return [];

    return this.prisma.clubPlayerRoster.findMany({
      where: {
        firstName:       profile.firstName,
        lastName:        profile.lastName,
        dateOfBirth:     profile.dateOfBirth,
        deletedAt:       null,
        linkedPlayerProfileId: null,
      },
      include: { club: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    }).then(rows => rows.map(r => ({
      rosterId:    r.id,
      clubId:      r.clubId,
      clubName:    r.club.name,
      firstName:   r.firstName,
      lastName:    r.lastName,
      dateOfBirth: r.dateOfBirth,
      division:    r.division,
    })));
  }

  /**
   * Link a roster entry to a player profile. Caller is responsible for
   * confirming the player opted-in (via the new confirm-match endpoint or
   * the signup hook). Idempotent: returns the roster id whether newly
   * linked or already linked.
   */
  async linkProfileToRoster(rosterId: string, playerProfileId: string): Promise<string | null> {
    const entry = await this.prisma.clubPlayerRoster.findUnique({
      where: { id: rosterId },
      select: { clubId: true, linkedPlayerProfileId: true },
    });
    if (!entry) return null;

    // If this profile is already linked to a different roster at the same club, refuse.
    if (entry.linkedPlayerProfileId && entry.linkedPlayerProfileId !== playerProfileId) {
      throw new BadRequestException('Esa fila de roster ya está vinculada a otra cuenta.');
    }
    if (entry.linkedPlayerProfileId === playerProfileId) return rosterId;

    // Verify there's no clash: same profile not already linked to another roster at this club.
    const clash = await this.prisma.clubPlayerRoster.findFirst({
      where: { clubId: entry.clubId, linkedPlayerProfileId: playerProfileId, NOT: { id: rosterId } },
    });
    if (clash) {
      throw new BadRequestException('Ya tienes otra fila de roster en este club.');
    }

    await this.prisma.clubPlayerRoster.update({
      where: { id: rosterId },
      data: { linkedPlayerProfileId: playerProfileId },
    });
    return rosterId;
  }

  /**
   * (Removed for correctness — see /players/me/club-matches/:rosterId/confirm.)
   *
   * Earlier this function silently called linkProfileToRoster() for every
   * identity match it found. That violated the "consequential action requires
   * confirmation" invariant: linking one account to another's club membership
   * without the player ever clicking "yes".
   *
   * Replaced by the player-driven flow: callers now surface candidates via
   * findIdentityMatches() (returned in GET /players/me/affiliations) and
   * the player confirms each match explicitly via
   * POST /players/me/club-matches/:rosterId/confirm, which is the ONLY path
   * that calls linkProfileToRoster() for the identity-matching flow.
   *
   * The intentional auto-link paths that survive (and are correct because
   * a human staff/admin initiates them) are:
   *   - roster import upsert + same-club home-club identity match (staff CSV upload)
   *   - login/signup flow (user explicitly creates an account)
   */

  // ─── WITHDRAW (Part E) ───────────────────────────────────────────────────────

  async withdraw(clubId: string, rosterId: string, seasonId: string, actor: ActingUser) {
    await this.assertScope(clubId, actor);
    await this.findEntry(clubId, rosterId);

    // Verify season belongs to this club and is active
    const season = await this.prisma.rankingSeason.findUnique({ where: { id: seasonId } });
    if (!season || season.clubId !== clubId) throw new NotFoundException('Season not found');
    if (season.status !== 'ACTIVE') throw new BadRequestException('Season is not active');

    // Mark this entry as withdrawn
    const entry = await this.prisma.clubRankingEntry.findFirst({
      where: { clubId, seasonId, rosterId },
    });
    if (!entry) throw new NotFoundException('Ranking entry not found for this player in this season');
    if (entry.withdrawn) throw new BadRequestException('Player is already withdrawn this season');

    await this.prisma.clubRankingEntry.update({
      where: { id: entry.id },
      data: { withdrawn: true },
    });

    // Find all other roster members in the same division who haven't played this player yet this season
    const division = entry.division;
    const opponents = await this.prisma.clubRankingEntry.findMany({
      where: {
        clubId,
        seasonId,
        rosterId: { not: rosterId },
        withdrawn: false,
        ...(division ? { division } : {}),
      },
      select: { rosterId: true, rosterEntry: { select: { firstName: true, lastName: true } } },
    });

    // Ensure RETIRO_LESION category exists
    await this.ensureRetiroCategory(clubId);

    const withdrawnEntry = await this.prisma.clubPlayerRoster.findUnique({
      where: { id: rosterId },
      select: { firstName: true, lastName: true },
    });
    const withdrawnName = withdrawnEntry
      ? `${withdrawnEntry.firstName} ${withdrawnEntry.lastName}`
      : 'Retirado';

    const staffUserId = actor.id;
    const now = new Date();
    let autoResults = 0;

    for (const opp of opponents) {
      // Check if a match already exists between these two players this season
      const existing = await this.prisma.clubMatchResult.findFirst({
        where: {
          clubId,
          seasonId,
          OR: [
            { winnerRosterId: rosterId, loserRosterId: opp.rosterId },
            { winnerRosterId: opp.rosterId, loserRosterId: rosterId },
          ],
        },
      });
      if (existing) continue;

      const oppName = `${opp.rosterEntry.firstName} ${opp.rosterEntry.lastName}`;
      await this.prisma.clubMatchResult.create({
        data: {
          clubId,
          seasonId,
          winnerRosterId:  opp.rosterId,
          winnerNameRaw:   oppName,
          loserRosterId:   rosterId,
          loserNameRaw:    withdrawnName,
          categoryKey:     'RETIRO_LESION',
          recordedAt:      now,
          source:          ClubMatchResultSource.MANUAL,
          enteredByUserId: staffUserId,
        },
      });
      autoResults++;
    }

    return {
      withdrawn: rosterId,
      autoResultsCreated: autoResults,
      message: `Player marked as withdrawn. ${autoResults} automatic RETIRO_LESION result(s) created.`,
    };
  }

  // ─── INTERNAL HELPERS ────────────────────────────────────────────────────────

  async ensureBonusTypesSeeded(clubId: string) {
    const count = await this.prisma.clubBonusPointType.count({ where: { clubId } });
    if (count > 0) return;
    await this.prisma.clubBonusPointType.createMany({
      data: DEFAULT_BONUS_TYPES.map(t => ({ ...t, clubId })),
      skipDuplicates: true,
    });
  }

  private async ensureRetiroCategory(clubId: string) {
    const exists = await this.prisma.clubRankingRule.findUnique({
      where: { clubId_categoryKey: { clubId, categoryKey: 'RETIRO_LESION' } },
    });
    if (!exists) {
      await this.prisma.clubRankingRule.create({
        data: {
          clubId,
          categoryKey:  'RETIRO_LESION',
          label:        'Retiro por lesión / inasistencia',
          winnerPoints: 100,
          loserPoints:  0,
          active:       true,
        },
      });
    }
  }

  private async assertScope(clubId: string, actor: ActingUser) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId }, select: { id: true } });
    if (!club) throw new NotFoundException('Club not found');
    await assertClubScope(actor, clubId, this.prisma);
  }

  private async findEntry(
    clubId: string,
    rosterId: string,
    options: {
      includeArchived?: boolean;
      include?: Prisma.ClubPlayerRosterInclude;
    } = {},
  ) {
    const entry = await this.prisma.clubPlayerRoster.findFirst({
      where: {
        id: rosterId,
        clubId,
        ...(options.includeArchived ? {} : { deletedAt: null }),
      },
      include: options.include,
    });
    if (!entry) throw new NotFoundException('Roster entry not found');
    return entry;
  }

  private rosterInclude(clubId: string) {
    return {
      linkedPlayerProfile: {
        include: {
          user: {
            select: {
              email: true,
              phone: true,
              membershipRequests: {
                where: {
                  clubId,
                  status: MembershipRequestStatus.PENDING,
                },
                select: {
                  id: true,
                  status: true,
                  requestedAt: true,
                  plan: {
                    select: {
                      id: true,
                      name: true,
                      billingPeriod: true,
                    },
                  },
                },
                orderBy: { requestedAt: 'desc' },
                take: 1,
              },
            },
          },
        },
      },
      memberships: {
        include: { plan: true },
        orderBy: [{ createdAt: 'desc' }, { startDate: 'desc' }],
      },
    } satisfies Prisma.ClubPlayerRosterInclude;
  }

  private pickBlockingMembership(memberships: Array<{ status: MembershipStatus }>) {
    return memberships.find(membership => NON_ARCHIVABLE_MEMBERSHIP_STATUSES.has(membership.status));
  }

  private pickCurrentMembership(memberships: any[] = []) {
    if (!memberships.length) return null;
    return [...memberships].sort((left, right) => {
      const priority = MEMBERSHIP_PRIORITY[left.status] - MEMBERSHIP_PRIORITY[right.status];
      if (priority !== 0) return priority;
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    })[0];
  }

  private formatEntry(entry: any) {
    const linked = entry.linkedPlayerProfile;
    const pendingRequest = linked?.user?.membershipRequests?.[0] ?? null;
    const currentMembership = this.pickCurrentMembership(entry.memberships);
    const membershipStatus =
      currentMembership?.status
      ?? (pendingRequest ? MembershipStatus.PENDING : null);

    return {
      id:          entry.id,
      clubId:      entry.clubId,
      firstName:   entry.firstName,
      lastName:    entry.lastName,
      fullName:    `${entry.firstName} ${entry.lastName}`,
      dateOfBirth: entry.dateOfBirth,
      rut:         entry.rut,
      phone:       entry.phone,
      division:    entry.division,
      deletedAt:   entry.deletedAt,
      archived:    !!entry.deletedAt,
      membershipStatus,
      currentMembership: currentMembership
        ? {
            id: currentMembership.id,
            planId: currentMembership.planId,
            planName: currentMembership.plan?.name ?? null,
            billingPeriod: currentMembership.plan?.billingPeriod ?? null,
            status: currentMembership.status,
            startDate: currentMembership.startDate,
            endDate: currentMembership.endDate,
            lastPaymentDate: currentMembership.lastPaymentDate,
            nextPaymentDue: currentMembership.nextPaymentDue,
            paymentNotes: currentMembership.paymentNotes,
          }
        : null,
      pendingMembershipRequest: pendingRequest
        ? {
            id: pendingRequest.id,
            status: pendingRequest.status,
            requestedAt: pendingRequest.requestedAt,
            planId: pendingRequest.plan?.id ?? null,
            planName: pendingRequest.plan?.name ?? null,
            billingPeriod: pendingRequest.plan?.billingPeriod ?? null,
          }
        : null,
      // Imported contact fields — permanent audit trail
      imported: {
        phone:    entry.phone,
        address:  entry.address,
        suburb:   entry.suburb,
        postcode: entry.postcode,
        city:     entry.city,
      },
      // Live data from linked profile (preferred for staff views when available)
      live: linked
        ? {
            playerProfileId: linked.id,
            email:           linked.user?.email,
            phone:           linked.user?.phone ?? entry.phone,
            displayName:     linked.displayName,
            profilePhotoUrl: linked.profilePhotoUrl,
          }
        : null,
      linked: !!linked,
    };
  }

  // ─── CSV/XLSX PARSER ─────────────────────────────────────────────────────────

  private parseRosterWorkbook(buffer: Buffer): RosterRow[] {
    // CSV path: parse UTF-8 directly so we don't double-encode accented names.
    // The xlsx library re-encodes CSV bytes as latin-1, which corrupts
    // characters like Renée, María, Peña. Skip xlsx for CSV files entirely.
    const looksLikeCsv = looksLikeCsvFile(buffer);
    if (looksLikeCsv) {
      const text = stripBom(buffer).toString('utf8');
      const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
      if (lines.length < 2) return [];
      const headerCells = splitCsvLine(lines[0]);
      return lines.slice(1).map((line, i) => this.rosterCsvRowToObject(headerCells, splitCsvLine(line), i));
    }

    // XLSX path — strip a UTF-8 BOM before parsing.
    const clean = stripBom(buffer);
    const wb = XLSX.read(clean, { type: 'buffer', cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

    return raw.map((row, index) => {
      const m = new Map(Object.entries(row).map(([k, v]) => [k.trim().toLowerCase().replace(/\s+/g, '_'), v]));
      const get = (...keys: string[]) => {
        for (const k of keys) if (m.has(k)) return String(m.get(k) ?? '').trim();
        return '';
      };

      const firstName = get('first_name', 'firstname', 'nombre', 'nombres');
      const lastName  = get('last_name',  'lastname',  'apellido', 'apellidos');
      if (!firstName || !lastName) {
        throw new BadRequestException(`Row ${index + 2}: firstName and lastName are required`);
      }

      const dobRaw = get('date_of_birth', 'dateofbirth', 'fecha_nacimiento', 'fecha nacimiento');
      if (!dobRaw) {
        throw new BadRequestException(
          `Row ${index + 2}: dateOfBirth is required (column: fechaNacimiento / date_of_birth)`,
        );
      }
      const d = new Date(dobRaw);
      if (Number.isNaN(d.getTime())) {
        throw new BadRequestException(`Row ${index + 2}: invalid dateOfBirth "${dobRaw}"`);
      }
      const dateOfBirth: Date = d;

      const rawRut = get('rut', 'run');
      let rut: string | undefined;
      if (rawRut) {
        try {
          rut = validateAndNormalizeRut(rawRut);
        } catch {
          throw new BadRequestException(`Row ${index + 2}: invalid RUT "${rawRut}"`);
        }
      }

      return {
        firstName,
        lastName,
        dateOfBirth,
        rut,
        phone:    get('phone', 'telefono', 'celular') || undefined,
        address:  get('address', 'direccion') || undefined,
        suburb:   get('suburb', 'comuna') || undefined,
        postcode: get('postcode', 'codigo_postal', 'zip') || undefined,
        city:     get('city', 'ciudad') || undefined,
      };
    });
  }

  private rosterCsvRowToObject(headerCells: string[], cells: string[], index: number): RosterRow {
    const m = new Map(headerCells.map((h, idx) => [normalizeHeaderKey(h), cells[idx] ?? '']));
    const get = (...keys: string[]) => {
      for (const k of keys) {
        const v = m.get(k);
        if (v !== undefined && v !== '') return String(v).trim();
      }
      return '';
    };

    const firstName = get('first_name', 'firstname', 'nombre', 'nombres');
    const lastName  = get('last_name',  'lastname',  'apellido', 'apellidos');
    if (!firstName || !lastName) {
      throw new BadRequestException(`Row ${index + 2}: firstName and lastName are required`);
    }

    const dobRaw = get('date_of_birth', 'dateofbirth', 'fecha_nacimiento', 'fecha nacimiento');
    if (!dobRaw) {
      throw new BadRequestException(
        `Row ${index + 2}: dateOfBirth is required (column: fechaNacimiento / date_of_birth)`,
      );
    }
    const d = new Date(dobRaw);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`Row ${index + 2}: invalid dateOfBirth "${dobRaw}"`);
    }
    const dateOfBirth: Date = d;

    const rawRut = get('rut', 'run');
    let rut: string | undefined;
    if (rawRut) {
      try {
        rut = validateAndNormalizeRut(rawRut);
      } catch {
        throw new BadRequestException(`Row ${index + 2}: invalid RUT "${rawRut}"`);
      }
    }

    return {
      firstName,
      lastName,
      dateOfBirth,
      rut,
      phone:    get('phone', 'telefono', 'celular') || undefined,
      address:  get('address', 'direccion') || undefined,
      suburb:   get('suburb', 'comuna') || undefined,
      postcode: get('postcode', 'codigo_postal', 'zip') || undefined,
      city:     get('city', 'ciudad') || undefined,
    };
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

function stripBom(buffer: Buffer): Buffer {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3);
  }
  return buffer;
}

function looksLikeCsvFile(buffer: Buffer): boolean {
  const head = buffer.subarray(0, 4096).toString('utf8', 0, Math.min(buffer.length, 4096));
  if (head.includes('PK\x03\x04')) return false; // xlsx zip signature
  return /^[\s\S]{0,2000},/.test(head);
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else {
      if (ch === ',') { out.push(cur); cur = ''; }
      else if (ch === '"') inQuotes = true;
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function normalizeHeaderKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '_');
}
