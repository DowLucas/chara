import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Text } from '@/components/Text';
import { isPopupJustClosed } from '@/lib/popup-guard';
import { fontDisplay, fontMono, fontSize, spacing } from '@/lib/theme';
import { makeStyles, useColors } from '@/lib/theme-context';

interface Props {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  value: string;
  onPress: () => void;
  onLongPress?: () => void;
  accessibilityHint?: string;
  /** 'rows' at large Dynamic Type sizes so the value never truncates. */
  layout: 'tiles' | 'rows';
}

/** A large quick-setting tile on the You tab (Appearance, Language, Home
 *  currency). Becomes a full-width row when text is large. */
export function SettingTile({ icon, label, value, onPress, onLongPress, accessibilityHint, layout }: Props) {
  const styles = useStyles();
  const colors = useColors();
  const rows = layout === 'rows';
  return (
    <TouchableOpacity
      onPress={() => { if (!isPopupJustClosed()) onPress(); }}
      onLongPress={onLongPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      accessibilityHint={accessibilityHint}
      style={[styles.tile, rows && styles.tileRow]}
    >
      <View style={styles.icon}>
        <Feather name={icon} size={18} color={colors.graphite} />
      </View>
      <View style={rows ? styles.textRow : undefined}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value} numberOfLines={rows ? undefined : 2}>{value}</Text>
      </View>
    </TouchableOpacity>
  );
}

const useStyles = makeStyles((colors) => ({
  tile: {
    flex: 1,
    minHeight: 118,
    backgroundColor: colors.bone,
    borderRadius: 10,
    paddingVertical: spacing.s4,
    paddingHorizontal: spacing.s3,
    gap: spacing.s2,
  },
  tileRow: { flex: 0, minHeight: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.s3 },
  textRow: { flex: 1 },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontFamily: fontDisplay, fontSize: fontSize.body, color: colors.graphite },
  value: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.2,
    marginTop: 2,
  },
}));
