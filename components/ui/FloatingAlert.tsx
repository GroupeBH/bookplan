import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../../constants/colors';

type AlertType = 'success' | 'error' | 'info';

interface FloatingAlertProps {
  visible: boolean;
  type?: AlertType;
  title: string;
  message: string;
  autoHideMs?: number;
  onHide: () => void;
}

export function FloatingAlert({
  visible,
  type = 'info',
  title,
  message,
  autoHideMs = 3000,
  onHide,
}: FloatingAlertProps) {
  const [mounted, setMounted] = useState(visible);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-14)).current;

  const palette = useMemo(() => {
    switch (type) {
      case 'success':
        return {
          accent: colors.green500,
          icon: 'checkmark-circle' as const,
        };
      case 'error':
        return {
          accent: colors.red500,
          icon: 'close-circle' as const,
        };
      default:
        return {
          accent: colors.purple500,
          icon: 'information-circle' as const,
        };
    }
  }, [type]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();

      timer = setTimeout(() => {
        onHide();
      }, autoHideMs);
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: -10,
          duration: 160,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setMounted(false);
        }
      });
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [visible, autoHideMs, mounted, onHide, opacity, translateY]);

  if (!mounted) return null;

  return (
    <View pointerEvents="box-none" style={styles.host}>
      <Animated.View
        style={[
          styles.container,
          {
            borderColor: `${palette.accent}66`,
            transform: [{ translateY }],
            opacity,
          },
        ]}
      >
        <View style={styles.left}>
          <Ionicons name={palette.icon} size={18} color={palette.accent} />
          <View style={styles.textWrap}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.message}>{message}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={onHide} style={styles.closeButton} activeOpacity={0.8}>
          <Ionicons name="close" size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: 8,
    left: 16,
    right: 16,
    zIndex: 1000,
  },
  container: {
    backgroundColor: '#0f0f0f',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  left: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    flex: 1,
  },
  textWrap: {
    flex: 1,
    gap: 3,
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  message: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  closeButton: {
    marginLeft: 8,
    padding: 2,
  },
});
