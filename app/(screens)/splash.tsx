import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';

export default function SplashScreen() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    // Wait for auth to finish loading, then navigate after 2 seconds
    if (!isLoading) {
      const timer = setTimeout(() => {
        if (isAuthenticated) {
          router.replace('/(screens)/dashboard');
        } else {
          router.replace('/(screens)/auth');
        }
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, isLoading, router]);

  return (
    <View style={styles.container}>
      {/* Logo */}
      <View style={styles.logoContainer}>
        <View style={styles.logo}>
          <Ionicons name="sparkles" size={48} color="#ffffff" />
        </View>
      </View>

      {/* Title */}
      <View style={styles.textContainer}>
        <Text style={styles.title}>BOOKPLAN</Text>
        <Text style={styles.subtitle}>Votre compagnie à portée de main</Text>
      </View>

      {/* Loading indicator */}
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.purple500} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  logoContainer: {
    marginBottom: 32,
  },
  logo: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: colors.purple500,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.purple500,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  textContainer: {
    alignItems: 'center',
    marginBottom: 80,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 3,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  loadingContainer: {
    position: 'absolute',
    bottom: 80,
  },
});
