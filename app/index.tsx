import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { colors } from '../constants/colors';

const ONBOARDING_STORAGE_KEY = '@kutana_onboarding_completed';

export default function Index() {
  const router = useRouter();
  const [isCheckingOnboarding, setIsCheckingOnboarding] = useState(true);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);

  useEffect(() => {
    const checkOnboarding = async () => {
      try {
        const value = await AsyncStorage.getItem(ONBOARDING_STORAGE_KEY);
        setHasSeenOnboarding(value === 'true');
      } catch (error) {
        console.error('Error checking onboarding status:', error);
        setHasSeenOnboarding(false);
      } finally {
        setIsCheckingOnboarding(false);
      }
    };

    checkOnboarding();
  }, []);

  useEffect(() => {
    if (!isCheckingOnboarding) {
      if (hasSeenOnboarding) {
        router.replace('/(screens)/splash');
      } else {
        router.replace('/(screens)/onboarding');
      }
    }
  }, [isCheckingOnboarding, hasSeenOnboarding, router]);

  // Show loading while checking onboarding status
  if (isCheckingOnboarding) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.purple500} />
      </View>
    );
  }

  // This should not be reached, but just in case
  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
