import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, typography } from '@/lib/theme';
import { Text } from './Text';
import { listGroups, Group } from '@/lib/api';
import { ActionSheet, ActionSheetOption, openNativeActionSheet } from '@/components/ActionSheet';
import i18n from '@/lib/i18n';

const ROUTE_TO_TAB: Record<string, { icon: React.ComponentProps<typeof Feather>['name']; labelKey: string }> = {
  index: { icon: 'home', labelKey: 'tabs.home' },
  you: { icon: 'user', labelKey: 'tabs.you' },
};

function navigateToAddExpense(groupId: string) {
  router.push(`/groups/${groupId}/add-expense`);
}

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerGroups, setPickerGroups] = useState<Group[]>([]);

  async function onFabPress() {
    let groups: Group[] = [];
    try {
      groups = await listGroups();
    } catch {
      router.push('/(tabs)');
      return;
    }
    if (groups.length === 0) {
      router.push('/(tabs)');
      return;
    }
    if (groups.length === 1) {
      navigateToAddExpense(groups[0].id);
      return;
    }
    const options: ActionSheetOption[] = groups.map((g) => ({
      label: g.name,
      onPress: () => navigateToAddExpense(g.id),
    }));
    if (Platform.OS === 'ios' && openNativeActionSheet(i18n.t('tabs.chooseGroup'), options)) {
      return;
    }
    setPickerGroups(groups);
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
      options={pickerGroups.map((g) => ({
        label: g.name,
        onPress: () => navigateToAddExpense(g.id),
      }))}
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
