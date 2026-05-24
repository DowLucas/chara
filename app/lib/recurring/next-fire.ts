import {
  addDays, addMonths, addYears, isAfter, parseISO,
} from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

export type FreqUnit = 'day' | 'week' | 'month' | 'year';

export interface Rule {
  freq_unit: FreqUnit;
  freq_interval: number;
  start_date: string;     // YYYY-MM-DD
  end_date: string | null;
  timezone: string;       // IANA
  fire_local_time: string; // HH:MM
}

export type Status = 'active' | 'ended';

export interface NextFireResult {
  next_fire: Date;
  status: Status;
}

export function nextFire(rule: Rule, occurrence: Date): NextFireResult {
  const [hh, mm] = rule.fire_local_time.split(':').map((x) => parseInt(x, 10));

  // Express the occurrence in the rule's tz, then snap to the fire time.
  const occInTZ = toZonedTime(occurrence, rule.timezone);
  const occAtFire = new Date(
    occInTZ.getFullYear(), occInTZ.getMonth(), occInTZ.getDate(),
    hh, mm, 0, 0,
  );

  let nextLocal: Date;
  switch (rule.freq_unit) {
    case 'day':   nextLocal = addDays(occAtFire, rule.freq_interval); break;
    case 'week':  nextLocal = addDays(occAtFire, 7 * rule.freq_interval); break;
    case 'month': nextLocal = addMonths(occAtFire, rule.freq_interval); break;
    case 'year':  nextLocal = addYears(occAtFire, rule.freq_interval); break;
  }

  const next = fromZonedTime(nextLocal, rule.timezone);

  if (rule.end_date) {
    const endLocal = parseISO(rule.end_date + 'T23:59:59');
    const endUTC = fromZonedTime(endLocal, rule.timezone);
    if (isAfter(next, endUTC)) {
      return { next_fire: occurrence, status: 'ended' };
    }
  }

  return { next_fire: next, status: 'active' };
}
