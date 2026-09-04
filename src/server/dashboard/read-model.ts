export const ADMIN_DASHBOARD_TIME_ZONE =
  'Asia/Tehran';

export interface AdminDashboardDayRange {
  start: Date;
  end: Date;
}

interface TimeZoneDateParts {
  year: number;
  month: number;
  day: number;
}

interface TimeZoneDateTimeParts
  extends TimeZoneDateParts {
  hour: number;
  minute: number;
  second: number;
}

function assertValidDate(
  value: Date,
): void {
  if (
    !(value instanceof Date) ||
    !Number.isFinite(
      value.getTime(),
    )
  ) {
    throw new RangeError(
      'Dashboard date must be valid.',
    );
  }
}

function getNumericPart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): number {
  const part =
    parts.find(
      (candidate) =>
        candidate.type === type,
    );

  if (!part) {
    throw new RangeError(
      `Missing ${type} while resolving dashboard timezone.`,
    );
  }

  const value =
    Number(part.value);

  if (!Number.isInteger(value)) {
    throw new RangeError(
      `Invalid ${type} while resolving dashboard timezone.`,
    );
  }

  return value;
}

function getTimeZoneDateParts(
  value: Date,
): TimeZoneDateParts {
  const formatter =
    new Intl.DateTimeFormat(
      'en-US-u-ca-gregory-nu-latn',
      {
        timeZone:
          ADMIN_DASHBOARD_TIME_ZONE,
        year:
          'numeric',
        month:
          '2-digit',
        day:
          '2-digit',
      },
    );

  const parts =
    formatter.formatToParts(
      value,
    );

  return {
    year:
      getNumericPart(
        parts,
        'year',
      ),
    month:
      getNumericPart(
        parts,
        'month',
      ),
    day:
      getNumericPart(
        parts,
        'day',
      ),
  };
}

function getTimeZoneDateTimeParts(
  value: Date,
): TimeZoneDateTimeParts {
  const formatter =
    new Intl.DateTimeFormat(
      'en-US-u-ca-gregory-nu-latn',
      {
        timeZone:
          ADMIN_DASHBOARD_TIME_ZONE,
        year:
          'numeric',
        month:
          '2-digit',
        day:
          '2-digit',
        hour:
          '2-digit',
        minute:
          '2-digit',
        second:
          '2-digit',
        hourCycle:
          'h23',
      },
    );

  const parts =
    formatter.formatToParts(
      value,
    );

  return {
    year:
      getNumericPart(
        parts,
        'year',
      ),
    month:
      getNumericPart(
        parts,
        'month',
      ),
    day:
      getNumericPart(
        parts,
        'day',
      ),
    hour:
      getNumericPart(
        parts,
        'hour',
      ),
    minute:
      getNumericPart(
        parts,
        'minute',
      ),
    second:
      getNumericPart(
        parts,
        'second',
      ),
  };
}

function getTimeZoneOffsetMilliseconds(
  value: Date,
): number {
  const parts =
    getTimeZoneDateTimeParts(
      value,
    );

  const representedAsUtc =
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );

  const sourceWithoutMilliseconds =
    Math.trunc(
      value.getTime() /
        1000,
    ) * 1000;

  return (
    representedAsUtc -
    sourceWithoutMilliseconds
  );
}

function createTehranMidnight(
  parts: TimeZoneDateParts,
): Date {
  const localMidnightAsUtc =
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      0,
      0,
      0,
      0,
    );

  let candidate =
    localMidnightAsUtc;

  for (
    let attempt = 0;
    attempt < 4;
    attempt += 1
  ) {
    const offset =
      getTimeZoneOffsetMilliseconds(
        new Date(candidate),
      );

    const nextCandidate =
      localMidnightAsUtc -
      offset;

    if (
      nextCandidate ===
      candidate
    ) {
      break;
    }

    candidate =
      nextCandidate;
  }

  const result =
    new Date(candidate);

  const resolved =
    getTimeZoneDateTimeParts(
      result,
    );

  if (
    resolved.year !==
      parts.year ||
    resolved.month !==
      parts.month ||
    resolved.day !==
      parts.day ||
    resolved.hour !== 0 ||
    resolved.minute !== 0 ||
    resolved.second !== 0
  ) {
    throw new RangeError(
      'Unable to resolve Tehran midnight.',
    );
  }

  return result;
}

function getNextGregorianDate(
  parts: TimeZoneDateParts,
): TimeZoneDateParts {
  const next =
    new Date(
      Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day + 1,
      ),
    );

  return {
    year:
      next.getUTCFullYear(),
    month:
      next.getUTCMonth() + 1,
    day:
      next.getUTCDate(),
  };
}

export function getAdminDashboardTehranDayRange(
  now: Date,
): AdminDashboardDayRange {
  assertValidDate(now);

  const today =
    getTimeZoneDateParts(
      now,
    );

  const tomorrow =
    getNextGregorianDate(
      today,
    );

  return {
    start:
      createTehranMidnight(
        today,
      ),
    end:
      createTehranMidnight(
        tomorrow,
      ),
  };
}
