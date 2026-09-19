import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Text } from '@/components/Text';
import { ContentContainer } from '@/components/ContentContainer';
import { useEnglishT } from '@/lib/i18n';
import { clearDraft } from '@/lib/onboarding-draft';
import { colors, fontBody, fontDisplay, fontMono, fontSize, spacing } from '@/lib/theme';
import * as analytics from '@/lib/analytics';

const SLIDES = 3;

export default function WelcomeIntroScreen() {
  const insets = useSafeAreaInsets();
  const t = useEnglishT();
  const pager = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    // A new run starts from scratch; never replay an abandoned draft.
    void clearDraft();
    analytics.track('onboarding_seen');
  }, []);

  function onScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (width > 0) setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  }

  function next() {
    if (index < SLIDES - 1) {
      pager.current?.scrollTo({ x: width * (index + 1), animated: true });
      setIndex(index + 1);
    } else {
      router.push('/welcome/name');
    }
  }

  function skip() {
    analytics.track('onboarding_intro_skipped', { slide: index });
    router.push('/welcome/name');
  }

  const ctaLabel = [t('welcome.getStarted'), t('welcome.next'), t('welcome.letsGo')][index];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        {index < SLIDES - 1 && (
          <TouchableOpacity onPress={skip} accessibilityRole="button" style={styles.skipBtn}>
            <Text style={styles.skipLabel}>{t('welcome.skip')}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.pagerWrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && (
          <ScrollView
            ref={pager}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onScrollEnd}
            onScrollEndDrag={onScrollEnd}
          >
            <Slide width={width}>
              <Image
                source={require('@/assets/chara-logo.png')}
                style={styles.logo}
                resizeMode="contain"
                accessibilityLabel={t('app.name')}
              />
              <Text style={styles.dictHeadword}>{t('signIn.dict.headword')}</Text>
              <Text style={styles.dictPron}>{t('signIn.dict.pronunciation')}</Text>
              <Text style={styles.dictPos}>{t('signIn.dict.partOfSpeech')}</Text>
              {[t('signIn.dict.def1'), t('signIn.dict.def2'), t('signIn.dict.def3')].map((def, i) => (
                <View key={i} style={styles.dictSense}>
                  <Text style={styles.dictSenseNum}>{i + 1}</Text>
                  <Text style={styles.dictSenseText}>{def}</Text>
                </View>
              ))}
            </Slide>
            <Slide width={width}>
              <Feather name="camera" size={40} color={colors.vermillion} style={styles.icon} />
              <Text style={styles.title}>{t('welcome.slide2Title')}</Text>
              <Text style={styles.body}>{t('welcome.slide2Body')}</Text>
            </Slide>
            <Slide width={width}>
              <Image
                source={require('@/assets/illustrations/onboarding-welcome.png')}
                style={styles.illustration}
                resizeMode="contain"
                accessible={false}
              />
              <Text style={styles.title}>{t('welcome.slide3Title')}</Text>
              <Text style={styles.body}>{t('welcome.slide3Body')}</Text>
            </Slide>
          </ScrollView>
        )}
      </View>

      <ContentContainer>
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.s4 }]}>
          <View style={styles.dots}>
            {Array.from({ length: SLIDES }, (_, i) => (
              <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
            ))}
          </View>
          <TouchableOpacity
            style={styles.cta}
            onPress={next}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Text style={styles.ctaLabel}>{ctaLabel}</Text>
            <Feather name="arrow-right" size={18} color={colors.fgOnAccent} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.haveAccount}
            onPress={() => {
              void clearDraft().then(() => router.push('/(auth)/sign-in'));
            }}
            accessibilityRole="button"
          >
            <Text style={styles.haveAccountLabel}>{t('welcome.haveAccount')}</Text>
          </TouchableOpacity>
        </View>
      </ContentContainer>
    </View>
  );
}

// Each slide scrolls vertically on its own so large OS font sizes never clip.
function Slide({ width, children }: { width: number; children: React.ReactNode }) {
  return (
    <ScrollView style={{ width }} contentContainerStyle={styles.slide}>
      <ContentContainer>{children}</ContentContainer>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  topBar: {
    height: 44,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.s5,
  },
  skipBtn: { justifyContent: 'center', paddingHorizontal: spacing.s2 },
  skipLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
  },
  pagerWrap: { flex: 1 },
  slide: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.s5 },
  // Square box matching the square mark, so `contain` adds no side padding
  // and the logo sits flush with the text's left edge.
  logo: { width: 88, height: 88, marginBottom: spacing.s6 },
  illustration: { width: '100%', height: 220, marginBottom: spacing.s5 },
  icon: { marginBottom: spacing.s4 },
  title: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayL,
    lineHeight: 44,
    color: colors.graphite,
    letterSpacing: -1,
  },
  body: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.lead,
    lineHeight: 22,
    marginTop: spacing.s3,
  },
  dictHeadword: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayL,
    letterSpacing: -1,
    lineHeight: 44,
    color: colors.graphite,
  },
  dictPron: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    letterSpacing: 0.3,
    marginTop: 6,
  },
  dictPos: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    letterSpacing: 0.3,
    fontStyle: 'italic',
    marginTop: 2,
    marginBottom: spacing.s2,
  },
  dictSense: { flexDirection: 'row', gap: spacing.s2, marginTop: spacing.s2 },
  dictSenseNum: {
    fontFamily: fontMono,
    fontSize: fontSize.body,
    color: colors.lead,
    lineHeight: 22,
    width: 12,
  },
  dictSenseText: {
    flex: 1,
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.graphite,
    lineHeight: 22,
  },
  footer: { paddingHorizontal: spacing.s5, paddingTop: spacing.s3, gap: spacing.s3 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.s2 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.ruleSoft },
  dotActive: { backgroundColor: colors.graphite },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s2,
    height: 52,
    borderRadius: 6,
    backgroundColor: colors.vermillion,
  },
  ctaLabel: { fontFamily: fontBody, fontSize: fontSize.body, color: colors.fgOnAccent },
  haveAccount: { alignSelf: 'center', paddingVertical: spacing.s2 },
  haveAccountLabel: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    textDecorationLine: 'underline',
    textDecorationColor: colors.ruleSoft,
  },
});
