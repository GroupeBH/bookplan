import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import { Button } from '../../components/ui/Button';
import { ImageWithFallback } from '../../components/ImageWithFallback';
import { useBlock } from '../../context/BlockContext';
import { useUser } from '../../context/UserContext';
import Animated, { FadeIn } from 'react-native-reanimated';

export default function SettingsScreen() {
  const router = useRouter();
  const { blockedUsers, isLoading, unblockUser, refreshBlockedUsers } = useBlock();
  const { setSelectedUser } = useUser();
  const [refreshing, setRefreshing] = useState(false);

  // Recharger la liste au focus
  useFocusEffect(
    useCallback(() => {
      refreshBlockedUsers();
    }, [refreshBlockedUsers])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshBlockedUsers();
    setRefreshing(false);
  };

  const handleUnblock = async (blockedId: string, blockedPseudo: string) => {
    Alert.alert(
      'Débloquer',
      `Êtes-vous sûr de vouloir débloquer ${blockedPseudo} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Débloquer',
          style: 'destructive',
          onPress: async () => {
            const success = await unblockUser(blockedId);
            if (success) {
              Alert.alert('Succès', 'Utilisateur débloqué');
              await refreshBlockedUsers();
            } else {
              Alert.alert('Erreur', 'Impossible de débloquer l\'utilisateur');
            }
          },
        },
      ]
    );
  };

  const handleViewProfile = async (blockedId: string) => {
    // Charger le profil complet depuis Supabase
    const { supabase } = await import('../../lib/supabase');
    try {
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', blockedId)
        .single();

      if (userProfile) {
        const fullUser = {
          id: userProfile.id,
          pseudo: userProfile.pseudo || 'Utilisateur',
          age: userProfile.age || 25,
          phone: userProfile.phone || '',
          photo: userProfile.photo || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
          description: userProfile.description || '',
          distance: undefined,
          rating: parseFloat(userProfile.rating) || 0,
          reviewCount: userProfile.review_count || 0,
          isSubscribed: userProfile.is_subscribed || false,
          subscriptionStatus: userProfile.subscription_status || 'pending',
          lastSeen: userProfile.last_seen || 'En ligne',
          gender: userProfile.gender || 'female',
          lat: userProfile.lat ? parseFloat(userProfile.lat) : undefined,
          lng: userProfile.lng ? parseFloat(userProfile.lng) : undefined,
          isAvailable: userProfile.is_available ?? true,
          currentBookingId: userProfile.current_booking_id,
        };
        setSelectedUser(fullUser);
        router.push('/(screens)/user-profile');
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
      Alert.alert('Erreur', 'Impossible de charger le profil');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Paramètres</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.purple500}
          />
        }
      >
        {/* Section Profils bloqués */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="lock-closed" size={24} color={colors.text} />
            <Text style={styles.sectionTitle}>Profils bloqués</Text>
          </View>
          <Text style={styles.sectionSubtitle}>
            Les utilisateurs que vous avez bloqués ne peuvent plus vous voir, vous envoyer de messages ou de demandes.
          </Text>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Chargement...</Text>
            </View>
          ) : blockedUsers.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="lock-open-outline" size={48} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>Aucun profil bloqué</Text>
              <Text style={styles.emptySubtitle}>
                Vous n'avez bloqué aucun utilisateur pour le moment.
              </Text>
            </View>
          ) : (
            <View style={styles.blockedList}>
              {blockedUsers.map((blockedUser, index) => (
                <Animated.View
                  key={blockedUser.blockedId}
                  entering={FadeIn.delay(index * 50)}
                  style={styles.blockedItem}
                >
                  <TouchableOpacity
                    style={styles.blockedItemContent}
                    onPress={() => handleViewProfile(blockedUser.blockedId)}
                  >
                    <ImageWithFallback
                      source={{ uri: blockedUser.blockedPhoto }}
                      style={styles.blockedAvatar}
                    />
                    <View style={styles.blockedInfo}>
                      <Text style={styles.blockedName}>{blockedUser.blockedPseudo}</Text>
                      <Text style={styles.blockedDate}>
                        Bloqué le {new Date(blockedUser.blockedAt).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <Button
                    title="Débloquer"
                    variant="outline"
                    onPress={() => handleUnblock(blockedUser.blockedId, blockedUser.blockedPseudo)}
                    icon={<Ionicons name="lock-open-outline" size={18} color={colors.text} />}
                    style={styles.unblockButton}
                  />
                </Animated.View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: `${colors.backgroundSecondary}80`,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSecondary,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    gap: 24,
  },
  section: {
    gap: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  loadingContainer: {
    padding: 24,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  emptyContainer: {
    padding: 48,
    alignItems: 'center',
    gap: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  blockedList: {
    gap: 12,
  },
  blockedItem: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  blockedItemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  blockedAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  blockedInfo: {
    flex: 1,
    gap: 4,
  },
  blockedName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  blockedDate: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  unblockButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
});

