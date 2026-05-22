/**
 * React-flavored wrapper around `classifyInvite` + `dispatchInviteIntent`
 * for the scanner screens (`app/groups/scan.tsx`, `app/onboarding/scan.tsx`).
 *
 * The deep-link handler in `app/_layout.tsx` calls `dispatchInviteIntent`
 * directly without this hook (it lives above the provider's children but
 * reads the accounts snapshot synchronously, no React context required).
 */

import { useCallback, useState } from 'react';
import { useAccounts } from './accounts';
import { classifyInvite } from './invite-handler';
import { dispatchInviteIntent, type DispatchResult } from './invite-dispatcher';

export interface UseInviteJoin {
  busy: boolean;
  handle: (scannedInput: string) => Promise<DispatchResult>;
}

export function useInviteJoin(): UseInviteJoin {
  const { accounts } = useAccounts();
  const [busy, setBusy] = useState(false);

  const handle = useCallback(
    async (scannedInput: string): Promise<DispatchResult> => {
      if (busy) return { kind: 'handled' };
      setBusy(true);
      try {
        const intent = classifyInvite(scannedInput, { accounts });
        return await dispatchInviteIntent(intent);
      } finally {
        setBusy(false);
      }
    },
    [accounts, busy],
  );

  return { busy, handle };
}
