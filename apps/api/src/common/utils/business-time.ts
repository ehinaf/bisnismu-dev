/**
 * Waktu "lokal usaha". Server (Docker) berjalan di UTC, sedangkan tanggal di
 * nomor struk, jadwal promo, dan batas hari laporan harus mengikuti zona waktu
 * usaha (businesses.timezone, IANA — mis. Asia/Jakarta, Asia/Makassar).
 * JANGAN pakai Date#getHours/getDay/setHours untuk logika bisnis — itu jam server.
 */
export const DEFAULT_TIMEZONE = "Asia/Jakarta";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    });
    formatterCache.set(timeZone, fmt);
  }
  return fmt;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** Zona waktu usaha yang aman dipakai — jatuh ke DEFAULT_TIMEZONE kalau kosong/tidak valid. */
export function resolveTimeZone(timeZone: string | null | undefined): string {
  return timeZone && isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIMEZONE;
}

export interface ZonedParts {
  /** Tanggal kalender lokal, YYYY-MM-DD. */
  date: string;
  /** Jam:menit lokal, HH:mm (00–23). */
  hm: string;
  /** 0 = Minggu … 6 = Sabtu (konvensi yang sama dengan Date#getDay). */
  dayOfWeek: number;
}

interface RawParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
  weekday: string;
}

function rawParts(instant: Date, timeZone: string): RawParts {
  const parts = formatter(resolveTimeZone(timeZone)).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
    weekday: get("weekday"),
  };
}

export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const p = rawParts(instant, timeZone);
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hm: `${p.hour}:${p.minute}`,
    dayOfWeek: WEEKDAYS.indexOf(p.weekday),
  };
}

/**
 * Nilai untuk kolom `@db.Date` (mis. document_counters.period). Prisma hanya
 * menyimpan bagian tanggal UTC dari Date, jadi tanggal lokal dikirim sebagai
 * tengah malam UTC pada tanggal kalender yang sama.
 */
export function dateOnly(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** Selisih jam dinding lokal terhadap UTC (ms) pada instan tertentu. */
function offsetMs(instant: Date, timeZone: string): number {
  const p = rawParts(instant, timeZone);
  const wallClockAsUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return wallClockAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Instan (UTC) saat hari `date` (YYYY-MM-DD) dimulai pukul 00:00 di zona `timeZone`. */
export function zonedDayStart(date: string, timeZone: string): Date {
  const tz = resolveTimeZone(timeZone);
  const utcMidnight = dateOnly(date).getTime();
  // Indonesia tidak memakai DST, tapi offset dihitung ulang sekali di titik
  // tebakan supaya tetap benar untuk zona yang berganti offset di hari itu.
  const firstGuess = utcMidnight - offsetMs(new Date(utcMidnight), tz);
  return new Date(utcMidnight - offsetMs(new Date(firstGuess), tz));
}

/** Tanggal kalender berikutnya (YYYY-MM-DD) — aritmetika kalender murni, tanpa zona. */
export function nextDate(date: string): string {
  return new Date(dateOnly(date).getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
