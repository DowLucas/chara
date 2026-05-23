/**
 * AppAlertHost — the single React surface that drives the AppAlert queue.
 *
 * Mounted once at the app root (see `app/_layout.tsx`). Subscribes to the
 * pure-JS queue in `lib/app-alert.ts` and renders the next pending alert.
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppAlert } from './AppAlert';
import { subscribeToAlerts, type AppAlertRequest } from '@/lib/app-alert';

export function AppAlertHost(): React.ReactElement | null {
  const { t } = useTranslation();
  const [request, setRequest] = useState<AppAlertRequest | null>(null);

  useEffect(() => {
    return subscribeToAlerts(setRequest);
  }, []);

  if (!request) return null;

  // The lib hands off a placeholder "OK" label for the default-button case so
  // it can stay framework-agnostic. The host swaps in the localized string.
  const localizedButtons = request.buttons.map((b) =>
    b.key === 'ok' && b.label === 'OK' ? { ...b, label: t('common.ok') } : b,
  );

  return <AppAlert request={{ ...request, buttons: localizedButtons }} />;
}
