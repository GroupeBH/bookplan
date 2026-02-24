const DRC_COUNTRY_CODE = '243';
const DRC_LOCAL_LENGTH = 9;

// Normalize phone numbers with DRC defaults while still supporting international input.
export const normalizePhoneNumber = (input: string): string => {
  const raw = input.trim();
  if (!raw) {
    return '';
  }

  const digits = raw.replace(/\D/g, '');
  if (!digits) {
    return '';
  }

  // Already in DRC international format (or close to it).
  if (digits.startsWith(DRC_COUNTRY_CODE)) {
    const localPart = digits.slice(DRC_COUNTRY_CODE.length).replace(/^0+/, '');
    if (localPart.length === DRC_LOCAL_LENGTH) {
      return `+${DRC_COUNTRY_CODE}${localPart}`;
    }
  }

  // Local DRC with leading zero (e.g. 0822912365 -> +243822912365).
  if (digits.length === DRC_LOCAL_LENGTH + 1 && digits.startsWith('0')) {
    return `+${DRC_COUNTRY_CODE}${digits.slice(1)}`;
  }

  // Local DRC without leading zero (e.g. 822912365 -> +243822912365).
  if (digits.length === DRC_LOCAL_LENGTH && !digits.startsWith('0')) {
    return `+${DRC_COUNTRY_CODE}${digits}`;
  }

  // Fallback for other international formats.
  return `+${digits}`;
};

export const isValidPhoneNumber = (input: string): boolean => {
  const normalizedPhone = normalizePhoneNumber(input);
  return /^\+\d{10,15}$/.test(normalizedPhone);
};
