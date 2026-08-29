import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Linking,
  Animated,
  Easing,
} from 'react-native';
import {
  useAudioRecorder,
  useAudioRecorderState,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  type RecordingOptions,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { WaitlistModal } from '@/components/WaitlistModal';
import { colors, fontBody, fontDisplay, fontMono, fontSize, spacing } from '@/lib/theme';
import {
  apiFor,
  isVoiceCapReached,
  voiceFailureCode,
  type VoiceQuestion,
} from '@/lib/api';
import { splitSummary, type VoiceDraft, type RosterMember } from '@/lib/voice-drafts';
import { formatMinorUnits, currentLanguage } from '@/lib/i18n';
import { showAlert } from '@/lib/app-alert';
import { useAccount } from '@/lib/accounts';
import { markPopupClosed } from '@/lib/popup-guard';
import { VoiceVocalizer } from '@/components/VoiceVocalizer';
import { dbfsToLevel } from '@/lib/voice-levels';
import * as analytics from '@/lib/analytics';

/** Hard stop for a recording. Gemini bills audio at roughly 32 tokens per
 *  second, so clip length is the entire cost story, and no real utterance
 *  needs longer. The server's byte cap is the authoritative backstop. */
export const MAX_CLIP_MS = 45_000;

/**
 * AAC mono at 16 kHz / 24 kbps.
 *
 * The design called for Opus, but AVAudioRecorder cannot produce it on
 * iOS. AAC is the equivalent that both platforms record natively, Gemini
 * downsamples to 16 kHz mono regardless, and the byte budget is the same:
 * a 45s clip is ~135 KB, far inside the server's 2 MB limit.
 */
const RECORDING_OPTIONS: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 24000,
  isMeteringEnabled: true,
  android: {
    extension: '.m4a',
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
  },
  ios: {
    extension: '.m4a',
    outputFormat: 'aac ',
    audioQuality: 64,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  // Required by the type. The mic is gated to native platforms, so this
  // branch is never exercised — see the Platform check in add-expense.
  web: { mimeType: 'audio/webm', bitsPerSecond: 24000 },
};

const MIME_TYPE = 'audio/m4a';

type CaptureState =
  | { kind: 'idle' }
  | { kind: 'recording' }
  | { kind: 'uploading' }
  | {
      kind: 'review';
      transcript: string;
      drafts: VoiceDraft[];
      questions: VoiceQuestion[];
      generationId: string;
    }
  | { kind: 'error'; code: 'unintelligible' | 'no_expense' | 'settlement' | 'network' };

export interface VoiceExpenseCaptureProps {
  serverUrl: string;
  groupId: string;
  groupCurrency: string;
  /** Needed to say WHO is on a split — the card can only show ids without it. */
  members: RosterMember[];
  onGenerated(result: { drafts: VoiceDraft[]; generationId: string }): void;
  /** Route the user to this group's settle screen. Used only for the
   *  settlement case, which is a redirect rather than a failure. */
  onGoToSettle(): void;
  onCancel(): void;
}

export function VoiceExpenseCapture({
  serverUrl,
  groupId,
  groupCurrency,
  members,
  onGenerated,
  onGoToSettle,
  onCancel,
}: VoiceExpenseCaptureProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [state, setState] = useState<CaptureState>({ kind: 'idle' });
  const [transcriptDraft, setTranscriptDraft] = useState('');
  // Compared against the transcript as returned, not a sticky flag: typing
  // a change and undoing it should disable the button again.
  const [originalTranscript, setOriginalTranscript] = useState('');
  const [answers, setAnswers] = useState<Record<string, { member_id: string; text: string }>>({});
  const [capBody, setCapBody] = useState<{ periodResetsAt?: string; remaining?: number; cap?: number } | null>(null);

  const account = useAccount(serverUrl);
  const handleWaitlistSubmit = useCallback(
    async (email: string) => {
      await apiFor(serverUrl).submitWaitlist({ email, trigger: 'voice_cap', source: 'mobile' });
    },
    [serverUrl],
  );

  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  // 80ms, not the default: at 250ms the vocalizer visibly steps between
  // frames instead of moving, which reads as lag rather than loudness.
  const recorderState = useAudioRecorderState(recorder, 80);
  const startedAt = useRef(0);
  const autoStop = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAutoStop = () => {
    if (autoStop.current) {
      clearTimeout(autoStop.current);
      autoStop.current = null;
    }
  };

  /**
   * Stop recording, delete the clip, and hand the audio session back.
   *
   * Every exit path must run this. Leaving the recorder going keeps the
   * file on disk — which would make the privacy policy's "never written to
   * disk" claim false — and leaving allowsRecording set keeps iOS in
   * record mode for the rest of the process, routing later playback to the
   * earpiece and potentially holding the recording indicator on.
   */
  const teardownRecording = useCallback(async () => {
    clearAutoStop();
    try {
      if (recorder.isRecording) await recorder.stop();
    } catch {
      // Already stopped, or never started. Still release the session.
    }
    const uri = recorder.uri;
    if (uri) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
  }, [recorder]);

  // Cover the case where the screen goes away without any button press.
  useEffect(() => {
    return () => {
      clearAutoStop();
      void teardownRecording();
    };
  }, [teardownRecording]);

  const dismiss = useCallback(
    (stage: string) => {
      analytics.track('voice_capture_cancelled', {
        stage,
        clip_ms: startedAt.current ? Date.now() - startedAt.current : 0,
      });
      void teardownRecording();
      markPopupClosed();
      onCancel();
    },
    [onCancel, teardownRecording],
  );

  /** Send audio (or a transcript re-post) and move to review. */
  const submit = useCallback(
    async (payload: { audioBase64?: string; clipMs?: number; transcript?: string }) => {
      setState({ kind: 'uploading' });
      const started = Date.now();
      try {
        const res = await apiFor(serverUrl).generateVoiceExpenses({
          groupId,
          localDate: localDateString(),
          timezone: deviceTimezone(),
          // Reasoning is for the recorder alone, on a screen already in
          // their app language.
          uiLanguage: currentLanguage(),
          ...(payload.audioBase64
            ? { audioBase64: payload.audioBase64, mimeType: MIME_TYPE, clipMs: payload.clipMs }
            : {}),
          ...(payload.transcript
            ? {
                transcript: payload.transcript,
                answers: Object.entries(answers).map(([question_id, a]) => ({
                  question_id,
                  member_id: a.member_id,
                  text: a.text,
                })),
              }
            : {}),
        });

        analytics.track('voice_generated', {
          clip_ms: payload.clipMs ?? 0,
          expense_count: res.expenses.length,
          question_count: res.questions?.length ?? 0,
          latency_ms: Date.now() - started,
        });

        setTranscriptDraft(res.transcript);
        setOriginalTranscript(res.transcript);
        setState({
          kind: 'review',
          transcript: res.transcript,
          drafts: res.expenses,
          questions: res.questions ?? [],
          generationId: res.generation_id ?? '',
        });
      } catch (err) {
        const cap = isVoiceCapReached(err);
        if (cap) {
          analytics.track('voice_generation_failed', { code: 'cap' });
          setCapBody({ periodResetsAt: cap.period_resets_at, remaining: cap.remaining });
          setState({ kind: 'idle' });
          return;
        }
        const code = voiceFailureCode(err);
        const mapped =
          code === 'unintelligible' || code === 'no_expense' || code === 'settlement'
            ? code
            : 'network';
        analytics.track('voice_generation_failed', { code: mapped });
        setState({ kind: 'error', code: mapped });
      }
    },
    [answers, groupId, serverUrl],
  );

  const stopAndSend = useCallback(async () => {
    clearAutoStop();
    const clipMs = Date.now() - startedAt.current;
    setState({ kind: 'uploading' });
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) {
        setState({ kind: 'error', code: 'unintelligible' });
        return;
      }
      const audioBase64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      // Audio is transient by design: drop the file and release the audio
      // session the moment it is encoded.
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      await submit({ audioBase64, clipMs });
    } catch {
      setState({ kind: 'error', code: 'network' });
    }
  }, [recorder, submit]);

  const startRecording = useCallback(async () => {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      await showAlert({
        title: t('voiceExpense.micDeniedTitle'),
        message: t('voiceExpense.micDenied'),
        buttons: [{ key: 'ok', label: t('common.ok') }],
      });
      dismiss('permission');
      return;
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      startedAt.current = Date.now();
      analytics.track('voice_capture_started', { entry: 'add_expense' });
      setState({ kind: 'recording' });
      autoStop.current = setTimeout(() => {
        void stopAndSend();
      }, MAX_CLIP_MS);
    } catch {
      setState({ kind: 'error', code: 'network' });
    }
  }, [dismiss, recorder, stopAndSend, t]);

  const transcriptEdited = transcriptDraft.trim() !== originalTranscript.trim();

  const regenerate = useCallback(() => {
    analytics.track('voice_transcript_edited', {});
    const answered = Object.keys(answers).length;
    if (answered > 0) analytics.track('voice_question_answered', { question_count: answered });
    void submit({ transcript: transcriptDraft });
  }, [answers, submit, transcriptDraft]);

  // ── render ────────────────────────────────────────────────────────────

  const body = (() => {
    switch (state.kind) {
      case 'idle':
        return (
          <IdleView
            onRecord={startRecording}
            onType={() =>
              setState({
                kind: 'review',
                transcript: '',
                drafts: [],
                questions: [],
                generationId: '',
              })
            }
          />
        );

      case 'recording':
        return (
          <RecordingView
            elapsedMs={Date.now() - startedAt.current}
            level={dbfsToLevel(recorderState.metering)}
            onStop={stopAndSend}
          />
        );

      case 'uploading':
        return (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.graphite} />
            <Text style={styles.hint}>{t('voiceExpense.uploading')}</Text>
          </View>
        );

      case 'review':
        return (
          <ReviewView
            transcript={transcriptDraft}
            transcriptEdited={transcriptEdited}
            drafts={state.drafts}
            members={members}
            questions={state.questions}
            answers={answers}
            groupCurrency={groupCurrency}
            onTranscriptChange={setTranscriptDraft}
            onAnswer={(qid, memberId, label) =>
              setAnswers((a) => ({ ...a, [qid]: { member_id: memberId, text: label } }))
            }
            onRegenerate={regenerate}
            onUse={() => {
              markPopupClosed();
              onGenerated({ drafts: state.drafts, generationId: state.generationId });
            }}
          />
        );

      case 'error':
        return (
          <ErrorView
            code={state.code}
            onRetry={() => setState({ kind: 'idle' })}
            onGoToSettle={() => {
              markPopupClosed();
              onGoToSettle();
            }}
          />
        );
    }
  })();

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.s3 }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => dismiss(state.kind)}
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
          hitSlop={12}
        >
          <Feather name="x" size={22} color={colors.graphite} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('voiceExpense.title')}</Text>
        <View style={{ width: 22 }} />
      </View>

      {body}

      {capBody ? (
        <WaitlistModal
          visible
          // The server owns the number; hardcoding it here would drift the
          // moment FreeVoiceCap changes.
          cap={capBody.remaining ?? 0}
          body={t('voiceExpense.capBody')}
          periodResetsAt={capBody.periodResetsAt}
          defaultEmail={account?.user.email}
          onSubmit={handleWaitlistSubmit}
          onDismiss={() => setCapBody(null)}
          onSelfHostPressed={() => {
            void Linking.openURL('https://chara.app/self-host');
          }}
        />
      ) : null}
    </View>
  );
}

// ── sub-views ───────────────────────────────────────────────────────────

function IdleView({ onRecord, onType }: { onRecord(): void; onType(): void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.centered}>
      <TouchableOpacity
        style={styles.micButton}
        onPress={onRecord}
        accessibilityRole="button"
        accessibilityLabel={t('voiceExpense.startRecording')}
      >
        <Feather name="mic" size={36} color={colors.paper} />
      </TouchableOpacity>
      <Text style={styles.hint}>{t('voiceExpense.hint')}</Text>
      <Text style={styles.exampleLabel}>{t('voiceExpense.exampleLabel')}</Text>
      <Text style={styles.example}>{t('voiceExpense.example')}</Text>
      <TouchableOpacity onPress={onType} accessibilityRole="button">
        <Text style={styles.link}>{t('voiceExpense.typeInstead')}</Text>
      </TouchableOpacity>
    </View>
  );
}

function RecordingView({
  elapsedMs,
  level,
  onStop,
}: {
  elapsedMs: number;
  /** Loudness 0..1, already normalised by dbfsToLevel. */
  level: number;
  onStop(): void;
}) {
  const { t } = useTranslation();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const remaining = Math.max(0, Math.ceil((MAX_CLIP_MS - elapsedMs) / 1000));

  return (
    <View style={styles.centered}>
      <Animated.View style={[styles.recordingDot, { opacity: pulse }]} />
      <Text style={styles.timer}>{t('voiceExpense.secondsLeft', { count: remaining })}</Text>
      <VoiceVocalizer level={level} />
      <Button onPress={onStop}>
        <Text>{t('voiceExpense.stop')}</Text>
      </Button>
    </View>
  );
}

function ReviewView({
  transcript,
  transcriptEdited,
  drafts,
  members,
  questions,
  answers,
  groupCurrency,
  onTranscriptChange,
  onAnswer,
  onRegenerate,
  onUse,
}: {
  transcript: string;
  /** Whether the user has actually changed the text. Gates the redo. */
  transcriptEdited: boolean;
  drafts: VoiceDraft[];
  members: RosterMember[];
  questions: VoiceQuestion[];
  answers: Record<string, { member_id: string; text: string }>;
  groupCurrency: string;
  onTranscriptChange(v: string): void;
  onAnswer(questionId: string, memberId: string, label: string): void;
  onRegenerate(): void;
  onUse(): void;
}) {
  const { t } = useTranslation();
  return (
    <ScrollView contentContainerStyle={styles.reviewScroll} keyboardShouldPersistTaps="handled">
      <Text style={styles.eyebrow}>{t('voiceExpense.transcriptLabel')}</Text>
      <TextInput
        style={styles.transcriptInput}
        value={transcript}
        onChangeText={onTranscriptChange}
        multiline
        placeholder={t('voiceExpense.example')}
        placeholderTextColor={colors.lead}
        accessibilityLabel={t('voiceExpense.transcriptLabel')}
        // A visual affordance helps nobody using VoiceOver; say it too.
        accessibilityHint={t('voiceExpense.transcriptHint')}
      />

      {questions.map((q) => (
        <View key={q.id} style={styles.questionCard}>
          <Text style={styles.questionText}>{q.text}</Text>
          <View style={styles.optionRow}>
            {q.options.map((o) => {
              const selected = answers[q.id]?.member_id === o.member_id;
              return (
                <TouchableOpacity
                  key={o.member_id}
                  style={[styles.optionChip, selected && styles.optionChipSelected]}
                  onPress={() => onAnswer(q.id, o.member_id, o.label)}
                  accessibilityRole="button"
                >
                  <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                    {o.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}

      {drafts.length > 0 ? (
        <>
          <Text style={styles.eyebrow}>
            {t('voiceExpense.draftsLabel', { count: drafts.length })}
          </Text>
          {drafts.map((d, i) => (
            <View key={`${d.title}-${i}`} style={styles.draftCard}>
              <View style={styles.draftHeader}>
                <Text style={styles.draftTitle} numberOfLines={1}>
                  {d.title}
                </Text>
                <Text style={styles.draftAmount}>
                  {formatMinorUnits(d.amount_minor, d.currency || groupCurrency)}
                </Text>
              </View>
              {/* The source phrase is what makes accepting several drafts at
                  once reasonable: the user can see where each came from. */}
              <Text style={styles.draftPhrase} numberOfLines={2}>
                “{d.source_phrase}”
              </Text>
              <DraftSplitLine draft={d} members={members} groupCurrency={groupCurrency} />
              {d.reasoning ? (
                <Text style={styles.draftReasoning} numberOfLines={3}>
                  {d.reasoning}
                </Text>
              ) : null}
              {d.low_confidence?.length ? (
                <View style={styles.flagRow}>
                  {d.low_confidence.map((f) => (
                    <Text key={f} style={styles.flag}>
                      {t(`voiceExpense.flag_${f}` as const, {
                        defaultValue: t('voiceExpense.flag_generic'),
                      })}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          ))}
        </>
      ) : null}

      <View style={styles.reviewActions}>
        <Button kind="secondary" onPress={onRegenerate} disabled={!transcriptEdited}>
          <Text>
            {transcriptEdited
              ? t('voiceExpense.regenerate')
              : t('voiceExpense.regenerateDisabled')}
          </Text>
        </Button>
        {drafts.length > 0 ? (
          <Button onPress={onUse}>
            <Text>{t('voiceExpense.useDrafts')}</Text>
          </Button>
        ) : null}
      </View>
    </ScrollView>
  );
}

/**
 * States the split in words: who is on it, how it divides, and — when it
 * divides exactly — what each person owes.
 *
 * This is the line that would have made "the rest of the guys" (which
 * excludes the speaker) visible before saving rather than after.
 */
function DraftSplitLine({
  draft,
  members,
  groupCurrency,
}: {
  draft: VoiceDraft;
  members: RosterMember[];
  groupCurrency: string;
}) {
  const { t } = useTranslation();
  const summary = splitSummary(draft, members);
  if (summary.memberNames.length === 0) return null;

  const method = t(`addExpense.split.${draft.split_method}` as const);
  const each =
    summary.perPersonMinor !== undefined
      ? t('voiceExpense.eachAmount', {
          amount: formatMinorUnits(summary.perPersonMinor, draft.currency || groupCurrency),
        })
      : null;

  return (
    <Text style={styles.draftSplit} numberOfLines={2}>
      {[summary.memberNames.join(', '), method, each].filter(Boolean).join(' · ')}
    </Text>
  );
}

function ErrorView({
  code,
  onRetry,
  onGoToSettle,
}: {
  code: 'unintelligible' | 'no_expense' | 'settlement' | 'network';
  onRetry(): void;
  onGoToSettle(): void;
}) {
  const { t } = useTranslation();
  const message = t(`voiceExpense.err_${code}` as const);

  return (
    <View style={styles.centered}>
      <Feather
        name={code === 'settlement' ? 'repeat' : 'alert-circle'}
        size={28}
        color={code === 'settlement' ? colors.graphite : colors.brick}
      />
      <Text style={styles.errorText}>{message}</Text>
      {/* A repayment is a redirect, not a failure — offer the real action. */}
      {code === 'settlement' ? (
        <Button onPress={onGoToSettle}>
        <Text>{t('voiceExpense.goToSettle')}</Text>
      </Button>
      ) : null}
      <Button kind="secondary" onPress={onRetry}>
        <Text>{t('voiceExpense.tryAgain')}</Text>
      </Button>
    </View>
  );
}

// ── helpers ─────────────────────────────────────────────────────────────

/** The device's local day, which is what "yesterday" must resolve against.
 *  Built from local getters rather than toISOString, which is UTC. */
function localDateString(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    return '';
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s5,
    paddingBottom: spacing.s4,
  },
  title: { fontFamily: fontDisplay, fontSize: fontSize.body, color: colors.graphite },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.s5,
    gap: spacing.s4,
  },
  micButton: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.graphite,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.graphite,
    textAlign: 'center',
  },
  example: {
    fontFamily: fontBody,
    fontSize: fontSize.caption,
    color: colors.lead,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  link: { fontFamily: fontBody, fontSize: fontSize.caption, color: colors.lead },
  exampleLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  recordingDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.brick },
  timer: {
    fontFamily: fontMono,
    fontSize: fontSize.body,
    color: colors.graphite,
    fontVariant: ['tabular-nums'],
  },
  reviewScroll: { padding: spacing.s4, gap: spacing.s3, paddingBottom: spacing.s6 },
  eyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  // Deliberately NOT a bone card: the draft and question cards on this
  // same screen are bone, so filling this made an editable field look like
  // the read-only things beside it. The app's Field convention is a ruled
  // input on paper, and the contrast is what signals "you can type here".
  transcriptInput: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.graphite,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.ruleSoft,
    borderRadius: 10,
    padding: spacing.s4,
    minHeight: 88,
    textAlignVertical: 'top',
  },
  questionCard: { backgroundColor: colors.bone, borderRadius: 10, padding: spacing.s4 },
  questionText: { fontFamily: fontBody, fontSize: fontSize.body, color: colors.graphite },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s2, marginTop: spacing.s3 },
  optionChip: {
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.ruleSoft,
  },
  optionChipSelected: { backgroundColor: colors.graphite, borderColor: colors.graphite },
  optionText: { fontFamily: fontBody, fontSize: fontSize.caption, color: colors.graphite },
  optionTextSelected: { color: colors.paper },
  draftCard: { backgroundColor: colors.bone, borderRadius: 10, padding: spacing.s4 },
  draftHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  draftTitle: {
    fontFamily: fontDisplay,
    fontSize: fontSize.body,
    color: colors.graphite,
    flexShrink: 1,
  },
  draftAmount: {
    fontFamily: fontMono,
    fontSize: fontSize.body,
    color: colors.graphite,
    fontVariant: ['tabular-nums'],
  },
  draftPhrase: {
    fontFamily: fontBody,
    fontSize: fontSize.caption,
    color: colors.lead,
    marginTop: spacing.s2,
  },
  // Mono: this line is names, a method and a number — closer to data than
  // prose, and it should scan rather than read.
  draftSplit: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.graphite,
    marginTop: spacing.s2,
  },
  draftReasoning: {
    fontFamily: fontBody,
    fontSize: fontSize.caption,
    color: colors.graphite,
    marginTop: spacing.s2,
  },
  flagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s2, marginTop: spacing.s2 },
  flag: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.brick,
    letterSpacing: 0.3,
  },
  reviewActions: { gap: spacing.s3, marginTop: spacing.s4 },
  errorText: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.graphite,
    textAlign: 'center',
  },
});
