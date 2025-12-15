import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { ImageWithFallback } from '../../components/ImageWithFallback';
import { useUser } from '../../context/UserContext';
import { useAccessRequest } from '../../context/AccessRequestContext';
import { useRating } from '../../context/RatingContext';
import { useAuth } from '../../context/AuthContext';
import { useBooking } from '../../context/BookingContext';
import { useBlock } from '../../context/BlockContext';
import { useAlbum } from '../../context/AlbumContext';
import { supabase } from '../../lib/supabase';
import { getProfileImage } from '../../lib/defaultImages';
import { User } from '../../types';
import Animated, { FadeIn } from 'react-native-reanimated';

export default function UserProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ userId?: string }>();
  const { selectedUser, setSelectedUser } = useUser();
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const { user: currentUser } = useAuth();
  const { requestAccess, hasAccess, canViewFullProfile, accessRequests, refreshRequests } = useAccessRequest();
  const { createRating, getUserRatings, updateRating, getUserAverageRating } = useRating();
  const { getActiveBookingWithUser, cancelBooking } = useBooking();
  const { blockUser, unblockUser, isUserBlocked, blockedUsers } = useBlock();
  const { getUserAlbumPhotos } = useAlbum();
  const [isBlocked, setIsBlocked] = useState(false);
  const [userAlbumPhotos, setUserAlbumPhotos] = useState<any[]>([]);
  const [isLoadingAlbum, setIsLoadingAlbum] = useState(false);
  const [showAccessDialog, setShowAccessDialog] = useState(false);
  const [showRatingDialog, setShowRatingDialog] = useState(false);
  const [showBookingDialog, setShowBookingDialog] = useState(false);
  const [activeBooking, setActiveBooking] = useState<any>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [userRatings, setUserRatings] = useState<any[]>([]);
  const [isLoadingRatings, setIsLoadingRatings] = useState(false);
  const [existingRating, setExistingRating] = useState<any>(null);
  const [averageRating, setAverageRating] = useState({ average: 0, count: 0 });
  const [isLoadingBooking, setIsLoadingBooking] = useState(false);
  const isLoadingBookingRef = React.useRef(false);
  const lastLoadTimeRef = React.useRef<number>(0);
  const lastSelectedUserIdRef = React.useRef<string | null>(null);

  // Fonction pour charger la demande active
  const loadActiveBooking = React.useCallback(async (force = false) => {
    if (!selectedUser?.id || !currentUser?.id) {
      setActiveBooking(null);
      lastSelectedUserIdRef.current = null;
      setIsLoadingBooking(false);
      isLoadingBookingRef.current = false;
      return;
    }

    // Éviter les appels multiples simultanés
    if (isLoadingBookingRef.current) {
      console.log('⏭️ Chargement déjà en cours, skip');
      return;
    }

    // Éviter de recharger trop souvent (max 1 fois par seconde)
    const now = Date.now();
    const sameUser = lastSelectedUserIdRef.current === selectedUser.id;
    if (!force && sameUser && now - lastLoadTimeRef.current < 1000) {
      console.log('⏭️ Rechargement trop récent, skip');
      return;
    }

    isLoadingBookingRef.current = true;
    setIsLoadingBooking(true);
    lastLoadTimeRef.current = now;
    lastSelectedUserIdRef.current = selectedUser.id;

    // Ajouter un timeout pour éviter que la fonction reste bloquée indéfiniment
    const timeoutId = setTimeout(() => {
      if (isLoadingBookingRef.current) {
        console.log('⏱️ Timeout lors du chargement de la demande active');
        setIsLoadingBooking(false);
        isLoadingBookingRef.current = false;
      }
    }, 10000); // 10 secondes timeout

    try {
      const booking = await getActiveBookingWithUser(selectedUser.id);
      clearTimeout(timeoutId);
      console.log('📋 Demande active chargée:', booking ? `${booking.id} - ${booking.status}` : 'Aucune demande');
      setActiveBooking(booking);
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('Error loading active booking:', error);
      setActiveBooking(null);
    } finally {
      clearTimeout(timeoutId);
      setIsLoadingBooking(false);
      isLoadingBookingRef.current = false;
    }
  }, [selectedUser?.id, currentUser?.id, getActiveBookingWithUser]);

  // Charger la demande active au montage
  React.useEffect(() => {
    if (selectedUser?.id && currentUser?.id) {
      loadActiveBooking(true); // Force le chargement initial
    }
  }, [selectedUser?.id, currentUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Charger les avis du profil
  const loadUserRatings = React.useCallback(async () => {
    if (!selectedUser?.id) return;

    setIsLoadingRatings(true);
    try {
      // Ajouter un timeout pour éviter que le chargement reste bloqué
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout loading ratings')), 10000);
      });

      // Charger les avis avec timeout
      const ratings = await Promise.race([
        getUserRatings(selectedUser.id),
        timeoutPromise,
      ]) as any[];
      
      // Charger les informations des raters pour chaque avis avec timeout individuel
      const ratingsWithRaterInfo = await Promise.all(
        ratings.map(async (ratingItem) => {
          try {
            const profilePromise = supabase
              .from('profiles')
              .select('pseudo, photo')
              .eq('id', ratingItem.raterId)
              .single();
            
            const timeout = new Promise((_, reject) => {
              setTimeout(() => reject(new Error('Timeout')), 5000);
            });

            const { data: raterProfile } = await Promise.race([profilePromise, timeout]) as any;
            
            return {
              ...ratingItem,
              rater: raterProfile ? {
                pseudo: raterProfile.pseudo || 'Utilisateur',
                photo: raterProfile.photo || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
              } : null,
            };
          } catch (err) {
            console.error('Error fetching rater profile:', err);
            return ratingItem;
          }
        })
      );

      setUserRatings(ratingsWithRaterInfo);

      // Vérifier si l'utilisateur actuel a déjà noté ce profil
      if (currentUser?.id) {
        const myRating = ratings.find(r => r.raterId === currentUser.id);
        setExistingRating(myRating || null);
      }

      // Charger la moyenne des notes avec timeout
      const avgRating = await Promise.race([
        getUserAverageRating(selectedUser.id),
        Promise.resolve({ average: 0, count: 0 }),
      ]) as { average: number; count: number };
      setAverageRating(avgRating);
    } catch (error) {
      console.error('Error loading user ratings:', error);
      // En cas d'erreur, initialiser avec des valeurs par défaut
      setUserRatings([]);
      setAverageRating({ average: 0, count: 0 });
    } finally {
      setIsLoadingRatings(false);
    }
  }, [selectedUser?.id, currentUser?.id, getUserRatings, getUserAverageRating]);

  // Charger les photos d'album au montage
  React.useEffect(() => {
    if (selectedUser?.id) {
      loadUserAlbumPhotos();
    }
  }, [selectedUser?.id]);

  // Charger les avis au montage
  React.useEffect(() => {
    if (selectedUser?.id) {
      loadUserRatings();
    }
  }, [selectedUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Charger le profil depuis userId si selectedUser n'est pas défini
  useEffect(() => {
    const loadProfileFromParams = async () => {
      if (!selectedUser && params.userId) {
        console.log('📥 Chargement du profil depuis userId:', params.userId);
        setIsLoadingProfile(true);
        try {
          const { data: userProfile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', params.userId)
            .single();

          if (error) {
            console.error('Error loading profile:', error);
            Alert.alert('Erreur', 'Impossible de charger le profil');
            router.back();
            return;
          }

          if (userProfile) {
            const fullUser: User = {
              id: userProfile.id,
              pseudo: userProfile.pseudo || 'Utilisateur',
              age: userProfile.age || 25,
              phone: userProfile.phone || '',
              photo: getProfileImage(userProfile.photo, userProfile.gender),
              description: userProfile.description || '',
              specialty: userProfile.specialty || undefined,
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
            console.log('✅ Profil chargé depuis userId');
          }
        } catch (error) {
          console.error('Error loading profile from params:', error);
          Alert.alert('Erreur', 'Impossible de charger le profil');
          router.back();
        } finally {
          setIsLoadingProfile(false);
        }
      }
    };

    loadProfileFromParams();
  }, [params.userId, selectedUser, setSelectedUser, router]);

  // Recharger quand on revient sur la page (après avoir créé une demande par exemple)
  useFocusEffect(
    React.useCallback(() => {
      // Utiliser un petit délai pour éviter les appels multiples et laisser le temps à la DB de se mettre à jour
      const timer = setTimeout(() => {
        if (selectedUser?.id && currentUser?.id) {
          console.log('🔄 Rechargement du profil - refreshRequests et loadActiveBooking');
          refreshRequests(); // Rafraîchir les demandes d'accès
          // Recharger la demande active quand on revient sur la page
          loadActiveBooking(true); // Force le rechargement quand on revient
        }
      }, 500); // Délai augmenté à 500ms pour laisser le temps à la DB

      return () => {
        clearTimeout(timer);
      };
    }, [selectedUser?.id, currentUser?.id, refreshRequests, loadActiveBooking]) // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Vérifier si on a déjà demandé l'accès (doit être avant le return conditionnel)
  const existingRequest = selectedUser ? accessRequests.find(
    r => r.requesterId === currentUser?.id && r.targetId === selectedUser.id
  ) : null;
  const accessRequested = !!existingRequest && existingRequest.status === 'pending';
  const accessAccepted = !!existingRequest && existingRequest.status === 'accepted';
  const hasFullAccess = selectedUser ? hasAccess(selectedUser.id) : false;
  const canViewInfo = selectedUser ? canViewFullProfile(selectedUser.id) : false;

  // Vérifier si l'utilisateur est bloqué (doit être avant le return conditionnel)
  React.useEffect(() => {
    const checkBlocked = async () => {
      if (selectedUser?.id && currentUser?.id) {
        const blocked = await isUserBlocked(currentUser.id, selectedUser.id);
        setIsBlocked(blocked);
      } else {
        setIsBlocked(false);
      }
    };
    checkBlocked();
  }, [selectedUser?.id, currentUser?.id, isUserBlocked]);

  // Debug logs (doit être avant le return conditionnel)
  React.useEffect(() => {
    if (selectedUser?.id && currentUser?.id) {
      console.log('🔍 Debug accès:', {
        selectedUserId: selectedUser.id,
        currentUserId: currentUser.id,
        accessRequestsCount: accessRequests.length,
        existingRequest: existingRequest ? {
          id: existingRequest.id,
          status: existingRequest.status,
          requesterId: existingRequest.requesterId,
          targetId: existingRequest.targetId,
        } : null,
        hasFullAccess,
        canViewInfo,
        accessRequested,
        accessAccepted,
      });
    }
  }, [selectedUser?.id, currentUser?.id, accessRequests, existingRequest, hasFullAccess, canViewInfo, accessRequested, accessAccepted]);

  if (!selectedUser) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profil</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          {isLoadingProfile ? (
            <>
              <ActivityIndicator size="large" color={colors.purple500} />
              <Text style={[styles.description, { marginTop: 16 }]}>Chargement du profil...</Text>
            </>
          ) : (
            <Text style={styles.description}>Profil non disponible</Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const handleRequestAccess = async () => {
    if (!currentUser) return;

    setIsLoading(true);
    try {
      const { error } = await requestAccess(selectedUser.id);
      
      if (error) {
        Alert.alert('Erreur', error.message || 'Impossible de créer la demande d\'accès');
        setIsLoading(false);
        return;
      }

      setShowAccessDialog(false);
      Alert.alert('Succès', 'Votre demande d\'accès a été envoyée');
    } catch (error: any) {
      Alert.alert('Erreur', 'Une erreur est survenue');
      console.error('Request access error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBooking = () => {
    if (!selectedUser.isAvailable) {
      Alert.alert('Indisponible', 'Cet utilisateur n\'est pas disponible pour le moment');
      return;
    }
    
    // Si une demande est déjà en cours, ne pas permettre une nouvelle demande
    if (activeBooking) {
      if (activeBooking.status === 'pending') {
        Alert.alert(
          'Demande en cours',
          'Vous avez déjà une demande en attente avec cet utilisateur'
        );
        return;
      }
      if (activeBooking.status === 'accepted') {
        Alert.alert(
          'Compagnie en cours',
          'Vous avez déjà une compagnie acceptée avec cet utilisateur'
        );
        return;
      }
    }
    
    router.push('/(screens)/booking');
  };

  const handleCancelBooking = () => {
    if (!activeBooking) return;

    Alert.alert(
      'Annuler la demande',
      'Êtes-vous sûr de vouloir annuler cette demande ?',
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Oui, annuler',
          style: 'destructive',
          onPress: async () => {
            setIsLoading(true);
            const bookingIdToCancel = activeBooking.id;
            try {
              const { error } = await cancelBooking(bookingIdToCancel);
              if (error) {
                Alert.alert('Erreur', error.message || 'Impossible d\'annuler la demande');
              } else {
                // Mettre à jour immédiatement le state local pour refléter l'annulation
                setActiveBooking(null);
                Alert.alert('Succès', 'La demande a été annulée');
                // Recharger la demande active pour s'assurer que tout est à jour
                await loadActiveBooking(true);
              }
            } catch (error: any) {
              Alert.alert('Erreur', 'Une erreur est survenue');
              console.error('Cancel booking error:', error);
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleSubmitRating = async () => {
    if (rating === 0) {
      Alert.alert('Erreur', 'Veuillez sélectionner une note');
      return;
    }

    if (!currentUser) return;

    setIsLoading(true);
    try {
      let error;
      
      // Si l'utilisateur a déjà noté ce profil, mettre à jour l'avis existant
      if (existingRating) {
        const result = await updateRating(existingRating.id, rating, comment);
        error = result.error;
      } else {
        // Sinon, créer un nouvel avis
        const result = await createRating(selectedUser.id, rating, comment);
        error = result.error;
      }
      
      if (error) {
        Alert.alert('Erreur', error.message || 'Impossible d\'envoyer l\'avis');
        setIsLoading(false);
        return;
      }

      setShowRatingDialog(false);
      setRating(0);
      setComment('');
      setExistingRating(null);
      
      // Recharger les avis pour mettre à jour l'affichage
      await loadUserRatings();
      
      Alert.alert('Succès', existingRating ? 'Votre avis a été modifié' : 'Votre avis a été envoyé');
    } catch (error: any) {
      Alert.alert('Erreur', 'Une erreur est survenue');
      console.error('Submit rating error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenRatingDialog = () => {
    // Si l'utilisateur a déjà noté ce profil, pré-remplir le formulaire
    if (existingRating) {
      setRating(existingRating.rating);
      setComment(existingRating.comment || '');
    } else {
      setRating(0);
      setComment('');
    }
    setShowRatingDialog(true);
  };

  const loadUserAlbumPhotos = async () => {
    if (!selectedUser?.id) return;
    
    setIsLoadingAlbum(true);
    try {
      // Ajouter un timeout pour éviter que le chargement reste bloqué
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout loading album photos')), 8000);
      });

      const photos = await Promise.race([
        getUserAlbumPhotos(selectedUser.id),
        timeoutPromise,
      ]) as any[];
      setUserAlbumPhotos(photos);
    } catch (error) {
      console.error('Error loading album photos:', error);
      // En cas d'erreur, initialiser avec un tableau vide
      setUserAlbumPhotos([]);
    } finally {
      setIsLoadingAlbum(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profil</Text>
        <TouchableOpacity>
          <Ionicons name="heart-outline" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Profile Image */}
        <View style={styles.imageContainer}>
          <ImageWithFallback
            source={{ uri: selectedUser.photo || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400' }}
            style={styles.profileImage}
          />
          <View style={styles.imageOverlay} />
          <View style={styles.imageInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{selectedUser.pseudo || 'Utilisateur'}</Text>
              <Text style={styles.separator}>·</Text>
              <Text style={styles.age}>{selectedUser.age || 0} ans</Text>
              {selectedUser.isSubscribed && (
                <View style={styles.crownIcon}>
                  <Ionicons name="diamond" size={12} color="#ffffff" />
                </View>
              )}
            </View>
            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <Ionicons name="star" size={16} color={colors.yellow500} />
                <Text style={styles.metaText}>{selectedUser.rating?.toFixed(1) || '0.0'}</Text>
                <Text style={styles.metaTextSecondary}>({selectedUser.reviewCount || 0})</Text>
              </View>
              {selectedUser.distance !== undefined && selectedUser.distance !== null && (
                <View style={styles.metaItem}>
                  <Ionicons name="location" size={16} color={colors.textSecondary} />
                  <Text style={styles.metaText}>{selectedUser.distance.toFixed(1)} km</Text>
                </View>
              )}
              <View style={styles.metaItem}>
                <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.metaText}>{selectedUser.lastSeen || 'En ligne'}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.content}>
          {/* Description */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>À propos</Text>
            <Text style={styles.description}>{selectedUser.description || 'Aucune description'}</Text>
          </View>

          {/* Specialty */}
          {selectedUser.specialty && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Savoir-faire particulier</Text>
              <View style={styles.specialtyCard}>
                <Ionicons name="briefcase" size={20} color={colors.pink400} />
                <Text style={styles.specialtyText}>{selectedUser.specialty}</Text>
              </View>
            </View>
          )}

          {/* Album Photos Section */}
          {userAlbumPhotos.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Album ({userAlbumPhotos.length})</Text>
              <View style={styles.albumGrid}>
                {userAlbumPhotos.map((photo) => (
                  <Animated.View key={photo.id} entering={FadeIn} style={styles.albumPhotoContainer}>
                    <ImageWithFallback
                      source={{ uri: photo.photoUrl }}
                      style={styles.albumPhoto}
                    />
                  </Animated.View>
                ))}
              </View>
            </View>
          )}

          {/* Access Request Section */}
          {!hasFullAccess && !accessRequested && currentUser?.id !== selectedUser.id && (
            <View style={styles.accessCard}>
              <View style={styles.accessHeader}>
                <Ionicons name="alert-circle" size={20} color={colors.pink400} />
                <View style={styles.accessText}>
                  <Text style={styles.accessTitle}>
                    Pour voir les informations personnelles de ce profil, vous devez demander l'accès.
                  </Text>
                  <Text style={styles.accessWarning}>
                    ⚠️ En demandant l'accès, cette personne pourra aussi voir vos informations personnelles.
                  </Text>
                </View>
              </View>
              <Button
                title="Demander l'accès aux informations"
                onPress={() => setShowAccessDialog(true)}
                icon={<Ionicons name="shield-checkmark" size={20} color="#ffffff" />}
                style={styles.accessButton}
              />
            </View>
          )}

          {accessRequested && !hasAccess && (
            <View style={styles.pendingCard}>
              <Ionicons name="time-outline" size={20} color={colors.yellow400} />
              <View>
                <Text style={styles.pendingTitle}>Demande d'accès envoyée</Text>
                <Text style={styles.pendingSubtitle}>En attente de l'approbation</Text>
              </View>
            </View>
          )}

          {accessAccepted && (
            <Animated.View entering={FadeIn} style={styles.verifiedCard}>
              <View style={styles.verifiedHeader}>
                <Ionicons name="checkmark-circle" size={20} color={colors.green500} />
                <Text style={styles.verifiedTitle}>Accès accordé</Text>
              </View>
              <Text style={styles.verifiedSubtitle}>
                Votre demande d'accès a été acceptée. Vous pouvez maintenant voir les informations personnelles de ce profil.
              </Text>
            </Animated.View>
          )}

          {/* Verified Information */}
          {canViewInfo && (
            <Animated.View entering={FadeIn} style={styles.verifiedCard}>
              <View style={styles.verifiedHeader}>
                <Ionicons name="checkmark-circle" size={20} color={colors.green500} />
                <Text style={styles.verifiedTitle}>Informations vérifiées</Text>
              </View>
              <View style={styles.verifiedInfo}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Âge exact</Text>
                  <Text style={styles.infoValue}>{selectedUser.age || 0} ans</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>WhatsApp</Text>
                  <Text style={styles.infoValue}>{selectedUser.phone || '+243 XXX XXX XXX'}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Statut</Text>
                  <Badge variant={selectedUser.subscriptionStatus === 'active' ? 'success' : 'default'}>
                    {selectedUser.subscriptionStatus === 'active' ? 'Abonné' : 'Non abonné'}
                  </Badge>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Dernière connexion</Text>
                  <Text style={styles.infoValue}>{selectedUser.lastSeen || 'En ligne'}</Text>
                </View>
              </View>
            </Animated.View>
          )}

          {/* Active Booking Section */}
          {activeBooking && activeBooking.status === 'pending' && (
            <Animated.View entering={FadeIn} style={styles.bookingCard}>
              <View style={styles.bookingHeader}>
                <Ionicons name="time-outline" size={20} color={colors.yellow400} />
                <View style={styles.bookingText}>
                  <Text style={styles.bookingTitle}>Votre demande pour ce profil est en attente</Text>
                  <Text style={styles.bookingSubtitle}>
                    En attente de la réponse de {selectedUser.pseudo || 'l\'utilisateur'}
                  </Text>
                </View>
              </View>
              <View style={styles.bookingDetails}>
                <View style={styles.bookingDetailRow}>
                  <Text style={styles.bookingDetailLabel}>Date et heure :</Text>
                  <Text style={styles.bookingDetailValue}>
                    {new Date(activeBooking.bookingDate).toLocaleString('fr-FR', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
                <View style={styles.bookingDetailRow}>
                  <Text style={styles.bookingDetailLabel}>Durée :</Text>
                  <Text style={styles.bookingDetailValue}>{activeBooking.durationHours} heure(s)</Text>
                </View>
                {activeBooking.location && (
                  <View style={styles.bookingDetailRow}>
                    <Text style={styles.bookingDetailLabel}>Lieu :</Text>
                    <Text style={styles.bookingDetailValue}>{activeBooking.location || 'À définir'}</Text>
                  </View>
                )}
                {activeBooking.notes && (
                  <View style={styles.bookingDetailRow}>
                    <Text style={styles.bookingDetailLabel}>Notes :</Text>
                    <Text style={styles.bookingDetailValue}>{activeBooking.notes}</Text>
                  </View>
                )}
              </View>
              <View style={styles.bookingActions}>
                <Button
                  title="Voir les détails"
                  onPress={() => router.push(`/(screens)/booking-details?bookingId=${activeBooking.id}`)}
                  variant="outline"
                  icon={<Ionicons name="information-circle-outline" size={20} color={colors.text} />}
                  style={[styles.bookingActionButton, { flex: 1 }]}
                />
                <Button
                  title="Annuler la demande"
                  onPress={handleCancelBooking}
                  variant="outline"
                  icon={<Ionicons name="close-circle-outline" size={20} color={colors.red500} />}
                  style={[styles.bookingActionButton, { flex: 1 }]}
                  loading={isLoading}
                  disabled={isLoading}
                />
              </View>
            </Animated.View>
          )}

          {activeBooking && activeBooking.status === 'accepted' && (
            <Animated.View entering={FadeIn} style={styles.bookingCardAccepted}>
              <View style={styles.bookingHeader}>
                <Ionicons name="checkmark-circle" size={20} color={colors.green500} />
                <View style={styles.bookingText}>
                  <Text style={styles.bookingTitle}>Votre demande a été acceptée</Text>
                  <Text style={styles.bookingSubtitle}>
                    Le rendez-vous est prévu pour :
                  </Text>
                </View>
              </View>
              <View style={styles.bookingDetails}>
                <View style={styles.bookingDetailRow}>
                  <Text style={styles.bookingDetailLabel}>Date et heure :</Text>
                  <Text style={styles.bookingDetailValue}>
                    {new Date(activeBooking.bookingDate).toLocaleString('fr-FR', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
                <View style={styles.bookingDetailRow}>
                  <Text style={styles.bookingDetailLabel}>Durée :</Text>
                  <Text style={styles.bookingDetailValue}>{activeBooking.durationHours} heure(s)</Text>
                </View>
                {activeBooking.location && (
                  <View style={styles.bookingDetailRow}>
                    <Text style={styles.bookingDetailLabel}>Lieu :</Text>
                    <Text style={styles.bookingDetailValue}>{activeBooking.location || 'À définir'}</Text>
                  </View>
                )}
                {activeBooking.notes && (
                  <View style={styles.bookingDetailRow}>
                    <Text style={styles.bookingDetailLabel}>Notes :</Text>
                    <Text style={styles.bookingDetailValue}>{activeBooking.notes}</Text>
                  </View>
                )}
              </View>
              <View style={styles.bookingActions}>
                <Button
                  title="Voir les détails"
                  onPress={() => router.push(`/(screens)/booking-details?bookingId=${activeBooking.id}`)}
                  variant="outline"
                  icon={<Ionicons name="information-circle-outline" size={20} color={colors.text} />}
                  style={[styles.bookingActionButton, { flex: 1 }]}
                />
              </View>
            </Animated.View>
          )}

          {/* Action Buttons - Ne s'affichent que s'il n'y a pas de demande active et si non bloqué */}
          {!activeBooking && !isBlocked && (
            <View style={styles.actions}>
              <Button
                title={selectedUser.isAvailable ? "Demander une compagnie" : "Indisponible"}
                onPress={handleBooking}
                icon={<Ionicons name="heart" size={20} color="#ffffff" />}
                style={styles.actionButton}
                disabled={!selectedUser.isAvailable}
              />
              <Button
                title="Envoyer un message"
                onPress={() => router.push(`/(screens)/chat?userId=${selectedUser.id}`)}
                variant="outline"
                icon={<Ionicons name="chatbubbles-outline" size={20} color={colors.text} />}
                style={styles.actionButton}
              />
            </View>
          )}

          {/* Bouton message si demande acceptée */}
          {activeBooking && activeBooking.status === 'accepted' && !isBlocked && (
            <View style={styles.actions}>
              <Button
                title="Envoyer un message"
                onPress={() => router.push(`/(screens)/chat?userId=${selectedUser.id}`)}
                variant="outline"
                icon={<Ionicons name="chatbubbles-outline" size={20} color={colors.text} />}
                style={styles.actionButton}
              />
            </View>
          )}

          {/* Bouton bloquer/débloquer */}
          {selectedUser?.id && currentUser?.id && selectedUser.id !== currentUser.id && (
            <View style={styles.actions}>
              <Button
                title={isBlocked ? "Débloquer" : "Bloquer"}
                onPress={async () => {
                  if (!selectedUser?.id) return;
                  
                  if (isBlocked) {
                    Alert.alert(
                      'Débloquer',
                      `Êtes-vous sûr de vouloir débloquer ${selectedUser.pseudo} ?`,
                      [
                        { text: 'Annuler', style: 'cancel' },
                        {
                          text: 'Débloquer',
                          style: 'destructive',
                          onPress: async () => {
                            const success = await unblockUser(selectedUser.id);
                            if (success) {
                              setIsBlocked(false);
                              Alert.alert('Succès', 'Utilisateur débloqué');
                            } else {
                              Alert.alert('Erreur', 'Impossible de débloquer l\'utilisateur');
                            }
                          },
                        },
                      ]
                    );
                  } else {
                    Alert.alert(
                      'Bloquer',
                      `Êtes-vous sûr de vouloir bloquer ${selectedUser.pseudo} ? Vous ne pourrez plus voir son profil, lui envoyer de messages ou de demandes.`,
                      [
                        { text: 'Annuler', style: 'cancel' },
                        {
                          text: 'Bloquer',
                          style: 'destructive',
                          onPress: async () => {
                            const success = await blockUser(selectedUser.id);
                            if (success) {
                              setIsBlocked(true);
                              Alert.alert('Succès', 'Utilisateur bloqué');
                            } else {
                              Alert.alert('Erreur', 'Impossible de bloquer l\'utilisateur');
                            }
                          },
                        },
                      ]
                    );
                  }
                }}
                variant={isBlocked ? "outline" : "ghost"}
                icon={<Ionicons name={isBlocked ? "lock-open-outline" : "lock-closed-outline"} size={20} color={isBlocked ? colors.text : colors.red500} />}
                style={styles.actionButton}
              />
            </View>
          )}

          {/* Message si bloqué */}
          {isBlocked && (
            <View style={styles.blockedMessage}>
              <Text style={styles.blockedText}>Cet utilisateur est bloqué</Text>
            </View>
          )}

          {/* Rating Section */}
          <View style={styles.ratingSection}>
            <View style={styles.ratingHeader}>
              <View>
                <Text style={styles.sectionTitle}>Avis et notes</Text>
                {averageRating.count > 0 && (
                  <View style={styles.ratingSummary}>
                    <View style={styles.ratingStars}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Ionicons
                          key={i}
                          name={i < Math.round(averageRating.average) ? 'star' : 'star-outline'}
                          size={16}
                          color={colors.yellow500}
                        />
                      ))}
                    </View>
                    <Text style={styles.ratingAverage}>{averageRating.average.toFixed(1)}</Text>
                    <Text style={styles.ratingCount}>({averageRating.count} avis)</Text>
                  </View>
                )}
              </View>
              {currentUser?.id !== selectedUser.id && (
                <TouchableOpacity onPress={handleOpenRatingDialog}>
                  <Text style={styles.ratingLink}>
                    {existingRating ? 'Modifier mon avis' : 'Laisser un avis'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Liste des avis */}
            {isLoadingRatings ? (
              <Text style={styles.loadingText}>Chargement des avis...</Text>
            ) : userRatings.length === 0 ? (
              <View style={styles.emptyRatings}>
                <Ionicons name="star-outline" size={32} color={colors.textTertiary} />
                <Text style={styles.emptyRatingsText}>Aucun avis pour le moment</Text>
              </View>
            ) : (
              <View style={styles.ratingsList}>
                {userRatings.map((ratingItem) => (
                  <Animated.View key={ratingItem.id} entering={FadeIn} style={styles.ratingCard}>
                    <View style={styles.ratingCardHeader}>
                      <View style={styles.ratingCardUser}>
                        {ratingItem.rater && (
                          <ImageWithFallback
                            source={{ uri: ratingItem.rater.photo }}
                            style={styles.ratingCardAvatar}
                          />
                        )}
                        <View style={styles.ratingCardUserInfo}>
                          <Text style={styles.ratingCardUserName}>
                            {ratingItem.rater?.pseudo || 'Utilisateur'}
                          </Text>
                          <Text style={styles.ratingCardDate}>
                            {new Date(ratingItem.createdAt).toLocaleDateString('fr-FR', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.ratingCardStars}>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Ionicons
                            key={i}
                            name={i < ratingItem.rating ? 'star' : 'star-outline'}
                            size={16}
                            color={colors.yellow500}
                          />
                        ))}
                      </View>
                    </View>
                    {ratingItem.comment && (
                      <Text style={styles.ratingCardComment}>{ratingItem.comment}</Text>
                    )}
                  </Animated.View>
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Access Request Dialog */}
      <Modal
        visible={showAccessDialog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAccessDialog(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Demander l'accès</Text>
            <Text style={styles.modalDescription}>
              Confirmez-vous vouloir demander l'accès aux informations personnelles ?
            </Text>
            <View style={styles.modalWarning}>
              <Text style={styles.modalWarningText}>
                En demandant l'accès, vous autorisez aussi {selectedUser.pseudo || 'l\'utilisateur'} à voir vos informations personnelles :
              </Text>
              <Text style={styles.modalWarningItem}>• Votre âge exact</Text>
              <Text style={styles.modalWarningItem}>• Votre numéro WhatsApp</Text>
              <Text style={styles.modalWarningItem}>• Votre statut d'abonnement</Text>
              <Text style={styles.modalWarningItem}>• Votre dernière connexion</Text>
            </View>
            <View style={styles.modalActions}>
              <Button
                title="Annuler"
                onPress={() => setShowAccessDialog(false)}
                variant="outline"
                style={styles.modalButton}
              />
              <Button
                title="Confirmer"
                onPress={handleRequestAccess}
                style={styles.modalButton}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Rating Dialog */}
      <Modal
        visible={showRatingDialog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRatingDialog(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {existingRating ? 'Modifier votre avis' : `Noter ${selectedUser.pseudo || 'l\'utilisateur'}`}
            </Text>
            <Text style={styles.modalDescription}>
              {existingRating 
                ? 'Modifiez votre note et votre commentaire'
                : 'Partagez votre expérience avec ce profil'}
            </Text>
            <View style={styles.starsContainer}>
              {Array.from({ length: 5 }).map((_, i) => (
                <TouchableOpacity key={i} onPress={() => setRating(i + 1)}>
                  <Ionicons
                    name={i < rating ? 'star' : 'star-outline'}
                    size={40}
                    color={i < rating ? colors.yellow500 : colors.textTertiary}
                  />
                </TouchableOpacity>
              ))}
            </View>
            <Input
              placeholder="Commentaire (optionnel)"
              value={comment}
              onChangeText={setComment}
              multiline
              numberOfLines={4}
              style={styles.commentInput}
            />
            <View style={styles.modalActions}>
              <Button
                title="Annuler"
                onPress={() => setShowRatingDialog(false)}
                variant="outline"
                style={styles.modalButton}
              />
                  <Button
                    title={existingRating ? 'Modifier' : 'Envoyer'}
                    onPress={handleSubmitRating}
                    disabled={rating === 0 || isLoading}
                    loading={isLoading}
                    style={styles.modalButton}
                  />
            </View>
          </View>
        </View>
      </Modal>
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
    paddingBottom: 24,
  },
  imageContainer: {
    height: 384,
    position: 'relative',
  },
  profileImage: {
    width: '100%',
    height: '100%',
  },
  imageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
    backgroundColor: 'transparent',
    background: 'linear-gradient(to top, rgba(10, 10, 10, 1), rgba(10, 10, 10, 0.5), transparent)',
  },
  imageInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    gap: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  separator: {
    fontSize: 24,
    color: colors.text,
  },
  age: {
    fontSize: 24,
    color: colors.text,
  },
  crownIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.yellow500,
    justifyContent: 'center',
    alignItems: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    gap: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  metaTextSecondary: {
    fontSize: 14,
    color: colors.textTertiary,
  },
  content: {
    padding: 24,
    gap: 24,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  description: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  accessCard: {
    backgroundColor: `${colors.pink500}33`,
    borderWidth: 1,
    borderColor: `${colors.pink500}4d`,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  accessHeader: {
    flexDirection: 'row',
    gap: 12,
  },
  accessText: {
    flex: 1,
    gap: 8,
  },
  accessTitle: {
    fontSize: 14,
    color: colors.pink400,
    lineHeight: 20,
  },
  accessWarning: {
    fontSize: 12,
    color: colors.pink400,
    opacity: 0.7,
  },
  accessButton: {
    marginTop: 0,
  },
  pendingCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: `${colors.yellow500}33`,
    borderWidth: 1,
    borderColor: `${colors.yellow500}4d`,
    borderRadius: 16,
    padding: 16,
  },
  pendingTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.yellow400,
  },
  pendingSubtitle: {
    fontSize: 12,
    color: colors.yellow400,
    opacity: 0.7,
  },
  verifiedCard: {
    backgroundColor: `${colors.green500}33`,
    borderWidth: 1,
    borderColor: `${colors.green500}4d`,
    borderRadius: 16,
    padding: 16,
    gap: 16,
  },
  verifiedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  verifiedTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.green500,
  },
  verifiedSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginTop: 8,
  },
  verifiedInfo: {
    gap: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  actions: {
    gap: 12,
  },
  actionButton: {
    marginTop: 0,
  },
  blockedMessage: {
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    alignItems: 'center',
  },
  blockedText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  ratingSection: {
    gap: 16,
  },
  ratingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  ratingSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  ratingStars: {
    flexDirection: 'row',
    gap: 2,
  },
  ratingAverage: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  ratingCount: {
    fontSize: 14,
    color: colors.textTertiary,
  },
  ratingLink: {
    fontSize: 14,
    color: colors.pink400,
    fontWeight: '600',
  },
  loadingText: {
    fontSize: 14,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingVertical: 16,
  },
  emptyRatings: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  emptyRatingsText: {
    fontSize: 14,
    color: colors.textTertiary,
  },
  ratingsList: {
    gap: 12,
  },
  ratingCard: {
    backgroundColor: `${colors.backgroundSecondary}80`,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  ratingCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  ratingCardUser: {
    flexDirection: 'row',
    gap: 12,
    flex: 1,
  },
  ratingCardAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  ratingCardUserInfo: {
    flex: 1,
    gap: 4,
  },
  ratingCardUserName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  ratingCardDate: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  ratingCardStars: {
    flexDirection: 'row',
    gap: 2,
  },
  ratingCardComment: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.borderSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    gap: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  modalDescription: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  modalWarning: {
    backgroundColor: `${colors.pink500}33`,
    borderWidth: 1,
    borderColor: `${colors.pink500}4d`,
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  modalWarningText: {
    fontSize: 14,
    color: colors.pink400,
    lineHeight: 20,
  },
  modalWarningItem: {
    fontSize: 14,
    color: colors.pink400,
    opacity: 0.8,
    marginLeft: 8,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    marginTop: 0,
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  commentInput: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  bookingCard: {
    backgroundColor: `${colors.yellow500}33`,
    borderWidth: 1,
    borderColor: `${colors.yellow500}4d`,
    borderRadius: 16,
    padding: 16,
    gap: 16,
  },
  bookingCardAccepted: {
    backgroundColor: `${colors.green500}33`,
    borderWidth: 1,
    borderColor: `${colors.green500}4d`,
    borderRadius: 16,
    padding: 16,
    gap: 16,
  },
  bookingHeader: {
    flexDirection: 'row',
    gap: 12,
  },
  bookingText: {
    flex: 1,
    gap: 4,
  },
  bookingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  bookingSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  bookingDetails: {
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.borderSecondary,
  },
  bookingDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  bookingDetailLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    flex: 1,
  },
  bookingDetailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    textAlign: 'right',
  },
  cancelButton: {
    marginTop: 0,
  },
  bookingActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  bookingActionButton: {
    marginTop: 0,
  },
  albumGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  albumPhotoContainer: {
    width: '30%',
    aspectRatio: 1,
  },
  albumPhoto: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
  },
  specialtyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: `${colors.backgroundSecondary}80`,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
    borderRadius: 16,
    padding: 16,
  },
  specialtyText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
});

