import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as XLSX from 'xlsx';
import { ClubMatchResultSource, Prisma } from '@prisma/client';
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

const DEFAULT_BONUS_TYPES = [
  { key: 'DESAFIO',  label: 'Desafío',               points: 50  },
  { key: 'LIGUILLA', label: 'Resultado de Liguilla', points: 100 },
] as const;

@Injectable()
export class RosterService {
  constructor(private prisma: PrismaService) {}

  // ─── LIST ────────────────────────────────────────────────────────────────────

  async listRoster(clubId: string, actor: ActingUser) {
    await this.assertScope(clubId, actor);
    const entries = await this.prisma.clubPlayerRoster.findMany({
      where: { clubId },
      include: {
        linkedPlayerProfile: {
          include: { user: { select: { email: true, phone: true } } },
        },
      },
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
              },
            });
            updated++;
          } else {
            await this.prisma.clubPlayerRoster.create({
              data: { clubId, ...row },
            });
            created++;
            // Attempt auto-link after import
            await this.tryAutoLinkByRut(clubId, row.rut);
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
      include: { linkedPlayerProfile: { include: { user: { select: { email: true, phone: true } } } } },
    });

    return this.formatEntry(updated);
  }

  // ─── LINKING (Part A) ────────────────────────────────────────────────────────

  /**
   * Called on registration and when a player updates their RUT.
   * Finds an unlinked roster entry in the player's home club (if set) that matches by RUT.
   * Returns the linked entry or null if no match.
   */
  async attemptRosterLink(playerProfileId: string): Promise<string | null> {
    const profile = await this.prisma.playerProfile.findUnique({
      where: { id: playerProfileId },
      select: { homeClubId: true, rut: true },
    });
    if (!profile?.homeClubId || !profile.rut) return null;
    return this.tryAutoLinkByRut(profile.homeClubId, profile.rut, playerProfileId);
  }

  private async tryAutoLinkByRut(
    clubId: string,
    rut: string,
    profileId?: string,
  ): Promise<string | null> {
    // Find unlinked roster entry with matching RUT in this club
    const rosterEntry = await this.prisma.clubPlayerRoster.findFirst({
      where: { clubId, rut, linkedPlayerProfileId: null },
    });
    if (!rosterEntry) return null;

    // Resolve the player profile if not provided
    let targetProfileId = profileId;
    if (!targetProfileId) {
      const profile = await this.prisma.playerProfile.findFirst({
        where: { rut, homeClubId: clubId },
        select: { id: true },
      });
      if (!profile) return null;
      targetProfileId = profile.id;
    }

    // Ensure this profile isn't already linked to another roster entry at this club
    const alreadyLinked = await this.prisma.clubPlayerRoster.findFirst({
      where: { clubId, linkedPlayerProfileId: targetProfileId },
    });
    if (alreadyLinked) return null;

    await this.prisma.clubPlayerRoster.update({
      where: { id: rosterEntry.id },
      data: { linkedPlayerProfileId: targetProfileId },
    });

    return rosterEntry.id;
  }

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

  private async findEntry(clubId: string, rosterId: string) {
    const entry = await this.prisma.clubPlayerRoster.findFirst({
      where: { id: rosterId, clubId },
    });
    if (!entry) throw new NotFoundException('Roster entry not found');
    return entry;
  }

  private formatEntry(entry: any) {
    const linked = entry.linkedPlayerProfile;
    return {
      id:          entry.id,
      clubId:      entry.clubId,
      firstName:   entry.firstName,
      lastName:    entry.lastName,
      fullName:    `${entry.firstName} ${entry.lastName}`,
      dateOfBirth: entry.dateOfBirth,
      rut:         entry.rut,
      division:    entry.division,
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
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

    return raw.map((row, index) => {
      const m = new Map(Object.entries(row).map(([k, v]) => [k.trim().toLowerCase().replace(/\s+/g, '_'), v]));
      const get = (...keys: string[]) => {
        for (const k of keys) if (m.has(k)) return String(m.get(k) ?? '').trim();
        return '';
      };

      const firstName = get('first_name', 'firstname', 'nombre');
      const lastName  = get('last_name',  'lastname',  'apellido', 'apellidos');
      if (!firstName || !lastName) {
        throw new BadRequestException(`Row ${index + 2}: firstName and lastName are required`);
      }

      const rawRut = get('rut', 'run');
      let rut: string | undefined;
      if (rawRut) {
        try {
          rut = validateAndNormalizeRut(rawRut);
        } catch {
          throw new BadRequestException(`Row ${index + 2}: invalid RUT "${rawRut}"`);
        }
      }

      const dobRaw = get('date_of_birth', 'dateofbirth', 'fecha_nacimiento', 'fecha nacimiento');
      let dateOfBirth: Date | undefined;
      if (dobRaw) {
        const d = new Date(dobRaw);
        if (!Number.isNaN(d.getTime())) dateOfBirth = d;
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
}
