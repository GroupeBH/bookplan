import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import { ImageWithFallback } from '../../components/ImageWithFallback';
import { useOffer } from '../../context/OfferContext';
import { Offer, OfferType } from '../../types';
import { Badge } from '../../components/ui/Badge';
import Animated, { FadeIn } from 'react-native-reanimated';

const OFFER_TYPE_LABELS: Record<OfferType, string> = {
  drink: 'À boire',
  food: 'À manger',
  transport: 'Transport',
  gift: 'Présent',
};

const OFFER_TYPE_ICONS: Record<OfferType, string> = {
  drink: 'wine-outline',
  food: 'restaurant-outline',
  transport: 'car-outline',
  gift: 'gift-outline',
};

export default function OffersScreen() {
  const router = useRouter();
  const { offers, isLoading, getAvailableOffers, refreshOffers } = useOffer();
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    React.useCallback(() => {
      refreshOffers();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshOffers();
    setRefreshing(false);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTimeUntil = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    
    if (diff < 0) return 'Expiré';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `Dans ${days} jour${days > 1 ? 's' : ''}`;
    } else if (hours > 0) {
      return `Dans ${hours}h${minutes > 0 ? `${minutes}min` : ''}`;
    } else {
      return `Dans ${minutes}min`;
    }
  };

  const handleViewOffer = (offer: Offer) => {
    router.push({
      pathname: '/(screens)/offer-details',
      params: { offerId: offer.id },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Offres disponibles</Text>
        <TouchableOpacity onPress={() => router.push('/(screens)/create-offer')}>
          <Ionicons name="add-circle" size={24} color={colors.pink500} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.pink500}
          />
        }
      >
        {isLoading && offers.length === 0 ? (
          <View style={styles.emptyContainer}>
            <ActivityIndicator size="large" color={colors.pink500} />
            <Text style={styles.emptyText}>Chargement des offres...</Text>
          </View>
        ) : offers.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="gift-outline" size={64} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>Aucune offre disponible</Text>
            <Text style={styles.emptySubtitle}>
              Il n'y a pas d'offres disponibles pour le moment. Créez-en une !
            </Text>
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => router.push('/(screens)/create-offer')}
            >
              <Ionicons name="add-circle" size={20} color="#ffffff" />
              <Text style={styles.createButtonText}>Créer une offre</Text>
            </TouchableOpacity>
          </View>
        ) : (
          offers.map((offer) => (
            <Animated.View key={offer.id} entering={FadeIn}>
              <TouchableOpacity
                style={styles.offerCard}
                onPress={() => handleViewOffer(offer)}
                activeOpacity={0.7}
              >
                <View style={styles.offerHeader}>
                  <View style={styles.offerTypeBadge}>
                    <Ionicons
                      name={OFFER_TYPE_ICONS[offer.offerType] as any}
                      size={20}
                      color={colors.pink500}
                    />
                    <Text style={styles.offerTypeText}>
                      {OFFER_TYPE_LABELS[offer.offerType]}
                    </Text>
                  </View>
                  {offer.applicationCount !== undefined && offer.applicationCount > 0 && (
                    <Badge variant="info" style={styles.applicationBadge}>
                      {offer.applicationCount} candidature{offer.applicationCount > 1 ? 's' : ''}
                    </Badge>
                  )}
                </View>

                <Text style={styles.offerTitle}>{offer.title}</Text>
                
                {offer.description && (
                  <Text style={styles.offerDescription} numberOfLines={2}>
                    {offer.description}
                  </Text>
                )}

                <View style={styles.offerDetails}>
                  <View style={styles.offerDetailItem}>
                    <Ionicons name="person-outline" size={16} color={colors.textSecondary} />
                    <Text style={styles.offerDetailText}>
                      {offer.author?.pseudo || 'Utilisateur'}
                    </Text>
                  </View>
                  <View style={styles.offerDetailItem}>
                    <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
                    <Text style={styles.offerDetailText}>{formatDate(offer.offerDate)}</Text>
                  </View>
                  {offer.location && (
                    <View style={styles.offerDetailItem}>
                      <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
                      <Text style={styles.offerDetailText} numberOfLines={1}>
                        {offer.location}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.offerFooter}>
                  <View style={styles.timeBadge}>
                    <Ionicons name="time-outline" size={14} color={colors.pink400} />
                    <Text style={styles.timeText}>{getTimeUntil(offer.expiresAt)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
                </View>
              </TouchableOpacity>
            </Animated.View>
          ))
        )}
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
    paddingHorizontal: 16,
    paddingVertical: 12,
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
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 32,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.pink600,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  offerCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  offerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  offerTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundTertiary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  offerTypeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.pink400,
  },
  applicationBadge: {
    marginLeft: 8,
  },
  offerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  offerDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 12,
    lineHeight: 20,
  },
  offerDetails: {
    gap: 8,
    marginBottom: 12,
  },
  offerDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  offerDetailText: {
    fontSize: 13,
    color: colors.textSecondary,
    flex: 1,
  },
  offerFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderSecondary,
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeText: {
    fontSize: 12,
    color: colors.pink400,
    fontWeight: '500',
  },
});

