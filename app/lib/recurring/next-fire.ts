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

export function nextFire(_rule: Rule, _occurrence: Date): NextFireResult {
  return { next_fire: new Date(0), status: 'active' };
}
