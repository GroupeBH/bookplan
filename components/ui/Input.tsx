import React from 'react';
import { TextInput, View, StyleSheet, TextInputProps, ViewStyle } from 'react-native';
import { colors } from '../../constants/colors';

interface InputProps extends TextInputProps {
  containerStyle?: ViewStyle;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function Input({ containerStyle, leftIcon, rightIcon, style, ...props }: InputProps) {
  return (
    <View style={[styles.container, containerStyle]} pointerEvents="box-none">
      {leftIcon && <View style={styles.leftIcon}>{leftIcon}</View>}
      <TextInput
        style={[styles.input, leftIcon && styles.inputWithLeftIcon, rightIcon && styles.inputWithRightIcon, style]}
        placeholderTextColor={colors.textTertiary}
        editable={true}
        selectTextOnFocus={false}
        autoCorrect={false}
        autoCapitalize="none"
        {...props}
      />
      {rightIcon && <View style={styles.rightIcon}>{rightIcon}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    height: 56,
    backgroundColor: `${colors.backgroundTertiary}80`,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    color: colors.text,
    fontSize: 16,
  },
  inputWithLeftIcon: {
    paddingLeft: 48,
  },
  inputWithRightIcon: {
    paddingRight: 48,
  },
  leftIcon: {
    position: 'absolute',
    left: 12,
    zIndex: 1,
    pointerEvents: 'none', // Permet de cliquer à travers l'icône
  },
  rightIcon: {
    position: 'absolute',
    right: 12,
    zIndex: 1,
    pointerEvents: 'none', // Permet de cliquer à travers l'icône
  },
});

