/**
 * Visual presentation of an alert. Pure component — wired to the AppAlert
 * queue exclusively by `AppAlertHost`.
 *
 * Visual language: fade-in centered card on a dim backdrop (the traditional
 * alert affordance — `Alert.alert` fades, action sheets slide). The card uses
 * the bone/paper palette so it sits naturally inside any screen.
 */

import React from 'react';
import {
  Modal,
  View,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Text } from '../Text';
import { markPopupClosed } from '@/lib/popup-guard';
import type { AppAlertRequest, AppAlertButton } from '@/lib/app-alert';
import {
  colors,
  fontBody,
  fontBodyMedium,
  fontMonoMedium,
  fontSize,
  radii,
  spacing,
} from '@/lib/theme';

interface Props {
  request: AppAlertRequest;
}

const SCREEN = Dimensions.get('window');
const MAX_WIDTH = Math.min(320, SCREEN.width - spacing.s7);

export function AppAlert({ request }: Props) {
  const { title, message, buttons, dismissable } = request;

  // Stamp the popup-guard on every dismissal path so the screen underneath
  // can't fire `onPress` in the same gesture that dismissed us. Mirrors
  // ActionSheet's `closeWithGuard` pattern.
  const handleDismiss = React.useCallback(() => {
    markPopupClosed();
    request.dismiss();
  }, [request]);

  const handleButton = React.useCallback(
    (b: AppAlertButton) => {
      markPopupClosed();
      request.resolve(b.key);
    },
    [request],
  );

  // Horizontal row for <=2 buttons (classic iOS alert), stacked for 3+.
  const stacked = buttons.length > 2;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <TouchableWithoutFeedback onPress={dismissable ? handleDismiss : undefined}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <View style={[styles.card, { maxWidth: MAX_WIDTH }]} accessibilityRole="alert">
          <View style={styles.body}>
            <Text style={styles.title}>{title}</Text>
            {message ? <Text style={styles.message}>{message}</Text> : null}
          </View>

          <View style={[styles.buttonRow, stacked && styles.buttonStack]}>
            {buttons.map((b, i) => (
              <TouchableOpacity
                key={`${b.key}-${i}`}
                onPress={() => handleButton(b)}
                activeOpacity={0.7}
                style={[
                  styles.button,
                  stacked ? styles.buttonStacked : styles.buttonInline,
                  // Vertical divider between inline buttons after the first.
                  !stacked && i > 0 && styles.buttonDividerLeft,
                ]}
                accessibilityRole="button"
                accessibilityLabel={b.label}
              >
                <Text
                  style={[
                    styles.buttonLabel,
                    b.style === 'destructive' && styles.buttonLabelDestructive,
                    b.style === 'cancel' && styles.buttonLabelCancel,
                  ]}
                  numberOfLines={1}
                >
                  {b.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.s5,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  card: {
    width: '100%',
    backgroundColor: colors.bone,
    borderRadius: radii.lg,
    borderWidth: 0.5,
    borderColor: colors.graphite,
    overflow: 'hidden',
  },
  body: {
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s5,
    paddingBottom: spacing.s4,
    alignItems: 'center',
  },
  title: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.bodyL,
    color: colors.graphite,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  message: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    textAlign: 'center',
    marginTop: spacing.s2,
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    borderTopWidth: 0.5,
    borderTopColor: colors.ruleSoft,
  },
  buttonStack: {
    flexDirection: 'column',
  },
  button: {
    paddingVertical: spacing.s4,
    paddingHorizontal: spacing.s3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonInline: {
    flex: 1,
  },
  buttonStacked: {
    width: '100%',
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ruleSoft,
  },
  buttonDividerLeft: {
    borderLeftWidth: 0.5,
    borderLeftColor: colors.ruleSoft,
  },
  buttonLabel: {
    fontFamily: fontBodyMedium,
    fontSize: fontSize.body,
    color: colors.graphite,
    letterSpacing: -0.2,
  },
  buttonLabelDestructive: {
    color: colors.brick,
  },
  buttonLabelCancel: {
    color: colors.lead,
  },
});
