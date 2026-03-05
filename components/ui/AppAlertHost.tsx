import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type AlertButton,
  type AlertOptions,
} from 'react-native';
import { colors } from '../../constants/colors';
import { setAppAlertListener, type AppAlertPayload } from '../../lib/appAlert';

interface AlertRequest extends AppAlertPayload {
  id: string;
}

const DEFAULT_BUTTON: AlertButton = { text: 'OK' };

const getButtonLabel = (button?: AlertButton) => {
  if (!button?.text || button.text.trim().length === 0) return 'OK';
  return button.text;
};

export function AppAlertHost() {
  const [queue, setQueue] = useState<AlertRequest[]>([]);

  useEffect(() => {
    const listener = (payload: AppAlertPayload) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setQueue((prev) => [...prev, { ...payload, id }]);
    };

    setAppAlertListener(listener);
    return () => {
      setAppAlertListener(null);
    };
  }, []);

  const current = queue[0] ?? null;
  const currentButtons = useMemo(() => {
    if (!current?.buttons || current.buttons.length === 0) return [DEFAULT_BUTTON];
    return current.buttons;
  }, [current]);

  const isCancelable = useMemo(() => {
    const options: AlertOptions | undefined = current?.options;
    return options?.cancelable ?? false;
  }, [current]);

  const closeCurrent = useCallback(
    (triggeredButton?: AlertButton) => {
      if (!current) return;
      const dismissHandler = current.options?.onDismiss;
      const onPress = triggeredButton?.onPress;

      setQueue((prev) => prev.slice(1));

      if (triggeredButton) {
        setTimeout(() => {
          onPress?.();
        }, 0);
      } else {
        setTimeout(() => {
          dismissHandler?.();
        }, 0);
      }
    },
    [current]
  );

  if (!current) return null;

  const isRowButtons = currentButtons.length <= 2;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (isCancelable) {
          closeCurrent();
        }
      }}
    >
      <Pressable
        style={styles.overlay}
        onPress={() => {
          if (isCancelable) closeCurrent();
        }}
      >
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.iconWrap}>
            <Ionicons name="notifications-outline" size={20} color={colors.purple500} />
          </View>

          <Text style={styles.title}>{current.title || 'Information'}</Text>
          {!!current.message && <Text style={styles.message}>{current.message}</Text>}

          <View style={[styles.actions, isRowButtons ? styles.actionsRow : styles.actionsColumn]}>
            {currentButtons.map((button, index) => {
              const style = button.style ?? 'default';
              const isDestructive = style === 'destructive';
              const isCancel = style === 'cancel';

              return (
                <TouchableOpacity
                  key={`${getButtonLabel(button)}-${index}`}
                  activeOpacity={0.86}
                  style={[
                    styles.buttonBase,
                    isRowButtons ? styles.buttonRow : styles.buttonColumn,
                    isDestructive
                      ? styles.buttonDanger
                      : isCancel
                        ? styles.buttonCancel
                        : styles.buttonPrimary,
                  ]}
                  onPress={() => {
                    closeCurrent(button);
                  }}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      isDestructive ? styles.buttonTextDanger : undefined,
                      isCancel ? styles.buttonTextCancel : undefined,
                    ]}
                  >
                    {getButtonLabel(button)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.56)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 22,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#111111',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
    padding: 18,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.34,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 8,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${colors.backgroundTertiary}CC`,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  message: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  actions: {
    marginTop: 8,
    gap: 10,
  },
  actionsRow: {
    flexDirection: 'row',
  },
  actionsColumn: {
    flexDirection: 'column',
  },
  buttonBase: {
    minHeight: 44,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  buttonRow: {
    flex: 1,
  },
  buttonColumn: {
    width: '100%',
  },
  buttonPrimary: {
    backgroundColor: colors.purple600,
  },
  buttonCancel: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonDanger: {
    backgroundColor: colors.red600,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  buttonTextCancel: {
    color: colors.text,
    fontWeight: '600',
  },
  buttonTextDanger: {
    color: '#fff',
  },
});

