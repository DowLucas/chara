import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, typography } from '@/lib/theme';
import { useResponsive } from '@/lib/use-responsive';
import { Text } from './Text';

const ROUTE_TO_TAB: Record<
  string,
  { icon: React.ComponentProps<typeof Feather>['name']; labelKey: string }
> = {
  index: { icon: 'home', labelKey: 'tabs.home' },
  activity: { icon: 'activity', labelKey: 'tabs.activity' },
  you: { icon: 'user', labelKey: 'tabs.you' },
};

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { contentMaxWidth } = useResponsive();

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <View
        style={[
          styles.row,
          contentMaxWidth != null && {
            maxWidth: contentMaxWidth,
            alignSelf: 'center',
          },
        ]}
      >
        {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;
        const tabInfo = ROUTE_TO_TAB[route.name];
        if (!tabInfo) return null;

        function onPress() {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
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
            <Text style={[styles.label, isFocused && styles.labelActive]}>
              {t(tabInfo.labelKey)}
            </Text>
          </TouchableOpacity>
        );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.paper,
    borderTopWidth: 1.5,
    borderTopColor: colors.graphite,
    paddingTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    width: '100%',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingBottom: 6,
    gap: 3,
  },
  label: {
    ...typography.monoCaption,
    color: colors.lead,
  },
  labelActive: {
    color: colors.graphite,
  },
});
