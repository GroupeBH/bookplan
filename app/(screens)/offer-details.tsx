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
import { Offer, OfferApplication, OfferType } from '../../types';
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
  const { getOfferById, applyToOffer, getOfferApplications } = useOffer();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [applications, setApplications] = useState<OfferApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const [showApplicationModal, setShowApplicationModal] = useState(false);
  const [applicationMessage, setApplicationMessage] = useState('');
  const [hasApplied, setHasApplied] = useState(false);

  useEffect(() => {
    loadOffer();
  }, [offerId]);

  const loadOffer = async () => {
    if (!offerId) return;

    setIsLoading(true);
    try {
      const loadedOffer = await getOfferById(offerId);
      if (loadedOffer) {
        setOffer(loadedOffer);
        
        // Vérifier si l'utilisateur a déjà candidaté
        const loadedApplications = await getOfferApplications(offerId);
        setApplications(loadedApplications);
        
        const userApplication = loadedApplications.find(
          (app) => app.applicantId === user?.id
        );
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
  const canApply = !isAuthor && !hasApplied && offer.status === 'active';

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
                  {offer.author?.rating?.toFixed(1) || '0.0'} ({offer.author?.reviewCount || 0})
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

          {/* Applications Count */}
          {isAuthor && applications.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Candidatures ({applications.length})
              </Text>
              <View style={styles.infoCard}>
                <Ionicons name="information-circle-outline" size={20} color={colors.pink400} />
                <Text style={styles.infoText}>
                  Vous pouvez gérer les candidatures depuis "Mes offres"
                </Text>
              </View>
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

          {hasApplied && (
            <View style={styles.appliedCard}>
              <Ionicons name="checkmark-circle" size={24} color={colors.green500} />
              <Text style={styles.appliedText}>Vous avez déjà candidaté à cette offre</Text>
            </View>
          )}

          {isAuthor && (
            <View style={styles.infoCard}>
              <Ionicons name="information-circle-outline" size={20} color={colors.pink400} />
              <Text style={styles.infoText}>
                C'est votre offre. Vous pouvez la gérer depuis "Mes offres"
              </Text>
            </View>
          )}
        </Animated.View>
      </ScrollView>

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
});




