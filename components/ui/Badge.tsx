import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { colors } from '../../constants/colors';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'error' | 'warning' | 'info';
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function Badge({ children, variant = 'default', style, textStyle }: BadgeProps) {
  const badgeStyle = [
    styles.badge,
    variant === 'default' && styles.badgeDefault,
    variant === 'success' && styles.badgeSuccess,
    variant === 'error' && styles.badgeError,
    variant === 'warning' && styles.badgeWarning,
    variant === 'info' && styles.badgeInfo,
    style,
  ];

  const textStyleFinal = [
    styles.text,
    variant === 'default' && styles.textDefault,
    variant === 'success' && styles.textSuccess,
    variant === 'error' && styles.textError,
    variant === 'warning' && styles.textWarning,
    variant === 'info' && styles.textInfo,
    textStyle,
  ];

  return (
    <View style={badgeStyle}>
      <Text style={textStyleFinal}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  badgeDefault: {
    backgroundColor: `${colors.purple500}33`,
    borderWidth: 1,
    borderColor: `${colors.purple500}4d`,
  },
  badgeSuccess: {
    backgroundColor: `${colors.green500}33`,
    borderWidth: 1,
    borderColor: `${colors.green500}4d`,
  },
  badgeError: {
    backgroundColor: `${colors.red500}33`,
    borderWidth: 1,
    borderColor: `${colors.red500}4d`,
  },
  badgeWarning: {
    backgroundColor: `${colors.yellow500}33`,
    borderWidth: 1,
    borderColor: `${colors.yellow500}4d`,
  },
  badgeInfo: {
    backgroundColor: `${colors.purple500}33`,
    borderWidth: 1,
    borderColor: `${colors.purple500}4d`,
  },
  text: {
    fontSize: 12,
    fontWeight: '500',
  },
  textDefault: {
    color: colors.purple400,
  },
  textSuccess: {
    color: colors.green500,
  },
  textError: {
    color: colors.red500,
  },
  textWarning: {
    color: colors.yellow400,
  },
  textInfo: {
    color: colors.purple400,
  },
});

