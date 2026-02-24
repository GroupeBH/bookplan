import React from 'react';
import { TextInput, View, StyleSheet, TextInputProps, ViewStyle, TextStyle, StyleProp, Text } from 'react-native';
import { colors } from '../../constants/colors';

interface InputProps extends TextInputProps {
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  label?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function Input({ containerStyle, inputStyle, label, leftIcon, rightIcon, style, ...props }: InputProps) {
  return (
    <View style={containerStyle} pointerEvents="box-none">
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.container}>
        {leftIcon ? <View style={styles.leftIcon}>{leftIcon}</View> : null}
        <TextInput
          style={[
            styles.input,
            leftIcon ? styles.inputWithLeftIcon : undefined,
            rightIcon ? styles.inputWithRightIcon : undefined,
            inputStyle,
            style,
          ]}
          placeholderTextColor={colors.textTertiary}
          editable={true}
          selectTextOnFocus={false}
          autoCorrect={false}
          autoCapitalize="none"
          {...props}
        />
        {rightIcon ? <View style={styles.rightIcon}>{rightIcon}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
    marginBottom: 8,
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
    pointerEvents: 'none',
  },
  rightIcon: {
    position: 'absolute',
    right: 12,
    zIndex: 1,
    pointerEvents: 'box-none',
  },
});
