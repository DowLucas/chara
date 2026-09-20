import React, { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { OnboardingScaffold } from '@/components/OnboardingScaffold';
import { GroupSetupForm, GroupSetupValue, defaultGroupCurrency } from '@/components/GroupSetupForm';
import { useEnglishT } from '@/lib/i18n';
import { loadDraft, signUpHref, updateDraft } from '@/lib/onboarding-draft';
import { legacyHostedUrl } from '@/lib/legacy-hosted-url';

// Draft-only: the group is created after sign-up by onboarding/setup.
export default function WelcomeCreateScreen() {
  const t = useEnglishT();
  const [form, setForm] = useState<GroupSetupValue>(() => ({
    name: '',
    currency: defaultGroupCurrency(),
    color: null,
  }));

  useEffect(() => {
    void loadDraft().then((d) => {
      if (d?.group) setForm(d.group);
    });
  }, []);

  const canSubmit = form.name.trim().length > 0;

  async function handleContinue() {
    if (!canSubmit) return;
    const draft = await updateDraft({
      intent: 'create',
      group: { ...form, name: form.name.trim() },
    });
    router.push(signUpHref(draft, legacyHostedUrl()) as never);
  }

  return (
    <OnboardingScaffold
      eyebrow={t('welcome.step', { current: 3, total: 3 })}
      headline={t('welcome.createHeadline')}
      body={t('welcome.createBody')}
      cta={{ label: t('welcome.continue'), onPress: handleContinue, disabled: !canSubmit }}
    >
      <GroupSetupForm value={form} onChange={setForm} />
    </OnboardingScaffold>
  );
}
