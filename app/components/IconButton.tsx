import React from 'react';
import { TouchableOpacity, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '@/lib/theme';

interface Props {
  icon: React.ComponentProps<typeof Feather>['name'];
  onPress?: () => void;
  label?: string;
  size?: number;
  color?: string;
}

export function IconButton({ icon, onPress, label, size = 22, color = colors.graphite }: Props) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityLabel={label}
      style={styles.btn}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Feather name={icon} size={size} color={color} strokeWidth={1.5} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
