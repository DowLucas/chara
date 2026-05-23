import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, typography } from '@/lib/theme';
import { Text } from './Text';
import { Group, apiFor } from '@/lib/api';
import { snapshot } from '@/lib/accounts-store';
import { ActionSheet, ActionSheetOption, openNativeActionSheet } from '@/components/ActionSheet';
import { isPopupJustClosed } from '@/lib/popup-guard';
import i18n from '@/lib/i18n';

const ROUTE_TO_TAB: Record<string, { icon: React.ComponentProps<typeof Feather>['name']; labelKey: string }> = {
  index: { icon: 'home', labelKey: 'tabs.home' },
  you: { icon: 'user', labelKey: 'tabs.you' },
};

interface GroupItem {
  serverUrl: string;
  group: Group;
}

function navigateToAddExpense(serverUrl: string, groupId: string) {
  router.push(`/groups/${encodeURIComponent(serverUrl)}/${groupId}/add-expense`);
}

function hostOf(serverUrl: string): string {
  try {
    return new URL(serverUrl).host;
  } catch {
    return serverUrl;
  }
}

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerItems, setPickerItems] = useState<GroupItem[]>([]);

  async function onFabPress() {
    // Don't reopen the group-picker if a popup was just dismissed in the
    // same gesture. See app/lib/popup-guard.ts.
    if (isPopupJustClosed()) return;
    const accounts = snapshot().accounts.filter(
      (a) => a.status !== 'reauth_required' && a.status !== 'incompatible',
    );
    if (accounts.length === 0) {
      router.push('/(tabs)');
      return;
    }

    const results = await Promise.allSettled(
      accounts.map((a) => apiFor(a.serverUrl).listGroups()),
    );

    const items: GroupItem[] = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        for (const g of r.value) {
          items.push({ serverUrl: accounts[i].serverUrl, group: g });
        }
      }
    });

    if (items.length === 0) {
      router.push('/(tabs)');
      return;
    }
    if (items.length === 1) {
      navigateToAddExpense(items[0].serverUrl, items[0].group.id);
      return;
    }

    // Detect duplicate group names — append server host when ambiguous.
    const nameCounts = new Map<string, number>();
    for (const item of items) {
      nameCounts.set(item.group.name, (nameCounts.get(item.group.name) ?? 0) + 1);
    }
    const labelFor = (item: GroupItem) =>
      (nameCounts.get(item.group.name) ?? 0) > 1
        ? `${item.group.name} · ${hostOf(item.serverUrl)}`
        : item.group.name;

    const options: ActionSheetOption[] = items.map((item) => ({
      label: labelFor(item),
      onPress: () => navigateToAddExpense(item.serverUrl, item.group.id),
    }));
    if (Platform.OS === 'ios' && openNativeActionSheet(i18n.t('tabs.chooseGroup'), options)) {
      return;
    }
    setPickerItems(items);
    setPickerVisible(true);
  }

  return (
    <>
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;
        const tabInfo = ROUTE_TO_TAB[route.name];
        if (!tabInfo) return null;

        function onPress() {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
        }

        return (
          <TouchableOpacity
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            onPress={onPress}
            style={styles.tab}
            activeOpacity={0.7}
          >
            <Feather
              name={tabInfo.icon}
              size={22}
              color={isFocused ? colors.graphite : colors.lead}
              strokeWidth={1.5}
            />
            <Text style={[styles.label, isFocused && styles.labelActive]}>{t(tabInfo.labelKey)}</Text>
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 14 }]}
        onPress={onFabPress}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={t('tabs.addExpenseLabel')}
      >
        <Feather name="plus" size={26} color={colors.paper} strokeWidth={1.5} />
      </TouchableOpacity>
    </View>
    <ActionSheet
      visible={pickerVisible}
      onClose={() => setPickerVisible(false)}
      title={t('tabs.chooseGroup')}
      options={pickerItems.map((item) => {
        const dup =
          pickerItems.filter((x) => x.group.name === item.group.name).length > 1;
        return {
          label: dup ? `${item.group.name} · ${hostOf(item.serverUrl)}` : item.group.name,
          onPress: () => navigateToAddExpense(item.serverUrl, item.group.id),
        };
      })}
    />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.paper,
    borderTopWidth: 1.5,
    borderTopColor: colors.graphite,
    paddingTop: 8,
    alignItems: 'flex-end',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingBottom: 6,
    gap: 3,
  },
  fab: {
    position: 'absolute',
    left: '50%',
    marginLeft: -26,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.graphite,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.graphite,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  label: {
    ...typography.monoCaption,
    color: colors.lead,
  },
  labelActive: {
    color: colors.graphite,
  },
});
