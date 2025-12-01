import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ImageWithFallback } from '../../components/ImageWithFallback';
import { Button } from '../../components/ui/Button';
import { colors } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';
import { useBooking } from '../../context/BookingContext';
import { useUser } from '../../context/UserContext';
import { User } from '../../types';

type Filter = 'all' | 'male' | 'female';

export default function SearchScreen() {
  const router = useRouter();
  const { setSelectedUser } = useUser();
  const { user: currentAuthUser } = useAuth();
  const { getAvailableUsers } = useBooking();
  const [filter, setFilter] = useState<Filter>('all');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [ageRange, setAgeRange] = useState({ min: 18, max: 100 });
  const [maxDistance, setMaxDistance] = useState<number | null>(null);
  const [minRating, setMinRating] = useState<number>(0);
  
  // États temporaires pour le modal (non appliqués jusqu'à ce que l'utilisateur clique sur "Appliquer")
  const [tempFilter, setTempFilter] = useState<Filter>('all');
  const [tempAgeRange, setTempAgeRange] = useState({ min: 18, max: 100 });
  const [tempAgeMinText, setTempAgeMinText] = useState('18');
  const [tempAgeMaxText, setTempAgeMaxText] = useState('100');
  const [tempMaxDistance, setTempMaxDistance] = useState<number | null>(null);
  const [tempMinRating, setTempMinRating] = useState<number>(0);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const isLoadingRef = React.useRef(false);
  const lastLoadTimeRef = React.useRef<number>(0);
  const hasLoadedRef = React.useRef(false);

  // Calculer la distance entre deux points (formule de Haversine)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Rayon de la Terre en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Charger les utilisateurs disponibles
  const loadUsers = useCallback(async (force = false) => {
    if (!currentAuthUser) return;

    // Éviter les appels multiples simultanés
    if (isLoadingRef.current) {
      console.log('⏭️ Chargement déjà en cours, skip');
      return;
    }

    // Éviter de recharger trop souvent (max 1 fois par seconde)
    const now = Date.now();
    if (!force && hasLoadedRef.current && now - lastLoadTimeRef.current < 1000) {
      console.log('⏭️ Rechargement trop récent, skip');
      return;
    }

    isLoadingRef.current = true;
    setIsLoading(true);
    lastLoadTimeRef.current = now;

    try {
      const availableUsers = await getAvailableUsers();
      
      // Convertir les données de la DB en format User
      const formattedUsers: User[] = availableUsers.map((u: any) => ({
        id: u.id,
        pseudo: u.pseudo || 'Utilisateur',
        age: u.age || 25,
        phone: u.phone,
        photo: u.photo || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
        description: u.description || '',
        rating: parseFloat(u.rating) || 0,
        reviewCount: u.review_count || 0,
        isSubscribed: u.is_subscribed || false,
        subscriptionStatus: u.subscription_status || 'pending',
        lastSeen: u.last_seen || 'En ligne',
        gender: u.gender || 'female',
        lat: u.lat ? parseFloat(u.lat) : undefined,
        lng: u.lng ? parseFloat(u.lng) : undefined,
        isAvailable: u.is_available,
      }));

      // Récupérer la position de l'utilisateur actuel
      if (currentAuthUser.lat && currentAuthUser.lng) {
        setUserLocation({ lat: currentAuthUser.lat, lng: currentAuthUser.lng });
        
        // Calculer les distances
        formattedUsers.forEach((u) => {
          if (u.lat && u.lng) {
            u.distance = calculateDistance(
              currentAuthUser.lat!,
              currentAuthUser.lng!,
              u.lat,
              u.lng
            );
          }
        });

        // Trier par distance
        formattedUsers.sort((a, b) => (a.distance || 999) - (b.distance || 999));
      }

      setUsers(formattedUsers);
      setCurrentIndex(0); // Réinitialiser l'index
      hasLoadedRef.current = true;
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  }, [currentAuthUser?.id]); // Utiliser seulement currentAuthUser.id comme dépendance

  // Charger les utilisateurs au montage
  React.useEffect(() => {
    if (currentAuthUser?.id) {
      loadUsers(true); // Force le chargement initial
    }
  }, [currentAuthUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recharger quand on revient sur la page (mais pas trop souvent)
  useFocusEffect(
    useCallback(() => {
      // Utiliser un petit délai pour éviter les appels multiples
      const timer = setTimeout(() => {
        if (currentAuthUser?.id) {
          loadUsers(false); // Ne pas forcer, respecter le rate limiting
        }
      }, 300);

      return () => {
        clearTimeout(timer);
      };
    }, [currentAuthUser?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Filtrer les utilisateurs
  const filteredUsers = users.filter((user) => {
    // Filtre par genre
    if (filter !== 'all' && user.gender !== filter) return false;
    
    // Filtre par recherche textuelle
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      if (!user.pseudo.toLowerCase().includes(query) && 
          !user.description.toLowerCase().includes(query)) {
        return false;
      }
    }
    
    // Filtre par âge
    if (user.age < ageRange.min || user.age > ageRange.max) return false;
    
    // Filtre par distance maximale
    if (maxDistance !== null) {
      // Si l'utilisateur n'a pas de distance calculée (pas de position), l'exclure
      if (user.distance === undefined || user.distance === null) {
        return false;
      }
      // Si la distance dépasse le maximum, exclure
      if (user.distance > maxDistance) {
        return false;
      }
    }
    
    // Filtre par note minimale
    if (minRating > 0) {
      // Si l'utilisateur n'a pas d'avis (reviewCount === 0), l'exclure si on demande une note minimale > 0
      if (!user.reviewCount || user.reviewCount === 0) {
        return false;
      }
      // Vérifier que la note est >= à la note minimale demandée
      if (user.rating < minRating) {
        return false;
      }
    }
    
    return true;
  });

  // S'assurer que currentIndex est dans les limites du tableau
  const safeIndex = filteredUsers.length > 0 
    ? Math.min(Math.max(0, currentIndex), filteredUsers.length - 1) 
    : 0;
  
  // Si l'index a changé, le mettre à jour
  React.useEffect(() => {
    if (filteredUsers.length > 0 && currentIndex >= filteredUsers.length) {
      setCurrentIndex(0);
    } else if (filteredUsers.length === 0) {
      setCurrentIndex(0);
    }
  }, [filteredUsers.length, currentIndex]);

  const currentUser = filteredUsers.length > 0 ? filteredUsers[safeIndex] : null;

  const handleViewProfile = (user: User) => {
    setSelectedUser(user);
    router.push('/(screens)/user-profile');
  };

  const handleNext = () => {
    if (currentIndex < filteredUsers.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // Si on est à la fin, recommencer depuis le début
      setCurrentIndex(0);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    } else {
      // Si on est au début, aller à la fin
      setCurrentIndex(Math.max(0, filteredUsers.length - 1));
    }
  };

  const resetFilters = () => {
    setFilter('all');
    setSearchQuery('');
    setAgeRange({ min: 18, max: 100 });
    setMaxDistance(null);
    setMinRating(0);
    setTempFilter('all');
    setTempAgeRange({ min: 18, max: 100 });
    setTempAgeMinText('18');
    setTempAgeMaxText('100');
    setTempMaxDistance(null);
    setTempMinRating(0);
    setCurrentIndex(0);
  };

  // Initialiser les états temporaires quand le modal s'ouvre
  const handleOpenFilters = () => {
    setTempFilter(filter);
    setTempAgeRange(ageRange);
    setTempMaxDistance(maxDistance);
    setTempMinRating(minRating);
    setTempAgeMinText(ageRange.min.toString());
    setTempAgeMaxText(ageRange.max.toString());
    setShowFilters(true);
  };

  // Appliquer les filtres temporaires
  const handleApplyFilters = () => {
    // Valider et normaliser les valeurs d'âge avant d'appliquer
    const minAge = parseInt(tempAgeMinText) || 18;
    const maxAge = parseInt(tempAgeMaxText) || 100;
    const normalizedMin = Math.max(18, Math.min(100, minAge));
    const normalizedMax = Math.max(18, Math.min(100, maxAge));
    
    // S'assurer que min <= max
    const finalMin = Math.min(normalizedMin, normalizedMax);
    const finalMax = Math.max(normalizedMin, normalizedMax);
    
    setFilter(tempFilter);
    setFilter(tempFilter);
    setAgeRange({ min: finalMin, max: finalMax });
    setTempAgeRange({ min: finalMin, max: finalMax });
    setTempAgeMinText(finalMin.toString());
    setTempAgeMaxText(finalMax.toString());
    setMaxDistance(tempMaxDistance);
    setMinRating(tempMinRating);
    setShowFilters(false);
    setCurrentIndex(0);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Recherche</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>Chargement...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Ne pas afficher la vue "Aucun profil trouvé" si le modal de filtres est ouvert
  if ((!currentUser || filteredUsers.length === 0) && !showFilters) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Recherche</Text>
          <TouchableOpacity onPress={handleOpenFilters}>
            <Ionicons name="options-outline" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Rechercher par nom ou description..."
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filters */}
        <View style={styles.filters}>
          <TouchableOpacity
            style={[styles.filterButton, filter === 'all' && styles.filterButtonActive]}
            onPress={() => {
              setFilter('all');
              setCurrentIndex(0);
            }}
          >
            <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>Tous</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, filter === 'male' && styles.filterButtonActive]}
            onPress={() => {
              setFilter('male');
              setCurrentIndex(0);
            }}
          >
            <Text style={[styles.filterText, filter === 'male' && styles.filterTextActive]}>Hommes</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, filter === 'female' && styles.filterButtonActive]}
            onPress={() => {
              setFilter('female');
              setCurrentIndex(0);
            }}
          >
            <Text style={[styles.filterText, filter === 'female' && styles.filterTextActive]}>Femmes</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.emptyContainer}>
          <View style={styles.emptyIcon}>
            <Ionicons name="search-outline" size={40} color={colors.textTertiary} />
          </View>
          <Text style={styles.emptyTitle}>Aucun profil trouvé</Text>
          <Text style={styles.emptySubtitle}>
            {searchQuery || filter !== 'all' || ageRange.min !== 18 || ageRange.max !== 100 || maxDistance !== null || minRating > 0
              ? 'Essayez de modifier vos critères de recherche'
              : 'Aucun utilisateur disponible pour le moment'}
          </Text>
          {(searchQuery || filter !== 'all' || ageRange.min !== 18 || ageRange.max !== 100 || maxDistance !== null || minRating > 0) && (
            <TouchableOpacity style={styles.resetButton} onPress={resetFilters}>
              <Text style={styles.resetButtonText}>Réinitialiser les filtres</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Filters Modal - doit être présent même si aucun résultat */}
        <Modal
          visible={showFilters}
          transparent
          animationType="slide"
          onRequestClose={() => setShowFilters(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Filtres avancés</Text>
                <TouchableOpacity onPress={() => setShowFilters(false)}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                {/* Gender Filter */}
                <View style={styles.filterSection}>
                  <Text style={styles.filterSectionTitle}>Sexe</Text>
                  <View style={styles.genderFilterContainer}>
                    <TouchableOpacity
                      style={[
                        styles.genderFilterButton,
                        tempFilter === 'all' && styles.genderFilterButtonActive,
                      ]}
                      onPress={() => setTempFilter('all')}
                    >
                      <Text
                        style={[
                          styles.genderFilterText,
                          tempFilter === 'all' && styles.genderFilterTextActive,
                        ]}
                      >
                        Tous
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.genderFilterButton,
                        tempFilter === 'male' && styles.genderFilterButtonActive,
                      ]}
                      onPress={() => setTempFilter('male')}
                    >
                      <Text
                        style={[
                          styles.genderFilterText,
                          tempFilter === 'male' && styles.genderFilterTextActive,
                        ]}
                      >
                        Hommes
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.genderFilterButton,
                        tempFilter === 'female' && styles.genderFilterButtonActive,
                      ]}
                      onPress={() => setTempFilter('female')}
                    >
                      <Text
                        style={[
                          styles.genderFilterText,
                          tempFilter === 'female' && styles.genderFilterTextActive,
                        ]}
                      >
                        Femmes
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
                {/* Age Range */}
                <View style={styles.filterSection}>
                  <Text style={styles.filterSectionTitle}>Âge</Text>
                  <View style={styles.ageRangeContainer}>
                    <View style={styles.ageInputContainer}>
                      <Text style={styles.ageLabel}>Min</Text>
                      <TextInput
                        style={styles.ageInput}
                        value={tempAgeMinText}
                        onChangeText={(text) => {
                          // Filtrer pour ne garder que les chiffres
                          const numericText = text.replace(/[^0-9]/g, '');
                          setTempAgeMinText(numericText);
                          // Mettre à jour tempAgeRange seulement si c'est un nombre valide
                          const numValue = parseInt(numericText);
                          if (!isNaN(numValue)) {
                            setTempAgeRange({ ...tempAgeRange, min: Math.max(18, Math.min(100, numValue)) });
                          }
                        }}
                        onBlur={() => {
                          // Quand le champ perd le focus, normaliser la valeur
                          const numValue = parseInt(tempAgeMinText);
                          if (isNaN(numValue) || numValue < 18) {
                            setTempAgeMinText('18');
                            setTempAgeRange({ ...tempAgeRange, min: 18 });
                          } else if (numValue > 100) {
                            setTempAgeMinText('100');
                            setTempAgeRange({ ...tempAgeRange, min: 100 });
                          } else {
                            setTempAgeMinText(numValue.toString());
                            setTempAgeRange({ ...tempAgeRange, min: numValue });
                          }
                        }}
                        keyboardType="numeric"
                        placeholder="18"
                      />
                    </View>
                    <Text style={styles.ageSeparator}>-</Text>
                    <View style={styles.ageInputContainer}>
                      <Text style={styles.ageLabel}>Max</Text>
                      <TextInput
                        style={styles.ageInput}
                        value={tempAgeMaxText}
                        onChangeText={(text) => {
                          // Filtrer pour ne garder que les chiffres
                          const numericText = text.replace(/[^0-9]/g, '');
                          setTempAgeMaxText(numericText);
                          // Mettre à jour tempAgeRange seulement si c'est un nombre valide
                          const numValue = parseInt(numericText);
                          if (!isNaN(numValue)) {
                            setTempAgeRange({ ...tempAgeRange, max: Math.max(18, Math.min(100, numValue)) });
                          }
                        }}
                        onBlur={() => {
                          // Quand le champ perd le focus, normaliser la valeur
                          const numValue = parseInt(tempAgeMaxText);
                          if (isNaN(numValue) || numValue < 18) {
                            setTempAgeMaxText('18');
                            setTempAgeRange({ ...tempAgeRange, max: 18 });
                          } else if (numValue > 100) {
                            setTempAgeMaxText('100');
                            setTempAgeRange({ ...tempAgeRange, max: 100 });
                          } else {
                            setTempAgeMaxText(numValue.toString());
                            setTempAgeRange({ ...tempAgeRange, max: numValue });
                          }
                        }}
                        keyboardType="numeric"
                        placeholder="100"
                      />
                    </View>
                  </View>
                </View>

                {/* Max Distance */}
                <View style={styles.filterSection}>
                  <Text style={styles.filterSectionTitle}>Distance maximale (km)</Text>
                  <TextInput
                    style={styles.distanceInput}
                    placeholder="Aucune limite"
                    placeholderTextColor={colors.textTertiary}
                    value={tempMaxDistance?.toString() || ''}
                    onChangeText={(text) => {
                      if (text === '') {
                        setTempMaxDistance(null);
                      } else {
                        const value = parseFloat(text);
                        if (!isNaN(value) && value > 0) {
                          setTempMaxDistance(value);
                        }
                      }
                    }}
                    keyboardType="numeric"
                  />
                </View>

                {/* Min Rating */}
                <View style={styles.filterSection}>
                  <Text style={styles.filterSectionTitle}>Note minimale</Text>
                  <View style={styles.ratingFilterContainer}>
                    {[0, 1, 2, 3, 4, 5].map((rating) => (
                      <TouchableOpacity
                        key={rating}
                        style={[
                          styles.ratingFilterButton,
                          tempMinRating === rating && styles.ratingFilterButtonActive,
                        ]}
                        onPress={() => setTempMinRating(rating)}
                      >
                        <Text
                          style={[
                            styles.ratingFilterText,
                            tempMinRating === rating && styles.ratingFilterTextActive,
                          ]}
                        >
                          {rating === 0 ? 'Tous' : `${rating}+`}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </ScrollView>
              <View style={styles.modalActions}>
                <Button
                  title="Réinitialiser"
                  onPress={resetFilters}
                  variant="outline"
                  style={styles.modalButton}
                />
                <Button
                  title="Appliquer"
                  onPress={() => {
                    setShowFilters(false);
                    setCurrentIndex(0);
                  }}
                  style={styles.modalButton}
                />
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  // Si pas d'utilisateur actuel, afficher la vue vide
  if (!currentUser) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Recherche</Text>
          <TouchableOpacity onPress={handleOpenFilters}>
            <Ionicons name="options-outline" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Rechercher par nom ou description..."
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filters */}
        <View style={styles.filters}>
          <TouchableOpacity
            style={[styles.filterButton, filter === 'all' && styles.filterButtonActive]}
            onPress={() => {
              setFilter('all');
              setCurrentIndex(0);
            }}
          >
            <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>Tous</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, filter === 'male' && styles.filterButtonActive]}
            onPress={() => {
              setFilter('male');
              setCurrentIndex(0);
            }}
          >
            <Text style={[styles.filterText, filter === 'male' && styles.filterTextActive]}>Hommes</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, filter === 'female' && styles.filterButtonActive]}
            onPress={() => {
              setFilter('female');
              setCurrentIndex(0);
            }}
          >
            <Text style={[styles.filterText, filter === 'female' && styles.filterTextActive]}>Femmes</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.emptyContainer}>
          <View style={styles.emptyIcon}>
            <Ionicons name="search-outline" size={40} color={colors.textTertiary} />
          </View>
          <Text style={styles.emptyTitle}>Aucun profil trouvé</Text>
          <Text style={styles.emptySubtitle}>
            {searchQuery || filter !== 'all' || ageRange.min !== 18 || ageRange.max !== 100 || maxDistance !== null || minRating > 0
              ? 'Essayez de modifier vos critères de recherche'
              : 'Aucun utilisateur disponible pour le moment'}
          </Text>
          {(searchQuery || filter !== 'all' || ageRange.min !== 18 || ageRange.max !== 100 || maxDistance !== null || minRating > 0) && (
            <TouchableOpacity style={styles.resetButton} onPress={resetFilters}>
              <Text style={styles.resetButtonText}>Réinitialiser les filtres</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Filters Modal */}
        <Modal
          visible={showFilters}
          transparent
          animationType="slide"
          onRequestClose={() => setShowFilters(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Filtres avancés</Text>
                <TouchableOpacity onPress={() => setShowFilters(false)}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                {/* Gender Filter */}
                <View style={styles.filterSection}>
                  <Text style={styles.filterSectionTitle}>Sexe</Text>
                  <View style={styles.genderFilterContainer}>
                    <TouchableOpacity
                      style={[
                        styles.genderFilterButton,
                        tempFilter === 'all' && styles.genderFilterButtonActive,
                      ]}
                      onPress={() => setTempFilter('all')}
                    >
                      <Text
                        style={[
                          styles.genderFilterText,
                          tempFilter === 'all' && styles.genderFilterTextActive,
                        ]}
                      >
                        Tous
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.genderFilterButton,
                        tempFilter === 'male' && styles.genderFilterButtonActive,
                      ]}
                      onPress={() => setTempFilter('male')}
                    >
                      <Text
                        style={[
                          styles.genderFilterText,
                          tempFilter === 'male' && styles.genderFilterTextActive,
                        ]}
                      >
                        Hommes
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.genderFilterButton,
                        tempFilter === 'female' && styles.genderFilterButtonActive,
                      ]}
                      onPress={() => setTempFilter('female')}
                    >
                      <Text
                        style={[
                          styles.genderFilterText,
                          tempFilter === 'female' && styles.genderFilterTextActive,
                        ]}
                      >
                        Femmes
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
                {/* Age Range */}
                <View style={styles.filterSection}>
                  <Text style={styles.filterSectionTitle}>Âge</Text>
                  <View style={styles.ageRangeContainer}>
                    <View style={styles.ageInputContainer}>
                      <Text style={styles.ageLabel}>Min</Text>
                      <TextInput
                        style={styles.ageInput}
                        value={tempAgeMinText}
                        onChangeText={(text) => {
                          // Filtrer pour ne garder que les chiffres
                          const numericText = text.replace(/[^0-9]/g, '');
                          setTempAgeMinText(numericText);
                          // Mettre à jour tempAgeRange seulement si c'est un nombre valide
                          const numValue = parseInt(numericText);
                          if (!isNaN(numValue)) {
                            setTempAgeRange({ ...tempAgeRange, min: Math.max(18, Math.min(100, numValue)) });
                          }
                        }}
                        onBlur={() => {
                          // Quand le champ perd le focus, normaliser la valeur
                          const numValue = parseInt(tempAgeMinText);
                          if (isNaN(numValue) || numValue < 18) {
                            setTempAgeMinText('18');
                            setTempAgeRange({ ...tempAgeRange, min: 18 });
                          } else if (numValue > 100) {
                            setTempAgeMinText('100');
                            setTempAgeRange({ ...tempAgeRange, min: 100 });
                          } else {
                            setTempAgeMinText(numValue.toString());
                            setTempAgeRange({ ...tempAgeRange, min: numValue });
                          }
                        }}
                        keyboardType="numeric"
                        placeholder="18"
                      />
                    </View>
                    <Text style={styles.ageSeparator}>-</Text>
                    <View style={styles.ageInputContainer}>
                      <Text style={styles.ageLabel}>Max</Text>
                      <TextInput
                        style={styles.ageInput}
                        value={tempAgeMaxText}
                        onChangeText={(text) => {
                          // Filtrer pour ne garder que les chiffres
                          const numericText = text.replace(/[^0-9]/g, '');
                          setTempAgeMaxText(numericText);
                          // Mettre à jour tempAgeRange seulement si c'est un nombre valide
                          const numValue = parseInt(numericText);
                          if (!isNaN(numValue)) {
                            setTempAgeRange({ ...tempAgeRange, max: Math.max(18, Math.min(100, numValue)) });
                          }
                        }}
                        onBlur={() => {
                          // Quand le champ perd le focus, normaliser la valeur
                          const numValue = parseInt(tempAgeMaxText);
                          if (isNaN(numValue) || numValue < 18) {
                            setTempAgeMaxText('18');
                            setTempAgeRange({ ...tempAgeRange, max: 18 });
                          } else if (numValue > 100) {
                            setTempAgeMaxText('100');
                            setTempAgeRange({ ...tempAgeRange, max: 100 });
                          } else {
                            setTempAgeMaxText(numValue.toString());
                            setTempAgeRange({ ...tempAgeRange, max: numValue });
                          }
                        }}
                        keyboardType="numeric"
                        placeholder="100"
                      />
                    </View>
                  </View>
                </View>

                {/* Max Distance */}
                <View style={styles.filterSection}>
                  <Text style={styles.filterSectionTitle}>Distance maximale (km)</Text>
                  <TextInput
                    style={styles.distanceInput}
                    placeholder="Aucune limite"
                    placeholderTextColor={colors.textTertiary}
                    value={tempMaxDistance?.toString() || ''}
                    onChangeText={(text) => {
                      if (text === '') {
                        setTempMaxDistance(null);
                      } else {
                        const value = parseFloat(text);
                        if (!isNaN(value) && value > 0) {
                          setTempMaxDistance(value);
                        }
                      }
                    }}
                    keyboardType="numeric"
                  />
                </View>

                {/* Min Rating */}
                <View style={styles.filterSection}>
                  <Text style={styles.filterSectionTitle}>Note minimale</Text>
                  <View style={styles.ratingFilterContainer}>
                    {[0, 1, 2, 3, 4, 5].map((rating) => (
                      <TouchableOpacity
                        key={rating}
                        style={[
                          styles.ratingFilterButton,
                          tempMinRating === rating && styles.ratingFilterButtonActive,
                        ]}
                        onPress={() => setTempMinRating(rating)}
                      >
                        <Text
                          style={[
                            styles.ratingFilterText,
                            tempMinRating === rating && styles.ratingFilterTextActive,
                          ]}
                        >
                          {rating === 0 ? 'Tous' : `${rating}+`}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </ScrollView>
              <View style={styles.modalActions}>
                <Button
                  title="Réinitialiser"
                  onPress={resetFilters}
                  variant="outline"
                  style={styles.modalButton}
                />
                <Button
                  title="Appliquer"
                  onPress={() => {
                    setShowFilters(false);
                    setCurrentIndex(0);
                  }}
                  style={styles.modalButton}
                />
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Recherche</Text>
        <TouchableOpacity onPress={() => setShowFilters(true)}>
          <Ionicons name="options-outline" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher par nom ou description..."
          placeholderTextColor={colors.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filters */}
      <View style={styles.filters}>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'all' && styles.filterButtonActive]}
          onPress={() => {
            setFilter('all');
            setCurrentIndex(0);
          }}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>Tous</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'male' && styles.filterButtonActive]}
          onPress={() => {
            setFilter('male');
            setCurrentIndex(0);
          }}
        >
          <Text style={[styles.filterText, filter === 'male' && styles.filterTextActive]}>Hommes</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'female' && styles.filterButtonActive]}
          onPress={() => {
            setFilter('female');
            setCurrentIndex(0);
          }}
        >
          <Text style={[styles.filterText, filter === 'female' && styles.filterTextActive]}>Femmes</Text>
        </TouchableOpacity>
      </View>

      {/* Card */}
      <View style={styles.cardContainer}>
        <View style={styles.card}>
          {currentUser && (
            <>
              <ImageWithFallback source={{ uri: currentUser.photo }} style={styles.cardImage} />
              <View style={styles.cardOverlay} />
              <View style={styles.cardInfo}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardName}>{currentUser.pseudo}</Text>
                  <Text style={styles.cardSeparator}>·</Text>
                  <Text style={styles.cardAge}>{currentUser.age} ans</Text>
                </View>
                <Text style={styles.cardDescription}>{currentUser.description}</Text>
                <View style={styles.cardMeta}>
                  {currentUser.distance !== undefined && (
                    <View style={styles.cardMetaItem}>
                      <Ionicons name="location" size={16} color={colors.textSecondary} />
                      <Text style={styles.cardMetaText}>{currentUser.distance.toFixed(1)} km</Text>
                    </View>
                  )}
                  <View style={styles.cardMetaItem}>
                    <Ionicons name="star" size={16} color={colors.yellow500} />
                    <Text style={styles.cardMetaText}>{currentUser.rating.toFixed(1)}</Text>
                    <Text style={styles.cardMetaTextSecondary}>({currentUser.reviewCount || 0})</Text>
                  </View>
                </View>
                <View style={styles.cardCounter}>
                  <Text style={styles.counterText}>
                    {currentIndex + 1} / {filteredUsers.length}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.viewProfileButton}
                  onPress={() => handleViewProfile(currentUser)}
                >
                  <Text style={styles.viewProfileButtonText}>Voir le profil</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>

      {/* Action buttons */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionButton} onPress={handlePrevious}>
          <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={handleNext}>
          <Ionicons name="close" size={32} color={colors.red500} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButtonPrimary}
          onPress={() => handleViewProfile(currentUser)}
        >
          <Ionicons name="heart" size={40} color="#ffffff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={handleNext}>
          <Ionicons name="arrow-forward" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Filters Modal */}
      <Modal
        visible={showFilters}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFilters(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filtres avancés</Text>
              <TouchableOpacity onPress={() => setShowFilters(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {/* Age Range */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Âge</Text>
                <View style={styles.ageRangeContainer}>
                  <View style={styles.ageInputContainer}>
                    <Text style={styles.ageLabel}>Min</Text>
                    <TextInput
                      style={styles.ageInput}
                      value={tempAgeMinText}
                      onChangeText={(text) => {
                        // Permettre la saisie libre (y compris chaîne vide)
                        // Ne garder que les chiffres
                        const numericText = text.replace(/[^0-9]/g, '');
                        setTempAgeMinText(numericText);
                        // Mettre à jour tempAgeRange seulement si c'est un nombre valide
                        const numValue = parseInt(numericText);
                        if (!isNaN(numValue)) {
                          setTempAgeRange({ ...tempAgeRange, min: Math.max(18, Math.min(100, numValue)) });
                        }
                      }}
                      onBlur={() => {
                        // Quand le champ perd le focus, normaliser la valeur
                        const numValue = parseInt(tempAgeMinText);
                        if (isNaN(numValue) || numValue < 18) {
                          setTempAgeMinText('18');
                          setTempAgeRange({ ...tempAgeRange, min: 18 });
                        } else if (numValue > 100) {
                          setTempAgeMinText('100');
                          setTempAgeRange({ ...tempAgeRange, min: 100 });
                        } else {
                          setTempAgeMinText(numValue.toString());
                          setTempAgeRange({ ...tempAgeRange, min: numValue });
                        }
                      }}
                      keyboardType="numeric"
                      placeholder="18"
                    />
                  </View>
                  <Text style={styles.ageSeparator}>-</Text>
                  <View style={styles.ageInputContainer}>
                    <Text style={styles.ageLabel}>Max</Text>
                    <TextInput
                      style={styles.ageInput}
                      value={tempAgeMaxText}
                      onChangeText={(text) => {
                        // Permettre la saisie libre (y compris chaîne vide)
                        // Ne garder que les chiffres
                        const numericText = text.replace(/[^0-9]/g, '');
                        setTempAgeMaxText(numericText);
                        // Mettre à jour tempAgeRange seulement si c'est un nombre valide
                        const numValue = parseInt(numericText);
                        if (!isNaN(numValue)) {
                          setTempAgeRange({ ...tempAgeRange, max: Math.max(18, Math.min(100, numValue)) });
                        }
                      }}
                      onBlur={() => {
                        // Quand le champ perd le focus, normaliser la valeur
                        const numValue = parseInt(tempAgeMaxText);
                        if (isNaN(numValue) || numValue < 18) {
                          setTempAgeMaxText('18');
                          setTempAgeRange({ ...tempAgeRange, max: 18 });
                        } else if (numValue > 100) {
                          setTempAgeMaxText('100');
                          setTempAgeRange({ ...tempAgeRange, max: 100 });
                        } else {
                          setTempAgeMaxText(numValue.toString());
                          setTempAgeRange({ ...tempAgeRange, max: numValue });
                        }
                      }}
                      keyboardType="numeric"
                      placeholder="100"
                    />
                  </View>
                </View>
              </View>

              {/* Max Distance */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Distance maximale (km)</Text>
                <TextInput
                  style={styles.distanceInput}
                  placeholder="Aucune limite"
                  placeholderTextColor={colors.textTertiary}
                  value={tempMaxDistance?.toString() || ''}
                  onChangeText={(text) => {
                    if (text === '') {
                      setTempMaxDistance(null);
                    } else {
                      const value = parseFloat(text);
                      if (!isNaN(value) && value > 0) {
                        setTempMaxDistance(value);
                      }
                    }
                  }}
                  keyboardType="numeric"
                />
              </View>

              {/* Min Rating */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Note minimale</Text>
                <View style={styles.ratingFilterContainer}>
                  {[0, 1, 2, 3, 4, 5].map((rating) => (
                    <TouchableOpacity
                      key={rating}
                      style={[
                        styles.ratingFilterButton,
                        tempMinRating === rating && styles.ratingFilterButtonActive,
                      ]}
                      onPress={() => setTempMinRating(rating)}
                    >
                      <Text
                        style={[
                          styles.ratingFilterText,
                          tempMinRating === rating && styles.ratingFilterTextActive,
                        ]}
                      >
                        {rating === 0 ? 'Tous' : `${rating}+`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>
            <View style={styles.modalActions}>
              <Button
                title="Réinitialiser"
                onPress={resetFilters}
                variant="outline"
                style={styles.modalButton}
              />
              <Button
                title="Appliquer"
                onPress={handleApplyFilters}
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
  filters: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSecondary,
    zIndex: 1,
    backgroundColor: colors.background,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.backgroundTertiary,
  },
  filterButtonActive: {
    backgroundColor: colors.pink600,
  },
  filterText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  filterTextActive: {
    color: colors.text,
  },
  cardContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    overflow: 'hidden',
    zIndex: 0,
    minHeight: 0, // Important pour que flex fonctionne correctement
  },
  card: {
    width: '100%',
    maxWidth: 400,
    height: '100%',
    maxHeight: 600,
    minHeight: 400,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 2,
    borderColor: colors.borderSecondary,
    zIndex: 0,
  },
  cardImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  cardOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  cardInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardName: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  cardSeparator: {
    fontSize: 24,
    color: colors.text,
  },
  cardAge: {
    fontSize: 24,
    color: colors.text,
  },
  cardDescription: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  cardMeta: {
    flexDirection: 'row',
    gap: 16,
  },
  cardMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardMetaText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  viewProfileButton: {
    backgroundColor: colors.pink600,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  viewProfileButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
    paddingVertical: 24,
  },
  actionButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.backgroundTertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonPrimary: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.pink600,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 16,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.backgroundTertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  resetButton: {
    backgroundColor: colors.purple600,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  resetButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: colors.backgroundSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSecondary,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 8,
  },
  cardCounter: {
    alignItems: 'center',
    marginTop: 8,
  },
  counterText: {
    fontSize: 12,
    color: colors.textTertiary,
    fontWeight: '500',
  },
  cardMetaTextSecondary: {
    fontSize: 14,
    color: colors.textTertiary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSecondary,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  modalScroll: {
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  filterSection: {
    marginBottom: 24,
    gap: 12,
  },
  filterSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  ageRangeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ageInputContainer: {
    flex: 1,
    gap: 8,
  },
  ageLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  ageInput: {
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  ageSeparator: {
    fontSize: 18,
    color: colors.textSecondary,
    marginTop: 24,
  },
  distanceInput: {
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  genderFilterContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  genderFilterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
  },
  genderFilterButtonActive: {
    backgroundColor: colors.purple600,
    borderColor: colors.purple600,
  },
  genderFilterText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  genderFilterTextActive: {
    color: colors.text,
  },
  ratingFilterContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  ratingFilterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
  },
  ratingFilterButtonActive: {
    backgroundColor: colors.purple600,
    borderColor: colors.purple600,
  },
  ratingFilterText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  ratingFilterTextActive: {
    color: colors.text,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.borderSecondary,
  },
  modalButton: {
    flex: 1,
    marginTop: 0,
  },
});

