import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { IconButton } from '@/components/IconButton';
import {
  clearSecurityCode,
  hasSecurityCode,
  setSecurityCode,
  verifySecurityCode,
} from '@/lib/preferences';
import { isValidSecurityCode } from '@/lib/security-code';
import { colors, fontBody, fontDisplay, fontMono, fontSize, spacing } from '@/lib/theme';

type Stage = 'loading' | 'current' | 'new' | 'confirm';

export default function SecurityCodeScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [exists, setExists] = useState(false);
  const [stage, setStage] = useState<Stage>('loading');
  const [code, setCode] = useState('');
  const [newCode, setNewCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    (async () => {
      const has = await hasSecurityCode();
      setExists(has);
      setStage(has ? 'current' : 'new');
    })();
  }, []);

  useEffect(() => {
    if (stage !== 'loading') {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [stage]);

  async function handleSubmit() {
    if (submitting) return;
    const value = code.trim();
    if (!isValidSecurityCode(value)) {
      Alert.alert(t('securityCode.errorTitle'), t('securityCode.errorFormat'));
      return;
    }
    setSubmitting(true);
    try {
      if (stage === 'current') {
        const ok = await verifySecurityCode(value);
        if (!ok) {
          Alert.alert(t('securityCode.errorTitle'), t('securityCode.errorWrong'));
          setCode('');
          return;
        }
        setCode('');
        setStage('new');
      } else if (stage === 'new') {
        setNewCode(value);
        setCode('');
        setStage('confirm');
      } else if (stage === 'confirm') {
        if (value !== newCode) {
          Alert.alert(t('securityCode.errorTitle'), t('securityCode.errorMismatch'));
          setCode('');
          setStage('new');
          setNewCode('');
          return;
        }
        await setSecurityCode(value);
        Alert.alert(t('securityCode.savedTitle'), t('securityCode.savedBody'), [
          { text: t('common.ok'), onPress: () => router.back() },
        ]);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleDisable() {
    Alert.alert(
      t('securityCode.disableTitle'),
      t('securityCode.disableBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('securityCode.disableConfirm'),
          style: 'destructive',
          onPress: async () => {
            await clearSecurityCode();
            router.back();
          },
        },
      ],
    );
  }

  const headline =
    stage === 'current'
      ? t('securityCode.enterCurrent')
      : stage === 'new'
        ? exists
          ? t('securityCode.enterNew')
          : t('securityCode.createCode')
        : t('securityCode.confirmCode');

  const body =
    stage === 'current'
      ? t('securityCode.enterCurrentBody')
      : stage === 'new'
        ? t('securityCode.createBody')
        : t('securityCode.confirmBody');

  if (stage === 'loading') {
    return <View style={[styles.container, { paddingTop: insets.top }]} />;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopBar
        title={t('securityCode.title')}
        left={<IconButton icon="chevron-left" onPress={() => router.back()} label={t('common.back')} />}
      />
      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{t('securityCode.eyebrow')}</Text>
          <Text style={styles.headline}>{headline}</Text>
          <Text style={styles.bodyText}>{body}</Text>
        </View>

        <TextInput
          ref={inputRef}
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
          secureTextEntry
          style={styles.input}
          placeholder="••••"
          placeholderTextColor={colors.lead}
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
        />

        <View style={{ flex: 1 }} />

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.s4 }]}>
          <TouchableOpacity
            style={[styles.cta, !isValidSecurityCode(code) && styles.ctaDisabled]}
            disabled={!isValidSecurityCode(code) || submitting}
            onPress={handleSubmit}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaLabel}>{t('securityCode.continue')}</Text>
            <Feather name="arrow-right" size={18} color={colors.fgOnAccent} />
          </TouchableOpacity>

          {exists && stage === 'current' && (
            <TouchableOpacity style={styles.disableBtn} onPress={handleDisable} activeOpacity={0.7}>
              <Text style={styles.disableLabel}>{t('securityCode.disable')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  body: { flex: 1, paddingHorizontal: spacing.s5, paddingTop: spacing.s5 },
  header: { gap: spacing.s2, marginBottom: spacing.s5 },
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
  bodyText: { fontFamily: fontBody, fontSize: fontSize.bodyS, color: colors.lead, lineHeight: 20 },
  input: {
    fontFamily: fontMono,
    fontSize: 32,
    color: colors.graphite,
    borderWidth: 0.5,
    borderColor: colors.graphite,
    borderRadius: 6,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    textAlign: 'center',
    letterSpacing: 12,
  },
  footer: { paddingTop: spacing.s3, gap: spacing.s3 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s2,
    height: 52,
    borderRadius: 6,
    backgroundColor: colors.vermillion,
  },
  ctaDisabled: { opacity: 0.45 },
  ctaLabel: { fontFamily: fontBody, fontSize: fontSize.body, color: colors.fgOnAccent },
  disableBtn: { alignItems: 'center', paddingVertical: spacing.s3 },
  disableLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.vermillion,
    letterSpacing: 0.3,
  },
});
