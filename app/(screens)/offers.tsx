import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge } from '../../components/ui/Badge';
import { colors } from '../../constants/colors';
import { useOffer } from '../../context/OfferContext';
import { Offer, OfferType } from '../../types';

const OFFER_TYPE_LABELS: Record<OfferType, string> = {
  drink: 'A boire',
  food: 'A manger',
  transport: 'Transport',
  gift: 'Present',
};

const OFFER_TYPE_ICONS: Record<OfferType, keyof typeof Ionicons.glyphMap> = {
  drink: 'wine-outline',
  food: 'restaurant-outline',
  transport: 'car-outline',
  gift: 'gift-outline',
};

const isOfferAvailable = (offer: Offer, now: Date) => {
  if (offer.status !== 'active') return false;
  const expiresAt = new Date(offer.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) return false;
  return expiresAt.getTime() > now.getTime();
};

export default function OffersScreen() {
  const router = useRouter();
  const { offers, isLoading, refreshOffers } = useOffer();
  const [refreshing, setRefreshing] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const refreshOffersRef = useRef(refreshOffers);
  const isFocusRefreshingRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    refreshOffersRef.current = refreshOffers;
  }, [refreshOffers]);

  const refreshOnFocus = useCallback(() => {
    if (isFocusRefreshingRef.current) return;
    isFocusRefreshingRef.current = true;

    Promise.resolve(refreshOffersRef.current())
      .catch(() => {})
      .finally(() => {
        isFocusRefreshingRef.current = false;
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshOnFocus();
    }, [refreshOnFocus])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshOffersRef.current();
    } finally {
      setRefreshing(false);
    }
  };

  const availableOffers = useMemo(() => {
    const now = new Date(nowMs);

    return offers
      .filter((offer) => isOfferAvailable(offer, now))
      .sort((a, b) => {
        const aExpires = new Date(a.expiresAt).getTime();
        const bExpires = new Date(b.expiresAt).getTime();

        if (aExpires !== bExpires) {
          return aExpires - bExpires;
        }

        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [offers, nowMs]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return 'Date non definie';

    const dayPart = date.toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    const timePart = date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${dayPart} a ${timePart}`;
  };

  const formatTimeLeft = (expiresAt: string) => {
    const end = new Date(expiresAt);
    if (Number.isNaN(end.getTime())) return 'Disponibilite inconnue';

    const diffMs = end.getTime() - nowMs;
    if (diffMs <= 0) return 'Expiree';

    const totalMinutes = Math.ceil(diffMs / (1000 * 60));
    if (totalMinutes < 60) {
      return `Expire dans ${totalMinutes} min`;
    }

    const totalHours = Math.floor(totalMinutes / 60);
    const remainingMinutes = totalMinutes % 60;
    if (totalHours < 24) {
      return remainingMinutes > 0
        ? `Expire dans ${totalHours}h${remainingMinutes}`
        : `Expire dans ${totalHours}h`;
    }

    const days = Math.floor(totalHours / 24);
    return `Expire dans ${days} jour${days > 1 ? 's' : ''}`;
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
        <View style={styles.summaryCard}>
          <View style={styles.summaryIconContainer}>
            <Ionicons name="sparkles-outline" size={18} color={colors.pink500} />
          </View>
          <View style={styles.summaryTextContainer}>
            <Text style={styles.summaryTitle}>Offres actives maintenant</Text>
            <Text style={styles.summarySubtitle}>
              Seulement les offres disponibles (non expirees) sont affichees.
            </Text>
          </View>
          <Text style={styles.summaryCount}>{availableOffers.length}</Text>
        </View>

        {isLoading && availableOffers.length === 0 ? (
          <View style={styles.emptyContainer}>
            <ActivityIndicator size="large" color={colors.pink500} />
            <Text style={styles.emptyText}>Chargement des offres...</Text>
          </View>
        ) : availableOffers.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="gift-outline" size={64} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>Aucune offre disponible</Text>
            <Text style={styles.emptySubtitle}>
              Il n&apos;y a actuellement aucune offre active. Reviens plus tard ou cree une offre.
            </Text>
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => router.push('/(screens)/create-offer')}
            >
              <Ionicons name="add-circle" size={20} color="#ffffff" />
              <Text style={styles.createButtonText}>Creer une offre</Text>
            </TouchableOpacity>
          </View>
        ) : (
          availableOffers.map((offer) => {
            const offerTypesToDisplay = (offer.offerTypes && offer.offerTypes.length > 0)
              ? offer.offerTypes
              : (offer.offerType ? [offer.offerType] : []);

            return (
              <Animated.View key={offer.id}>
                <TouchableOpacity
                  style={styles.offerCard}
                  onPress={() => handleViewOffer(offer)}
                  activeOpacity={0.8}
                >
                  <View style={styles.offerHeader}>
                    <View style={styles.offerTypesContainer}>
                      {offerTypesToDisplay.map((type, index) => (
                        <View key={`${offer.id}-${type}-${index}`} style={styles.offerTypeBadge}>
                          <Ionicons
                            name={OFFER_TYPE_ICONS[type]}
                            size={14}
                            color={colors.pink500}
                          />
                          <Text style={styles.offerTypeText}>{OFFER_TYPE_LABELS[type]}</Text>
                        </View>
                      ))}
                    </View>

                    <View style={styles.headerRight}>
                      <Badge variant="success" style={styles.availableBadge}>
                        Disponible
                      </Badge>
                      {offer.applicationCount !== undefined && offer.applicationCount > 0 ? (
                        <Badge variant="info" style={styles.applicationBadge}>
                          {offer.applicationCount} candidature{offer.applicationCount > 1 ? 's' : ''}
                        </Badge>
                      ) : null}
                    </View>
                  </View>

                  <Text style={styles.offerTitle}>{offer.title}</Text>

                  {offer.description ? (
                    <Text style={styles.offerDescription} numberOfLines={2}>
                      {offer.description}
                    </Text>
                  ) : null}

                  <View style={styles.offerDetails}>
                    <View style={styles.offerDetailItem}>
                      <Ionicons name="person-outline" size={16} color={colors.textSecondary} />
                      <Text style={styles.offerDetailText}>
                        {offer.author?.pseudo || 'Utilisateur'}
                      </Text>
                      {offer.author?.rating ? (
                        <View style={styles.ratingChip}>
                          <Ionicons name="star" size={12} color={colors.yellow500} />
                          <Text style={styles.ratingText}>{offer.author.rating.toFixed(1)}</Text>
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.offerDetailItem}>
                      <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
                      <Text style={styles.offerDetailText}>{formatDate(offer.offerDate)}</Text>
                    </View>

                    {offer.location ? (
                      <View style={styles.offerDetailItem}>
                        <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
                        <Text style={styles.offerDetailText} numberOfLines={1}>
                          {offer.location}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.offerFooter}>
                    <View style={styles.timeBadge}>
                      <Ionicons name="time-outline" size={14} color={colors.pink400} />
                      <Text style={styles.timeText}>{formatTimeLeft(offer.expiresAt)}</Text>
                    </View>
                    <View style={styles.actionHint}>
                      <Text style={styles.actionHintText}>Voir details</Text>
                      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                    </View>
                  </View>
                </TouchableOpacity>
              </Animated.View>
            );
          })
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
    paddingBottom: 28,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: `${colors.pink500}44`,
    backgroundColor: `${colors.pink500}14`,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    gap: 10,
  },
  summaryIconContainer: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${colors.pink500}22`,
  },
  summaryTextContainer: {
    flex: 1,
  },
  summaryTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  summarySubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  summaryCount: {
    color: colors.pink400,
    fontSize: 22,
    fontWeight: '700',
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
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 28,
    lineHeight: 20,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.pink600,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  offerCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
  },
  offerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 8,
  },
  offerTypesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
  },
  headerRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  offerTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundTertiary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    gap: 5,
  },
  offerTypeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.pink400,
  },
  availableBadge: {
    backgroundColor: `${colors.green500}22`,
  },
  applicationBadge: {
    marginLeft: 0,
  },
  offerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  offerDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 10,
    lineHeight: 20,
  },
  offerDetails: {
    gap: 8,
    marginBottom: 10,
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
  ratingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: `${colors.yellow500}22`,
  },
  ratingText: {
    color: colors.yellow400,
    fontSize: 11,
    fontWeight: '600',
  },
  offerFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
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
    fontWeight: '600',
  },
  actionHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  actionHintText: {
    color: colors.textTertiary,
    fontSize: 12,
    fontWeight: '500',
  },
});
