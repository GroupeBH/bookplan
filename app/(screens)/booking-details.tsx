import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Alert, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ImageWithFallback } from '../../components/ImageWithFallback';
import { useBooking } from '../../context/BookingContext';
import { useAuth } from '../../context/AuthContext';
import { useRating } from '../../context/RatingContext';
import { useNotification } from '../../context/NotificationContext';
import { useUser } from '../../context/UserContext';
import { supabase } from '../../lib/supabase';
import Animated, { FadeIn } from 'react-native-reanimated';

export default function BookingDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bookingId: string }>();
  const { user: currentUser } = useAuth();
  const { setSelectedUser } = useUser();
  const { bookings, updateBookingStatus, cancelBooking, refreshBookings } = useBooking();
  const { createRating, updateRating, getUserRatings } = useRating();
  const { showNotification } = useNotification();

  const [booking, setBooking] = useState<any>(null);
  const [otherUser, setOtherUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [showExtensionModal, setShowExtensionModal] = useState(false);
  const [showExtensionConfirmationModal, setShowExtensionConfirmationModal] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [extensionHours, setExtensionHours] = useState(1);
  const [existingRating, setExistingRating] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Charger les détails de la compagnie
  const loadBookingDetails = useCallback(async () => {
    if (!params.bookingId || !currentUser?.id) return;

    setIsLoading(true);
    try {
      const { data: bookingData, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', params.bookingId)
        .single();

      if (error) {
        console.error('Error loading booking:', error);
        Alert.alert('Erreur', 'Impossible de charger les détails de la compagnie');
        router.back();
        return;
      }

      if (!bookingData) {
        Alert.alert('Erreur', 'Compagnie introuvable');
        router.back();
        return;
      }

      setBooking(bookingData);

      // Déterminer qui est l'autre utilisateur
      const otherUserId = bookingData.requester_id === currentUser.id 
        ? bookingData.provider_id 
        : bookingData.requester_id;

      // Charger le profil de l'autre utilisateur
      const { data: userData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', otherUserId)
        .single();

      if (userData) {
        setOtherUser({
          id: userData.id,
          pseudo: userData.pseudo || 'Utilisateur',
          age: userData.age || 25,
          photo: userData.photo || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
          description: userData.description || '',
          rating: parseFloat(userData.rating) || 0,
          reviewCount: userData.review_count || 0,
        });
      }

      // Vérifier s'il y a déjà un avis pour cette compagnie
      const ratings = await getUserRatings(currentUser.id);
      const existing = ratings.find((r: any) => r.bookingId === params.bookingId);
      if (existing) {
        setExistingRating(existing);
        setRating(existing.rating);
        setComment(existing.comment || '');
      }
    } catch (error) {
      console.error('Error in loadBookingDetails:', error);
    } finally {
      setIsLoading(false);
    }
  }, [params.bookingId, currentUser?.id, getUserRatings]);

  // Ne recharger que si le bookingId change ou si c'est le premier chargement
  const lastBookingIdRef = React.useRef<string | null>(null);
  
  useFocusEffect(
    useCallback(() => {
      // Ne recharger que si le bookingId a changé ou si c'est le premier chargement
      if (params.bookingId && params.bookingId !== lastBookingIdRef.current) {
        lastBookingIdRef.current = params.bookingId;
        loadBookingDetails();
      }
    }, [params.bookingId, loadBookingDetails])
  );

  // Vérifier si la compagnie est terminée
  useEffect(() => {
    if (!booking || booking.status !== 'accepted') return;

    const checkEndTime = () => {
      const bookingDate = new Date(booking.booking_date);
      const endTime = new Date(bookingDate.getTime() + booking.duration_hours * 60 * 60 * 1000);
      const now = new Date();

      if (now >= endTime && booking.status === 'accepted') {
        // La compagnie est terminée, afficher le modal
        setShowRatingModal(true);
      }
    };

    const interval = setInterval(checkEndTime, 60000); // Vérifier toutes les minutes
    checkEndTime(); // Vérifier immédiatement

    return () => clearInterval(interval);
  }, [booking]);

  const isRequester = booking?.requester_id === currentUser?.id;
  const isProvider = booking?.provider_id === currentUser?.id;

  const handleCancel = async () => {
    if (!booking) return;

    Alert.alert(
      'Annuler la compagnie',
      'Êtes-vous sûr de vouloir annuler cette compagnie ?',
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Oui, annuler',
          style: 'destructive',
          onPress: async () => {
            setIsSubmitting(true);
            const { error } = await cancelBooking(booking.id);
            setIsSubmitting(false);

            if (error) {
              Alert.alert('Erreur', 'Impossible d\'annuler la compagnie');
            } else {
              // Envoyer une notification à l'autre utilisateur
              const otherUserId = isRequester ? booking.provider_id : booking.requester_id;
              await showNotification(
                'booking_cancelled',
                'Compagnie annulée',
                `${currentUser?.pseudo || 'L\'utilisateur'} a annulé la compagnie.`,
                { bookingId: booking.id, userId: currentUser?.id }
              );
              
              Alert.alert('Succès', 'Compagnie annulée avec succès', [
                { text: 'OK', onPress: () => router.back() }
              ]);
            }
          },
        },
      ]
    );
  };

  const handleSubmitRating = async () => {
    if (!booking || !otherUser || rating === 0) {
      Alert.alert('Erreur', 'Veuillez donner une note');
      return;
    }

    setIsSubmitting(true);
    try {
      if (existingRating) {
        await updateRating(existingRating.id, rating, comment);
      } else {
        await createRating(otherUser.id, rating, comment, booking.id);
      }

      // Marquer la compagnie comme complétée si ce n'est pas déjà fait
      if (booking.status === 'accepted') {
        await updateBookingStatus(booking.id, 'completed');
      }

      setShowRatingModal(false);
      Alert.alert('Succès', 'Avis enregistré avec succès');
      loadBookingDetails();
    } catch (error) {
      console.error('Error submitting rating:', error);
      Alert.alert('Erreur', 'Impossible d\'enregistrer l\'avis');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestExtension = async () => {
    if (!booking || extensionHours <= 0) {
      Alert.alert('Erreur', 'Veuillez entrer un nombre d\'heures valide');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('request_booking_extension', {
        p_booking_id: booking.id,
        p_additional_hours: extensionHours,
      });

      if (error) {
        Alert.alert('Erreur', error.message || 'Impossible de demander la prolongation');
        return;
      }

      // Envoyer une notification au provider
      await showNotification(
        'booking_extension',
        'Demande de prolongation',
        `${currentUser?.pseudo || 'L\'utilisateur'} demande de prolonger la compagnie de ${extensionHours} heure(s).`,
        { bookingId: booking.id, extensionHours }
      );

      setShowExtensionModal(false);
      Alert.alert('Succès', 'Demande de prolongation envoyée');
      loadBookingDetails();
    } catch (error) {
      console.error('Error requesting extension:', error);
      Alert.alert('Erreur', 'Impossible de demander la prolongation');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmExtension = async () => {
    if (!booking) return;

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('confirm_booking_extension', {
        p_booking_id: booking.id,
      });

      if (error) {
        Alert.alert('Erreur', error.message || 'Impossible de confirmer la prolongation');
        return;
      }

      // Envoyer une notification au requester
      await showNotification(
        'booking_extension_confirmed',
        'Prolongation confirmée',
        `La prolongation de ${booking.extension_requested_hours} heure(s) a été confirmée.`,
        { bookingId: booking.id }
      );

      setShowExtensionConfirmationModal(false);
      Alert.alert('Succès', 'Prolongation confirmée');
      loadBookingDetails();
    } catch (error) {
      console.error('Error confirming extension:', error);
      Alert.alert('Erreur', 'Impossible de confirmer la prolongation');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRejectExtension = async () => {
    if (!booking) return;

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('reject_booking_extension', {
        p_booking_id: booking.id,
      });

      if (error) {
        Alert.alert('Erreur', error.message || 'Impossible de refuser la prolongation');
        return;
      }

      // Envoyer une notification au requester
      await showNotification(
        'booking_extension_rejected',
        'Prolongation refusée',
        'La demande de prolongation a été refusée.',
        { bookingId: booking.id }
      );

      setShowExtensionConfirmationModal(false);
      Alert.alert('Succès', 'Prolongation refusée');
      loadBookingDetails();
    } catch (error) {
      console.error('Error rejecting extension:', error);
      Alert.alert('Erreur', 'Impossible de refuser la prolongation');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Détails de la compagnie</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.purple500} />
        </View>
      </SafeAreaView>
    );
  }

  if (!booking) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Détails de la compagnie</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Compagnie introuvable</Text>
        </View>
      </SafeAreaView>
    );
  }

  const bookingDate = new Date(booking.booking_date);
  const endTime = new Date(bookingDate.getTime() + booking.duration_hours * 60 * 60 * 1000);
  const now = new Date();
  const isEnded = now >= endTime;
  const timeRemaining = isEnded ? 0 : Math.max(0, endTime.getTime() - now.getTime());

  const getStatusBadge = () => {
    switch (booking.status) {
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
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Détails de la compagnie</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Other User Info */}
        {otherUser && (
          <Animated.View entering={FadeIn} style={styles.userCard}>
            <View style={styles.userCardContent}>
              <ImageWithFallback
                source={{ uri: otherUser.photo }}
                style={styles.userAvatar}
              />
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{otherUser.pseudo}</Text>
                <View style={styles.userMeta}>
                  <Ionicons name="star" size={16} color={colors.yellow500} />
                  <Text style={styles.userRating}>{otherUser.rating.toFixed(1)}</Text>
                  <Text style={styles.userReviewCount}>({otherUser.reviewCount})</Text>
                </View>
              </View>
            </View>
            <View style={styles.userActions}>
              <Button
                title="Voir le profil"
                variant="outline"
                onPress={async () => {
                  if (!otherUser?.id) return;
                  
                  try {
                    // Charger le profil complet depuis Supabase
                    const { data: userProfile } = await supabase
                      .from('profiles')
                      .select('*')
                      .eq('id', otherUser.id)
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
                style={[styles.viewProfileButton, { paddingHorizontal: 12 }]}
                textStyle={{ fontSize: 14 }}
                icon={<Ionicons name="person-outline" size={18} color={colors.text} />}
              />
              {booking?.status === 'accepted' && (
                <Button
                  title="Message"
                  onPress={() => {
                    if (!otherUser?.id) return;
                    router.push(`/(screens)/chat?userId=${otherUser.id}`);
                  }}
                  style={[styles.viewProfileButton, { paddingHorizontal: 12 }]}
                  textStyle={{ fontSize: 14 }}
                  icon={<Ionicons name="chatbubbles-outline" size={18} color="#ffffff" />}
                />
              )}
            </View>
          </Animated.View>
        )}

        {/* Status */}
        <Animated.View entering={FadeIn} style={styles.statusCard}>
          <View style={styles.statusRow}>
            <Ionicons name="calendar-outline" size={24} color={colors.purple400} />
            <View style={styles.statusInfo}>
              <Text style={styles.statusTitle}>Statut</Text>
              <Text style={styles.statusSubtitle}>
                {booking.status === 'pending' && 'En attente de réponse'}
                {booking.status === 'accepted' && 'Compagnie acceptée'}
                {booking.status === 'rejected' && 'Compagnie refusée'}
                {booking.status === 'completed' && 'Compagnie terminée'}
                {booking.status === 'cancelled' && 'Compagnie annulée'}
              </Text>
            </View>
          </View>
          {getStatusBadge()}
        </Animated.View>

        {/* Booking Details */}
        <Animated.View entering={FadeIn} style={styles.detailsCard}>
          <Text style={styles.detailsTitle}>Détails de la compagnie</Text>
          
          <View style={styles.detailRow}>
            <Ionicons name="time-outline" size={20} color={colors.textSecondary} />
            <View style={styles.detailInfo}>
              <Text style={styles.detailLabel}>Date et heure</Text>
              <Text style={styles.detailValue}>
                {bookingDate.toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
                {' à '}
                {bookingDate.toLocaleTimeString('fr-FR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="hourglass-outline" size={20} color={colors.textSecondary} />
            <View style={styles.detailInfo}>
              <Text style={styles.detailLabel}>Durée</Text>
              <Text style={styles.detailValue}>{booking.duration_hours} heure(s)</Text>
            </View>
          </View>

          {booking.status === 'accepted' && !isEnded && (
            <View style={styles.detailRow}>
              <Ionicons name="timer-outline" size={20} color={colors.purple400} />
              <View style={styles.detailInfo}>
                <Text style={styles.detailLabel}>Temps restant</Text>
                <Text style={[styles.detailValue, styles.timeRemaining]}>
                  {Math.floor(timeRemaining / (60 * 60 * 1000))}h {Math.floor((timeRemaining % (60 * 60 * 1000)) / (60 * 1000))}min
                </Text>
              </View>
            </View>
          )}

          {booking.location && (
            <View style={styles.detailRow}>
              <Ionicons name="location-outline" size={20} color={colors.textSecondary} />
              <View style={styles.detailInfo}>
                <Text style={styles.detailLabel}>Lieu</Text>
                <Text style={styles.detailValue}>{booking.location}</Text>
              </View>
            </View>
          )}

          {booking.notes && (
            <View style={styles.detailRow}>
              <Ionicons name="document-text-outline" size={20} color={colors.textSecondary} />
              <View style={styles.detailInfo}>
                <Text style={styles.detailLabel}>Notes</Text>
                <Text style={styles.detailValue}>{booking.notes}</Text>
              </View>
            </View>
          )}

          {/* Extension Request */}
          {booking.extension_requested_hours && booking.status === 'accepted' && (
            <Animated.View entering={FadeIn} style={styles.extensionCard}>
              <Ionicons name="time-outline" size={24} color={colors.yellow500} />
              <View style={styles.extensionInfo}>
                <Text style={styles.extensionTitle}>
                  {isRequester ? 'Votre demande de prolongation' : 'Demande de prolongation'}
                </Text>
                <Text style={styles.extensionText}>
                  {isRequester 
                    ? `En attente de confirmation pour ${booking.extension_requested_hours} heure(s) supplémentaire(s)`
                    : `${otherUser?.pseudo || 'L\'utilisateur'} demande de prolonger de ${booking.extension_requested_hours} heure(s)`}
                </Text>
                {isProvider && (
                  <View style={styles.extensionActions}>
                    <Button
                      title="Confirmer"
                      onPress={handleConfirmExtension}
                      disabled={isSubmitting}
                      loading={isSubmitting}
                      style={styles.extensionButton}
                    />
                    <Button
                      title="Refuser"
                      variant="outline"
                      onPress={handleRejectExtension}
                      disabled={isSubmitting}
                      style={styles.extensionButton}
                    />
                  </View>
                )}
              </View>
            </Animated.View>
          )}
        </Animated.View>

        {/* Bouton d'annulation pour le requester si le statut est pending */}
        {isRequester && booking.status === 'pending' && (
          <View style={styles.actions}>
            <Button
              title="Annuler la demande"
              variant="outline"
              onPress={handleCancel}
              disabled={isSubmitting}
              loading={isSubmitting}
              icon={<Ionicons name="close-circle-outline" size={20} color={colors.red500} />}
              style={[styles.actionButton, { borderColor: colors.red500 }]}
              textStyle={{ color: colors.red500 }}
            />
          </View>
        )}

        {/* Actions */}
        {booking.status === 'accepted' && (
          <View style={styles.actions}>
            {otherUser && (
              <Button
                title="Envoyer un message"
                onPress={() => {
                  if (!otherUser?.id) return;
                  router.push(`/(screens)/chat?userId=${otherUser.id}`);
                }}
                icon={<Ionicons name="chatbubbles-outline" size={20} color="#ffffff" />}
                style={styles.actionButton}
              />
            )}
            {isRequester && !isEnded && (
              <Button
                title="Demander une prolongation"
                variant="outline"
                onPress={() => setShowExtensionModal(true)}
                icon={<Ionicons name="time-outline" size={20} color={colors.text} />}
                style={styles.actionButton}
              />
            )}
            {(isRequester || isProvider) && (
              <Button
                title="Annuler la compagnie"
                variant="outline"
                onPress={handleCancel}
                disabled={isSubmitting}
                icon={<Ionicons name="close-circle-outline" size={20} color={colors.red500} />}
                style={[styles.actionButton, styles.cancelButton]}
                textStyle={{ color: colors.red500 }}
              />
            )}
          </View>
        )}

        {booking.status === 'completed' && !existingRating && (
          <View style={styles.actions}>
            <Button
              title="Noter cette compagnie"
              onPress={() => setShowRatingModal(true)}
              icon={<Ionicons name="star-outline" size={20} color="#ffffff" />}
              style={styles.actionButton}
            />
          </View>
        )}
      </ScrollView>

      {/* Rating Modal */}
      <Modal
        visible={showRatingModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRatingModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {existingRating ? 'Modifier votre avis' : 'Noter cette compagnie'}
            </Text>
            <Text style={styles.modalDescription}>
              {existingRating 
                ? 'Vous pouvez modifier votre avis sur cette compagnie.'
                : 'Votre compagnie est terminée. Partagez votre expérience !'}
            </Text>

            {/* Stars */}
            <View style={styles.starsContainer}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity
                  key={star}
                  onPress={() => setRating(star)}
                  style={styles.starButton}
                >
                  <Ionicons
                    name={star <= rating ? 'star' : 'star-outline'}
                    size={40}
                    color={star <= rating ? colors.yellow500 : colors.textTertiary}
                  />
                </TouchableOpacity>
              ))}
            </View>

            {/* Comment */}
            <View style={styles.commentContainer}>
              <Text style={styles.commentLabel}>Commentaire (optionnel)</Text>
              <TextInput
                style={styles.commentInput}
                value={comment}
                onChangeText={setComment}
                placeholder="Partagez votre expérience..."
                placeholderTextColor={colors.textTertiary}
                multiline
                numberOfLines={4}
              />
            </View>

            {/* Actions */}
            <View style={styles.modalActions}>
              <Button
                title="Annuler"
                variant="outline"
                onPress={() => setShowRatingModal(false)}
                style={styles.modalButton}
              />
              <Button
                title={existingRating ? 'Modifier' : 'Envoyer'}
                onPress={handleSubmitRating}
                disabled={rating === 0 || isSubmitting}
                loading={isSubmitting}
                style={styles.modalButton}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Extension Request Modal (Requester) */}
      <Modal
        visible={showExtensionModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowExtensionModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Demander une prolongation</Text>
            <Text style={styles.modalDescription}>
              Combien d'heures supplémentaires souhaitez-vous ajouter ?
            </Text>

            <View style={styles.extensionInputContainer}>
              <TextInput
                style={styles.extensionInput}
                value={extensionHours.toString()}
                onChangeText={(text) => {
                  const num = parseInt(text) || 0;
                  if (num >= 0 && num <= 24) {
                    setExtensionHours(num);
                  }
                }}
                keyboardType="number-pad"
                placeholder="1"
              />
              <Text style={styles.extensionLabel}>heure(s)</Text>
            </View>

            <View style={styles.modalActions}>
              <Button
                title="Annuler"
                variant="outline"
                onPress={() => setShowExtensionModal(false)}
                style={styles.modalButton}
              />
              <Button
                title="Demander"
                onPress={handleRequestExtension}
                disabled={extensionHours <= 0 || isSubmitting}
                loading={isSubmitting}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    gap: 16,
  },
  userCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  userCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  userAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  userInfo: {
    flex: 1,
    gap: 4,
  },
  userName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  userMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  userRating: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  userReviewCount: {
    fontSize: 14,
    color: colors.textTertiary,
  },
  viewProfileButton: {
    marginTop: 0,
    flex: 1,
    minWidth: 0,
  },
  userActions: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
    marginTop: 8,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 16,
    padding: 16,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  statusInfo: {
    flex: 1,
    gap: 4,
  },
  statusTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  statusSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  detailsCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 16,
    padding: 16,
    gap: 16,
  },
  detailsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  detailInfo: {
    flex: 1,
    gap: 4,
  },
  detailLabel: {
    fontSize: 12,
    color: colors.textTertiary,
    textTransform: 'uppercase',
  },
  detailValue: {
    fontSize: 16,
    color: colors.text,
  },
  timeRemaining: {
    color: colors.purple400,
    fontWeight: '600',
  },
  extensionCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: `${colors.yellow500}33`,
    borderWidth: 1,
    borderColor: `${colors.yellow500}4d`,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  extensionInfo: {
    flex: 1,
    gap: 8,
  },
  extensionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.yellow400,
  },
  extensionText: {
    fontSize: 12,
    color: colors.yellow400,
    opacity: 0.9,
  },
  extensionActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  extensionButton: {
    flex: 1,
    marginTop: 0,
  },
  actions: {
    gap: 12,
  },
  actionButton: {
    marginTop: 0,
  },
  cancelButton: {
    borderColor: colors.red500,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: colors.background,
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    gap: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  modalDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  starButton: {
    padding: 4,
  },
  commentContainer: {
    gap: 8,
  },
  commentLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  commentInput: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    padding: 16,
    color: colors.text,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    marginTop: 0,
  },
  extensionInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    justifyContent: 'center',
  },
  extensionInput: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    padding: 16,
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    minWidth: 80,
  },
  extensionLabel: {
    fontSize: 16,
    color: colors.textSecondary,
  },
});

