import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ImageWithFallback } from '../../components/ImageWithFallback';
import { useUser } from '../../context/UserContext';
import { useAuth } from '../../context/AuthContext';
import { useRating } from '../../context/RatingContext';
import { useAlbum } from '../../context/AlbumContext';
import { supabase } from '../../lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeIn } from 'react-native-reanimated';

export default function ProfileScreen() {
  const router = useRouter();
  const { currentUser } = useUser();
  const { logout, isAuthenticated, user: authUser } = useAuth();
  const { getUserRatings, getUserAverageRating } = useRating();
  const { albumPhotos, getUserAlbumPhotos, addAlbumPhoto, deleteAlbumPhoto, isLoading: isLoadingAlbum } = useAlbum();
  const [userRatings, setUserRatings] = useState<any[]>([]);
  const [isLoadingRatings, setIsLoadingRatings] = useState(false);
  const [averageRating, setAverageRating] = useState({ average: 0, count: 0 });
  const [showAlbumModal, setShowAlbumModal] = useState(false);

  // Refs pour éviter les appels multiples
  const isLoadingRatingsRef = React.useRef(false);
  const lastLoadTimeRef = React.useRef(0);
  const lastAuthUserIdRef = React.useRef<string | null>(null);

  // Charger les avis de l'utilisateur connecté
  const loadUserRatings = useCallback(async (force: boolean = false) => {
    if (!authUser?.id) return;

    // Éviter les appels multiples
    const now = Date.now();
    const timeSinceLastLoad = now - lastLoadTimeRef.current;
    const MIN_LOAD_INTERVAL = 2000; // 2 secondes minimum entre les chargements

    if (!force && (
      isLoadingRatingsRef.current ||
      (timeSinceLastLoad < MIN_LOAD_INTERVAL && lastAuthUserIdRef.current === authUser.id)
    )) {
      return;
    }

    isLoadingRatingsRef.current = true;
    lastLoadTimeRef.current = now;
    lastAuthUserIdRef.current = authUser.id;

    setIsLoadingRatings(true);
    try {
      // Charger les avis
      const ratings = await getUserRatings(authUser.id);
      
      // Charger les profils des personnes qui ont laissé les avis
      const ratingsWithRaters = await Promise.all(
        ratings.map(async (rating: any) => {
          try {
            const { data: raterProfile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', rating.raterId)
              .single();

            return {
              ...rating,
              rater: raterProfile ? {
                pseudo: raterProfile.pseudo || 'Utilisateur',
                photo: raterProfile.photo || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
              } : null,
            };
          } catch (err) {
            console.error('Error fetching rater profile:', err);
            return rating;
          }
        })
      );

      setUserRatings(ratingsWithRaters);

      // Charger la moyenne des notes
      const avgRating = await getUserAverageRating(authUser.id);
      setAverageRating(avgRating);
    } catch (error) {
      console.error('Error loading user ratings:', error);
    } finally {
      setIsLoadingRatings(false);
      isLoadingRatingsRef.current = false;
    }
  }, [authUser?.id, getUserRatings, getUserAverageRating]);

  // Charger les photos d'album au montage
  React.useEffect(() => {
    if (authUser?.id) {
      getUserAlbumPhotos(authUser.id);
    }
  }, [authUser?.id, getUserAlbumPhotos]);

  // Charger les avis au montage
  React.useEffect(() => {
    if (authUser?.id) {
      loadUserRatings(true);
    }
  }, [authUser?.id]); // Ne pas inclure loadUserRatings dans les dépendances

  // Charger les avis quand l'écran est focus (avec délai pour éviter les appels multiples)
  useFocusEffect(
    useCallback(() => {
      if (authUser?.id) {
        const timer = setTimeout(() => {
          loadUserRatings(false);
        }, 500);
        return () => clearTimeout(timer);
      }
    }, [authUser?.id]) // Ne pas inclure loadUserRatings dans les dépendances
  );

  // Rediriger si pas d'utilisateur (dans un useEffect pour éviter l'erreur React)
  React.useEffect(() => {
    if (!isAuthenticated || !currentUser) {
      // Utiliser un petit délai pour s'assurer que l'état est bien mis à jour
      const timer = setTimeout(() => {
        router.replace('/(screens)/auth');
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, currentUser, router]);

  const handleLogout = () => {
    Alert.alert(
      'Déconnexion',
      'Êtes-vous sûr de vouloir vous déconnecter ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Déconnexion',
          style: 'destructive',
          onPress: async () => {
            try {
              await logout();
              // La redirection sera gérée par le useEffect ci-dessus
              // qui détectera que isAuthenticated est false
            } catch (error) {
              console.error('Error logging out:', error);
              Alert.alert('Erreur', 'Une erreur est survenue lors de la déconnexion');
            }
          },
        },
      ]
    );
  };

  const handleAddPhoto = async () => {
    if (!authUser?.id) return;

    if (albumPhotos.length >= 5) {
      Alert.alert('Limite atteinte', 'Vous ne pouvez ajouter que 5 photos maximum');
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission requise', 'Nous avons besoin de l\'accès à vos photos');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      // Pour l'instant, utiliser l'URI locale directement
      // En production, il faudrait uploader vers Supabase Storage
      const photoUrl = result.assets[0].uri;
      
      const { error } = await addAlbumPhoto(authUser.id, photoUrl);
      if (error) {
        Alert.alert('Erreur', error.message || 'Impossible d\'ajouter la photo');
      } else {
        Alert.alert('Succès', 'Photo ajoutée à votre album');
      }
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    Alert.alert(
      'Supprimer la photo',
      'Êtes-vous sûr de vouloir supprimer cette photo ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            const { error } = await deleteAlbumPhoto(photoId);
            if (error) {
              Alert.alert('Erreur', error.message || 'Impossible de supprimer la photo');
            } else {
              Alert.alert('Succès', 'Photo supprimée');
            }
          },
        },
      ]
    );
  };

  // Ne pas rendre si pas d'utilisateur (évite les erreurs)
  if (!isAuthenticated || !currentUser) {
    return null;
  }

  const getStatusBadge = () => {
    if (currentUser.subscriptionStatus === 'active') {
      return <Badge variant="success">Actif</Badge>;
    }
    if (currentUser.subscriptionStatus === 'expired') {
      return <Badge variant="error">Expiré</Badge>;
    }
    return <Badge variant="warning">En attente</Badge>;
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mon Profil</Text>
        <TouchableOpacity>
          <Ionicons name="settings-outline" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            <ImageWithFallback
              source={{ uri: currentUser.photo }}
              style={styles.avatar}
            />
            <TouchableOpacity style={styles.editButton}>
              <Ionicons name="pencil" size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>

          <View style={styles.profileInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{currentUser.pseudo}</Text>
              {currentUser.isSubscribed && (
                <View style={styles.crownIcon}>
                  <Ionicons name="diamond" size={16} color="#ffffff" />
                </View>
              )}
            </View>
            <Text style={styles.age}>{currentUser.age} ans</Text>
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={20} color={colors.yellow500} />
              <Text style={styles.rating}>{currentUser.rating}</Text>
              <Text style={styles.reviewCount}>({currentUser.reviewCount} avis)</Text>
            </View>
          </View>
        </View>

        {/* Status */}
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <Ionicons name="shield-checkmark" size={20} color={colors.purple400} />
            <View style={styles.statusInfo}>
              <Text style={styles.statusTitle}>Statut d'abonnement</Text>
              <Text style={styles.statusSubtitle}>1000 CDF / mois</Text>
            </View>
          </View>
          {getStatusBadge()}
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>À propos</Text>
          <View style={styles.descriptionCard}>
            <Text style={styles.description}>{currentUser.description}</Text>
          </View>
        </View>

        {/* Specialty */}
        {currentUser.specialty && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Savoir-faire particulier</Text>
            <View style={styles.specialtyCard}>
              <Ionicons name="briefcase" size={20} color={colors.pink400} />
              <Text style={styles.specialtyText}>{currentUser.specialty}</Text>
            </View>
          </View>
        )}

        {/* Album Photos Section */}
        <View style={styles.section}>
          <View style={styles.albumHeader}>
            <Text style={styles.sectionTitle}>Mon Album ({albumPhotos.length}/5)</Text>
            {albumPhotos.length < 5 && (
              <TouchableOpacity
                onPress={handleAddPhoto}
                style={styles.addPhotoButton}
                disabled={isLoadingAlbum}
              >
                <Ionicons name="add-circle-outline" size={24} color={colors.pink400} />
              </TouchableOpacity>
            )}
          </View>
          {isLoadingAlbum ? (
            <Text style={styles.loadingText}>Chargement des photos...</Text>
          ) : albumPhotos.length === 0 ? (
            <View style={styles.emptyAlbum}>
              <Ionicons name="images-outline" size={48} color={colors.textTertiary} />
              <Text style={styles.emptyAlbumText}>Aucune photo dans votre album</Text>
              <Text style={styles.emptyAlbumSubtext}>Ajoutez jusqu'à 5 photos</Text>
              <Button
                title="Ajouter une photo"
                onPress={handleAddPhoto}
                icon={<Ionicons name="add" size={20} color="#ffffff" />}
                style={styles.addPhotoButtonFull}
              />
            </View>
          ) : (
            <View style={styles.albumGrid}>
              {albumPhotos.map((photo) => (
                <View key={photo.id} style={styles.albumPhotoContainer}>
                  <ImageWithFallback
                    source={{ uri: photo.photoUrl }}
                    style={styles.albumPhoto}
                  />
                  <TouchableOpacity
                    style={styles.deletePhotoButton}
                    onPress={() => handleDeletePhoto(photo.id)}
                    disabled={isLoadingAlbum}
                  >
                    <Ionicons name="close-circle" size={24} color={colors.red500} />
                  </TouchableOpacity>
                </View>
              ))}
              {albumPhotos.length < 5 && (
                <TouchableOpacity
                  style={styles.addPhotoSlot}
                  onPress={handleAddPhoto}
                  disabled={isLoadingAlbum}
                >
                  <Ionicons name="add-circle-outline" size={48} color={colors.textTertiary} />
                  <Text style={styles.addPhotoText}>Ajouter</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <Button
              title="Modifier le profil"
              onPress={() => router.push('/(screens)/edit-profile')}
              variant="outline"
              icon={<Ionicons name="pencil" size={20} color={colors.text} />}
              style={styles.actionButton}
            />
            <Button
              title="Mes demandes envoyées"
              onPress={() => router.push('/(screens)/my-requests')}
              variant="outline"
              icon={<Ionicons name="paper-plane-outline" size={20} color={colors.text} />}
              style={styles.actionButton}
            />
            <Button
              title="Mes offres"
              onPress={() => router.push('/(screens)/my-offers')}
              variant="outline"
              icon={<Ionicons name="gift-outline" size={20} color={colors.text} />}
              style={styles.actionButton}
            />
            <Button
              title="Offres disponibles"
              onPress={() => router.push('/(screens)/offers')}
              variant="outline"
              icon={<Ionicons name="gift" size={20} color={colors.pink500} />}
              style={styles.actionButton}
            />
            <Button
              title="Demandes reçues"
              onPress={() => router.push('/(screens)/requests')}
              variant="outline"
              icon={<Ionicons name="notifications-outline" size={20} color={colors.text} />}
              style={styles.actionButton}
            />
            <Button
              title="Paramètres"
              onPress={() => router.push('/(screens)/settings')}
              variant="outline"
              icon={<Ionicons name="settings-outline" size={20} color={colors.text} />}
              style={styles.actionButton}
            />
          <Button
            title="Gérer l'abonnement"
            onPress={() => router.push('/(screens)/subscription')}
            icon={<Ionicons name="diamond" size={20} color="#ffffff" />}
            style={styles.actionButton}
          />
          <Button
            title="Déconnexion"
            onPress={handleLogout}
            variant="outline"
            icon={<Ionicons name="log-out-outline" size={20} color={colors.red500} />}
            style={[styles.actionButton, styles.logoutButton]}
            textStyle={{ color: colors.red500 }}
          />
        </View>

        {/* Reviews Section */}
        <View style={styles.section}>
          <View style={styles.reviewsHeader}>
            <View>
              <Text style={styles.sectionTitle}>Avis reçus</Text>
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
                  <Text style={styles.reviewCount}>({averageRating.count} avis)</Text>
                </View>
              )}
            </View>
          </View>
          
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
                <Animated.View key={ratingItem.id} entering={FadeIn} style={styles.reviewCard}>
                  <View style={styles.reviewHeader}>
                    <View style={styles.ratingCardUser}>
                      {ratingItem.rater && (
                        <ImageWithFallback
                          source={{ uri: ratingItem.rater.photo }}
                          style={styles.ratingCardAvatar}
                        />
                      )}
                      <View style={styles.ratingCardUserInfo}>
                        <Text style={styles.reviewAuthor}>
                          {ratingItem.rater?.pseudo || 'Utilisateur'}
                        </Text>
                        <Text style={styles.reviewDate}>
                          {new Date(ratingItem.createdAt).toLocaleDateString('fr-FR', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.stars}>
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
                    <Text style={styles.reviewComment}>{ratingItem.comment}</Text>
                  )}
                </Animated.View>
              ))}
            </View>
          )}
        </View>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    gap: 24,
  },
  profileHeader: {
    alignItems: 'center',
    gap: 16,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 128,
    height: 128,
    borderRadius: 24,
    borderWidth: 4,
    borderColor: `${colors.pink500}4d`,
  },
  editButton: {
    position: 'absolute',
    bottom: -8,
    right: -8,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.purple600,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  profileInfo: {
    alignItems: 'center',
    gap: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    fontSize: 24,
    fontWeight: '600',
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
  age: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rating: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  reviewCount: {
    fontSize: 14,
    color: colors.textTertiary,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: `${colors.backgroundSecondary}80`,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
    borderRadius: 16,
    padding: 16,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusInfo: {
    gap: 4,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  statusSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  descriptionCard: {
    backgroundColor: `${colors.backgroundSecondary}80`,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
    borderRadius: 16,
    padding: 16,
  },
  description: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  actions: {
    gap: 12,
  },
  actionButton: {
    marginTop: 0,
  },
  logoutButton: {
    borderColor: colors.red500,
  },
  reviewsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reviewCard: {
    backgroundColor: `${colors.backgroundSecondary}80`,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
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
  reviewAuthor: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  stars: {
    flexDirection: 'row',
    gap: 2,
  },
  reviewComment: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.borderSecondary,
  },
  reviewDate: {
    fontSize: 12,
    color: colors.textTertiary,
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
  albumHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addPhotoButton: {
    padding: 8,
  },
  albumGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  albumPhotoContainer: {
    position: 'relative',
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
  deletePhotoButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: colors.background,
    borderRadius: 12,
  },
  addPhotoSlot: {
    width: '30%',
    aspectRatio: 1,
    backgroundColor: `${colors.backgroundSecondary}80`,
    borderWidth: 2,
    borderColor: colors.borderSecondary,
    borderStyle: 'dashed',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  addPhotoText: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  emptyAlbum: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  emptyAlbumText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  emptyAlbumSubtext: {
    fontSize: 14,
    color: colors.textTertiary,
  },
  addPhotoButtonFull: {
    marginTop: 8,
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

