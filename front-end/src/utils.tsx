import { useState, useRef, useEffect, type ReactNode } from 'react';
import L from 'leaflet';

export const API_BASE = import.meta.env.VITE_API_URL ?? '';

export const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

export function configureLeafletDefaultIcon() {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}

export function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((v): v is string => typeof v === 'string')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t) return [];
    if (t.startsWith('[') && t.endsWith(']')) {
      try {
        const p = JSON.parse(t);
        if (Array.isArray(p)) {
          return p
            .filter((v): v is string => typeof v === 'string')
            .map((s) => s.trim())
            .filter(Boolean);
        }
      } catch {}
    }
    return t.split(/,|\|\//).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export function normalize(text: string): string {
  return text.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function isZipCode(value: string): boolean {
  return /^\d{5}$/.test(value.trim());
}

export function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function capitalizeWords(text: string): string {
  return text.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getTodayDay(): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()];
}

export function parseTimeToMinutes(timeStr: string): number | null {
  const clean = timeStr.trim().toLowerCase().replace(/\s+/g, '');
  const match = clean.match(/^(\d{1,2})(?::(\d{2}))?([ap]m)?$/);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const ampm = match[3];
  if (ampm === 'pm' && hours !== 12) hours += 12;
  if (ampm === 'am' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

export function isOpenNow(timeRangeStr: string): boolean | null {
  const lower = timeRangeStr.toLowerCase().trim();
  if (lower === 'closed' || lower === 'not available') return false;
  const dashMatch = lower.replace(/\s+/g, '').match(/^(.+?)[-–](.+)$/);
  if (!dashMatch) return null;
  const openMin = parseTimeToMinutes(dashMatch[1]);
  const closeMin = parseTimeToMinutes(dashMatch[2]);
  if (openMin === null || closeMin === null) return null;
  const now = new Date();
  const currentMin = now.getHours() * 60 + now.getMinutes();
  return currentMin >= openMin && currentMin < closeMin;
}

export function to12Hour(time: string): string {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return time;
  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const ampm = hours < 12 ? 'AM' : 'PM';
  if (hours === 0) hours = 12;
  else if (hours > 12) hours -= 12;
  return `${hours}:${minutes} ${ampm}`;
}

export function formatBusinessHours(hours: unknown): string[] {
  if (!hours) return [];

  if (typeof hours === 'string') {
    const trimmed = hours.trim();
    if (!trimmed) return [];
    try {
      return formatBusinessHours(JSON.parse(trimmed));
    } catch {
      return [trimmed];
    }
  }

  if (Array.isArray(hours)) {
    return hours
      .map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
      .filter(Boolean);
  }

  if (typeof hours === 'object') {
    const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const NUMERIC_KEYS = new Set(['0', '1', '2', '3', '4', '5', '6']);
    const STRING_DAY_KEYS = new Set(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);
    const STRING_DAY_ORDER: Record<string, number> = {
      sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
    };

    const formatValue = (label: string, value: unknown): string => {
      if (typeof value === 'string') return `${label}: ${value}`;
      if (Array.isArray(value)) return `${label}: ${value.join(', ')}`;
      if (value && typeof value === 'object') {
        const schedule = value as Record<string, unknown>;
        let timeStr: string;
        if (schedule.closed === true) {
          timeStr = 'Closed';
        } else if (schedule.open_24_hours === true) {
          timeStr = 'Open 24 hours';
        } else if (Array.isArray(schedule.periods) && schedule.periods.length > 0) {
          timeStr = schedule.periods
            .map((period: unknown) => {
              if (period && typeof period === 'object') {
                const p = period as Record<string, unknown>;
                if (p.open && p.close) return `${to12Hour(String(p.open))} – ${to12Hour(String(p.close))}`;
              }
              return '';
            })
            .filter(Boolean)
            .join(', ');
        } else {
          timeStr = 'Hours not available';
        }
        return `${label}: ${timeStr}`;
      }
      return `${label}: ${String(value ?? '')}`;
    };

    const entries = Object.entries(hours as Record<string, unknown>);
    const numericEntries = entries.filter(([key]) => NUMERIC_KEYS.has(key));
    if (numericEntries.length > 0) {
      return numericEntries
        .sort(([a], [b]) => parseInt(a, 10) - parseInt(b, 10))
        .map(([key, value]) => formatValue(DAY_NAMES[parseInt(key, 10)], value));
    }

    return entries
      .filter(([day]) => STRING_DAY_KEYS.has(day.toLowerCase()))
      .sort(([a], [b]) => (STRING_DAY_ORDER[a.toLowerCase()] ?? 7) - (STRING_DAY_ORDER[b.toLowerCase()] ?? 7))
      .map(([day, value]) => formatValue(day.charAt(0).toUpperCase() + day.slice(1), value));
  }

  return [String(hours)];
}

export function renderStars(rating: number, outOf = 5): string {
  return Array.from({ length: outOf }, (_, index) => (index < rating ? '★' : '☆')).join('');
}

export function isBusinessOpenNow(hours: unknown): boolean {
  if (!hours || typeof hours !== 'object' || Array.isArray(hours)) return false;
  const todayIndex = new Date().getDay();
  const hoursObj = hours as Record<string, unknown>;
  const dayData = hoursObj[todayIndex] ?? hoursObj[String(todayIndex)];
  if (!dayData || typeof dayData !== 'object') return false;
  const day = dayData as Record<string, unknown>;
  if (day.closed === true) return false;
  if (day.open_24_hours === true) return true;
  if (Array.isArray(day.periods)) {
    const now = new Date();
    const currentMin = now.getHours() * 60 + now.getMinutes();
    return day.periods.some((period: unknown) => {
      if (!period || typeof period !== 'object') return false;
      const p = period as Record<string, unknown>;
      const openMin = parseTimeToMinutes(String(p.open ?? ''));
      const closeMin = parseTimeToMinutes(String(p.close ?? ''));
      if (openMin === null || closeMin === null) return false;
      if (closeMin <= openMin) return currentMin >= openMin || currentMin < closeMin;
      return currentMin >= openMin && currentMin < closeMin;
    });
  }
  return false;
}

export function getOpenDaysFromHours(hours: unknown): string[] {
  if (!hours || typeof hours !== 'object' || Array.isArray(hours)) return [];
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const NUMERIC_KEYS = new Set(['0', '1', '2', '3', '4', '5', '6']);
  const STRING_DAY_KEYS = new Set(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);
  const entries = Object.entries(hours as Record<string, unknown>);
  const numericEntries = entries.filter(([key]) => NUMERIC_KEYS.has(key));
  const isNotClosed = ([, v]: [string, unknown]) =>
    !(v && typeof v === 'object' && !Array.isArray(v) && (v as Record<string, unknown>).closed === true);
  if (numericEntries.length > 0) {
    return numericEntries
      .filter(isNotClosed)
      .map(([key]) => DAY_NAMES[parseInt(key, 10)]);
  }
  return entries
    .filter(([day]) => STRING_DAY_KEYS.has(day.toLowerCase()))
    .filter(isNotClosed)
    .map(([day]) => day.charAt(0).toUpperCase() + day.slice(1));
}

export function mapsUrl(lat: number, lng: number, label: string): string {
  if (IS_IOS) {
    return `https://maps.apple.com/?q=${encodeURIComponent(label)}&ll=${lat},${lng}&z=16`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}

interface MapsChooserProps {
  lat: number;
  lng: number;
  query: string;
  className?: string;
  children: ReactNode;
}

export function MapsChooser({ lat, lng, query, className, children }: MapsChooserProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const googleUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
  const appleUrl = `https://maps.apple.com/?q=${encodeURIComponent(query)}&ll=${lat},${lng}&z=16`;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!IS_IOS) {
    return (
      <a href={googleUrl} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
      </a>
    );
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button type="button" className={className} onClick={() => setOpen((o) => !o)}>
        {children}
      </button>
      {open && (
        <div className="maps-chooser-dropdown">
          <a href={appleUrl} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
            Apple Maps
          </a>
          <a href={googleUrl} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
            Google Maps
          </a>
        </div>
      )}
    </div>
  );
}
