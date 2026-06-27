import { PrismaClient, Role, SurfaceType, BillingPeriod } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Pre-hash all passwords so update: blocks can self-heal stale rows
  const [
    superAdminHash,
    adminHash,
    managerHash,
    receptionHash,
    instructorHash,
    playerHash,
    casualHash,
  ] = await Promise.all([
    bcrypt.hash('SuperAdmin123!', 12),
    bcrypt.hash('Admin123!', 12),
    bcrypt.hash('Manager123!', 12),
    bcrypt.hash('Reception123!', 12),
    bcrypt.hash('Instructor123!', 12),
    bcrypt.hash('Player123!', 12),
    bcrypt.hash('Player123!', 12),
  ]);

  // ─── SUPER ADMIN ─────────────────────────────────────────────────────────────
  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@raqueta.app' },
    update: { passwordHash: superAdminHash, status: 'ACTIVE' },
    create: {
      email: 'superadmin@raqueta.app',
      passwordHash: superAdminHash,
      role: Role.SUPER_ADMIN,
      phone: '+56900000001',
      status: 'ACTIVE',
    },
  });
  console.log('✅ Super admin created:', superAdmin.email);

  // ─── CLUB ADMIN ──────────────────────────────────────────────────────────────
  const clubAdmin = await prisma.user.upsert({
    where: { email: 'admin@clubtenislascondes.cl' },
    update: { passwordHash: adminHash, status: 'ACTIVE' },
    create: {
      email: 'admin@clubtenislascondes.cl',
      passwordHash: adminHash,
      role: Role.CLUB_ADMIN,
      phone: '+56911111111',
      status: 'ACTIVE',
    },
  });
  console.log('✅ Club admin created:', clubAdmin.email);

  // ─── MANAGER ─────────────────────────────────────────────────────────────────
  const manager = await prisma.user.upsert({
    where: { email: 'manager@clubtenislascondes.cl' },
    update: { passwordHash: managerHash, status: 'ACTIVE' },
    create: {
      email: 'manager@clubtenislascondes.cl',
      passwordHash: managerHash,
      role: Role.MANAGER,
      phone: '+56922222222',
      status: 'ACTIVE',
    },
  });

  // ─── RECEPTION ───────────────────────────────────────────────────────────────
  const reception = await prisma.user.upsert({
    where: { email: 'recepcion@clubtenislascondes.cl' },
    update: { passwordHash: receptionHash, status: 'ACTIVE' },
    create: {
      email: 'recepcion@clubtenislascondes.cl',
      passwordHash: receptionHash,
      role: Role.RECEPTION,
      phone: '+56933333333',
      status: 'ACTIVE',
    },
  });

  // ─── INSTRUCTOR ──────────────────────────────────────────────────────────────
  const instructorUser = await prisma.user.upsert({
    where: { email: 'profe.garcia@clubtenislascondes.cl' },
    update: { passwordHash: instructorHash, status: 'ACTIVE' },
    create: {
      email: 'profe.garcia@clubtenislascondes.cl',
      passwordHash: instructorHash,
      role: Role.INSTRUCTOR,
      phone: '+56944444444',
      status: 'ACTIVE',
    },
  });

  // ─── PLAYERS ─────────────────────────────────────────────────────────────────
  const player1 = await prisma.user.upsert({
    where: { email: 'juan.perez@gmail.com' },
    update: { passwordHash: playerHash, status: 'ACTIVE' },
    create: {
      email: 'juan.perez@gmail.com',
      passwordHash: playerHash,
      role: Role.PLAYER,
      phone: '+56955555555',
      status: 'ACTIVE',
    },
  });

  const player2 = await prisma.user.upsert({
    where: { email: 'maria.lopez@gmail.com' },
    update: { passwordHash: playerHash, status: 'ACTIVE' },
    create: {
      email: 'maria.lopez@gmail.com',
      passwordHash: playerHash,
      role: Role.PLAYER,
      phone: '+56966666666',
      status: 'ACTIVE',
    },
  });

  const player3 = await prisma.user.upsert({
    where: { email: 'carlos.silva@gmail.com' },
    update: { passwordHash: playerHash, status: 'ACTIVE' },
    create: {
      email: 'carlos.silva@gmail.com',
      passwordHash: playerHash,
      role: Role.MEMBER,
      phone: '+56977777777',
      status: 'ACTIVE',
    },
  });

  const casualUser = await prisma.user.upsert({
    where: { email: 'casual@gmail.com' },
    update: { passwordHash: casualHash, status: 'ACTIVE' },
    create: {
      email: 'casual@gmail.com',
      passwordHash: casualHash,
      role: Role.CASUAL_USER,
      phone: '+56988888888',
      status: 'ACTIVE',
    },
  });

  // ─── CLUB ────────────────────────────────────────────────────────────────────
  const club = await prisma.club.upsert({
    where: { slug: 'club-tenis-las-condes' },
    update: {},
    create: {
      name: 'Club de Tenis Las Condes',
      slug: 'club-tenis-las-condes',
      ownerUserId: clubAdmin.id,
      status: 'ACTIVE',
      profile: {
        create: {
          description: 'El mejor club de tenis en Las Condes. Instalaciones de primer nivel con canchas de arcilla y superficie dura.',
          address: 'Av. Las Condes 12500',
          city: 'Las Condes',
          region: 'Región Metropolitana',
          country: 'Chile',
          latitude: -33.4072,
          longitude: -70.5658,
          phone: '+56222345678',
          whatsapp: '+56222345678',
          email: 'contacto@clubtenislascondes.cl',
          instagram: '@clubtenislascondes',
          website: 'https://clubtenislascondes.cl',
          rules: '1. Respetar los horarios de reserva\n2. Usar ropa de tenis adecuada\n3. Dejar la cancha limpia',
          cancellationPolicy: 'Cancelación gratuita hasta 24 horas antes. Después se cobra el 50% del valor.',
          paymentMethods: ['MANUAL_CASH', 'MANUAL_CARD', 'MANUAL_TRANSFER'],
        },
      },
    },
    include: { profile: true },
  });
  console.log('✅ Club created:', club.name);

  // ─── STAFF CLUB AFFILIATION ──────────────────────────────────────────────────
  await prisma.user.update({ where: { id: clubAdmin.id }, data: { staffClubId: club.id } });
  await prisma.user.update({ where: { id: manager.id }, data: { staffClubId: club.id } });
  await prisma.user.update({ where: { id: reception.id }, data: { staffClubId: club.id } });
  await prisma.user.update({ where: { id: instructorUser.id }, data: { staffClubId: club.id } });
  console.log('✅ Staff club affiliations set');

  // ─── OPENING HOURS ───────────────────────────────────────────────────────────
  const openingHours = [
    { dayOfWeek: 0, openTime: '08:00', closeTime: '20:00', isClosed: false },
    { dayOfWeek: 1, openTime: '07:00', closeTime: '22:00', isClosed: false },
    { dayOfWeek: 2, openTime: '07:00', closeTime: '22:00', isClosed: false },
    { dayOfWeek: 3, openTime: '07:00', closeTime: '22:00', isClosed: false },
    { dayOfWeek: 4, openTime: '07:00', closeTime: '22:00', isClosed: false },
    { dayOfWeek: 5, openTime: '07:00', closeTime: '22:00', isClosed: false },
    { dayOfWeek: 6, openTime: '08:00', closeTime: '20:00', isClosed: false },
  ];

  await prisma.clubOpeningHour.deleteMany({ where: { clubId: club.id } });
  await prisma.clubOpeningHour.createMany({
    data: openingHours.map(h => ({ ...h, clubId: club.id })),
  });
  console.log('✅ Opening hours set');

  // ─── COURTS ──────────────────────────────────────────────────────────────────
  const courts = await Promise.all([
    prisma.court.upsert({
      where: { id: 'court-1-seed' },
      update: {},
      create: {
        id: 'court-1-seed',
        clubId: club.id,
        name: 'Cancha Central',
        description: 'Nuestra cancha principal con gradas para espectadores',
        surfaceType: SurfaceType.CLAY,
        indoor: false,
        lighting: true,
        active: true,
        pricing: {
          create: [
            { userType: 'CASUAL', price: 20000, currency: 'CLP', peakPrice: 25000, offPeakPrice: 15000 },
            { userType: 'MEMBER', price: 12000, currency: 'CLP', peakPrice: 15000, offPeakPrice: 10000 },
          ],
        },
      },
    }),
    prisma.court.upsert({
      where: { id: 'court-2-seed' },
      update: {},
      create: {
        id: 'court-2-seed',
        clubId: club.id,
        name: 'Cancha 2',
        surfaceType: SurfaceType.CLAY,
        indoor: false,
        lighting: true,
        active: true,
        pricing: {
          create: [
            { userType: 'CASUAL', price: 18000, currency: 'CLP' },
            { userType: 'MEMBER', price: 11000, currency: 'CLP' },
          ],
        },
      },
    }),
    prisma.court.upsert({
      where: { id: 'court-3-seed' },
      update: {},
      create: {
        id: 'court-3-seed',
        clubId: club.id,
        name: 'Cancha Cubierta',
        description: 'Cancha techada para jugar en cualquier clima',
        surfaceType: SurfaceType.HARD,
        indoor: true,
        lighting: true,
        active: true,
        pricing: {
          create: [
            { userType: 'CASUAL', price: 25000, currency: 'CLP' },
            { userType: 'MEMBER', price: 16000, currency: 'CLP' },
          ],
        },
      },
    }),
  ]);
  console.log('✅ Courts created:', courts.length);

  // ─── INSTRUCTOR ──────────────────────────────────────────────────────────────
  const instructor = await prisma.instructor.upsert({
    where: { id: 'instructor-1-seed' },
    update: {},
    create: {
      id: 'instructor-1-seed',
      clubId: club.id,
      userId: instructorUser.id,
      name: 'Prof. Roberto García',
      bio: 'Ex-jugador profesional con 15 años de experiencia como instructor certificado por la Federación de Tenis de Chile.',
      experienceYears: 15,
      specialties: ['Técnica base', 'Juego de fondo', 'Servicio'],
      certifications: ['FTECH Nivel 3', 'ITF Coach Level 2'],
      hourlyRate: 30000,
      active: true,
      availability: {
        create: [
          { dayOfWeek: 1, startTime: '08:00', endTime: '12:00' },
          { dayOfWeek: 1, startTime: '15:00', endTime: '19:00' },
          { dayOfWeek: 2, startTime: '08:00', endTime: '12:00' },
          { dayOfWeek: 3, startTime: '08:00', endTime: '12:00' },
          { dayOfWeek: 3, startTime: '15:00', endTime: '19:00' },
          { dayOfWeek: 4, startTime: '08:00', endTime: '12:00' },
          { dayOfWeek: 5, startTime: '08:00', endTime: '13:00' },
        ],
      },
    },
  });
  console.log('✅ Instructor created:', instructor.name);

  // ─── MEMBERSHIP PLANS ────────────────────────────────────────────────────────
  const plans = await Promise.all([
    prisma.membershipPlan.upsert({
      where: { id: 'plan-casual-seed' },
      update: {},
      create: {
        id: 'plan-casual-seed',
        clubId: club.id,
        name: 'Casual',
        description: 'Sin compromiso. Reserva cuando quieras.',
        price: 0,
        billingPeriod: BillingPeriod.MONTHLY,
        benefits: ['Reserva en línea', 'Tarifa casual'],
        active: true,
      },
    }),
    prisma.membershipPlan.upsert({
      where: { id: 'plan-mensual-seed' },
      update: {},
      create: {
        id: 'plan-mensual-seed',
        clubId: club.id,
        name: 'Socio Mensual',
        description: 'Acceso ilimitado con descuentos especiales',
        price: 45000,
        billingPeriod: BillingPeriod.MONTHLY,
        benefits: ['Tarifa socio', '2 clases grupales/mes', 'Vestuario premium', 'Acceso a torneos'],
        active: true,
      },
    }),
    prisma.membershipPlan.upsert({
      where: { id: 'plan-anual-seed' },
      update: {},
      create: {
        id: 'plan-anual-seed',
        clubId: club.id,
        name: 'Socio Anual',
        description: 'La mejor opción para jugadores frecuentes',
        price: 450000,
        billingPeriod: BillingPeriod.ANNUAL,
        benefits: ['Tarifa socio', '4 clases grupales/mes', 'Vestuario premium', 'Acceso a torneos', 'Prioridad en reservas'],
        active: true,
      },
    }),
  ]);
  console.log('✅ Membership plans created:', plans.length);

  // ─── PLAYER PROFILES ─────────────────────────────────────────────────────────
  for (const [user, name, level] of [
    [player1, 'Juan Pérez', 'INTERMEDIATE'],
    [player2, 'María López', 'BEGINNER'],
    [player3, 'Carlos Silva', 'ADVANCED'],
    [casualUser, 'Usuario Casual', 'BEGINNER'],
  ] as const) {
    const existing = await prisma.playerProfile.findUnique({ where: { userId: user.id } });
    if (!existing) {
      const profile = await prisma.playerProfile.create({
        data: {
          userId: user.id,
          displayName: name,
          level: level as any,
          homeClubId: club.id,
          publicVisibility: true,
        },
      });
      await prisma.playerStats.create({ data: { playerId: profile.id } });
    }
  }
  console.log('✅ Player profiles created');

  // ─── MEMBERSHIP FOR player3 ──────────────────────────────────────────────────
  const existing = await prisma.membership.findFirst({ where: { userId: player3.id, clubId: club.id } });
  if (!existing) {
    await prisma.membership.create({
      data: {
        userId: player3.id,
        clubId: club.id,
        planId: plans[1].id,
        status: 'ACTIVE',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
  }
  console.log('✅ Membership assigned to Carlos Silva');

  // ─── DEMO TOURNAMENT ─────────────────────────────────────────────────────────
  const existingTournament = await prisma.tournament.findFirst({ where: { clubId: club.id, name: 'Torneo Apertura 2026' } });
  if (!existingTournament) {
    const tournament = await prisma.tournament.create({
      data: {
        clubId: club.id,
        name: 'Torneo Apertura 2026',
        description: 'Primer torneo del año. Categorías masculina y femenina.',
        startDate: new Date('2026-07-01'),
        endDate: new Date('2026-07-15'),
        registrationOpenDate: new Date('2026-06-20'),
        registrationCloseDate: new Date('2026-06-28'),
        status: 'REGISTRATION_OPEN',
        format: 'SINGLE_ELIMINATION',
        price: 15000,
        maxPlayers: 32,
        createdBy: clubAdmin.id,
        categories: {
          create: [
            { name: 'Masculino Intermedio', levelMin: 'BEGINNER', levelMax: 'INTERMEDIATE', gender: 'MALE', maxPlayers: 16 },
            { name: 'Femenino Libre', gender: 'FEMALE', maxPlayers: 16 },
          ],
        },
      },
      include: { categories: true },
    });
    console.log('✅ Demo tournament created:', tournament.name);
  }

  console.log('\n🎾 Seed complete!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Test Accounts:');
  console.log('  Super Admin:  superadmin@raqueta.app          / SuperAdmin123!');
  console.log('  Club Admin:   admin@clubtenislascondes.cl     / Admin123!');
  console.log('  Manager:      manager@clubtenislascondes.cl   / Manager123!');
  console.log('  Reception:    recepcion@clubtenislascondes.cl / Reception123!');
  console.log('  Instructor:   profe.garcia@clubtenislascondes.cl / Instructor123!');
  console.log('  Player:       juan.perez@gmail.com            / Player123!');
  console.log('  Member:       carlos.silva@gmail.com          / Player123!');
  console.log('  Casual:       casual@gmail.com                / Player123!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
