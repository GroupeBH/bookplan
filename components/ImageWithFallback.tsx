import React, { useState } from 'react';
import { Image, View, StyleSheet, ImageProps, ImageStyle, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';

interface ImageWithFallbackProps extends ImageProps {
  fallbackStyle?: ViewStyle;
  imageStyle?: ImageStyle;
}

export function ImageWithFallback({
  source,
  style,
  fallbackStyle,
  imageStyle,
  ...props
}: ImageWithFallbackProps) {
  const [error, setError] = useState(false);

  if (error || !source) {
    return (
      <View style={[styles.fallback, style, fallbackStyle]}>
        <Ionicons name="image-outline" size={24} color={colors.textTertiary} />
      </View>
    );
  }

  return (
    <Image
      source={source}
      style={[style, imageStyle]}
      onError={() => setError(true)}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: colors.backgroundTertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

