import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Dimensions, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../constants/colors';

const { width } = Dimensions.get('window');

interface OnboardingPage {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  color: string;
}

const ONBOARDING_PAGES: OnboardingPage[] = [
  {
    icon: 'people-outline',
    title: 'Bienvenue sur Kutana',
    description: 'Trouvez votre compagnie idéale pour partager des moments inoubliables. Rencontrez des personnes partageant vos intérêts et créez des liens authentiques.',
    color: colors.purple500,
  },
  {
    icon: 'heart-outline',
    title: 'Demandes de compagnie',
    description: 'Envoyez ou recevez des demandes de compagnie pour des sorties, des activités ou simplement passer du temps ensemble. Gérez vos rendez-vous facilement.',
    color: colors.pink500,
  },
  {
    icon: 'gift-outline',
    title: 'Offres et candidatures',
    description: 'Publiez des offres (boire, manger, transport, cadeaux) ou candidatez à celles des autres. Trouvez des opportunités et partagez des expériences.',
    color: colors.yellow500,
  },
];

const ONBOARDING_STORAGE_KEY = '@kutana_onboarding_completed';

export default function OnboardingScreen() {
  const router = useRouter();
  const [currentPage, setCurrentPage] = useState(0);

  const handleNext = () => {
    if (currentPage < ONBOARDING_PAGES.length - 1) {
      setCurrentPage(currentPage + 1);
    } else {
      handleComplete();
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleComplete = async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
      router.replace('/(screens)/splash');
    } catch (error) {
      console.error('Error saving onboarding status:', error);
      router.replace('/(screens)/splash');
    }
  };

  const currentPageData = ONBOARDING_PAGES[currentPage];
  const isLastPage = currentPage === ONBOARDING_PAGES.length - 1;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
          <Text style={styles.skipText}>Passer</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        contentContainerStyle={styles.scrollContent}
      >
        {ONBOARDING_PAGES.map((page, index) => (
          <View key={index} style={styles.pageContainer}>
            <Animated.View
              entering={FadeIn.duration(300)}
              exiting={FadeOut.duration(200)}
              style={styles.content}
            >
              <View style={[styles.iconContainer, { backgroundColor: `${page.color}20` }]}>
                <Ionicons name={page.icon} size={80} color={page.color} />
              </View>

              <View style={styles.textContainer}>
                <Text style={styles.title}>{page.title}</Text>
                <Text style={styles.description}>{page.description}</Text>
              </View>
            </Animated.View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        {/* Pagination dots */}
        <View style={styles.pagination}>
          {ONBOARDING_PAGES.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                index === currentPage && styles.dotActive,
                { backgroundColor: index === currentPage ? currentPageData.color : colors.border },
              ]}
            />
          ))}
        </View>

        {/* Navigation buttons */}
        <View style={styles.buttons}>
          {currentPage > 0 && (
            <TouchableOpacity
              onPress={() => setCurrentPage(currentPage - 1)}
              style={[styles.button, styles.buttonSecondary, { flex: 1 }]}
            >
              <Text style={styles.buttonSecondaryText}>Précédent</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={handleNext}
            style={[
              styles.button,
              styles.buttonPrimary,
              { backgroundColor: currentPageData.color, flex: currentPage > 0 ? 1 : undefined, minWidth: 140 },
            ]}
          >
            <Text style={styles.buttonPrimaryText}>
              {isLastPage ? 'Commencer' : 'Suivant'}
            </Text>
            <Ionicons
              name={isLastPage ? 'checkmark' : 'arrow-forward'}
              size={20}
              color={colors.text}
              style={styles.buttonIcon}
            />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  skipButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  skipText: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  scrollContent: {
    flexGrow: 1,
  },
  pageContainer: {
    width,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  content: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
  },
  iconContainer: {
    width: 160,
    height: 160,
    borderRadius: 80,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 48,
  },
  textContainer: {
    alignItems: 'center',
    gap: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    gap: 24,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 24,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
  button: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonPrimary: {
    minWidth: 140,
  },
  buttonPrimaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  buttonSecondary: {
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonSecondaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  buttonIcon: {
    marginLeft: 4,
  },
});
