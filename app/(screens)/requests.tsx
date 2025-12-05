import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ImageWithFallback } from '../../components/ImageWithFallback';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { colors } from '../../constants/colors';
import { useAccessRequest } from '../../context/AccessRequestContext';
import { useAuth } from '../../context/AuthContext';
import { useBooking } from '../../context/BookingContext';
import { useUser } from '../../context/UserContext';
import { supabase } from '../../lib/supabase';

type RequestTab = 'bookings' | 'access';

export default function RequestsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { setSelectedUser } = useUser();
  const { bookings, updateBookingStatus, refreshBookings } = useBooking();
  const { pendingRequests, accessRequests, updateAccessRequest, refreshRequests } = useAccessRequest();
  const [activeTab, setActiveTab] = useState<RequestTab>('bookings');
  const [statusFilter, setStatusFilter] = useState<'pending' | 'accepted' | 'all'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [enrichedAccessRequests, setEnrichedAccessRequests] = useState<any[]>([]);
  const isEnrichingRef = useRef(false);
  const lastEnrichKeyRef = useRef<string>('');

  useEffect(() => {
    refreshBookings();
    refreshRequests();
  }, []);

  // Filtrer les bookings où l'utilisateur est le provider (demandes reçues)
  const allReceivedBookings = useMemo(() => 
    bookings.filter(b => b.providerId === user?.id),
    [bookings, user?.id]
  );
  const receivedBookings = useMemo(() => 
    statusFilter === 'all' 
      ? allReceivedBookings 
      : allReceivedBookings.filter(b => b.status === statusFilter),
    [allReceivedBookings, statusFilter]
  );

  // Filtrer les demandes d'accès reçues
  const allReceivedAccessRequests = useMemo(() => 
    accessRequests.filter(r => r.targetId === user?.id),
    [accessRequests, user?.id]
  );
  const receivedAccessRequests = useMemo(() =>
    statusFilter === 'all'
      ? allReceivedAccessRequests
      : allReceivedAccessRequests.filter(r => r.status === statusFilter),
    [allReceivedAccessRequests, statusFilter]
  );

  // Enrichir les demandes d'accès avec les profils des requester
  useEffect(() => {
    const enrichRequests = async () => {
      if (!user?.id) {
        setEnrichedAccessRequests([]);
        return;
      }

      // Créer une clé unique pour cette requête d'enrichissement
      const enrichKey = `${receivedAccessRequests.length}-${receivedAccessRequests.map(r => r.id).join(',')}-${statusFilter}`;
      
      // Éviter les appels multiples avec la même clé
      if (isEnrichingRef.current || lastEnrichKeyRef.current === enrichKey) {
        return;
      }

      if (receivedAccessRequests.length === 0) {
        setEnrichedAccessRequests([]);
        lastEnrichKeyRef.current = enrichKey;
        return;
      }

      isEnrichingRef.current = true;
      lastEnrichKeyRef.current = enrichKey;

      try {
        const enriched = await Promise.all(
          receivedAccessRequests.map(async (request) => {
            // Pour les demandes acceptées, toujours charger le requester
            // Pour les autres, charger seulement si requesterInfoRevealed est true
            const shouldLoadRequester = request.status === 'accepted' || request.requesterInfoRevealed;
            
            if (shouldLoadRequester && request.requesterId && !request.requester) {
              try {
                const { data: requesterProfile } = await supabase
                  .from('profiles')
                  .select('*')
                  .eq('id', request.requesterId)
                  .single();

                if (requesterProfile) {
                  return {
                    ...request,
                    requester: {
                      id: requesterProfile.id,
                      pseudo: requesterProfile.pseudo || 'Utilisateur',
                      age: requesterProfile.age || 25,
                      photo: requesterProfile.photo || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
                      description: requesterProfile.description || '',
                      rating: parseFloat(requesterProfile.rating) || 0,
                      reviewCount: requesterProfile.review_count || 0,
                      gender: requesterProfile.gender || 'female',
                    },
                  };
                }
              } catch (error) {
                console.error('Error fetching requester profile:', error);
              }
            }
            return request;
          })
        );

        setEnrichedAccessRequests(enriched);
      } finally {
        isEnrichingRef.current = false;
      }
    };

    enrichRequests();
  }, [receivedAccessRequests, user?.id, statusFilter]);

  const handleAcceptBooking = async (bookingId: string) => {
    setIsLoading(true);
    try {
      const { error } = await updateBookingStatus(bookingId, 'accepted');
      if (error) {
        Alert.alert('Erreur', error.message || 'Impossible d\'accepter la demande');
      } else {
        Alert.alert('Succès', 'Demande acceptée');
        refreshBookings();
      }
    } catch (error) {
      Alert.alert('Erreur', 'Une erreur est survenue');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRejectBooking = async (bookingId: string) => {
    Alert.alert(
      'Refuser la demande',
      'Êtes-vous sûr de vouloir refuser cette demande ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Refuser',
          style: 'destructive',
          onPress: async () => {
            setIsLoading(true);
            try {
              const { error } = await updateBookingStatus(bookingId, 'rejected');
              if (error) {
                Alert.alert('Erreur', error.message || 'Impossible de refuser la demande');
              } else {
                Alert.alert('Succès', 'Demande refusée');
                refreshBookings();
              }
            } catch (error) {
              Alert.alert('Erreur', 'Une erreur est survenue');
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleAcceptAccess = async (requestId: string) => {
    setIsLoading(true);
    try {
      const { error } = await updateAccessRequest(requestId, 'accepted');
      if (error) {
        Alert.alert('Erreur', error.message || 'Impossible d\'accepter la demande');
      } else {
        Alert.alert('Succès', 'Accès accordé');
        refreshRequests();
      }
    } catch (error) {
      Alert.alert('Erreur', 'Une erreur est survenue');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRejectAccess = async (requestId: string) => {
    Alert.alert(
      'Refuser l\'accès',
      'Êtes-vous sûr de vouloir refuser cette demande d\'accès ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Refuser',
          style: 'destructive',
          onPress: async () => {
            setIsLoading(true);
            try {
              const { error } = await updateAccessRequest(requestId, 'rejected');
              if (error) {
                Alert.alert('Erreur', error.message || 'Impossible de refuser la demande');
              } else {
                Alert.alert('Succès', 'Demande refusée');
                refreshRequests();
              }
            } catch (error) {
              Alert.alert('Erreur', 'Une erreur est survenue');
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
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

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mes demandes</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'bookings' && styles.tabActive]}
          onPress={() => setActiveTab('bookings')}
        >
          <Ionicons
            name="calendar-outline"
            size={20}
            color={activeTab === 'bookings' ? colors.pink500 : colors.textTertiary}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === 'bookings' && styles.tabTextActive,
            ]}
          >
            Compagnies ({receivedBookings.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'access' && styles.tabActive]}
          onPress={() => setActiveTab('access')}
        >
          <Ionicons
            name="shield-outline"
            size={20}
            color={activeTab === 'access' ? colors.pink500 : colors.textTertiary}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === 'access' && styles.tabTextActive,
            ]}
          >
            Accès ({receivedAccessRequests.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Status Filter */}
      <View style={styles.statusFilters}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusFiltersContent}>
          {(['pending', 'accepted', 'all'] as const).map((filter) => (
            <TouchableOpacity
              key={filter}
              style={[styles.statusFilterButton, statusFilter === filter && styles.statusFilterButtonActive]}
              onPress={() => setStatusFilter(filter)}
            >
              <Text style={[styles.statusFilterText, statusFilter === filter && styles.statusFilterTextActive]}>
                {filter === 'pending' ? 'En attente' : filter === 'accepted' ? 'Acceptées' : 'Toutes'}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Content */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {activeTab === 'bookings' ? (
          <>
            {receivedBookings.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="calendar-outline" size={48} color={colors.textTertiary} />
                <Text style={styles.emptyStateText}>
                  {statusFilter === 'pending' ? 'Aucune demande de compagnie en attente' :
                   statusFilter === 'accepted' ? 'Aucune demande de compagnie acceptée' :
                   'Aucune demande de compagnie reçue'}
                </Text>
              </View>
            ) : (
              receivedBookings.map((booking) => (
                <View key={booking.id} style={styles.requestCard}>
                  <View style={styles.requestHeader}>
                    <View style={styles.requestUserInfo}>
                      <View style={styles.avatar}>
                        <Ionicons name="person" size={20} color={colors.purple500} />
                      </View>
                      <View>
                        <Text style={styles.requestUserName}>Demande de compagnie</Text>
                        <Text style={styles.requestDate}>{formatDate(booking.bookingDate)}</Text>
                      </View>
                    </View>
                    <Badge variant={booking.status === 'accepted' ? 'success' : booking.status === 'rejected' ? 'error' : 'warning'}>
                      {booking.status === 'accepted' ? 'Acceptée' : booking.status === 'rejected' ? 'Refusée' : 'En attente'}
                    </Badge>
                  </View>

                  <View style={styles.requestDetails}>
                    <View style={styles.detailItem}>
                      <Ionicons name="time-outline" size={16} color={colors.textTertiary} />
                      <Text style={styles.detailText}>
                        Durée : {booking.durationHours} heure{booking.durationHours > 1 ? 's' : ''}
                      </Text>
                    </View>
                    {booking.location && (
                      <View style={styles.detailItem}>
                        <Ionicons name="location-outline" size={16} color={colors.textTertiary} />
                        <Text style={styles.detailText}>{booking.location}</Text>
                      </View>
                    )}
                    {booking.notes && (
                      <View style={styles.detailItem}>
                        <Ionicons name="document-text-outline" size={16} color={colors.textTertiary} />
                        <Text style={styles.detailText}>{booking.notes}</Text>
                      </View>
                    )}
                  </View>

                  {booking.status === 'pending' ? (
                    <View style={styles.requestActions}>
                      <Button
                        title="Refuser"
                        onPress={() => handleRejectBooking(booking.id)}
                        variant="outline"
                        style={[styles.actionButton, styles.rejectButton]}
                        textStyle={{ color: colors.red500 }}
                        disabled={isLoading}
                      />
                      <Button
                        title="Accepter"
                        onPress={() => handleAcceptBooking(booking.id)}
                        style={styles.actionButton}
                        disabled={isLoading}
                        loading={isLoading}
                      />
                    </View>
                  ) : booking.status === 'accepted' ? (
                    <View style={styles.requestActions}>
                      <Button
                        title="Voir les détails"
                        onPress={() => router.push(`/(screens)/booking-details?bookingId=${booking.id}`)}
                        variant="outline"
                        style={styles.actionButton}
                        icon={<Ionicons name="information-circle-outline" size={20} color={colors.text} />}
                      />
                    </View>
                  ) : null}
                </View>
              ))
            )}
          </>
        ) : (
          <>
            {enrichedAccessRequests.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="shield-outline" size={48} color={colors.textTertiary} />
                <Text style={styles.emptyStateText}>
                  {statusFilter === 'pending' ? 'Aucune demande d\'accès en attente' :
                   statusFilter === 'accepted' ? 'Aucune demande d\'accès acceptée' :
                   'Aucune demande d\'accès reçue'}
                </Text>
              </View>
            ) : (
              enrichedAccessRequests.map((request) => (
                <View key={request.id} style={styles.requestCard}>
                  <View style={styles.requestHeader}>
                    <View style={styles.requestUserInfo}>
                      {request.requester ? (
                        <>
                          <ImageWithFallback
                            source={{ uri: request.requester.photo }}
                            style={styles.requesterAvatar}
                          />
                          <View>
                            <Text style={styles.requestUserName}>
                              {request.requester.pseudo}
                            </Text>
                            <Text style={styles.requestDate}>
                              {request.requester.age} ans · {new Date(request.createdAt).toLocaleDateString('fr-FR')}
                            </Text>
                          </View>
                        </>
                      ) : (
                        <>
                          <View style={styles.avatar}>
                            <Ionicons name="person" size={20} color={colors.purple500} />
                          </View>
                          <View>
                            <Text style={styles.requestUserName}>
                              {request.requesterId ? 'Demande d\'accès aux informations' : 'Utilisateur'}
                            </Text>
                            <Text style={styles.requestDate}>
                              {new Date(request.createdAt).toLocaleDateString('fr-FR')}
                            </Text>
                          </View>
                        </>
                      )}
                    </View>
                    <Badge variant={request.status === 'accepted' ? 'success' : request.status === 'rejected' ? 'error' : 'warning'}>
                      {request.status === 'accepted' ? 'Acceptée' : request.status === 'rejected' ? 'Refusée' : 'En attente'}
                    </Badge>
                  </View>

                  {request.requester && (
                    <View style={styles.requesterInfo}>
                      {request.requester.description && (
                        <Text style={styles.requesterDescription} numberOfLines={2}>
                          {request.requester.description}
                        </Text>
                      )}
                      <View style={styles.requesterMeta}>
                        <View style={styles.metaItem}>
                          <Ionicons name="star" size={14} color={colors.yellow500} />
                          <Text style={styles.metaText}>
                            {request.requester.rating.toFixed(1)} ({request.requester.reviewCount || 0})
                          </Text>
                        </View>
                        {request.requester.gender && (
                          <View style={styles.metaItem}>
                            <Ionicons 
                              name={request.requester.gender === 'male' ? 'male' : 'female'} 
                              size={14} 
                              color={colors.purple400} 
                            />
                            <Text style={styles.metaText}>
                              {request.requester.gender === 'male' ? 'Homme' : 'Femme'}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  )}

                  <View style={styles.infoCard}>
                    <Ionicons name="information-circle-outline" size={20} color={colors.purple400} />
                    <Text style={styles.infoText}>
                      {request.requester && request.requesterInfoRevealed
                        ? `${request.requester.pseudo} souhaite voir vos informations personnelles. En acceptant, vous pourrez aussi voir les siennes.`
                        : 'Cette personne souhaite voir vos informations personnelles. En acceptant, vous pourrez aussi voir les siennes.'}
                    </Text>
                  </View>

                  {request.status === 'pending' ? (
                    <View style={styles.requestActions}>
                      <Button
                        title="Refuser"
                        onPress={() => handleRejectAccess(request.id)}
                        variant="outline"
                        style={[styles.actionButton, styles.rejectButton]}
                        textStyle={{ color: colors.red500 }}
                        disabled={isLoading}
                      />
                      <Button
                        title="Accepter"
                        onPress={() => handleAcceptAccess(request.id)}
                        style={styles.actionButton}
                        disabled={isLoading}
                        loading={isLoading}
                      />
                    </View>
                  ) : request.status === 'accepted' ? (
                    <>
                      <View style={styles.acceptedInfo}>
                        <Ionicons name="checkmark-circle" size={20} color={colors.green500} />
                        <Text style={styles.acceptedText}>
                          Vous avez accepté cette demande. Vous pouvez maintenant voir les informations personnelles de {request.requester?.pseudo || 'cet utilisateur'}.
                        </Text>
                      </View>
                      {request.requester && (
                        <View style={styles.requestActions}>
                          <Button
                            title="Voir le profil"
                            onPress={async () => {
                              // Charger le profil complet depuis Supabase
                              try {
                                const { data: userProfile } = await supabase
                                  .from('profiles')
                                  .select('*')
                                  .eq('id', request.requesterId)
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
                            }}
                            style={styles.actionButton}
                            icon={<Ionicons name="person-outline" size={20} color={colors.text} />}
                          />
                        </View>
                      )}
                    </>
                  ) : null}
                </View>
              ))
            )}
          </>
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
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSecondary,
  },
  statusFilters: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSecondary,
    backgroundColor: colors.backgroundSecondary,
  },
  statusFiltersContent: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    gap: 8,
  },
  statusFilterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.background,
    marginRight: 8,
  },
  statusFilterButtonActive: {
    backgroundColor: colors.pink500,
  },
  statusFilterText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  statusFilterTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  tabActive: {
    backgroundColor: `${colors.pink500}33`,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textTertiary,
  },
  tabTextActive: {
    color: colors.pink500,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    gap: 16,
  },
  requestCard: {
    backgroundColor: `${colors.backgroundSecondary}80`,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
    borderRadius: 16,
    padding: 16,
    gap: 16,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  requestUserInfo: {
    flexDirection: 'row',
    gap: 12,
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${colors.purple500}33`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  requesterAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  requestUserName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  requestDate: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 4,
  },
  requesterInfo: {
    paddingLeft: 52,
    gap: 8,
    marginTop: 8,
  },
  requesterDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  requesterMeta: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  requestDetails: {
    gap: 8,
    paddingLeft: 52,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  infoCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: `${colors.purple500}33`,
    borderWidth: 1,
    borderColor: `${colors.purple500}4d`,
    borderRadius: 12,
    padding: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: colors.purple400,
    lineHeight: 18,
  },
  requestActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    marginTop: 0,
  },
  rejectButton: {
    borderColor: colors.red500,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    gap: 16,
  },
  emptyStateText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  acceptedInfo: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: `${colors.green500}33`,
    borderWidth: 1,
    borderColor: `${colors.green500}4d`,
    borderRadius: 12,
    padding: 12,
    alignItems: 'flex-start',
  },
  acceptedText: {
    flex: 1,
    fontSize: 14,
    color: colors.green400,
    lineHeight: 20,
  },
});


