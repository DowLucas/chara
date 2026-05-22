import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { IconButton } from '@/components/IconButton';
import { publicApi } from '@/lib/api';
import { checkProtocolCompat } from '@/lib/protocol';
import { normalizeServerUrl } from '@/lib/server-url';
import { legacyHostedUrl } from '@/lib/legacy-hosted-url';
import { runDiscoveryHandshake } from '@/lib/discovery';
import type { AccountInstanceInfo } from '@/lib/accounts-store';
import {
  colors,
  fontBody,
  fontDisplay,
  fontMono,
  fontMonoMedium,
  fontSize,
  spacing,
} from '@/lib/theme';

type Mode = 'first-launch' | 'settings' | 'invite';
type Stage = 'url' | 'validating' | 'confirm';

interface ConfirmState {
  serverUrl: string;
  instance: AccountInstanceInfo;
}

export default function AddServerScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    prefillUrl?: string;
    mode?: Mode;
    pendingInvite?: string;
  }>();

  const mode: Mode = (params.mode as Mode) ?? 'settings';

  // Initial URL: explicit prefill always wins; otherwise, first-launch mode
  // uses the legacy hosted URL so the existing flow is preserved.
  const initialUrl = useMemo(() => {
    if (params.prefillUrl) return String(params.prefillUrl);
    if (mode === 'first-launch') return legacyHostedUrl();
    return '';
  }, [params.prefillUrl, mode]);

  const [stage, setStage] = useState<Stage>('url');
  const [urlInput, setUrlInput] = useState<string>(initialUrl);
  const [error, setError] = useState<string | null>(null);
  const [validatingHost, setValidatingHost] = useState<string>('');
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  // Re-sync the input if the params change while the screen is alive (e.g.
  // re-entry from a different invite). Only effective at stage='url'.
  useEffect(() => {
    setUrlInput(initialUrl);
  }, [initialUrl]);

  const errorMessageFor = (reason: string): string => {
    switch (reason) {
      case 'unreachable':
        return t('addServer.validateUnreachable');
      case 'not_chara':
        return t('addServer.validateNotChara');
      case 'app_too_old':
        return t('addServer.appTooOld');
      case 'app_too_new':
        return t('addServer.appTooNew');
      case 'server_too_old':
        return t('addServer.serverTooOld');
      case 'server_too_new':
        return t('addServer.serverTooNew');
      default:
        return t('addServer.validateUnreachable');
    }
  };

  function hostFor(serverUrl: string): string {
    try {
      return new URL(serverUrl).host;
    } catch {
      return serverUrl;
    }
  }

  async function handleContinueFromUrl() {
    setError(null);
    const raw = urlInput.trim();
    if (raw.length === 0) {
      setError(t('addServer.validateInvalidUrl'));
      return;
    }
    const normalized = normalizeServerUrl(raw);
    if (typeof normalized !== 'string') {
      setError(t('addServer.validateInvalidUrl'));
      return;
    }

    setValidatingHost(hostFor(normalized));
    setStage('validating');

    const result = await runDiscoveryHandshake({
      fetchInstanceInfo: () => publicApi(normalized).instanceInfo(),
      checkCompat: (args) =>
        checkProtocolCompat({
          serverProtocol: args.serverProtocol,
          serverMinApp: args.serverMinApp,
          serverMaxApp: args.serverMaxApp,
        }),
    });

    if (!result.ok) {
      setError(errorMessageFor(result.reason));
      setStage('url');
      return;
    }

    setConfirm({ serverUrl: normalized, instance: result.instance });
    setStage('confirm');
  }

  function handleConfirmContinue() {
    if (!confirm) return;
    const qs = new URLSearchParams();
    qs.set('server', encodeURIComponent(confirm.serverUrl));
    qs.set('mode', mode);
    if (params.pendingInvite) qs.set('pendingInvite', String(params.pendingInvite));
    router.replace(`/(auth)/sign-in?${qs.toString()}`);
  }

  function handleCancel() {
    if (router.canGoBack()) router.back();
  }

  function handleEditUrl() {
    setStage('url');
    setConfirm(null);
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ paddingTop: insets.top }}>
        <TopBar
          title={t('addServer.title')}
          left={<IconButton icon="chevron-left" onPress={handleCancel} label={t('common.back')} />}
        />
      </View>

      <View style={[styles.body, { paddingBottom: insets.bottom + spacing.s4 }]}>
        {stage === 'url' ? (
          <UrlStage
            urlInput={urlInput}
            setUrlInput={setUrlInput}
            error={error}
            onContinue={handleContinueFromUrl}
          />
        ) : stage === 'validating' ? (
          <ValidatingStage host={validatingHost} />
        ) : confirm ? (
          <ConfirmStage
            serverUrl={confirm.serverUrl}
            instance={confirm.instance}
            onContinue={handleConfirmContinue}
            onCancel={handleCancel}
            onEdit={handleEditUrl}
          />
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

function UrlStage({
  urlInput,
  setUrlInput,
  error,
  onContinue,
}: {
  urlInput: string;
  setUrlInput: (s: string) => void;
  error: string | null;
  onContinue: () => void;
}) {
  const { t } = useTranslation();
  const canSubmit = urlInput.trim().length > 0;
  return (
    <View style={styles.stage}>
      <View style={styles.headerBlock}>
        <Text style={styles.eyebrow}>{t('addServer.eyebrow')}</Text>
        <Text style={styles.headline}>{t('addServer.headline')}</Text>
        <Text style={styles.bodyText}>{t('addServer.body')}</Text>
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>{t('addServer.urlLabel')}</Text>
        <TextInput
          value={urlInput}
          onChangeText={setUrlInput}
          placeholder={t('addServer.urlPlaceholder')}
          placeholderTextColor={colors.lead}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="url"
          returnKeyType="go"
          onSubmitEditing={canSubmit ? onContinue : undefined}
          style={styles.input}
        />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>

      <View style={{ flex: 1 }} />

      <TouchableOpacity
        style={[styles.cta, !canSubmit && styles.ctaDisabled]}
        disabled={!canSubmit}
        onPress={onContinue}
        activeOpacity={0.85}
      >
        <Text style={styles.ctaLabel}>{t('addServer.continue')}</Text>
        <Feather name="arrow-right" size={18} color={colors.fgOnAccent} />
      </TouchableOpacity>
    </View>
  );
}

function ValidatingStage({ host }: { host: string }) {
  const { t } = useTranslation();
  return (
    <View style={[styles.stage, styles.centeredStage]}>
      <ActivityIndicator color={colors.graphite} />
      <Text style={styles.validatingText}>{t('addServer.connecting', { host })}</Text>
    </View>
  );
}

function ConfirmStage({
  serverUrl,
  instance,
  onContinue,
  onCancel,
  onEdit,
}: {
  serverUrl: string;
  instance: AccountInstanceInfo;
  onContinue: () => void;
  onCancel: () => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  let host = serverUrl;
  try {
    host = new URL(serverUrl).host;
  } catch {
    /* keep original */
  }

  return (
    <View style={styles.stage}>
      <View style={styles.headerBlock}>
        <Text style={styles.eyebrow}>{t('addServer.eyebrow')}</Text>
        <Text style={styles.headline}>{t('addServer.confirmHeadline', { host })}</Text>
      </View>

      <View style={styles.card}>
        <ConfirmRow label={t('addServer.confirmMode')} value={instance.mode} />
        <ConfirmRow label={t('addServer.confirmVersion')} value={instance.version} />
        <ConfirmRow
          label={t('addServer.confirmMethods')}
          value={instance.auth_methods.join(', ') || '—'}
        />
      </View>

      <TouchableOpacity onPress={onEdit} activeOpacity={0.85} style={styles.editRow}>
        <Feather name="edit-2" size={14} color={colors.lead} />
        <Text style={styles.editLabel}>{serverUrl}</Text>
      </TouchableOpacity>

      <View style={{ flex: 1 }} />

      <View style={styles.confirmButtons}>
        <TouchableOpacity
          style={[styles.cta, styles.ctaSecondary, styles.ctaRowItem]}
          onPress={onCancel}
          activeOpacity={0.85}
        >
          <Text style={[styles.ctaLabel, styles.ctaLabelSecondary]}>{t('addServer.cancel')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.cta, styles.ctaRowItem]}
          onPress={onContinue}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaLabel}>{t('addServer.confirmContinue')}</Text>
          <Feather name="arrow-right" size={18} color={colors.fgOnAccent} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.confirmRow}>
      <Text style={styles.confirmRowLabel}>{label}</Text>
      <Text style={styles.confirmRowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s4,
  },
  stage: {
    flex: 1,
  },
  centeredStage: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s3,
  },
  headerBlock: {
    gap: spacing.s2,
    marginBottom: spacing.s5,
  },
  eyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
  },
  headline: {
    fontFamily: fontDisplay,
    fontSize: 32,
    lineHeight: 36,
    color: colors.graphite,
    letterSpacing: -1,
  },
  bodyText: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    lineHeight: 20,
  },
  field: {
    gap: spacing.s2,
  },
  fieldLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
  },
  input: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.graphite,
    borderWidth: 0.5,
    borderColor: colors.graphite,
    borderRadius: 6,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
  },
  errorText: {
    fontFamily: fontBody,
    fontSize: fontSize.caption,
    color: colors.vermillion,
    marginTop: spacing.s1,
  },
  validatingText: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.lead,
  },
  card: {
    borderWidth: 0.5,
    borderColor: colors.graphite,
    borderRadius: 6,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    gap: spacing.s2,
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s3,
  },
  confirmRowLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
  },
  confirmRowValue: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.caption,
    color: colors.graphite,
    flexShrink: 1,
    textAlign: 'right',
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.s2,
  },
  editLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: spacing.s2,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s2,
    height: 52,
    borderRadius: 6,
    backgroundColor: colors.vermillion,
    borderWidth: 0.5,
    borderColor: colors.vermillion,
  },
  ctaRowItem: {
    flex: 1,
  },
  ctaSecondary: {
    backgroundColor: 'transparent',
    borderColor: colors.graphite,
  },
  ctaDisabled: {
    opacity: 0.45,
  },
  ctaLabel: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.fgOnAccent,
  },
  ctaLabelSecondary: {
    color: colors.graphite,
  },
});
