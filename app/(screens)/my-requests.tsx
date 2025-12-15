import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ImageWithFallback } from '../../components/ImageWithFallback';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { colors } from '../../constants/colors';
import { useAccessRequest } from '../../context/AccessRequestContext';
import { useAuth } from '../../context/AuthContext';
import { useBooking } from '../../context/BookingContext';
import { getProfileImage } from '../../lib/defaultImages';
import { supabase } from '../../lib/supabase';

type RequestType = 'access' | 'booking';

interface RequestItem {
  id: string;
  type: RequestType;
  status: string;
  targetUser?: any;
  createdAt: string;
  updatedAt: string;
  data?: any; // Données spécifiques (booking date, etc.)
  _targetId?: string; // ID du target stocké explicitement pour éviter les confusions (pour les demandes d'accès)
}

export default function MyRequestsScreen() {
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const { accessRequests, refreshRequests } = useAccessRequest();
  const { bookings, refreshBookings } = useBooking();
  
  // Log pour déboguer
  console.log('🔍 MyRequestsScreen - État initial:', {
    currentUserId: currentUser?.id,
    accessRequestsCount: accessRequests.length,
    bookingsCount: bookings.length,
    accessRequests: accessRequests.map(r => ({ id: r.id, requesterId: r.requesterId, targetId: r.targetId })),
    bookings: bookings.map(b => ({ id: b.id, requesterId: b.requesterId, providerId: b.providerId })),
  });
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'accepted' | 'rejected'>('all');
  const isLoadingRef = useRef(false);
  const lastLoadKeyRef = useRef<string>('');

  // Mémoriser les demandes filtrées pour éviter les recalculs
  const sentAccessRequests = useMemo(() => {
    const filtered = accessRequests.filter(r => r.requesterId === currentUser?.id);
    console.log('📋 sentAccessRequests:', {
      total: accessRequests.length,
      filtered: filtered.length,
      currentUserId: currentUser?.id,
      allRequesterIds: accessRequests.map(r => r.requesterId),
    });
    return filtered;
  }, [accessRequests, currentUser?.id]);

  const sentBookings = useMemo(() => {
    const filtered = bookings.filter(b => b.requesterId === currentUser?.id);
    console.log('📋 sentBookings:', {
      total: bookings.length,
      filtered: filtered.length,
      currentUserId: currentUser?.id,
      allRequesterIds: bookings.map(b => b.requesterId),
    });
    return filtered;
  }, [bookings, currentUser?.id]);

  const loadRequests = useCallback(async (force: boolean = false) => {
    if (!currentUser?.id) {
      setIsLoading(false);
      return;
    }

    // Créer une clé unique pour cette requête (sans le filtre car le filtre est appliqué après)
    const accessRequestIds = sentAccessRequests.map(r => r.id).sort().join(',');
    const bookingIds = sentBookings.map(b => b.id).sort().join(',');
    const loadKey = `${currentUser.id}-${accessRequestIds}-${bookingIds}`;
    
    console.log('🔄 loadRequests appelé:', { force, loadKey, lastKey: lastLoadKeyRef.current, isLoading: isLoadingRef.current });
    
    // Éviter les appels multiples (sauf si forcé)
    if (!force && (isLoadingRef.current || lastLoadKeyRef.current === loadKey)) {
      console.log('⏭️ loadRequests ignoré (déjà en cours ou même clé)');
      return;
    }

    isLoadingRef.current = true;
    lastLoadKeyRef.current = loadKey;
    setIsLoading(true);
    
    console.log('✅ loadRequests démarre:', { 
      accessRequestsCount: sentAccessRequests.length, 
      bookingsCount: sentBookings.length 
    });

    // Timeout de sécurité pour éviter un chargement infini
    let safetyTimeout: NodeJS.Timeout | null = null;
    
    try {
      const allRequests: RequestItem[] = [];

      // Si aucune demande, terminer immédiatement
      if (sentAccessRequests.length === 0 && sentBookings.length === 0) {
        console.log('📭 Aucune demande à charger');
        setRequests(allRequests); // Liste vide
        return; // Le finally s'occupera de réinitialiser isLoading
      }

      // Timeout de sécurité pour éviter un chargement infini
      safetyTimeout = setTimeout(() => {
        if (isLoadingRef.current) {
          console.warn('⚠️ Timeout de sécurité - arrêt du chargement');
          isLoadingRef.current = false;
          setIsLoading(false);
          setRequests([]);
        }
      }, 30000); // 30 secondes maximum

      // Charger les demandes d'accès envoyées
      for (const accessRequest of sentAccessRequests) {
        // Stocker le targetId AVANT toute opération asynchrone pour éviter les confusions
        const currentTargetId = accessRequest.targetId;
        const currentRequestId = accessRequest.id;
        
        try {
          console.log('🔍 [ACCESS] Début chargement profil:', {
            requestId: currentRequestId,
            targetId: currentTargetId,
            requesterId: accessRequest.requesterId,
            currentUserId: currentUser.id,
          });

          // Charger le profil du target avec timeout amélioré
          const profileQuery = supabase
            .from('profiles')
            .select('*')
            .eq('id', currentTargetId) // Utiliser la variable locale pour éviter toute confusion
            .single();

          // Utiliser Promise.race avec timeout (réduit à 5 secondes)
          const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) =>
            setTimeout(() => resolve({ data: null, error: { message: 'Timeout' } }), 5000)
          );

          const result = await Promise.race([profileQuery, timeoutPromise]) as any;
          const { data: targetProfile, error: profileError } = result;
          
          // Vérifier immédiatement que le profil correspond
          if (targetProfile && targetProfile.id !== currentTargetId) {
            console.error('❌ [ACCESS] ERREUR CRITIQUE: Le profil chargé ne correspond PAS au targetId!', {
              requestId: currentRequestId,
              expectedTargetId: currentTargetId,
              loadedProfileId: targetProfile.id,
              loadedProfilePseudo: targetProfile.pseudo,
            });
            // Ne pas utiliser ce profil, utiliser les infos partielles à la place
            allRequests.push({
              id: currentRequestId,
              type: 'access',
              status: accessRequest.status,
              targetUser: {
                id: currentTargetId,
                pseudo: 'Utilisateur',
                photo: getProfileImage(null, 'female'),
                age: 25,
              },
              createdAt: accessRequest.createdAt,
              updatedAt: accessRequest.updatedAt,
              _targetId: currentTargetId,
            });
            continue; // Passer à la demande suivante
          }

          // Vérifier que le profil chargé correspond bien au targetId
          if (!profileError && targetProfile && targetProfile.id === currentTargetId) {
            console.log('✅ [ACCESS] Profil chargé correctement:', {
              requestId: currentRequestId,
              targetId: currentTargetId,
              profileId: targetProfile.id,
              pseudo: targetProfile.pseudo,
            });
            
            allRequests.push({
              id: currentRequestId,
              type: 'access',
              status: accessRequest.status,
              targetUser: {
                id: currentTargetId, // Utiliser la variable locale pour garantir la cohérence
                pseudo: targetProfile.pseudo || 'Utilisateur',
                photo: getProfileImage(targetProfile.photo, targetProfile.gender),
                age: targetProfile.age || 25,
              },
              createdAt: accessRequest.createdAt,
              updatedAt: accessRequest.updatedAt,
              // Stocker aussi le targetId directement pour éviter toute confusion
              _targetId: currentTargetId,
            });
          } else {
            // Même en cas d'erreur ou de timeout, afficher la demande avec des infos partielles
            console.warn('⚠️ [ACCESS] Impossible de charger le profil target:', {
              requestId: currentRequestId,
              targetId: currentTargetId,
              error: profileError?.message || 'Timeout',
              profileId: targetProfile?.id,
              profileMatches: targetProfile?.id === currentTargetId,
            });
            allRequests.push({
              id: currentRequestId,
              type: 'access',
              status: accessRequest.status,
              targetUser: {
                id: currentTargetId, // Utiliser la variable locale
                pseudo: 'Utilisateur',
                photo: getProfileImage(null, 'female'),
                age: 25,
              },
              createdAt: accessRequest.createdAt,
              updatedAt: accessRequest.updatedAt,
              // Stocker aussi le targetId directement pour éviter toute confusion
              _targetId: currentTargetId,
            });
          }
        } catch (err) {
          console.error('❌ [ACCESS] Error loading target profile:', {
            requestId: currentRequestId,
            targetId: currentTargetId,
            error: err,
          });
          // Même en cas d'erreur, afficher la demande avec des infos partielles
          allRequests.push({
            id: currentRequestId,
            type: 'access',
            status: accessRequest.status,
            targetUser: {
              id: currentTargetId, // Utiliser la variable locale
              pseudo: 'Utilisateur',
              photo: getProfileImage(null, 'female'),
              age: 25,
            },
            createdAt: accessRequest.createdAt,
            updatedAt: accessRequest.updatedAt,
            // Stocker aussi le targetId directement pour éviter toute confusion
            _targetId: currentTargetId,
          });
        }
      }

      // Charger les demandes de compagnie envoyées
      for (const booking of sentBookings) {
        // Stocker les IDs AVANT toute opération asynchrone
        const currentBookingId = booking.id;
        const currentProviderId = booking.providerId;
        
        try {
          console.log('🔍 [BOOKING] Début chargement profil:', {
            bookingId: currentBookingId,
            providerId: currentProviderId,
            requesterId: booking.requesterId,
            currentUserId: currentUser.id,
          });
          
          // Charger le profil du provider avec timeout amélioré
          const profileQuery = supabase
            .from('profiles')
            .select('*')
            .eq('id', currentProviderId) // Utiliser la variable locale
            .single();

          // Utiliser Promise.race avec timeout (réduit à 5 secondes)
          const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) =>
            setTimeout(() => resolve({ data: null, error: { message: 'Timeout' } }), 5000)
          );

          const result = await Promise.race([profileQuery, timeoutPromise]) as any;
          const { data: providerProfile, error: profileError } = result;

          // Vérifier que le profil correspond bien
          if (providerProfile && providerProfile.id !== currentProviderId) {
            console.error('❌ [BOOKING] ERREUR CRITIQUE: Le profil chargé ne correspond PAS au providerId!', {
              bookingId: currentBookingId,
              expectedProviderId: currentProviderId,
              loadedProfileId: providerProfile.id,
              loadedProfilePseudo: providerProfile.pseudo,
            });
          }

          if (!profileError && providerProfile && providerProfile.id === currentProviderId) {
            console.log('✅ [BOOKING] Profil chargé correctement:', {
              bookingId: currentBookingId,
              providerId: currentProviderId,
              profileId: providerProfile.id,
              pseudo: providerProfile.pseudo,
            });
            
            allRequests.push({
              id: currentBookingId, // Utiliser la variable locale
              type: 'booking',
              status: booking.status,
              targetUser: {
                id: currentProviderId, // Utiliser la variable locale pour garantir la cohérence
                pseudo: providerProfile.pseudo || 'Utilisateur',
                photo: getProfileImage(providerProfile.photo, providerProfile.gender),
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
          } else {
            // Même en cas d'erreur ou de timeout, afficher la demande avec des infos partielles
            console.warn('⚠️ [BOOKING] Impossible de charger le profil provider:', {
              bookingId: currentBookingId,
              providerId: currentProviderId,
              error: profileError?.message || 'Timeout',
            });
            allRequests.push({
              id: currentBookingId, // Utiliser la variable locale
              type: 'booking',
              status: booking.status,
              targetUser: {
                id: currentProviderId, // Utiliser la variable locale
                pseudo: 'Utilisateur',
                photo: getProfileImage(null, 'female'),
                age: 25,
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
        } catch (err) {
          console.error('❌ [BOOKING] Error loading provider profile:', {
            bookingId: currentBookingId,
            providerId: currentProviderId,
            error: err,
          });
          // Même en cas d'erreur, afficher la demande avec des infos partielles
          allRequests.push({
            id: currentBookingId, // Utiliser la variable locale
            type: 'booking',
            status: booking.status,
            targetUser: {
              id: currentProviderId, // Utiliser la variable locale
              pseudo: 'Utilisateur',
              photo: getProfileImage(null, 'female'),
              age: 25,
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

      // Log détaillé de toutes les demandes avant de les définir
      console.log('✅ [LOAD] loadRequests terminé - Liste complète des demandes:', {
        requestsCount: allRequests.length,
        requests: allRequests.map(r => ({
          id: r.id,
          type: r.type,
          targetUserPseudo: r.targetUser?.pseudo,
          targetUserId: r.targetUser?.id,
          _targetId: r._targetId,
          status: r.status,
        })),
      });
      
      // Vérifier qu'il n'y a pas de doublons d'IDs
      const requestIds = allRequests.map(r => r.id);
      const duplicateIds = requestIds.filter((id, index) => requestIds.indexOf(id) !== index);
      if (duplicateIds.length > 0) {
        console.error('❌ [LOAD] ERREUR: IDs dupliqués trouvés!', duplicateIds);
      }
      
      setRequests(allRequests);
    } catch (error) {
      console.error('Error loading requests:', error);
      setRequests([]); // Afficher une liste vide plutôt que de rester en chargement
    } finally {
      if (safetyTimeout) {
        clearTimeout(safetyTimeout);
      }
      isLoadingRef.current = false;
      setIsLoading(false);
      console.log('✅ loadRequests - État de chargement réinitialisé');
    }
  }, [currentUser?.id, sentAccessRequests, sentBookings]);

  // Charger les demandes au montage initial et quand les données changent
  useEffect(() => {
    if (!currentUser?.id) {
      setIsLoading(false);
      setRequests([]);
      return;
    }

    // Vérifier si les IDs ont changé
    const accessRequestIds = sentAccessRequests.map(r => r.id).sort().join(',');
    const bookingIds = sentBookings.map(b => b.id).sort().join(',');
    const newKey = `${currentUser.id}-${accessRequestIds}-${bookingIds}`;
    
    // Si la clé est vide, c'est le premier chargement - forcer
    const isFirstLoad = lastLoadKeyRef.current === '';
    
    console.log('🔍 useEffect check:', { 
      isFirstLoad, 
      newKey, 
      lastKey: lastLoadKeyRef.current, 
      isLoading: isLoadingRef.current,
      hasAccessRequests: sentAccessRequests.length > 0,
      hasBookings: sentBookings.length > 0
    });
    
    // Éviter les appels multiples (sauf si c'est le premier chargement)
    if (!isFirstLoad && (isLoadingRef.current || lastLoadKeyRef.current === newKey)) {
      console.log('⏭️ useEffect ignoré');
      return;
    }

    const hasRequests = sentAccessRequests.length > 0 || sentBookings.length > 0;
    if (hasRequests) {
      // Forcer le premier chargement
      console.log('🚀 Démarrage du chargement des demandes');
      loadRequests(isFirstLoad);
    } else {
      console.log('📭 Aucune demande, mise à jour de l\'état');
      // Réinitialiser les refs pour permettre un nouveau chargement si des demandes arrivent
      isLoadingRef.current = false;
      setIsLoading(false);
      setRequests([]);
      // Mettre à jour la clé même si pas de demandes pour éviter les rechargements
      if (lastLoadKeyRef.current !== newKey) {
        lastLoadKeyRef.current = newKey;
      }
    }
  }, [currentUser?.id, sentAccessRequests, sentBookings]); // eslint-disable-line react-hooks/exhaustive-deps

  // Suivre le temps du dernier focus pour éviter les rafraîchissements trop fréquents
  const lastFocusTimeRef = useRef<number>(0);
  
  useFocusEffect(
    useCallback(() => {
      if (!currentUser?.id || isLoadingRef.current) return;
      
      const now = Date.now();
      const timeSinceLastFocus = now - lastFocusTimeRef.current;
      
      // Ne rafraîchir que si on revient après plus de 2 secondes (évite les rafraîchissements lors de la navigation rapide)
      if (timeSinceLastFocus > 2000 || lastFocusTimeRef.current === 0) {
        console.log('🔄 Rafraîchissement des demandes (focus après', timeSinceLastFocus, 'ms)');
        lastFocusTimeRef.current = now;
        
        // Rafraîchir les données au focus (sans forcer le rechargement complet)
        refreshRequests().then(() => {
          console.log('✅ Access requests rafraîchies');
        });
        refreshBookings().then(() => {
          console.log('✅ Bookings rafraîchies');
        });
        
        // Recharger seulement si les données ont changé (pas de forçage systématique)
        const timer = setTimeout(() => {
          if (!isLoadingRef.current) {
            // Vérifier si les données ont changé avant de recharger
            const newAccessRequestIds = sentAccessRequests.map(r => r.id).sort().join(',');
            const newBookingIds = sentBookings.map(b => b.id).sort().join(',');
            const newLoadKey = `${currentUser.id}-${newAccessRequestIds}-${newBookingIds}`;
            
            if (newLoadKey !== lastLoadKeyRef.current) {
              console.log('🔄 Données changées, rechargement nécessaire');
              loadRequests(false); // Ne pas forcer, laisser la logique normale gérer
            } else {
              console.log('⏭️ Données inchangées, pas de rechargement');
            }
          }
        }, 500);
        return () => clearTimeout(timer);
      } else {
        console.log('⏭️ Focus trop récent, pas de rafraîchissement');
      }
    }, [currentUser?.id, sentAccessRequests, sentBookings, refreshRequests, refreshBookings, loadRequests]) // eslint-disable-line react-hooks/exhaustive-deps
  );

  const onRefresh = useCallback(async () => {
    if (isLoadingRef.current) return; // Éviter les refresh multiples
    
    setRefreshing(true);
    // Réinitialiser la clé de chargement pour forcer le rechargement
    lastLoadKeyRef.current = '';
    isLoadingRef.current = false;
    
    await refreshRequests();
    await refreshBookings();
    
    // Attendre un peu pour que les données soient mises à jour
    setTimeout(() => {
      loadRequests(true);
      setRefreshing(false);
    }, 500);
  }, [refreshRequests, refreshBookings]); // eslint-disable-line react-hooks/exhaustive-deps

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
          return colors.green500;
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
    console.log('🖱️ [CLICK] handleRequestPress appelé:', {
      requestId: request.id,
      type: request.type,
      targetUserFromRequest: request.targetUser?.id,
      targetUserPseudo: request.targetUser?.pseudo,
      _targetId: request._targetId,
    });
    
    if (request.type === 'booking') {
      // Pour toutes les demandes de compagnie, naviguer vers les détails
      console.log('📋 [CLICK] Navigation vers booking-details:', request.id);
      router.push(`/(screens)/booking-details?bookingId=${request.id}`);
    } else if (request.type === 'access') {
      // Pour les demandes d'accès, trouver le targetId depuis les accessRequests
      const accessRequest = sentAccessRequests.find(r => r.id === request.id);
      
      console.log('📋 [CLICK] Détails de la demande d\'accès:', {
        requestId: request.id,
        _targetId: request._targetId,
        targetUserFromRequest: request.targetUser?.id,
        targetUserPseudo: request.targetUser?.pseudo,
        accessRequestFound: !!accessRequest,
        accessRequestTargetId: accessRequest?.targetId,
        allSentAccessRequests: sentAccessRequests.map(r => ({
          id: r.id,
          targetId: r.targetId,
          requesterId: r.requesterId,
        })),
      });
      
      // Priorité absolue: utiliser le targetId depuis sentAccessRequests (source de vérité)
      const targetId = accessRequest?.targetId;
      
      if (!targetId) {
        console.error('❌ [CLICK] ERREUR: Impossible de trouver le targetId pour la demande!', {
          requestId: request.id,
          _targetId: request._targetId,
          targetUserFromRequest: request.targetUser?.id,
          accessRequestFound: !!accessRequest,
          allSentAccessRequests: sentAccessRequests.map(r => ({ id: r.id, targetId: r.targetId })),
        });
        Alert.alert('Erreur', 'Impossible d\'ouvrir le profil');
        return;
      }
      
      // Vérifier que le targetId correspond bien à la demande affichée
      if (request.targetUser?.id && request.targetUser.id !== targetId) {
        console.error('❌ [CLICK] ERREUR: Le targetUser.id ne correspond pas au targetId de la demande!', {
          requestId: request.id,
          expectedTargetId: targetId,
          actualTargetUserId: request.targetUser.id,
          targetUserPseudo: request.targetUser.pseudo,
        });
      }
      
      console.log('✅ [CLICK] Navigation vers user-profile avec targetId:', {
        requestId: request.id,
        targetId: targetId,
        targetUserPseudo: request.targetUser?.pseudo,
      });
      
      // TOUJOURS utiliser le targetId depuis sentAccessRequests (source de vérité)
      router.push(`/(screens)/user-profile?userId=${targetId}`);
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
                onPress={() => {
                  console.log('🖱️ [DISPLAY] Clic sur demande:', {
                    requestId: request.id,
                    type: request.type,
                    targetUserPseudo: request.targetUser?.pseudo,
                    targetUserId: request.targetUser?.id,
                    _targetId: request._targetId,
                  });
                  handleRequestPress(request);
                }}
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



