import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge } from '../../components/ui/Badge';
import { colors } from '../../constants/colors';
import { useOffer } from '../../context/OfferContext';
import { Offer, OfferTargetGender, OfferType } from '../../types';

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

type OfferTypeFilter = 'all' | OfferType;
type OfferAudienceFilter = 'any' | OfferTargetGender;

export default function OffersScreen() {
  const router = useRouter();
  const { offers, isLoading, refreshOffers } = useOffer();
  const [refreshing, setRefreshing] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [typeFilter, setTypeFilter] = useState<OfferTypeFilter>('all');
  const [audienceFilter, setAudienceFilter] = useState<OfferAudienceFilter>('any');
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

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const filteredOffers = useMemo(() => {
    return availableOffers.filter((offer) => {
      if (typeFilter !== 'all') {
        const offerTypes = (offer.offerTypes && offer.offerTypes.length > 0)
          ? offer.offerTypes
          : [offer.offerType];
        if (!offerTypes.includes(typeFilter)) {
          return false;
        }
      }

      if (audienceFilter !== 'any') {
        const targetGender = offer.targetGender ?? 'all';
        if (targetGender !== audienceFilter) {
          return false;
        }
      }

      if (normalizedSearchQuery) {
        const title = offer.title?.toLowerCase() ?? '';
        const description = offer.description?.toLowerCase() ?? '';
        const location = offer.location?.toLowerCase() ?? '';
        const author = offer.author?.pseudo?.toLowerCase() ?? '';
        const offerTypes = (offer.offerTypes && offer.offerTypes.length > 0)
          ? offer.offerTypes
          : [offer.offerType];
        const typeLabels = offerTypes
          .map((type) => OFFER_TYPE_LABELS[type]?.toLowerCase() ?? '')
          .join(' ');

        if (
          !title.includes(normalizedSearchQuery) &&
          !description.includes(normalizedSearchQuery) &&
          !location.includes(normalizedSearchQuery) &&
          !author.includes(normalizedSearchQuery) &&
          !typeLabels.includes(normalizedSearchQuery)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [availableOffers, typeFilter, audienceFilter, normalizedSearchQuery]);

  const hasActiveFilters =
    normalizedSearchQuery.length > 0 || typeFilter !== 'all' || audienceFilter !== 'any';

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

  const resetFilters = () => {
    setSearchQuery('');
    setTypeFilter('all');
    setAudienceFilter('any');
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
        <View style={styles.searchSection}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color={colors.textSecondary} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Rechercher une offre"
              placeholderTextColor={colors.textTertiary}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {searchQuery.trim().length > 0 ? (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.filterToggle, showFilters && styles.filterToggleActive]}
              onPress={() => setShowFilters((prev) => !prev)}
              activeOpacity={0.85}
            >
              <Ionicons
                name="options-outline"
                size={14}
                color={showFilters ? colors.pink400 : colors.textSecondary}
              />
              <Text style={[styles.filterToggleText, showFilters && styles.filterToggleTextActive]}>
                Filtrer
              </Text>
            </TouchableOpacity>
          </View>

          {showFilters ? (
            <View style={styles.filtersContainer}>
              <Text style={styles.filterLabel}>Type d&apos;offre</Text>
              <View style={styles.filterRow}>
                <TouchableOpacity
                  style={[styles.filterChip, typeFilter === 'all' && styles.filterChipActive]}
                  onPress={() => setTypeFilter('all')}
                >
                  <Text style={[styles.filterChipText, typeFilter === 'all' && styles.filterChipTextActive]}>
                    Tous
                  </Text>
                </TouchableOpacity>
                {(['drink', 'food', 'transport', 'gift'] as OfferType[]).map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.filterChip, typeFilter === type && styles.filterChipActive]}
                    onPress={() => setTypeFilter(type)}
                  >
                    <Text style={[styles.filterChipText, typeFilter === type && styles.filterChipTextActive]}>
                      {OFFER_TYPE_LABELS[type]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.filterLabel}>Audience</Text>
              <View style={styles.filterRow}>
                <TouchableOpacity
                  style={[styles.filterChip, audienceFilter === 'any' && styles.filterChipActive]}
                  onPress={() => setAudienceFilter('any')}
                >
                  <Text style={[styles.filterChipText, audienceFilter === 'any' && styles.filterChipTextActive]}>
                    Tous
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.filterChip, audienceFilter === 'female' && styles.filterChipActive]}
                  onPress={() => setAudienceFilter('female')}
                >
                  <Text style={[styles.filterChipText, audienceFilter === 'female' && styles.filterChipTextActive]}>
                    Femmes
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.filterChip, audienceFilter === 'male' && styles.filterChipActive]}
                  onPress={() => setAudienceFilter('male')}
                >
                  <Text style={[styles.filterChipText, audienceFilter === 'male' && styles.filterChipTextActive]}>
                    Hommes
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.filterChip, audienceFilter === 'all' && styles.filterChipActive]}
                  onPress={() => setAudienceFilter('all')}
                >
                  <Text style={[styles.filterChipText, audienceFilter === 'all' && styles.filterChipTextActive]}>
                    Les deux
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryIconContainer}>
            <Ionicons name="sparkles-outline" size={18} color={colors.pink500} />
          </View>
          <View style={styles.summaryTextContainer}>
            <Text style={styles.summaryTitle}>Offres actives maintenant</Text>
            <Text style={styles.summarySubtitle}>
              {filteredOffers.length} resultat{filteredOffers.length > 1 ? 's' : ''} sur {availableOffers.length} offre{availableOffers.length > 1 ? 's' : ''} disponible{availableOffers.length > 1 ? 's' : ''}.
            </Text>
          </View>
          <Text style={styles.summaryCount}>{filteredOffers.length}</Text>
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
        ) : filteredOffers.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="search-outline" size={64} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>Aucun resultat</Text>
            <Text style={styles.emptySubtitle}>
              Aucune offre ne correspond a ta recherche ou a tes filtres.
            </Text>
            {hasActiveFilters ? (
              <TouchableOpacity
                style={styles.resetFiltersButton}
                onPress={resetFilters}
              >
                <Ionicons name="refresh" size={18} color={colors.text} />
                <Text style={styles.resetFiltersButtonText}>Reinitialiser les filtres</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          filteredOffers.map((offer) => {
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
  searchSection: {
    marginBottom: 12,
    gap: 10,
  },
  searchBar: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
    backgroundColor: colors.backgroundSecondary,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    paddingVertical: 0,
  },
  filterToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
    backgroundColor: `${colors.background}B0`,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  filterToggleActive: {
    borderColor: `${colors.pink500}99`,
    backgroundColor: `${colors.pink500}22`,
  },
  filterToggleText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  filterToggleTextActive: {
    color: colors.pink400,
  },
  filtersContainer: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
    backgroundColor: `${colors.backgroundSecondary}D8`,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  filterLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
    backgroundColor: `${colors.background}A0`,
  },
  filterChipActive: {
    borderColor: `${colors.pink500}99`,
    backgroundColor: `${colors.pink500}24`,
  },
  filterChipText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: colors.pink400,
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
  resetFiltersButton: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.purple600,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  resetFiltersButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
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
