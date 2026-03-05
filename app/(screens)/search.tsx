import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Image, ImageSourcePropType, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View, useWindowDimensions } from 'react-native';
import { PanGestureHandler, PanGestureHandlerGestureEvent } from 'react-native-gesture-handler';
import Animated, {
  Extrapolate,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ImageWithFallback } from '../../components/ImageWithFallback';
import { Button } from '../../components/ui/Button';
import { colors } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';
import { useBooking } from '../../context/BookingContext';
import { useLike } from '../../context/LikeContext';
import { useUser } from '../../context/UserContext';
import { User } from '../../types';

type Filter = 'all' | 'male' | 'female';

/**
 * Fonction utilitaire pour obtenir la source d'image correcte pour React Native Image
 * Gère à la fois les URLs HTTP/HTTPS (Supabase) et les images locales par défaut
 */
const getImageSource = (photoUrl: string | null | undefined, gender: 'male' | 'female' = 'female'): ImageSourcePropType => {
  // Vérifier si on a une URL valide
  if (photoUrl && typeof photoUrl === 'string' && photoUrl.trim() !== '') {
    const trimmedUrl = photoUrl.trim();
    
    // Rejeter les URIs locales (file://) - elles ne sont pas accessibles depuis d'autres appareils
    if (trimmedUrl.startsWith('file://')) {
      return gender === 'male' 
        ? require('../../assets/images/avatar_men.png')
        : require('../../assets/images/avatar_woman.png');
    }
    
    // Si c'est une URL HTTP/HTTPS valide (Supabase Storage, etc.)
    if (trimmedUrl.startsWith('https://') || 
        (trimmedUrl.startsWith('http://') && 
         !trimmedUrl.includes('10.0.2.2') && 
         !trimmedUrl.includes('localhost') &&
         !trimmedUrl.includes('127.0.0.1') &&
         !trimmedUrl.includes('/assets/'))) {
      return { uri: trimmedUrl };
    }
  }
  
  // Sinon, utiliser l'image par défaut selon le genre
  return gender === 'male' 
    ? require('../../assets/images/avatar_men.png')
    : require('../../assets/images/avatar_woman.png');
};

export default function SearchScreen() {
  const router = useRouter();
  const { setSelectedUser } = useUser();
  const { user: currentAuthUser } = useAuth();
  const { getAllUsers } = useBooking();
  const { likeUser, unlikeUser, isUserLiked } = useLike();
  const [filter, setFilter] = useState<Filter>('all');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
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
  const isLoadingRef = React.useRef(false);
  const lastLoadTimeRef = React.useRef<number>(0);
  const hasLoadedRef = React.useRef(false);
  const hasLoadedOnceRef = React.useRef(false); // Pour charger une seule fois à l'arrivée
  
  // Obtenir les dimensions de la fenêtre
  const { width: screenWidth } = useWindowDimensions();
  
  // États pour le swipe
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);
  const SWIPE_THRESHOLD = screenWidth * 0.3; // 30% de l'écran
  const SWIPE_VELOCITY_THRESHOLD = 500;
  const SWIPE_ANIMATION_DURATION = 220;
  const SWIPE_RETURN_SPRING = { damping: 18, stiffness: 220, mass: 0.9 };
  const isSwipeAnimatingRef = React.useRef(false);
  const swipeTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fonction pour calculer si un utilisateur est en ligne
  const calculateOnlineStatus = (lastSeenValue: string | null | undefined): boolean => {
    if (!lastSeenValue) {
      return false; // Pas de last_seen = pas en ligne
    }
    if (lastSeenValue === 'En ligne' || lastSeenValue.toLowerCase() === 'en ligne') {
      return true;
    }
    // Vérifier si c'est une date récente (moins de 5 minutes)
    try {
      const lastSeenDate = new Date(lastSeenValue);
      if (isNaN(lastSeenDate.getTime())) {
        return false; // Date invalide = pas en ligne
      }
      const now = new Date();
      const diffMs = now.getTime() - lastSeenDate.getTime();
      const diffMinutes = diffMs / (1000 * 60);
      return diffMinutes < 5; // En ligne si vu il y a moins de 5 minutes
    } catch {
      return false; // Erreur de parsing = pas en ligne
    }
  };

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
    if (!currentAuthUser) {
      setIsLoading(false);
      isLoadingRef.current = false;
      return;
    }

    // Ne pas charger si le modal de filtres est ouvert pour éviter les re-renders qui ferment le clavier
    if (showFilters) {
      return;
    }

    // Éviter les appels multiples simultanés
    if (isLoadingRef.current) {
      return;
    }

    // Éviter de recharger trop souvent (max 1 fois par seconde)
    const now = Date.now();
    if (!force && hasLoadedRef.current && now - lastLoadTimeRef.current < 1000) {
      return;
    }

    isLoadingRef.current = true;
    setIsLoading(true);
    lastLoadTimeRef.current = now;

    // Ajouter un timeout pour éviter que le chargement reste bloqué
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    timeoutId = setTimeout(() => {
      if (isLoadingRef.current) {
        setIsLoading(false);
        isLoadingRef.current = false;
        // Initialiser avec un tableau vide pour éviter un état bloqué
        setUsers([]);
      }
    }, 15000); // 15 secondes de timeout

    try {
      if (!getAllUsers) {
        console.error('getAllUsers is not available');
        if (timeoutId) clearTimeout(timeoutId);
        setIsLoading(false);
        isLoadingRef.current = false;
        setUsers([]);
        return;
      }

      const availableUsers = await getAllUsers();
      
      // Annuler le timeout si le chargement réussit
      if (timeoutId) clearTimeout(timeoutId);
      
      // Vérifier que availableUsers est un tableau valide
      if (!Array.isArray(availableUsers)) {
        console.error('getAllUsers returned invalid data:', availableUsers);
        setUsers([]);
        setIsLoading(false);
        isLoadingRef.current = false;
        hasLoadedRef.current = true;
        return;
      }
      
      // Convertir les données de la DB en format User
      const formattedUsers: User[] = availableUsers.map((u: any) => ({
        id: u.id,
        pseudo: u.pseudo || 'Utilisateur',
        age: u.age || 25,
        phone: u.phone,
        photo: u.photo || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
        description: u.description || '',
        rating: parseFloat(u.rating) || 0,
        reviewCount: typeof u.review_count === 'number' ? u.review_count : (typeof u.review_count === 'string' ? parseInt(u.review_count, 10) || 0 : 0),
        isSubscribed: u.is_subscribed || false,
        subscriptionStatus: u.subscription_status || 'pending',
        lastSeen: u.last_seen || 'Hors ligne', // Ne pas mettre 'En ligne' par défaut
        gender: (u.gender === 'male' || u.gender === 'female') ? u.gender : 'female', // Garder le genre tel quel s'il est valide, sinon 'female' par défaut
        lat: u.lat ? parseFloat(u.lat) : undefined,
        lng: u.lng ? parseFloat(u.lng) : undefined,
        isAvailable: u.is_available,
      }));

      // Récupérer la position de l'utilisateur actuel
      if (currentAuthUser.lat && currentAuthUser.lng) {
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
    } catch (error: any) {
      if (timeoutId) clearTimeout(timeoutId);
      console.error('Error loading users:', error);
      // En cas d'erreur, initialiser avec un tableau vide pour éviter un état bloqué
      setUsers([]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  }, [currentAuthUser, getAllUsers, showFilters]); // Ajouter showFilters comme dépendance

  // Charger les utilisateurs UNE SEULE FOIS à l'arrivée sur l'onglet Recherche
  useFocusEffect(
    useCallback(() => {
      // Ne pas charger si le modal de filtres est ouvert
      if (showFilters) {
        return;
      }

      // Charger une seule fois à l'arrivée sur l'onglet
      if (!hasLoadedOnceRef.current && currentAuthUser?.id) {
        hasLoadedOnceRef.current = true;
        loadUsers(true);
      } else if (!currentAuthUser?.id) {
        // Si pas d'utilisateur authentifié, arrêter le chargement
        setIsLoading(false);
        isLoadingRef.current = false;
      }

      // Cleanup: ne rien faire quand on quitte l'onglet (on garde les données chargées)
      return () => {
        // On ne recharge pas quand on quitte l'onglet
      };
    }, [currentAuthUser?.id, loadUsers, showFilters])
  );

  // Debounce de la recherche pour éviter un filtrage complet à chaque frappe.
  React.useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim().toLowerCase());
    }, 120);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  // Filtrer les utilisateurs - mémoriser pour éviter les recalculs inutiles
  const filteredUsers = useMemo(() => {
    const normalizedFilter = filter.toLowerCase().trim();
    const query = debouncedSearchQuery;

    return users.filter((user) => {
      // Filtre par genre - comparer strictement avec le genre de l'utilisateur
      if (filter !== 'all') {
        // Normaliser le genre pour la comparaison (en minuscules et supprimer les espaces)
        const userGender = user.gender?.toLowerCase().trim();
        if (userGender !== normalizedFilter) {
          return false;
        }
      }
      
      // Filtre par recherche textuelle
      if (query) {
        const pseudo = user.pseudo?.toLowerCase() || '';
        const description = user.description?.toLowerCase() || '';
        if (!pseudo.includes(query) && !description.includes(query)) {
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
  }, [users, filter, debouncedSearchQuery, ageRange, maxDistance, minRating]);

  // S'assurer que currentIndex est dans les limites du tableau
  const safeIndex = filteredUsers.length > 0 
    ? Math.min(Math.max(0, currentIndex), filteredUsers.length - 1) 
    : 0;
  
  // Si l'index a changé, le mettre à jour
  // Ne pas mettre à jour si le modal de filtres est ouvert pour éviter les re-renders
  React.useEffect(() => {
    // Ne pas mettre à jour si le modal est ouvert
    if (showFilters) {
      return;
    }
    
    if (filteredUsers.length > 0 && currentIndex >= filteredUsers.length) {
      setCurrentIndex(0);
    } else if (filteredUsers.length === 0) {
      setCurrentIndex(0);
    }
  }, [filteredUsers.length, currentIndex, showFilters]);

  const currentUser = filteredUsers.length > 0 ? filteredUsers[safeIndex] : null;
  const currentUserImageSource = currentUser
    ? getImageSource(currentUser.photo, currentUser.gender || 'female')
    : null;
  const isCurrentUserRemoteImage = !!currentUserImageSource &&
    typeof currentUserImageSource === 'object' &&
    'uri' in currentUserImageSource;
  const isCurrentUserOnline = calculateOnlineStatus(currentUser?.lastSeen);
  const currentUserReviewCount = typeof currentUser?.reviewCount === 'number'
    ? currentUser.reviewCount
    : (typeof currentUser?.reviewCount === 'string' ? parseInt(currentUser.reviewCount, 10) || 0 : 0);
  const currentUserDescription = currentUser?.description?.trim()
    ? currentUser.description
    : 'Aucune description pour le moment';

  // Réinitialiser les animations quand l'utilisateur change
  // Ne pas réinitialiser si le modal de filtres est ouvert pour éviter les re-renders
  React.useEffect(() => {
    // Ne pas réinitialiser si le modal est ouvert
    if (showFilters) {
      return;
    }
    
    translateX.value = 0;
    translateY.value = 0;
    opacity.value = 1;
    scale.value = 1;
  }, [currentIndex, currentUser?.id, opacity, scale, showFilters, translateX, translateY]);

  const handleViewProfile = (user: User) => {
    setSelectedUser(user);
    router.push('/(screens)/user-profile');
  };

  const handleNext = () => {
    if (filteredUsers.length === 0) return;
    setCurrentIndex((prev) => (prev < filteredUsers.length - 1 ? prev + 1 : 0));
    // Réinitialiser les animations
    translateX.value = 0;
    translateY.value = 0;
    opacity.value = 1;
    scale.value = 1;
    isSwipeAnimatingRef.current = false;
  };

  const handlePrevious = () => {
    if (filteredUsers.length === 0) return;
    setCurrentIndex((prev) => (
      prev > 0 ? prev - 1 : Math.max(0, filteredUsers.length - 1)
    ));
    // Réinitialiser les animations
    translateX.value = 0;
    translateY.value = 0;
    opacity.value = 1;
    scale.value = 1;
    isSwipeAnimatingRef.current = false;
  };

  // Fonction pour passer au suivant (appelée depuis le geste)
  const goToNext = () => {
    handleNext();
  };

  // Fonction pour passer au précédent (appelée depuis le geste)
  const goToPrevious = () => {
    handlePrevious();
  };

  // Fonction pour liker l'utilisateur actuel (appelée depuis le geste)
  const handleLikeCurrentUser = useCallback(() => {
    if (currentUser && !isUserLiked(currentUser.id)) {
      likeUser(currentUser.id);
    }
  }, [currentUser, isUserLiked, likeUser]);

  // Fonction pour unliker l'utilisateur actuel (appelée depuis le geste)
  const handleUnlikeCurrentUser = useCallback(() => {
    if (currentUser && isUserLiked(currentUser.id)) {
      unlikeUser(currentUser.id);
    }
  }, [currentUser, isUserLiked, unlikeUser]);

  // Gérer le geste de swipe
  const onGestureEvent = (event: PanGestureHandlerGestureEvent) => {
    if (isSwipeAnimatingRef.current) {
      return;
    }

    const { translationX, translationY } = event.nativeEvent;
    
    translateX.value = translationX;
    translateY.value = translationY;
    
    // Calculer l'opacité et l'échelle basées sur la distance
    const distance = Math.max(Math.abs(translationX), Math.abs(translationY) * 0.6);
    const maxDistance = screenWidth * 0.9;
    opacity.value = interpolate(
      distance,
      [0, maxDistance],
      [1, 0],
      Extrapolate.CLAMP
    );
    scale.value = interpolate(
      distance,
      [0, maxDistance],
      [1, 0.8],
      Extrapolate.CLAMP
    );
  };

  // Gérer la fin du geste
  const onHandlerStateChange = (event: PanGestureHandlerGestureEvent) => {
    if (isSwipeAnimatingRef.current) {
      return;
    }

    const { translationX, velocityX, state } = event.nativeEvent;
    
    if (state === 5) { // END
      const shouldSwipeLeft = translationX < -SWIPE_THRESHOLD || velocityX < -SWIPE_VELOCITY_THRESHOLD;
      const shouldSwipeRight = translationX > SWIPE_THRESHOLD || velocityX > SWIPE_VELOCITY_THRESHOLD;
      
      if (shouldSwipeLeft) {
        isSwipeAnimatingRef.current = true;
        if (swipeTimeoutRef.current) {
          clearTimeout(swipeTimeoutRef.current);
          swipeTimeoutRef.current = null;
        }
        swipeTimeoutRef.current = setTimeout(() => {
          isSwipeAnimatingRef.current = false;
          swipeTimeoutRef.current = null;
        }, SWIPE_ANIMATION_DURATION + 120);

        // Swipe vers la gauche - si déjà liké, enlever le like
        runOnJS(handleUnlikeCurrentUser)();
        // Swipe vers la gauche (suivant)
        translateX.value = withTiming(-screenWidth * 1.2, { duration: SWIPE_ANIMATION_DURATION });
        opacity.value = withTiming(0, { duration: SWIPE_ANIMATION_DURATION });
        scale.value = withTiming(0.86, { duration: SWIPE_ANIMATION_DURATION }, () => {
          runOnJS(goToNext)();
        });
      } else if (shouldSwipeRight) {
        isSwipeAnimatingRef.current = true;
        if (swipeTimeoutRef.current) {
          clearTimeout(swipeTimeoutRef.current);
          swipeTimeoutRef.current = null;
        }
        swipeTimeoutRef.current = setTimeout(() => {
          isSwipeAnimatingRef.current = false;
          swipeTimeoutRef.current = null;
        }, SWIPE_ANIMATION_DURATION + 120);

        // Swipe vers la droite (côté cœur) - like automatique
        runOnJS(handleLikeCurrentUser)();
        // Swipe vers la droite (précédent)
        translateX.value = withTiming(screenWidth * 1.2, { duration: SWIPE_ANIMATION_DURATION });
        opacity.value = withTiming(0, { duration: SWIPE_ANIMATION_DURATION });
        scale.value = withTiming(0.86, { duration: SWIPE_ANIMATION_DURATION }, () => {
          runOnJS(goToPrevious)();
        });
      } else {
        // Retour à la position initiale
        translateX.value = withSpring(0, SWIPE_RETURN_SPRING);
        translateY.value = withSpring(0, SWIPE_RETURN_SPRING);
        opacity.value = withSpring(1, SWIPE_RETURN_SPRING);
        scale.value = withSpring(1, SWIPE_RETURN_SPRING);
      }
    }
  };

  React.useEffect(() => {
    return () => {
      if (swipeTimeoutRef.current) {
        clearTimeout(swipeTimeoutRef.current);
      }
    };
  }, []);

  // Style animé pour la carte
  const animatedCardStyle = useAnimatedStyle(() => {
    const rotation = interpolate(
      translateX.value,
      [-screenWidth, 0, screenWidth],
      [-15, 0, 15],
      Extrapolate.CLAMP
    );

    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rotation}deg` },
        { scale: scale.value },
      ],
      opacity: opacity.value,
    };
  });

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
  const handleApplyFilters = useCallback(() => {
    // Valider et normaliser les valeurs d'âge avant d'appliquer
    // Lire directement depuis les états temporaires actuels
    const minAge = parseInt(tempAgeMinText) || 18;
    const maxAge = parseInt(tempAgeMaxText) || 100;
    const normalizedMin = Math.max(18, Math.min(100, minAge));
    const normalizedMax = Math.max(18, Math.min(100, maxAge));
    
    // S'assurer que min <= max
    const finalMin = Math.min(normalizedMin, normalizedMax);
    const finalMax = Math.max(normalizedMin, normalizedMax);
    
    // Utiliser les valeurs temporaires actuelles (celles modifiées dans le modal)
    // Appliquer les filtres avec les valeurs temporaires actuelles
    setFilter(tempFilter);
    setAgeRange({ min: finalMin, max: finalMax });
    setMaxDistance(tempMaxDistance);
    setMinRating(tempMinRating);
    
    // Mettre à jour les valeurs temporaires pour qu'elles correspondent aux valeurs appliquées
    setTempAgeRange({ min: finalMin, max: finalMax });
    setTempAgeMinText(finalMin.toString());
    setTempAgeMaxText(finalMax.toString());
    
    setShowFilters(false);
    setCurrentIndex(0);
  }, [tempFilter, tempMaxDistance, tempMinRating, tempAgeMinText, tempAgeMaxText]); // Dépendances pour garantir que la fonction utilise les valeurs actuelles

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
            <TouchableOpacity onPress={() => {
              Keyboard.dismiss();
              setSearchQuery('');
            }}>
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
          statusBarTranslucent
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
            <TouchableOpacity onPress={() => {
              Keyboard.dismiss();
              setSearchQuery('');
            }}>
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
          statusBarTranslucent
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

  return (
    <SafeAreaView style={styles.container}>
      <Pressable style={{ flex: 1 }} onPress={Keyboard.dismiss}>
        {/* Header */}
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
        <Pressable onPress={(e) => e.stopPropagation()}>
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
              <TouchableOpacity onPress={() => {
                Keyboard.dismiss();
                setSearchQuery('');
              }}>
                <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>
        </Pressable>

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
        <PanGestureHandler
          onGestureEvent={onGestureEvent}
          onHandlerStateChange={onHandlerStateChange}
        >
          <Animated.View style={[styles.card, animatedCardStyle]}>
            {currentUser && (
              <>
                <View style={styles.cardImageContainer}>
                  {currentUserImageSource && isCurrentUserRemoteImage ? (
                    <ImageWithFallback
                      source={currentUserImageSource}
                      style={styles.cardImage}
                    />
                  ) : currentUserImageSource ? (
                    <Image
                      source={currentUserImageSource}
                      style={styles.cardImage}
                      resizeMode="cover"
                    />
                  ) : null}
                  {isCurrentUserOnline ? <View style={styles.onlineBadge} /> : null}
                </View>
                <View style={styles.cardOverlay} />
                <View style={styles.cardInfo}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardNameRow}>
                      <Text style={styles.cardName}>{currentUser.pseudo}</Text>
                      <Text style={styles.cardSeparator}>·</Text>
                      <Text style={styles.cardAge}>{currentUser.age} ans</Text>
                    </View>
                    <Text style={styles.cardGender}>
                      {currentUser.gender === 'male' ? 'Homme' : currentUser.gender === 'female' ? 'Femme' : ''}
                    </Text>
                  </View>
                  <Text style={styles.cardDescription}>{currentUserDescription}</Text>
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
                      {currentUserReviewCount > 0 ? (
                        <Text style={styles.cardMetaText}>
                          ({currentUserReviewCount} avis)
                        </Text>
                      ) : (
                        <Text style={styles.cardMetaTextSecondary}>
                          (Aucun avis)
                        </Text>
                      )}
                    </View>
                    <View style={styles.cardMetaItem}>
                      <Ionicons
                        name="ellipse"
                        size={12}
                        color={isCurrentUserOnline ? colors.green500 : colors.textTertiary}
                      />
                      <Text style={styles.cardMetaText}>
                        {isCurrentUserOnline ? 'En ligne' : 'Hors ligne'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.cardCounter}>
                    <Text style={styles.counterText}>
                      {safeIndex + 1} / {filteredUsers.length}
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
          </Animated.View>
        </PanGestureHandler>
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
      </Pressable>

      {/* Filters Modal */}
      <Modal
        statusBarTranslucent
        visible={showFilters}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFilters(false)}
        onDismiss={() => Keyboard.dismiss()}
      >
        <TouchableWithoutFeedback 
          onPress={() => {
            Keyboard.dismiss();
            setShowFilters(false);
          }}
        >
          <View style={styles.modalOverlay}>
            <Pressable 
              style={styles.modalContent}
              onPress={(e) => {
                // Empêcher la propagation pour que le modal ne se ferme pas
                e.stopPropagation();
              }}
            >
            <KeyboardAvoidingView
              style={styles.modalContentInner}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
              enabled={Platform.OS === 'ios'}
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Filtres avancés</Text>
                <TouchableOpacity onPress={() => {
                  Keyboard.dismiss();
                  setShowFilters(false);
                }}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
              <ScrollView
                style={styles.modalScroll}
                contentContainerStyle={styles.modalScrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="none"
                nestedScrollEnabled={true}
              >
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
            </KeyboardAvoidingView>
            </Pressable>
          </View>
        </TouchableWithoutFeedback>
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
    overflow: 'visible', // Permettre à la carte de sortir de l'écran lors du swipe
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
  cardImageContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  cardImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.green500,
    borderWidth: 3,
    borderColor: colors.background,
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
    flexDirection: 'column',
    gap: 4,
  },
  cardNameRow: {
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
  cardGender: {
    fontSize: 18,
    color: colors.textSecondary,
    textTransform: 'capitalize',
  },
  cardDescription: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  cardMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%', // Augmenter légèrement la hauteur maximale
    paddingBottom: 0, // Le padding sera géré par modalActions
    width: '100%',
    minHeight: 200, // Hauteur minimale pour s'assurer que le modal est visible
  },
  modalContentInner: {
    width: '100%',
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
  modalScrollContent: {
    paddingBottom: 100, // Espace supplémentaire pour permettre le scroll jusqu'au champ de distance quand le clavier est ouvert
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
    paddingBottom: 80, // Espace supplémentaire pour éviter que les boutons soient cachés par la barre de navigation et les icônes du téléphone
    borderTopWidth: 1,
    borderTopColor: colors.borderSecondary,
    marginBottom: 0,
  },
  modalButton: {
    flex: 1,
    marginTop: 0,
  },
});

