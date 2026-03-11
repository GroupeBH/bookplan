type BookingStatusLike =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'completed'
  | 'cancelled'
  | 'expired';

const HOUR_MS = 60 * 60 * 1000;

const parseTimeMs = (value: unknown): number | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeDurationHours = (value: unknown): number => {
  const duration = Number(value);
  return Number.isFinite(duration) && duration > 0 ? duration : 1;
};

export const getBookingStartMs = (bookingDateValue: unknown): number | null => {
  return parseTimeMs(bookingDateValue);
};

export const getBookingEndMs = (
  bookingDateValue: unknown,
  durationHoursValue: unknown
): number | null => {
  const startMs = parseTimeMs(bookingDateValue);
  if (startMs === null) return null;
  return startMs + normalizeDurationHours(durationHoursValue) * HOUR_MS;
};

export const isPendingBookingExpired = (
  status: unknown,
  bookingDateValue: unknown,
  nowMs: number = Date.now()
): boolean => {
  if (status !== 'pending') return false;
  const startMs = parseTimeMs(bookingDateValue);
  if (startMs === null) return false;
  return nowMs >= startMs;
};

export const isAcceptedBookingEnded = (
  status: unknown,
  bookingDateValue: unknown,
  durationHoursValue: unknown,
  nowMs: number = Date.now()
): boolean => {
  if (status !== 'accepted') return false;
  const endMs = getBookingEndMs(bookingDateValue, durationHoursValue);
  if (endMs === null) return false;
  return nowMs >= endMs;
};

export const deriveBookingStatus = (
  status: unknown,
  bookingDateValue: unknown,
  durationHoursValue: unknown,
  nowMs: number = Date.now()
): BookingStatusLike => {
  const normalizedStatus = typeof status === 'string' ? status : 'pending';

  if (isPendingBookingExpired(normalizedStatus, bookingDateValue, nowMs)) {
    return 'expired';
  }

  if (isAcceptedBookingEnded(normalizedStatus, bookingDateValue, durationHoursValue, nowMs)) {
    return 'completed';
  }

  if (
    normalizedStatus === 'pending' ||
    normalizedStatus === 'accepted' ||
    normalizedStatus === 'rejected' ||
    normalizedStatus === 'completed' ||
    normalizedStatus === 'cancelled' ||
    normalizedStatus === 'expired'
  ) {
    return normalizedStatus;
  }

  return 'pending';
};

export const isBookingLive = (
  status: unknown,
  bookingDateValue: unknown,
  durationHoursValue: unknown,
  nowMs: number = Date.now()
): boolean => {
  const derived = deriveBookingStatus(status, bookingDateValue, durationHoursValue, nowMs);
  return derived === 'pending' || derived === 'accepted';
};

export const canAcceptPendingBooking = (
  status: unknown,
  bookingDateValue: unknown,
  durationHoursValue: unknown,
  nowMs: number = Date.now()
): boolean => {
  return deriveBookingStatus(status, bookingDateValue, durationHoursValue, nowMs) === 'pending';
};

export const getBookingStatusPresentation = (
  status: unknown,
  bookingDateValue: unknown,
  durationHoursValue: unknown,
  nowMs: number = Date.now()
): {
  status: BookingStatusLike;
  label: string;
  subtitle: string;
} => {
  const derived = deriveBookingStatus(status, bookingDateValue, durationHoursValue, nowMs);

  switch (derived) {
    case 'pending':
      return {
        status: derived,
        label: 'En attente',
        subtitle: 'En attente de reponse',
      };
    case 'accepted':
      return {
        status: derived,
        label: 'Acceptee',
        subtitle: 'Compagnie acceptee',
      };
    case 'rejected':
      return {
        status: derived,
        label: 'Refusee',
        subtitle: 'Demande refusee',
      };
    case 'completed':
      return {
        status: derived,
        label: 'Terminee',
        subtitle: 'Compagnie terminee',
      };
    case 'cancelled':
      return {
        status: derived,
        label: 'Annulee',
        subtitle: 'Demande annulee',
      };
    case 'expired':
      return {
        status: derived,
        label: 'Cloturee',
        subtitle: 'Demande expiree (date depassee)',
      };
    default:
      return {
        status: 'pending',
        label: 'En attente',
        subtitle: 'En attente de reponse',
      };
  }
};
