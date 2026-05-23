/**
 * AppAlert — imperative replacement for React Native's `Alert.alert(...)`.
 *
 * The API is intentionally identical in spirit: callers fire-and-forget (or
 * await) a single function call and don't need to wire any React state. Under
 * the hood we keep a FIFO queue of pending alerts and a single subscriber
 * (the AppAlertHost mounted at the app root). The host renders one alert at a
 * time and calls `resolve(key)` / `dismiss()` to advance the queue.
 *
 * This module is framework-agnostic — no React imports — so it can be called
 * from anywhere: components, helpers, async flows, background tasks. The host
 * is the only consumer of React state.
 *
 * See `popup-guard.ts` for the same pattern at smaller scope.
 */

export type AppAlertButtonStyle = 'default' | 'cancel' | 'destructive';

export type AppAlertButton = {
  /** Stable identifier the caller pattern-matches on after `showAlert` resolves. */
  key: string;
  /** Already-translated label. The caller handles i18n. */
  label: string;
  style?: AppAlertButtonStyle;
};

export type AppAlertOptions = {
  title: string;
  message?: string;
  /**
   * Up to 3 buttons. If omitted, defaults to a single `{ key: 'ok', label: 'OK' }`.
   * The default label is filled in by the host via i18n — callers that want a
   * specific label should pass `buttons` explicitly.
   */
  buttons?: AppAlertButton[];
  /** If true, swiping or tapping backdrop resolves to `null`. Default true. */
  dismissable?: boolean;
};

/**
 * Live alert request handed to the host. The host UI calls `resolve(key)` for
 * a button tap or `dismiss()` for a backdrop / swipe-down dismissal.
 */
export type AppAlertRequest = {
  id: number;
  title: string;
  message?: string;
  buttons: AppAlertButton[];
  dismissable: boolean;
  resolve: (key: string) => void;
  dismiss: () => void;
};

type Pending = {
  id: number;
  options: AppAlertOptions;
  resolve: (key: string | null) => void;
};

type Subscriber = (next: AppAlertRequest | null) => void;

// --- Module state --------------------------------------------------------

let nextId = 1;
const queue: Pending[] = [];
let active: Pending | null = null;
let subscriber: Subscriber | null = null;

function defaultButtons(): AppAlertButton[] {
  // The host will render this label; we hand off a sensible default here so
  // the lib has no dependency on i18n at import time. Callers that need a
  // translated label should pass `buttons` explicitly.
  return [{ key: 'ok', label: 'OK', style: 'default' }];
}

function buildRequest(p: Pending): AppAlertRequest {
  const opts = p.options;
  const buttons = opts.buttons && opts.buttons.length > 0 ? opts.buttons : defaultButtons();
  const dismissable = opts.dismissable ?? true;

  return {
    id: p.id,
    title: opts.title,
    message: opts.message,
    buttons,
    dismissable,
    resolve: (key: string) => {
      // Guard against double-resolution from rapid taps.
      if (active?.id !== p.id) return;
      finish(key);
    },
    dismiss: () => {
      if (active?.id !== p.id) return;
      if (!dismissable) return;
      finish(null);
    },
  };
}

function finish(result: string | null): void {
  const a = active;
  if (!a) return;
  active = null;
  a.resolve(result);
  pump();
}

function pump(): void {
  if (active) return;
  const next = queue.shift();
  if (!next) {
    subscriber?.(null);
    return;
  }
  active = next;
  subscriber?.(buildRequest(next));
}

// --- Public API ----------------------------------------------------------

/**
 * Show a custom alert. Resolves to the `key` of the tapped button, or `null`
 * if the alert was dismissed (only possible when `dismissable !== false`).
 *
 * Sequential calls are queued (FIFO); only one alert is on screen at a time.
 */
export function showAlert(opts: AppAlertOptions): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const pending: Pending = {
      id: nextId++,
      options: opts,
      resolve,
    };
    queue.push(pending);
    pump();
  });
}

/**
 * Subscribe to alert events. The subscriber is invoked with the next alert
 * request whenever a new alert becomes active, and with `null` when the queue
 * empties. Only one subscriber is supported (the AppAlertHost).
 *
 * Returns an unsubscribe function.
 */
export function subscribeToAlerts(fn: Subscriber): () => void {
  subscriber = fn;
  // If there is already an active alert (e.g. host remounted), re-deliver it.
  if (active) {
    fn(buildRequest(active));
  } else {
    fn(null);
  }
  return () => {
    if (subscriber === fn) subscriber = null;
  };
}

// --- Test-only -----------------------------------------------------------

/** Reset internal state. Not exported through any barrel. */
export function __resetAppAlertForTests(): void {
  nextId = 1;
  queue.length = 0;
  active = null;
  subscriber = null;
}
