import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ImageWithFallback } from '../../components/ImageWithFallback';
import { Badge } from '../../components/ui/Badge';
import { useOffer } from '../../context/OfferContext';
import { useAuth } from '../../context/AuthContext';
import { useRating } from '../../context/RatingContext';
import { Offer, OfferApplication, OfferType } from '../../types';
import { supabase } from '../../lib/supabase';
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

export default function OfferDetailsScreen() {
  const router = useRouter();
  const { offerId } = useLocalSearchParams<{ offerId: string }>();
  const { user } = useAuth();
  const { getOfferById, applyToOffer, getOfferApplications, cancelMyApplication, selectApplication, rejectApplication, cancelOffer, deleteOffer, reactivateOffer, refreshMyOffers } = useOffer();
  const { getUserAverageRating } = useRating();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [applications, setApplications] = useState<OfferApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const [showApplicationModal, setShowApplicationModal] = useState(false);
  const [applicationMessage, setApplicationMessage] = useState('');
  const [hasApplied, setHasApplied] = useState(false);
  const [myApplication, setMyApplication] = useState<OfferApplication | null>(null);
  const [showApplicationsModal, setShowApplicationsModal] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState<OfferApplication | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionMessage, setRejectionMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [authorRating, setAuthorRating] = useState({ average: 0, count: 0 });

  useEffect(() => {
    loadOffer();
  }, [offerId]);

  const loadOffer = async () => {
    if (!offerId) return;

    setIsLoading(true);
    try {
      const loadedOffer = await getOfferById(offerId);
      if (loadedOffer) {
        // Vérifier si l'offre est expirée et mettre à jour le statut si nécessaire
        const expiresAt = new Date(loadedOffer.expiresAt);
        const now = new Date();
        const isExpired = expiresAt <= now && (loadedOffer.status === 'active' || loadedOffer.status === 'closed');
        
        if (isExpired && loadedOffer.status !== 'expired') {
          // Mettre à jour le statut dans la base de données
          try {
            const { error: updateError } = await supabase
              .from('offers')
              .update({ status: 'expired', updated_at: new Date().toISOString() })
              .eq('id', offerId);
            
            if (!updateError) {
              loadedOffer.status = 'expired';
            }
          } catch (updateError) {
            console.error('Error updating expired offer status:', updateError);
          }
        }
        
        setOffer(loadedOffer);
        
        // Charger la moyenne et le nombre d'avis de l'auteur
        if (loadedOffer.authorId) {
          try {
            const avgRating = await getUserAverageRating(loadedOffer.authorId);
            setAuthorRating(avgRating);
          } catch (error) {
            console.error('Error loading author rating:', error);
          }
        }
        
        // Vérifier si l'utilisateur a déjà candidaté
        const loadedApplications = await getOfferApplications(offerId);
        setApplications(loadedApplications);
        
        const userApplication = loadedApplications.find(
          (app) => app.applicantId === user?.id
        );
        setMyApplication(userApplication || null);
        // L'utilisateur a candidaté si la candidature existe et n'est pas annulée
        // (les candidatures annulées sont supprimées, donc si elle existe, elle n'est pas annulée)
        setHasApplied(!!userApplication);
      }
    } catch (error) {
      console.error('Error loading offer:', error);
      Alert.alert('Erreur', 'Impossible de charger l\'offre');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = async () => {
    if (!applicationMessage.trim()) {
      Alert.alert('Erreur', 'Veuillez écrire un message pour votre candidature');
      return;
    }

    if (!offerId) return;

    setIsApplying(true);
    try {
      const { error, application } = await applyToOffer(offerId, applicationMessage.trim());

      if (error) {
        Alert.alert('Erreur', error.message || 'Impossible de candidater');
        return;
      }

      Alert.alert('Succès', 'Votre candidature a été envoyée');
      setShowApplicationModal(false);
      setApplicationMessage('');
      setHasApplied(true);
      await loadOffer();
    } catch (error) {
      Alert.alert('Erreur', 'Une erreur est survenue');
      console.error('Apply error:', error);
    } finally {
      setIsApplying(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (hours: number) => {
    if (hours < 1) {
      return `${Math.round(hours * 60)} minutes`;
    } else if (hours === 1) {
      return '1 heure';
    } else {
      return `${hours} heures`;
    }
  };

  const getApplicationStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="warning">En attente</Badge>;
      case 'selected':
        return <Badge variant="success">Sélectionnée</Badge>;
      case 'rejected':
        return <Badge variant="error">Refusée</Badge>;
      case 'expired':
        return <Badge variant="default">Expirée</Badge>;
      default:
        return <Badge variant="default">{status}</Badge>;
    }
  };

  const handleViewApplications = async () => {
    if (!offerId) return;
    const apps = await getOfferApplications(offerId);
    setApplications(apps);
    setShowApplicationsModal(true);
  };

  const handleSelectApplication = async (applicationId: string) => {
    if (!offerId) return;

    Alert.alert(
      'Sélectionner ce candidat',
      'Êtes-vous sûr de vouloir sélectionner ce candidat ? Les autres candidatures seront automatiquement refusées.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Sélectionner',
          onPress: async () => {
            setIsProcessing(true);
            try {
              const { error } = await selectApplication(offerId, applicationId);
              if (error) {
                Alert.alert('Erreur', error.message || 'Impossible de sélectionner ce candidat');
              } else {
                Alert.alert('Succès', 'Candidat sélectionné avec succès');
                await loadOffer();
                setShowApplicationsModal(false);
              }
            } catch (error) {
              Alert.alert('Erreur', 'Une erreur est survenue');
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleRejectApplication = async () => {
    if (!selectedApplication || !rejectionMessage.trim()) {
      Alert.alert('Erreur', 'Veuillez écrire un message de refus');
      return;
    }

    setIsProcessing(true);
    try {
      const { error } = await rejectApplication(selectedApplication.id, rejectionMessage.trim());
      if (error) {
        Alert.alert('Erreur', error.message || 'Impossible de rejeter cette candidature');
      } else {
        Alert.alert('Succès', 'Candidature rejetée');
        setShowRejectModal(false);
        setRejectionMessage('');
        setSelectedApplication(null);
        await loadOffer();
        if (showApplicationsModal) {
          const apps = await getOfferApplications(offerId!);
          setApplications(apps);
        }
      }
    } catch (error) {
      Alert.alert('Erreur', 'Une erreur est survenue');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteOffer = async () => {
    if (!offerId) return;

    Alert.alert(
      'Supprimer l\'offre',
      'Êtes-vous sûr de vouloir supprimer définitivement cette offre ? Cette action est irréversible et supprimera également toutes les candidatures associées.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            setIsProcessing(true);
            try {
              const { error } = await deleteOffer(offerId);
              if (error) {
                Alert.alert('Erreur', error.message || 'Impossible de supprimer l\'offre');
              } else {
                Alert.alert('Succès', 'Offre supprimée définitivement');
                router.back();
              }
            } catch (error) {
              Alert.alert('Erreur', 'Une erreur est survenue');
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleCancelOffer = async () => {
    if (!offerId) return;

    Alert.alert(
      'Annuler l\'offre',
      'Êtes-vous sûr de vouloir annuler cette offre ? Les candidats en attente seront notifiés.',
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Oui, annuler',
          style: 'destructive',
          onPress: async () => {
            setIsProcessing(true);
            try {
              const { error } = await cancelOffer(offerId, 'L\'offre a été annulée par l\'auteur.');
              if (error) {
                Alert.alert('Erreur', error.message || 'Impossible d\'annuler l\'offre');
              } else {
                Alert.alert('Succès', 'Offre annulée');
                await loadOffer();
              }
            } catch (error) {
              Alert.alert('Erreur', 'Une erreur est survenue');
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleReactivateOffer = async () => {
    if (!offerId) return;

    Alert.alert(
      'Réactiver l\'offre',
      'Êtes-vous sûr de vouloir réactiver cette offre ?',
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Oui, réactiver',
          onPress: async () => {
            setIsProcessing(true);
            try {
              const { error } = await reactivateOffer(offerId);
              if (error) {
                Alert.alert('Erreur', error.message || 'Impossible de réactiver l\'offre');
              } else {
                Alert.alert('Succès', 'Offre réactivée');
                await loadOffer();
              }
            } catch (error) {
              Alert.alert('Erreur', 'Une erreur est survenue');
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Détails de l'offre</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.pink500} />
        </View>
      </SafeAreaView>
    );
  }

  if (!offer) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Détails de l'offre</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.emptyContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={colors.textTertiary} />
          <Text style={styles.emptyTitle}>Offre introuvable</Text>
          <Text style={styles.emptySubtitle}>Cette offre n'existe pas ou a été supprimée</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isAuthor = offer.authorId === user?.id;
  const isExpired = offer.status === 'expired';
  const canApply = !isAuthor && !hasApplied && offer.status === 'active' && !isExpired;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Détails de l'offre</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Animated.View entering={FadeIn}>
          {/* Offer Type Badge */}
          <View style={styles.typeBadge}>
            <Ionicons
              name={OFFER_TYPE_ICONS[offer.offerType] as any}
              size={24}
              color={colors.pink500}
            />
            <Text style={styles.typeText}>{OFFER_TYPE_LABELS[offer.offerType]}</Text>
          </View>

          {/* Title */}
          <Text style={styles.title}>{offer.title}</Text>

          {/* Author Card */}
          <View style={styles.authorCard}>
            <ImageWithFallback
              source={{ uri: offer.author?.photo || '' }}
              style={styles.authorImage}
            />
            <View style={styles.authorInfo}>
              <Text style={styles.authorName}>{offer.author?.pseudo || 'Utilisateur'}</Text>
              <View style={styles.authorRating}>
                <Ionicons name="star" size={14} color={colors.yellow400} />
                <Text style={styles.ratingText}>
                  {authorRating.count > 0 ? authorRating.average.toFixed(1) : offer.author?.rating?.toFixed(1) || '0.0'} ({authorRating.count > 0 ? authorRating.count : offer.author?.reviewCount || 0})
                </Text>
              </View>
            </View>
          </View>

          {/* Description */}
          {offer.description && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Description</Text>
              <Text style={styles.description}>{offer.description}</Text>
            </View>
          )}

          {/* Details */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Détails</Text>
            <View style={styles.detailsCard}>
              <View style={styles.detailRow}>
                <Ionicons name="calendar-outline" size={20} color={colors.pink400} />
                <View style={styles.detailInfo}>
                  <Text style={styles.detailLabel}>Date et heure</Text>
                  <Text style={styles.detailValue}>{formatDate(offer.offerDate)}</Text>
                </View>
              </View>
              <View style={styles.separator} />
              <View style={styles.detailRow}>
                <Ionicons name="time-outline" size={20} color={colors.pink400} />
                <View style={styles.detailInfo}>
                  <Text style={styles.detailLabel}>Durée</Text>
                  <Text style={styles.detailValue}>{formatDuration(offer.durationHours)}</Text>
                </View>
              </View>
              {offer.location && (
                <>
                  <View style={styles.separator} />
                  <View style={styles.detailRow}>
                    <Ionicons name="location-outline" size={20} color={colors.pink400} />
                    <View style={styles.detailInfo}>
                      <Text style={styles.detailLabel}>Lieu</Text>
                      <Text style={styles.detailValue}>{offer.location}</Text>
                    </View>
                  </View>
                </>
              )}
            </View>
          </View>

          {/* Notes */}
          {offer.notes && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Note personnelle</Text>
              <View style={styles.notesCard}>
                <Text style={styles.notesText}>{offer.notes}</Text>
              </View>
            </View>
          )}

          {/* Applications Section */}
          {isAuthor && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Candidatures ({applications.length})
              </Text>
              <Button
                title="Voir les candidatures"
                onPress={handleViewApplications}
                icon={<Ionicons name="people-outline" size={20} color="#ffffff" />}
                style={styles.button}
              />
            </View>
          )}

          {/* Apply Button */}
          {canApply && (
            <Button
              title="Candidater à cette offre"
              onPress={() => setShowApplicationModal(true)}
              icon={<Ionicons name="send" size={20} color="#ffffff" />}
              style={styles.button}
            />
          )}

          {hasApplied && myApplication && (
            <View style={styles.appliedCard}>
              {myApplication.status === 'selected' ? (
                <>
                  <Ionicons name="checkmark-circle" size={24} color={colors.green500} />
                  <Text style={styles.appliedText}>Votre candidature a été acceptée ! 🎉</Text>
                  <View style={styles.appliedActions}>
                    <Button
                      title="Commencer une conversation"
                      onPress={() => {
                        if (offer?.authorId) {
                          router.push(`/(screens)/chat?userId=${offer.authorId}`);
                        }
                      }}
                      icon={<Ionicons name="chatbubbles-outline" size={20} color="#ffffff" />}
                      style={[styles.button, { marginTop: 12 }]}
                    />
                    <Button
                      title="Annuler ma candidature"
                      variant="outline"
                      onPress={async () => {
                        Alert.alert(
                          'Annuler votre candidature',
                          'Êtes-vous sûr de vouloir annuler votre candidature ?',
                          [
                            { text: 'Non', style: 'cancel' },
                            {
                              text: 'Oui, annuler',
                              style: 'destructive',
                              onPress: async () => {
                                setIsApplying(true);
                                try {
                                  const { error } = await cancelMyApplication(myApplication.id);
                                  if (error) {
                                    Alert.alert('Erreur', error.message || 'Impossible d\'annuler la candidature');
                                  } else {
                                    Alert.alert('Succès', 'Candidature annulée');
                                    await loadOffer();
                                  }
                                } catch (error) {
                                  Alert.alert('Erreur', 'Une erreur est survenue');
                                } finally {
                                  setIsApplying(false);
                                }
                              },
                            },
                          ]
                        );
                      }}
                      disabled={isApplying}
                      style={[styles.button, { marginTop: 8, borderColor: colors.red500 }]}
                      textStyle={{ color: colors.red500 }}
                    />
                  </View>
                </>
              ) : myApplication.status === 'rejected' ? (
                <>
                  <Ionicons name="close-circle" size={24} color={colors.red500} />
                  <Text style={styles.appliedText}>Votre candidature a été refusée</Text>
                  {myApplication.rejectionMessage && (
                    <Text style={[styles.appliedText, { marginTop: 8, fontSize: 14, color: colors.textSecondary }]}>
                      {myApplication.rejectionMessage}
                    </Text>
                  )}
                </>
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={24} color={colors.green500} />
                  <Text style={styles.appliedText}>Vous avez déjà candidaté à cette offre</Text>
                  {myApplication.status === 'pending' && !isExpired && (
                    <Button
                      title="Annuler ma candidature"
                      variant="outline"
                      onPress={async () => {
                        Alert.alert(
                          'Annuler votre candidature',
                          'Êtes-vous sûr de vouloir annuler votre candidature ?',
                          [
                            { text: 'Non', style: 'cancel' },
                            {
                              text: 'Oui, annuler',
                              style: 'destructive',
                              onPress: async () => {
                                setIsApplying(true);
                                try {
                                  const { error } = await cancelMyApplication(myApplication.id);
                                  if (error) {
                                    Alert.alert('Erreur', error.message || 'Impossible d\'annuler la candidature');
                                  } else {
                                    Alert.alert('Succès', 'Candidature annulée');
                                    await loadOffer();
                                  }
                                } catch (error) {
                                  Alert.alert('Erreur', 'Une erreur est survenue');
                                } finally {
                                  setIsApplying(false);
                                }
                              },
                            },
                          ]
                        );
                      }}
                      disabled={isApplying}
                      style={[styles.button, { marginTop: 12, borderColor: colors.red500 }]}
                      textStyle={{ color: colors.red500 }}
                    />
                  )}
                </>
              )}
            </View>
          )}

          {isAuthor && (
            <View style={styles.section}>
              {offer.status === 'active' && (
                <>
                  <Button
                    title="Modifier l'offre"
                    onPress={() => {
                      router.push({
                        pathname: '/(screens)/create-offer',
                        params: { offerId: offer.id },
                      });
                    }}
                    variant="outline"
                    icon={<Ionicons name="pencil-outline" size={20} color={colors.text} />}
                    style={styles.button}
                  />
                  <Button
                    title="Annuler l'offre"
                    onPress={handleCancelOffer}
                    variant="outline"
                    icon={<Ionicons name="close-circle-outline" size={20} color={colors.orange500} />}
                    style={[styles.button, { marginTop: 12, borderColor: colors.orange500 }]}
                    textStyle={{ color: colors.orange500 }}
                    loading={isProcessing}
                    disabled={isProcessing}
                  />
                </>
              )}
              {isExpired && (
                <Button
                  title="Supprimer l'offre"
                  onPress={handleDeleteOffer}
                  variant="outline"
                  icon={<Ionicons name="trash-outline" size={20} color={colors.red500} />}
                  style={[styles.button, { borderColor: colors.red500 }]}
                  textStyle={{ color: colors.red500 }}
                  loading={isProcessing}
                  disabled={isProcessing}
                />
              )}
              {offer.status === 'cancelled' && (
                <Button
                  title="Réactiver l'offre"
                  onPress={handleReactivateOffer}
                  icon={<Ionicons name="refresh-outline" size={20} color="#ffffff" />}
                  style={styles.button}
                  loading={isProcessing}
                  disabled={isProcessing}
                />
              )}
            </View>
          )}
        </Animated.View>
      </ScrollView>

      {/* Applications Modal */}
      <Modal
        visible={showApplicationsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowApplicationsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Candidatures ({applications.length})
              </Text>
              <TouchableOpacity onPress={() => setShowApplicationsModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.applicationsList}>
              {applications.length === 0 ? (
                <View style={styles.emptyModalContainer}>
                  <Ionicons name="people-outline" size={48} color={colors.textTertiary} />
                  <Text style={styles.emptyModalText}>Aucune candidature</Text>
                </View>
              ) : (
                applications.map((application) => (
                  <View key={application.id} style={styles.applicationItem}>
                    <ImageWithFallback
                      source={{ uri: application.applicant?.photo || '' }}
                      style={styles.applicantImage}
                    />
                    <View style={styles.applicantInfo}>
                      <Text style={styles.applicantName}>
                        {application.applicant?.pseudo || 'Utilisateur'}
                      </Text>
                      <Text style={styles.applicantMessage} numberOfLines={2}>
                        {application.message}
                      </Text>
                      {getApplicationStatusBadge(application.status)}
                    </View>
                    {application.status === 'pending' && !isExpired && (
                      <View style={styles.applicationActions}>
                        <TouchableOpacity
                          style={styles.selectButton}
                          onPress={() => handleSelectApplication(application.id)}
                          disabled={isProcessing}
                        >
                          <Ionicons name="checkmark" size={18} color="#ffffff" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.rejectButton}
                          onPress={() => {
                            setSelectedApplication(application);
                            setShowRejectModal(true);
                          }}
                          disabled={isProcessing}
                        >
                          <Ionicons name="close" size={18} color="#ffffff" />
                        </TouchableOpacity>
                      </View>
                    )}
                    {application.status === 'selected' && (
                      <View style={styles.applicationActions}>
                        <TouchableOpacity
                          style={[styles.selectButton, { backgroundColor: colors.purple500 }]}
                          onPress={() => {
                            if (application.applicant?.id) {
                              router.push(`/(screens)/chat?userId=${application.applicant.id}`);
                            }
                          }}
                        >
                          <Ionicons name="chatbubbles" size={18} color="#ffffff" />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Reject Modal */}
      <Modal
        visible={showRejectModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRejectModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Refuser la candidature</Text>
              <TouchableOpacity onPress={() => setShowRejectModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Écrivez un message gentil pour expliquer votre refus
            </Text>

            <Input
              value={rejectionMessage}
              onChangeText={setRejectionMessage}
              placeholder="Message de refus..."
              multiline
              numberOfLines={4}
              containerStyle={styles.modalInput}
            />

            <View style={styles.modalActions}>
              <Button
                title="Annuler"
                onPress={() => {
                  setShowRejectModal(false);
                  setRejectionMessage('');
                  setSelectedApplication(null);
                }}
                variant="outline"
                style={styles.modalButton}
              />
              <Button
                title="Refuser"
                onPress={handleRejectApplication}
                style={styles.modalButton}
                loading={isProcessing}
                disabled={isProcessing || !rejectionMessage.trim()}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Application Modal */}
      <Modal
        visible={showApplicationModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowApplicationModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Candidater à l'offre</Text>
              <TouchableOpacity onPress={() => setShowApplicationModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Écrivez un message pour expliquer pourquoi vous êtes intéressé(e) par cette offre
            </Text>

            <Input
              value={applicationMessage}
              onChangeText={setApplicationMessage}
              placeholder="Votre message..."
              multiline
              numberOfLines={5}
              containerStyle={styles.modalInput}
            />

            <View style={styles.modalActions}>
              <Button
                title="Annuler"
                onPress={() => setShowApplicationModal(false)}
                variant="outline"
                style={styles.modalButton}
              />
              <Button
                title="Envoyer la candidature"
                onPress={handleApply}
                style={styles.modalButton}
                loading={isApplying}
                disabled={isApplying || !applicationMessage.trim()}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.backgroundSecondary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 16,
    gap: 8,
  },
  typeText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.pink400,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  authorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  authorImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  authorInfo: {
    flex: 1,
  },
  authorName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  authorRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  detailsCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    padding: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  detailInfo: {
    flex: 1,
    marginLeft: 12,
  },
  detailLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 14,
    color: colors.text,
  },
  separator: {
    height: 1,
    backgroundColor: colors.borderSecondary,
    marginVertical: 8,
  },
  notesCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    padding: 16,
  },
  notesText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  button: {
    marginBottom: 16,
  },
  appliedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    padding: 16,
    gap: 12,
    marginBottom: 16,
  },
  appliedText: {
    fontSize: 14,
    color: colors.green500,
    fontWeight: '500',
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
    paddingHorizontal: 32,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  modalSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 16,
    lineHeight: 20,
  },
  modalInput: {
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
  },
  applicationsList: {
    maxHeight: 400,
  },
  emptyModalContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyModalText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 12,
  },
  applicationItem: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    gap: 12,
  },
  applicantImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  applicantInfo: {
    flex: 1,
  },
  applicantName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  applicantMessage: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 8,
    lineHeight: 18,
  },
  applicationActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  selectButton: {
    backgroundColor: colors.green500,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rejectButton: {
    backgroundColor: colors.red500,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
});




