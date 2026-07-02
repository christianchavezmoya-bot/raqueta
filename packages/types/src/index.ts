// ─── Enums ────────────────────────────────────────────────────────────────────

export type UserRole =
  | 'SUPER_ADMIN'
  | 'CLUB_ADMIN'
  | 'MANAGER'
  | 'RECEPTION'
  | 'INSTRUCTOR'
  | 'PLAYER'
  | 'PARENT'
  | 'CASUAL_USER'
  | 'MEMBER';

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';

export type CourtSurface =
  | 'CLAY'
  | 'HARD'
  | 'GRASS'
  | 'ARTIFICIAL_GRASS'
  | 'CARPET'
  | 'INDOOR';

export type CourtStatus = 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE';

export type ReservationStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'NO_SHOW';

export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | 'CANCELLED';

export type PaymentMethod = 'CASH' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'TRANSFER' | 'WEBPAY';

export type MembershipStatus = 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'CANCELLED' | 'PENDING';

export type TournamentStatus =
  | 'DRAFT'
  | 'REGISTRATION_OPEN'
  | 'REGISTRATION_CLOSED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export type TournamentFormat =
  | 'SINGLE_ELIMINATION'
  | 'DOUBLE_ELIMINATION'
  | 'ROUND_ROBIN'
  | 'SWISS'
  | 'LEAGUE';

export type MatchStatus =
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'WALKOVER';

export type PlayerLevel =
  | 'BEGINNER'
  | 'INTERMEDIATE'
  | 'ADVANCED'
  | 'COMPETITIVE'
  | 'PROFESSIONAL';

export type Hand = 'RIGHT' | 'LEFT';
export type Backhand = 'ONE_HANDED' | 'TWO_HANDED';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends AuthTokens {
  user: User;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface RegisterDto {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role?: 'PLAYER' | 'CASUAL_USER';
}

// ─── User ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  playerProfile?: PlayerProfile;
}

// ─── Club ─────────────────────────────────────────────────────────────────────

export interface Club {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  profile?: ClubProfile;
  courts?: Court[];
  openingHours?: OpeningHour[];
}

export interface ClubProfile {
  id: string;
  clubId: string;
  description?: string;
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  email?: string;
  website?: string;
  logoUrl?: string;
}

export interface OpeningHour {
  id: string;
  clubId: string;
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
}

// ─── Court ────────────────────────────────────────────────────────────────────

export interface Court {
  id: string;
  clubId: string;
  name: string;
  surface: CourtSurface;
  isIndoor: boolean;
  status: CourtStatus;
  pricePerHour?: number;
  memberPricePerHour?: number;
  description?: string;
}

export interface AvailabilitySlot {
  startTime: string;
  endTime: string;
  available: boolean;
  price?: number;
}

// ─── Reservation ──────────────────────────────────────────────────────────────

export interface Reservation {
  id: string;
  courtId: string;
  userId: string;
  startTime: string;
  endTime: string;
  status: ReservationStatus;
  totalPrice?: number;
  notes?: string;
  createdAt: string;
  court?: Court;
  user?: User;
}

export interface CreateReservationDto {
  courtId: string;
  startTime: string;
  endTime: string;
  notes?: string;
}

// ─── Player ───────────────────────────────────────────────────────────────────

export interface PlayerProfile {
  id: string;
  userId: string;
  displayName?: string;
  birthDate?: string;
  gender?: Gender;
  level?: PlayerLevel;
  hand?: Hand;
  backhand?: Backhand;
  height?: number;
  weight?: number;
  bio?: string;
  stats?: PlayerStats;
}

export interface PlayerStats {
  id: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  rankingPoints: number;
  tournamentsPlayed: number;
  tournamentsWon: number;
}

// ─── Membership ───────────────────────────────────────────────────────────────

export interface MembershipPlan {
  id: string;
  clubId: string;
  name: string;
  description?: string;
  price: number;
  durationDays: number;
  features: string[];
  isActive: boolean;
}

export interface Membership {
  id: string;
  userId: string;
  clubId: string;
  planId: string;
  status: MembershipStatus;
  startDate: string;
  endDate: string;
  plan?: MembershipPlan;
}

// ─── Tournament ───────────────────────────────────────────────────────────────

export interface Tournament {
  id: string;
  clubId: string;
  name: string;
  description?: string;
  format: TournamentFormat;
  status: TournamentStatus;
  startDate: string;
  endDate: string;
  registrationOpenDate?: string;
  registrationCloseDate?: string;
  price: number;
  maxPlayers?: number;
  categories?: TournamentCategory[];
  matches?: Match[];
  club?: Club;
}

export interface TournamentCategory {
  id: string;
  tournamentId: string;
  name: string;
  gender?: Gender;
  ageMin?: number;
  ageMax?: number;
  levelMin?: PlayerLevel;
  levelMax?: PlayerLevel;
  registrations?: TournamentRegistration[];
}

export interface TournamentRegistration {
  id: string;
  categoryId: string;
  playerId: string;
  registeredAt: string;
  paymentStatus: PaymentStatus;
  player?: User;
}

// ─── Match ────────────────────────────────────────────────────────────────────

export interface Match {
  id: string;
  tournamentId?: string;
  categoryId?: string;
  player1Id?: string;
  player2Id?: string;
  status: MatchStatus;
  score?: string;
  scheduledTime?: string;
  courtId?: string;
  winnerId?: string;
  player1?: User;
  player2?: User;
  winner?: User;
}

// ─── Payment ──────────────────────────────────────────────────────────────────

export interface Payment {
  id: string;
  userId: string;
  clubId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  method?: PaymentMethod;
  description?: string;
  createdAt: string;
  user?: User;
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export interface DashboardKPIs {
  todayReservations: number;
  pendingPayments: number;
  activeMembers: number;
  monthRevenue: number;
  totalCourts: number;
  upcomingTournaments: number;
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
