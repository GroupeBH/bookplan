import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ImageWithFallback } from '../../components/ImageWithFallback';
import { useAccessRequest } from '../../context/AccessRequestContext';
import { useBooking } from '../../context/BookingContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import Animated, { FadeIn } from 'react-native-reanimated';

type RequestType = 'access' | 'booking';

interface RequestItem {
  id: string;
  type: RequestType;
  status: string;
  targetUser?: any;
  createdAt: string;
  updatedAt: string;
  data?: any; // Données spécifiques (booking date, etc.)
}

export default function MyRequestsScreen() {
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const { accessRequests, refreshRequests } = useAccessRequest();
  const { bookings, refreshBookings } = useBooking();
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'accepted' | 'rejected'>('all');

  const loadRequests = useCallback(async () => {
    if (!currentUser?.id) return;

    setIsLoading(true);
    try {
      const allRequests: RequestItem[] = [];

      // Charger les demandes d'accès envoyées
      const sentAccessRequests = accessRequests.filter(
        r => r.requesterId === currentUser.id
      );

      for (const accessRequest of sentAccessRequests) {
        // Charger le profil du target
        const { data: targetProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', accessRequest.targetId)
          .single();

        if (targetProfile) {
          allRequests.push({
            id: accessRequest.id,
            type: 'access',
            status: accessRequest.status,
            targetUser: {
              id: targetProfile.id,
              pseudo: targetProfile.pseudo || 'Utilisateur',
              photo: targetProfile.photo || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
              age: targetProfile.age || 25,
            },
            createdAt: accessRequest.createdAt,
            updatedAt: accessRequest.updatedAt,
          });
        }
      }

      // Charger les demandes de compagnie envoyées
      const sentBookings = bookings.filter(
        b => b.requesterId === currentUser.id
      );

      for (const booking of sentBookings) {
        // Charger le profil du provider
        const { data: providerProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', booking.providerId)
          .single();

        if (providerProfile) {
          allRequests.push({
            id: booking.id,
            type: 'booking',
            status: booking.status,
            targetUser: {
              id: providerProfile.id,
              pseudo: providerProfile.pseudo || 'Utilisateur',
              photo: providerProfile.photo || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
              age: providerProfile.age || 25,
            },
            createdAt: booking.createdAt,
            updatedAt: booking.updatedAt,
            data: {
              bookingDate: booking.bookingDate,
              durationHours: booking.durationHours,
              location: booking.location,
            },
          });
        }
      }

      // Trier par date de création (plus récent en premier)
      allRequests.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      setRequests(allRequests);
    } catch (error) {
      console.error('Error loading requests:', error);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser?.id, accessRequests, bookings]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (currentUser?.id) {
      loadRequests();
    }
  }, [currentUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(
    useCallback(() => {
      if (currentUser?.id) {
        refreshRequests();
        refreshBookings();
        // Recharger les demandes après un court délai pour éviter les re-renders
        const timer = setTimeout(() => {
          loadRequests();
        }, 300);
        return () => clearTimeout(timer);
      }
    }, [currentUser?.id, refreshRequests, refreshBookings]) // eslint-disable-line react-hooks/exhaustive-deps
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshRequests();
    await refreshBookings();
    await loadRequests();
    setRefreshing(false);
  }, [refreshRequests, refreshBookings, loadRequests]);

  const filteredRequests = requests.filter(req => {
    if (filter === 'all') return true;
    return req.status === filter;
  });

  const getStatusBadge = (status: string, type: RequestType) => {
    switch (status) {
      case 'pending':
        return <Badge variant="warning">En attente</Badge>;
      case 'accepted':
        return <Badge variant="success">Acceptée</Badge>;
      case 'rejected':
        return <Badge variant="error">Refusée</Badge>;
      case 'completed':
        return <Badge variant="default">Terminée</Badge>;
      case 'cancelled':
        return <Badge variant="error">Annulée</Badge>;
      default:
        return <Badge variant="default">{status}</Badge>;
    }
  };

  const getRequestIcon = (type: RequestType, status: string) => {
    if (type === 'access') {
      return status === 'accepted' ? 'lock-open' : 'lock-closed';
    } else {
      switch (status) {
        case 'pending':
          return 'time-outline';
        case 'accepted':
          return 'checkmark-circle';
        case 'rejected':
          return 'close-circle';
        case 'completed':
          return 'checkmark-done';
        case 'cancelled':
          return 'close-circle';
        default:
          return 'calendar-outline';
      }
    }
  };

  const getRequestColor = (type: RequestType, status: string) => {
    if (type === 'access') {
      return status === 'accepted' ? colors.green500 : colors.purple500;
    } else {
      switch (status) {
        case 'pending':
          return colors.yellow500;
        case 'accepted':
          return colors.green500;
        case 'rejected':
        case 'cancelled':
          return colors.red500;
        case 'completed':
          return colors.blue500;
        default:
          return colors.textSecondary;
      }
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return "Aujourd'hui";
    } else if (days === 1) {
      return 'Hier';
    } else if (days < 7) {
      return `Il y a ${days} jours`;
    } else {
      return date.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      });
    }
  };

  const handleRequestPress = (request: RequestItem) => {
    if (request.type === 'booking' && request.status === 'accepted') {
      router.push(`/(screens)/booking-details?bookingId=${request.id}`);
    } else if (request.targetUser) {
      // Naviguer vers le profil de l'utilisateur
      // TODO: Implémenter la navigation vers le profil
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mes demandes</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Filters */}
      <View style={styles.filters}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersContent}>
          {(['all', 'pending', 'accepted', 'rejected'] as const).map((filterOption) => (
            <TouchableOpacity
              key={filterOption}
              style={[styles.filterButton, filter === filterOption && styles.filterButtonActive]}
              onPress={() => setFilter(filterOption)}
            >
              <Text style={[styles.filterText, filter === filterOption && styles.filterTextActive]}>
                {filterOption === 'all' ? 'Toutes' : 
                 filterOption === 'pending' ? 'En attente' :
                 filterOption === 'accepted' ? 'Acceptées' : 'Refusées'}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.purple500} />
        }
      >
        {isLoading ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Chargement...</Text>
          </View>
        ) : filteredRequests.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={64} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>
              {filter === 'all' ? 'Aucune demande' : 
               filter === 'pending' ? 'Aucune demande en attente' :
               filter === 'accepted' ? 'Aucune demande acceptée' : 'Aucune demande refusée'}
            </Text>
            <Text style={styles.emptyText}>
              {filter === 'all' 
                ? 'Vous n\'avez pas encore envoyé de demandes d\'accès ou de compagnie.'
                : 'Aucune demande ne correspond à ce filtre.'}
            </Text>
          </View>
        ) : (
          filteredRequests.map((request, index) => (
            <Animated.View
              key={`${request.type}-${request.id}`}
              entering={FadeIn.delay(index * 50)}
            >
              <TouchableOpacity
                style={styles.requestCard}
                onPress={() => handleRequestPress(request)}
                activeOpacity={0.7}
              >
                <View style={styles.requestHeader}>
                  <View style={styles.userInfo}>
                    <ImageWithFallback
                      source={{ uri: request.targetUser?.photo }}
                      style={styles.userAvatar}
                    />
                    <View style={styles.userDetails}>
                      <Text style={styles.userName}>{request.targetUser?.pseudo || 'Utilisateur'}</Text>
                      <Text style={styles.requestType}>
                        {request.type === 'access' ? 'Demande d\'accès' : 'Demande de compagnie'}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.iconContainer, { backgroundColor: `${getRequestColor(request.type, request.status)}33` }]}>
                    <Ionicons
                      name={getRequestIcon(request.type, request.status) as any}
                      size={24}
                      color={getRequestColor(request.type, request.status)}
                    />
                  </View>
                </View>

                {request.type === 'booking' && request.data && (
                  <View style={styles.bookingDetails}>
                    <View style={styles.bookingDetailRow}>
                      <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
                      <Text style={styles.bookingDetailText}>
                        {new Date(request.data.bookingDate).toLocaleDateString('fr-FR', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                    </View>
                    <View style={styles.bookingDetailRow}>
                      <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
                      <Text style={styles.bookingDetailText}>
                        {request.data.durationHours} heure(s)
                      </Text>
                    </View>
                    {request.data.location && (
                      <View style={styles.bookingDetailRow}>
                        <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
                        <Text style={styles.bookingDetailText}>{request.data.location}</Text>
                      </View>
                    )}
                  </View>
                )}

                <View style={styles.requestFooter}>
                  <View style={styles.statusContainer}>
                    {getStatusBadge(request.status, request.type)}
                  </View>
                  <Text style={styles.dateText}>{formatDate(request.createdAt)}</Text>
                </View>

                {request.type === 'booking' && request.status === 'accepted' && (
                  <View style={styles.actionContainer}>
                    <Button
                      title="Voir les détails"
                      variant="outline"
                      onPress={() => router.push(`/(screens)/booking-details?bookingId=${request.id}`)}
                      style={styles.actionButton}
                      icon={<Ionicons name="information-circle-outline" size={20} color={colors.text} />}
                    />
                  </View>
                )}
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
  filters: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSecondary,
    backgroundColor: colors.backgroundSecondary,
  },
  filtersContent: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.background,
    marginRight: 8,
  },
  filterButtonActive: {
    backgroundColor: colors.pink500,
  },
  filterText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  filterTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    gap: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 64,
    gap: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
  },
  requestCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  requestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  userDetails: {
    flex: 1,
    gap: 4,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  requestType: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bookingDetails: {
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderSecondary,
  },
  bookingDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bookingDetailText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  requestFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderSecondary,
  },
  statusContainer: {
    flex: 1,
  },
  dateText: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  actionContainer: {
    marginTop: 8,
  },
  actionButton: {
    marginTop: 0,
  },
});



