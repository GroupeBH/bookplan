import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ImageWithFallback } from '../../components/ImageWithFallback';
import { Badge } from '../../components/ui/Badge';
import { colors } from '../../constants/colors';
import { useAccessRequest } from '../../context/AccessRequestContext';
import { useAuth } from '../../context/AuthContext';
import { useBooking } from '../../context/BookingContext';
import { deriveBookingStatus } from '../../lib/bookingLifecycle';
import { getProfileImage } from '../../lib/defaultImages';
import { supabase } from '../../lib/supabase';

type RequestType = 'access' | 'booking';
type RequestFilter =
  | 'all'
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'completed'
  | 'cancelled'
  | 'expired';
type BadgeVariant = 'default' | 'success' | 'error' | 'warning' | 'info';

interface ProfileRow {
  id: string;
  pseudo: string | null;
  photo: string | null;
  age: number | null;
  gender: 'male' | 'female' | null;
}

interface ProfileLite {
  id: string;
  pseudo: string;
  photo: string;
  age: number;
}

interface RequestItem {
  id: string;
  type: RequestType;
  status: string;
  targetUserId: string;
  createdAt: string;
  updatedAt: string;
  bookingDate?: string;
  durationHours?: number;
  location?: string;
}

interface StatusMeta {
  label: string;
  variant: BadgeVariant;
  color: string;
  icon: string;
}

const FILTERS: readonly { key: RequestFilter; label: string }[] = [
  { key: 'all', label: 'Toutes' },
  { key: 'pending', label: 'En attente' },
  { key: 'accepted', label: 'Acceptees' },
  { key: 'rejected', label: 'Refusees' },
  { key: 'completed', label: 'Terminees' },
  { key: 'cancelled', label: 'Annulees' },
  { key: 'expired', label: 'Cloturees' },
];

function getStatusMeta(status: string): StatusMeta {
  switch (status) {
    case 'pending':
      return { label: 'En attente', variant: 'warning', color: colors.yellow500, icon: 'time-outline' };
    case 'accepted':
      return { label: 'Acceptee', variant: 'success', color: colors.green500, icon: 'checkmark-circle' };
    case 'rejected':
      return { label: 'Refusee', variant: 'error', color: colors.red500, icon: 'close-circle' };
    case 'completed':
      return { label: 'Terminee', variant: 'info', color: colors.purple400, icon: 'checkmark-done' };
    case 'cancelled':
      return { label: 'Annulee', variant: 'error', color: colors.red500, icon: 'close-circle' };
    case 'expired':
      return { label: 'Cloturee', variant: 'default', color: colors.textSecondary, icon: 'hourglass-outline' };
    default:
      return { label: status, variant: 'default', color: colors.textSecondary, icon: 'ellipse-outline' };
  }
}

function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return "Aujourd'hui";
  if (diffDays === 1) return 'Hier';
  if (diffDays < 7) return `Il y a ${diffDays} jours`;

  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function formatBookingDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MyRequestsScreen() {
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const {
    accessRequests,
    refreshRequests,
    isLoading: isAccessLoading,
  } = useAccessRequest();
  const {
    bookings,
    refreshBookings,
    isLoading: isBookingsLoading,
  } = useBooking();

  const [refreshing, setRefreshing] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [filter, setFilter] = useState<RequestFilter>('all');
  const [bookingClock, setBookingClock] = useState(Date.now());
  const [profilesById, setProfilesById] = useState<Record<string, ProfileLite>>({});
  const inFlightProfileIdsRef = useRef<Set<string>>(new Set());
  const lastFocusRefreshRef = useRef(0);
  const refreshRequestsRef = useRef(refreshRequests);
  const refreshBookingsRef = useRef(refreshBookings);

  useEffect(() => {
    refreshRequestsRef.current = refreshRequests;
  }, [refreshRequests]);

  useEffect(() => {
    refreshBookingsRef.current = refreshBookings;
  }, [refreshBookings]);

  useEffect(() => {
    setProfilesById({});
  }, [currentUser?.id]);

  useEffect(() => {
    const interval = setInterval(() => {
      setBookingClock(Date.now());
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.allSettled([refreshRequestsRef.current(), refreshBookingsRef.current()]);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      if (!currentUser?.id) {
        if (isMounted) {
          setIsBootstrapping(false);
        }
        return;
      }

      if (isMounted) {
        setIsBootstrapping(true);
      }
      await refreshAll();
      if (isMounted) {
        setIsBootstrapping(false);
      }
    };

    bootstrap();

    return () => {
      isMounted = false;
    };
  }, [currentUser?.id, refreshAll]);

  const sentAccessRequests = useMemo(
    () => accessRequests.filter((request) => request.requesterId === currentUser?.id),
    [accessRequests, currentUser?.id]
  );

  const sentBookings = useMemo(
    () => bookings.filter((booking) => booking.requesterId === currentUser?.id),
    [bookings, currentUser?.id]
  );

  const requests = useMemo<RequestItem[]>(() => {
    const accessItems: RequestItem[] = sentAccessRequests.map((request) => ({
      id: request.id,
      type: 'access',
      status: request.status,
      targetUserId: request.targetId,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
    }));

    const bookingItems: RequestItem[] = sentBookings.map((booking) => ({
      id: booking.id,
      type: 'booking',
      status: deriveBookingStatus(
        booking.status,
        booking.bookingDate,
        booking.durationHours,
        bookingClock
      ),
      targetUserId: booking.providerId,
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
      bookingDate: booking.bookingDate,
      durationHours: booking.durationHours,
      location: booking.location,
    }));

    return [...accessItems, ...bookingItems].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [sentAccessRequests, sentBookings, bookingClock]);

  useEffect(() => {
    const inFlightProfileIds = inFlightProfileIdsRef.current;
    const uniqueTargetIds = Array.from(
      new Set(requests.map((request) => request.targetUserId).filter(Boolean))
    );

    const idsToLoad = uniqueTargetIds.filter(
      (id) => !profilesById[id] && !inFlightProfileIds.has(id)
    );

    if (idsToLoad.length === 0) {
      return;
    }

    idsToLoad.forEach((id) => inFlightProfileIds.add(id));
    let isMounted = true;

    const loadProfiles = async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('id, pseudo, photo, age, gender')
          .in('id', idsToLoad);

        if (!isMounted || !data) {
          return;
        }

        const rows = data as ProfileRow[];
        const mappedProfiles: Record<string, ProfileLite> = {};

        rows.forEach((profile) => {
          mappedProfiles[profile.id] = {
            id: profile.id,
            pseudo: profile.pseudo || 'Utilisateur',
            photo: getProfileImage(profile.photo, profile.gender || 'female'),
            age: profile.age || 25,
          };
        });

        if (Object.keys(mappedProfiles).length > 0) {
          setProfilesById((prev) => ({ ...prev, ...mappedProfiles }));
        }
      } finally {
        idsToLoad.forEach((id) => inFlightProfileIds.delete(id));
      }
    };

    loadProfiles();

    return () => {
      isMounted = false;
      idsToLoad.forEach((id) => inFlightProfileIds.delete(id));
    };
  }, [profilesById, requests]);

  useFocusEffect(
    useCallback(() => {
      if (!currentUser?.id) return;

      const now = Date.now();
      if (now - lastFocusRefreshRef.current < 15000) {
        return;
      }

      lastFocusRefreshRef.current = now;
      refreshAll();
    }, [currentUser?.id, refreshAll])
  );

  const onRefresh = useCallback(async () => {
    if (refreshing) {
      return;
    }

    setRefreshing(true);
    try {
      await refreshAll();
    } finally {
      setRefreshing(false);
    }
  }, [refreshAll, refreshing]);

  const filteredRequests = useMemo(() => {
    if (filter === 'all') {
      return requests;
    }
    return requests.filter((request) => request.status === filter);
  }, [filter, requests]);

  const countsByFilter = useMemo<Record<RequestFilter, number>>(() => {
    const counts: Record<RequestFilter, number> = {
      all: requests.length,
      pending: 0,
      accepted: 0,
      rejected: 0,
      completed: 0,
      cancelled: 0,
      expired: 0,
    };

    requests.forEach((request) => {
      if (request.status in counts) {
        counts[request.status as RequestFilter] += 1;
      }
    });

    return counts;
  }, [requests]);

  const isLoading = isBootstrapping && (isAccessLoading || isBookingsLoading);

  const getTargetProfile = useCallback(
    (targetUserId: string): ProfileLite => {
      return (
        profilesById[targetUserId] || {
          id: targetUserId,
          pseudo: 'Utilisateur',
          photo: getProfileImage(null, 'female'),
          age: 25,
        }
      );
    },
    [profilesById]
  );

  const handleRequestPress = useCallback(
    (request: RequestItem) => {
      if (request.type === 'booking') {
        router.push(`/(screens)/booking-details?bookingId=${request.id}`);
        return;
      }

      if (request.targetUserId) {
        router.push(`/(screens)/user-profile?userId=${request.targetUserId}`);
      }
    },
    [router]
  );

  const renderEmptyState = () => {
    if (isLoading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={colors.pink500} />
          <Text style={styles.emptyText}>Chargement des demandes...</Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="document-text-outline" size={60} color={colors.textTertiary} />
        <Text style={styles.emptyTitle}>
          {filter === 'all' ? 'Aucune demande envoyee' : 'Aucun resultat pour ce filtre'}
        </Text>
        <Text style={styles.emptyText}>
          {filter === 'all'
            ? "Vous n'avez pas encore envoye de demande d'acces ou de compagnie."
            : 'Essayez un autre statut pour afficher vos demandes.'}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Mes demandes envoyees</Text>
          <Text style={styles.headerSubtitle}>{requests.length} demande(s)</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.filters}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersContent}
        >
          {FILTERS.map((filterOption) => {
            const isActive = filter === filterOption.key;
            const count = countsByFilter[filterOption.key];

            return (
              <TouchableOpacity
                key={filterOption.key}
                style={[styles.filterButton, isActive && styles.filterButtonActive]}
                onPress={() => setFilter(filterOption.key)}
              >
                <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                  {filterOption.label} ({count})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={filteredRequests}
        keyExtractor={(item) => `${item.type}-${item.id}`}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.listContent,
          filteredRequests.length === 0 ? styles.listContentEmpty : undefined,
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.pink500} />
        }
        ListEmptyComponent={renderEmptyState}
        renderItem={({ item, index }) => {
          const statusMeta = getStatusMeta(item.status);
          const targetProfile = getTargetProfile(item.targetUserId);
          const requestTypeLabel = item.type === 'access' ? "Demande d'acces" : 'Demande de compagnie';

          return (
            <Animated.View entering={FadeIn.delay(Math.min(index, 8) * 40)}>
              <TouchableOpacity
                style={styles.requestCard}
                onPress={() => handleRequestPress(item)}
                activeOpacity={0.85}
              >
                <View style={styles.requestHeader}>
                  <View style={styles.userInfo}>
                    <ImageWithFallback source={{ uri: targetProfile.photo }} style={styles.userAvatar} />
                    <View style={styles.userDetails}>
                      <Text style={styles.userName}>{targetProfile.pseudo}</Text>
                      <Text style={styles.userMeta}>{targetProfile.age} ans</Text>
                    </View>
                  </View>
                  <View style={[styles.iconContainer, { backgroundColor: `${statusMeta.color}26` }]}>
                    <Ionicons name={statusMeta.icon as never} size={20} color={statusMeta.color} />
                  </View>
                </View>

                <View style={styles.badgesRow}>
                  <Badge variant={item.type === 'access' ? 'info' : 'default'}>{requestTypeLabel}</Badge>
                  <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                </View>

                {item.type === 'booking' && item.bookingDate ? (
                  <View style={styles.bookingDetails}>
                    <View style={styles.bookingDetailRow}>
                      <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
                      <Text style={styles.bookingDetailText}>{formatBookingDate(item.bookingDate)}</Text>
                    </View>
                    <View style={styles.bookingDetailRow}>
                      <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
                      <Text style={styles.bookingDetailText}>
                        {item.durationHours || 1} heure{item.durationHours && item.durationHours > 1 ? 's' : ''}
                      </Text>
                    </View>
                    {item.location ? (
                      <View style={styles.bookingDetailRow}>
                        <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
                        <Text style={styles.bookingDetailText} numberOfLines={1}>
                          {item.location}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                <View style={styles.requestFooter}>
                  <Text style={styles.dateText}>{formatRelativeDate(item.createdAt)}</Text>
                  <View style={styles.footerAction}>
                    <Text style={styles.footerActionText}>
                      {item.type === 'booking' ? 'Voir details' : 'Voir profil'}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                  </View>
                </View>
              </TouchableOpacity>
            </Animated.View>
          );
        }}
      />
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
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: `${colors.backgroundSecondary}99`,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSecondary,
  },
  headerContent: {
    alignItems: 'center',
    gap: 2,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.textTertiary,
    fontWeight: '500',
  },
  headerSpacer: {
    width: 24,
  },
  filters: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSecondary,
    backgroundColor: `${colors.backgroundSecondary}d9`,
  },
  filtersContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  filterButtonActive: {
    backgroundColor: `${colors.pink500}26`,
    borderColor: `${colors.pink500}66`,
  },
  filterText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  filterTextActive: {
    color: colors.pink400,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
  requestCard: {
    backgroundColor: `${colors.backgroundSecondary}ee`,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  requestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  userAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: colors.border,
  },
  userDetails: {
    flex: 1,
    gap: 2,
  },
  userName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  userMeta: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  bookingDetails: {
    gap: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderSecondary,
  },
  bookingDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bookingDetailText: {
    fontSize: 13,
    color: colors.textSecondary,
    flex: 1,
  },
  requestFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderSecondary,
  },
  dateText: {
    fontSize: 12,
    color: colors.textTertiary,
    fontWeight: '500',
  },
  footerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  footerActionText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
});
