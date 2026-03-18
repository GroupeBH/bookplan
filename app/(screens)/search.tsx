import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { clampPointToDRC, DRC_CAMERA_BOUNDS, DRC_DEFAULT_REGION, isPointInDRC } from '../../lib/drcMap';
import { isMapboxAvailable } from '../../lib/mapbox';
import { User } from '../../types';

type Filter = 'all' | 'male' | 'female';
type SearchTab = 'discover' | 'nearby';

// Import conditionnel de Mapbox
let Mapbox: any = null;
let MapView: any = null;
let PointAnnotation: any = null;
let Camera: any = null;

if (isMapboxAvailable) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mapboxModule = require('@rnmapbox/maps');
    Mapbox = mapboxModule.default;
    MapView = mapboxModule.MapView;
    PointAnnotation = mapboxModule.PointAnnotation;
    Camera = mapboxModule.Camera;
  } catch {
    console.warn('Failed to load Mapbox components in search screen');
  }
}

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
  const { getAllUsers, getAvailableUsers } = useBooking();
  const { likeUser, unlikeUser, isUserLiked } = useLike();
  const isScreenFocused = useIsFocused();
  const [activeTab, setActiveTab] = useState<SearchTab>('discover');
  const [filter, setFilter] = useState<Filter>('all');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [nearbyUsers, setNearbyUsers] = useState<User[]>([]);
  const [deviceNearbyLocation, setDeviceNearbyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [nearbyMapReady, setNearbyMapReady] = useState(false);
  const [isLoadingNearby, setIsLoadingNearby] = useState(false);
  const [showNearbyMap, setShowNearbyMap] = useState(false);
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
  const getAvailableUsersRef = React.useRef(getAvailableUsers);
  const nearbyLocationSubscriptionRef = React.useRef<Location.LocationSubscription | null>(null);
  const hasLoadedNearbyOnceRef = React.useRef(false);
  const nearbyDataSignatureRef = React.useRef('');
  const nearbyFetchSequenceRef = React.useRef(0);
  const isNearbyContextActiveRef = React.useRef(false);
  
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

  const setDeviceNearbyLocationSafe = useCallback((next: { lat: number; lng: number }) => {
    setDeviceNearbyLocation((prev) => {
      if (!prev) return next;
      const latDiff = Math.abs(prev.lat - next.lat);
      const lngDiff = Math.abs(prev.lng - next.lng);
      // Evite les rerenders inutiles sur de micro-variations GPS.
      if (latDiff < 0.00005 && lngDiff < 0.00005) {
        return prev;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    getAvailableUsersRef.current = getAvailableUsers;
  }, [getAvailableUsers]);

  useEffect(() => {
    const isNearbyActive = activeTab === 'nearby' && isScreenFocused;
    isNearbyContextActiveRef.current = isNearbyActive;

    if (!isNearbyActive) {
      // Invalide les reponses async en vol quand on quitte Recherche.
      nearbyFetchSequenceRef.current += 1;
    }
  }, [activeTab, isScreenFocused]);

  const refreshDeviceNearbyLocation = useCallback(async () => {
    try {
      let permission = await Location.getForegroundPermissionsAsync();

      if (permission.status !== 'granted' && permission.canAskAgain) {
        permission = await Location.requestForegroundPermissionsAsync();
      }

      if (permission.status !== 'granted') {
        return;
      }

      let nextPoint: { lat: number; lng: number } | null = null;
      const lastKnownLocation = await Location.getLastKnownPositionAsync();
      if (lastKnownLocation?.coords) {
        const bounded = clampPointToDRC(lastKnownLocation.coords.latitude, lastKnownLocation.coords.longitude);
        nextPoint = { lat: bounded.lat, lng: bounded.lng };
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      if (currentLocation?.coords) {
        const bounded = clampPointToDRC(currentLocation.coords.latitude, currentLocation.coords.longitude);
        nextPoint = { lat: bounded.lat, lng: bounded.lng };
      }

      if (nextPoint && isNearbyContextActiveRef.current) {
        setDeviceNearbyLocationSafe(nextPoint);
        AsyncStorage.setItem('user_location', JSON.stringify(nextPoint)).catch(() => {});
      }
    } catch {
      // no-op: fallback sur la position profil
    }
  }, [setDeviceNearbyLocationSafe]);

  const nearbyCenter = useMemo(() => {
    if (deviceNearbyLocation) {
      return deviceNearbyLocation;
    }
    const lat = Number(currentAuthUser?.lat);
    const lng = Number(currentAuthUser?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const bounded = clampPointToDRC(lat, lng);
    return { lat: bounded.lat, lng: bounded.lng };
  }, [currentAuthUser?.lat, currentAuthUser?.lng, deviceNearbyLocation]);
  const nearbyCenterLat = nearbyCenter?.lat ?? null;
  const nearbyCenterLng = nearbyCenter?.lng ?? null;

  const loadNearbyUsers = useCallback(async (silent = false) => {
    if (!currentAuthUser?.id || nearbyCenterLat === null || nearbyCenterLng === null) {
      if (isNearbyContextActiveRef.current) {
        setNearbyUsers([]);
        if (!silent) setIsLoadingNearby(false);
      }
      return;
    }

    const requestSequence = ++nearbyFetchSequenceRef.current;
    const getAvailableUsersFn = getAvailableUsersRef.current;
    if (!getAvailableUsersFn) {
      if (isNearbyContextActiveRef.current) {
        setNearbyUsers([]);
        if (!silent) setIsLoadingNearby(false);
      }
      return;
    }

    if (!silent && !hasLoadedNearbyOnceRef.current) {
      setIsLoadingNearby(true);
    }
    try {
      const availableNearbyUsers = await getAvailableUsersFn({
        center: { lat: nearbyCenterLat, lng: nearbyCenterLng },
        radiusKm: 10,
        onlineWithinMinutes: 2,
      });

      if (
        !isNearbyContextActiveRef.current ||
        requestSequence !== nearbyFetchSequenceRef.current
      ) {
        return;
      }

      if (!Array.isArray(availableNearbyUsers)) {
        if (!silent) {
          setNearbyUsers([]);
        }
        return;
      }

      const formattedNearby: User[] = availableNearbyUsers
        .map((u: any) => {
          const lat = u.lat != null ? Number(u.lat) : undefined;
          const lng = u.lng != null ? Number(u.lng) : undefined;
          const userGender = (u.gender === 'male' || u.gender === 'female') ? u.gender : 'female';
          const distance =
            lat !== undefined && lng !== undefined && Number.isFinite(lat) && Number.isFinite(lng)
              ? calculateDistance(nearbyCenterLat, nearbyCenterLng, lat, lng)
              : undefined;

          return {
            id: u.id,
            pseudo: u.pseudo || 'Utilisateur',
            age: u.age || 25,
            phone: u.phone,
            photo: u.photo || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
            description: u.description || '',
            rating: parseFloat(u.rating) || 0,
            reviewCount: typeof u.review_count === 'number'
              ? u.review_count
              : (typeof u.review_count === 'string' ? parseInt(u.review_count, 10) || 0 : 0),
            isSubscribed: u.is_subscribed || false,
            subscriptionStatus: u.subscription_status || 'pending',
            lastSeen: u.last_seen || 'Hors ligne',
            gender: userGender,
            lat: lat !== undefined && Number.isFinite(lat) ? lat : undefined,
            lng: lng !== undefined && Number.isFinite(lng) ? lng : undefined,
            isAvailable: u.is_available,
            distance,
          } as User;
        })
        .filter((u) => {
          if (u.lat === undefined || u.lng === undefined) return false;
          if (!isPointInDRC(u.lat, u.lng)) return false;
          if (u.distance === undefined || !Number.isFinite(u.distance)) return false;
          if (u.distance > 10) return false;
          return true;
        })
        .sort((a, b) => {
          const aOnline = calculateOnlineStatus(a.lastSeen);
          const bOnline = calculateOnlineStatus(b.lastSeen);
          if (aOnline !== bOnline) {
            return aOnline ? -1 : 1;
          }
          return (a.distance || 999) - (b.distance || 999);
        });

      const nextSignature = formattedNearby
        .map((u) => `${u.id}:${u.distance?.toFixed(2) ?? 'na'}:${u.lastSeen ?? ''}`)
        .join('|');
      if (nextSignature !== nearbyDataSignatureRef.current) {
        nearbyDataSignatureRef.current = nextSignature;
        setNearbyUsers(formattedNearby);
      }
      hasLoadedNearbyOnceRef.current = true;
    } catch (error) {
      console.error('Error loading nearby users in search:', error);
      if (!silent && !hasLoadedNearbyOnceRef.current) {
        setNearbyUsers([]);
      }
    } finally {
      if (
        !silent &&
        isNearbyContextActiveRef.current &&
        requestSequence === nearbyFetchSequenceRef.current
      ) {
        setIsLoadingNearby(false);
      }
    }
  }, [currentAuthUser?.id, nearbyCenterLat, nearbyCenterLng]);

  useEffect(() => {
    if (activeTab !== 'nearby' || !isScreenFocused) {
      return;
    }

    const hydrateFromCache = async () => {
      try {
        const cachedLocationStr = await AsyncStorage.getItem('user_location');
        if (!cachedLocationStr) return;
        const cachedLocation = JSON.parse(cachedLocationStr);
        if (!Number.isFinite(cachedLocation?.lat) || !Number.isFinite(cachedLocation?.lng)) return;
        if (!isNearbyContextActiveRef.current) return;
        const bounded = clampPointToDRC(cachedLocation.lat, cachedLocation.lng);
        setDeviceNearbyLocationSafe({ lat: bounded.lat, lng: bounded.lng });
      } catch {
        // no-op
      }
    };

    hydrateFromCache();
  }, [activeTab, isScreenFocused, setDeviceNearbyLocationSafe]);

  useEffect(() => {
    if (activeTab !== 'nearby' || !isScreenFocused) {
      return;
    }

    refreshDeviceNearbyLocation();
    const gpsIntervalId = setInterval(() => {
      refreshDeviceNearbyLocation();
    }, 30000);

    return () => {
      clearInterval(gpsIntervalId);
    };
  }, [activeTab, isScreenFocused, refreshDeviceNearbyLocation]);

  useEffect(() => {
    if (activeTab !== 'nearby' || !isScreenFocused) {
      return;
    }

    let disposed = false;

    const startLocationWatch = async () => {
      try {
        let permission = await Location.getForegroundPermissionsAsync();

        if (permission.status !== 'granted' && permission.canAskAgain) {
          permission = await Location.requestForegroundPermissionsAsync();
        }

        if (permission.status !== 'granted') {
          return;
        }

        const subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 10000,
            distanceInterval: 10,
          },
          (location) => {
            if (!isNearbyContextActiveRef.current) {
              return;
            }
            const bounded = clampPointToDRC(location.coords.latitude, location.coords.longitude);
            const nextPoint = { lat: bounded.lat, lng: bounded.lng };
            setDeviceNearbyLocationSafe(nextPoint);
            AsyncStorage.setItem('user_location', JSON.stringify(nextPoint)).catch(() => {});
          }
        );

        if (disposed) {
          subscription.remove();
          return;
        }

        nearbyLocationSubscriptionRef.current = subscription;
      } catch {
        // no-op
      }
    };

    startLocationWatch();

    return () => {
      disposed = true;
      if (nearbyLocationSubscriptionRef.current) {
        nearbyLocationSubscriptionRef.current.remove();
        nearbyLocationSubscriptionRef.current = null;
      }
    };
  }, [activeTab, isScreenFocused, setDeviceNearbyLocationSafe]);

  useEffect(() => {
    if (activeTab !== 'nearby' || !isScreenFocused) {
      return;
    }

    if (hasLoadedNearbyOnceRef.current) {
      loadNearbyUsers(true);
    } else {
      loadNearbyUsers();
    }
    const intervalId = setInterval(() => {
      loadNearbyUsers(true);
    }, 10000);

    return () => {
      clearInterval(intervalId);
    };
  }, [activeTab, isScreenFocused, loadNearbyUsers]);

  useEffect(() => {
    if (activeTab !== 'nearby') {
      setShowNearbyMap(false);
      setNearbyMapReady(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'nearby' || nearbyMapReady) {
      return;
    }
    const readyFallbackTimer = setTimeout(() => {
      setNearbyMapReady(true);
    }, 1200);
    return () => clearTimeout(readyFallbackTimer);
  }, [activeTab, nearbyMapReady]);

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

  const renderSearchTabs = () => (
    <View style={styles.searchTabs}>
      <TouchableOpacity
        style={[styles.searchTabButton, activeTab === 'discover' && styles.searchTabButtonActive]}
        onPress={() => setActiveTab('discover')}
      >
        <Ionicons
          name="sparkles-outline"
          size={16}
          color={activeTab === 'discover' ? colors.text : colors.textSecondary}
        />
        <Text style={[styles.searchTabText, activeTab === 'discover' && styles.searchTabTextActive]}>
          Decouverte
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.searchTabButton, activeTab === 'nearby' && styles.searchTabButtonActive]}
        onPress={() => setActiveTab('nearby')}
      >
        <Ionicons
          name="location-outline"
          size={16}
          color={activeTab === 'nearby' ? colors.text : colors.textSecondary}
        />
        <Text style={[styles.searchTabText, activeTab === 'nearby' && styles.searchTabTextActive]}>
          A proximite
        </Text>
      </TouchableOpacity>
    </View>
  );

  const mapCenter = nearbyCenter ?? {
    lat: DRC_DEFAULT_REGION.latitude,
    lng: DRC_DEFAULT_REGION.longitude,
  };
  const nearbyActiveCount = nearbyUsers.filter((u) => calculateOnlineStatus(u.lastSeen)).length;

  const renderNearbyMap = (mapStyle: any, mapIdSuffix: 'inline' | 'modal') => {
    if (!isMapboxAvailable || !Mapbox || !Mapbox.StyleURL || !MapView || !Camera) {
      return (
        <View style={styles.mapPlaceholder}>
          <Ionicons name="map-outline" size={48} color={colors.purple400} />
          <Text style={styles.mapPlaceholderText}>Carte non disponible</Text>
        </View>
      );
    }

    const visibleNearbyUsers = nearbyUsers.filter(
      (nearbyUser) =>
        nearbyUser.lat !== undefined &&
        nearbyUser.lng !== undefined &&
        isPointInDRC(nearbyUser.lat, nearbyUser.lng)
    );

    const distanceMetersBetween = (aLat: number, aLng: number, bLat: number, bLng: number) =>
      calculateDistance(aLat, aLng, bLat, bLng) * 1000;

    const offsetCoordinateByMeters = (
      lat: number,
      lng: number,
      meters: number,
      bearingRad: number
    ) => {
      const metersPerDegLat = 111320;
      const metersPerDegLng = Math.max(111320 * Math.cos((lat * Math.PI) / 180), 1e-6);

      const latOffset = (Math.cos(bearingRad) * meters) / metersPerDegLat;
      const lngOffset = (Math.sin(bearingRad) * meters) / metersPerDegLng;

      return {
        lat: lat + latOffset,
        lng: lng + lngOffset,
      };
    };

    const hashToAngle = (input: string) => {
      let hash = 2166136261;
      for (let i = 0; i < input.length; i += 1) {
        hash ^= input.charCodeAt(i);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
      }
      const normalized = Math.abs(hash) % 360;
      return (normalized * Math.PI) / 180;
    };

    const MIN_DISTANCE_FROM_CURRENT_M = 18;
    const MIN_DISTANCE_BETWEEN_USERS_M = 14;
    const MAX_VISUAL_SHIFT_M = 42;

    const placedMarkers: { lat: number; lng: number }[] = [];

    const nearbyMarkerData = visibleNearbyUsers.map((nearbyUser) => {
      const originalLat = nearbyUser.lat as number;
      const originalLng = nearbyUser.lng as number;

      let markerLat = originalLat;
      let markerLng = originalLng;

      const initialDistanceFromCurrent = distanceMetersBetween(
        mapCenter.lat,
        mapCenter.lng,
        originalLat,
        originalLng
      );

      const overlapsCurrent = () =>
        distanceMetersBetween(mapCenter.lat, mapCenter.lng, markerLat, markerLng) <
        MIN_DISTANCE_FROM_CURRENT_M;

      const overlapsOtherMarker = () =>
        placedMarkers.some(
          (placed) =>
            distanceMetersBetween(placed.lat, placed.lng, markerLat, markerLng) <
            MIN_DISTANCE_BETWEEN_USERS_M
        );

      if (overlapsCurrent() || overlapsOtherMarker()) {
        const baseAngle = hashToAngle(nearbyUser.id);
        const directionFromCurrent =
          initialDistanceFromCurrent > 0.5
            ? Math.atan2(originalLng - mapCenter.lng, originalLat - mapCenter.lat)
            : baseAngle;

        for (let attempt = 0; attempt < 10; attempt += 1) {
          const pushFromCurrent = Math.max(
            0,
            MIN_DISTANCE_FROM_CURRENT_M - initialDistanceFromCurrent
          );
          const shiftMeters = Math.min(MAX_VISUAL_SHIFT_M, 6 + pushFromCurrent + attempt * 4);
          const angle = directionFromCurrent + attempt * (Math.PI / 6);
          const candidate = offsetCoordinateByMeters(originalLat, originalLng, shiftMeters, angle);

          if (!isPointInDRC(candidate.lat, candidate.lng)) {
            continue;
          }

          markerLat = candidate.lat;
          markerLng = candidate.lng;

          if (!overlapsCurrent() && !overlapsOtherMarker()) {
            break;
          }
        }
      }

      placedMarkers.push({ lat: markerLat, lng: markerLng });

      return {
        user: nearbyUser,
        markerLat,
        markerLng,
      };
    });

    return (
      <MapView
        style={mapStyle}
        styleURL={Mapbox.StyleURL.Street}
        logoEnabled={false}
        attributionEnabled={false}
        onDidFinishLoadingMap={() => {
          if (!nearbyMapReady) {
            setTimeout(() => setNearbyMapReady(true), 100);
          }
        }}
      >
        <Camera
          maxBounds={DRC_CAMERA_BOUNDS}
          centerCoordinate={[mapCenter.lng, mapCenter.lat]}
          zoomLevel={13}
          animationMode="moveTo"
          animationDuration={0}
        />
        {PointAnnotation
          ? nearbyMarkerData.map(({ user: nearbyUser, markerLat, markerLng }) => (
                <PointAnnotation
                  key={`nearby-map-${mapIdSuffix}-${nearbyUser.id}`}
                  id={`nearby-map-${mapIdSuffix}-${nearbyUser.id}`}
                  coordinate={[markerLng, markerLat]}
                  anchor={{ x: 0.5, y: 0.5 }}
                >
                  <View style={styles.nearbyMapUserMarker}>
                    <Ionicons name="person-outline" size={12} color="#ffffff" />
                  </View>
                </PointAnnotation>
              ))
          : null}
        {PointAnnotation &&
        Number.isFinite(mapCenter.lat) &&
        Number.isFinite(mapCenter.lng) ? (
          <PointAnnotation
            id={`nearby-current-user-${mapIdSuffix}`}
            coordinate={[mapCenter.lng, mapCenter.lat]}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.nearbyMapCurrentMarker}>
              <Ionicons name="person" size={14} color="#ffffff" />
            </View>
          </PointAnnotation>
        ) : null}
      </MapView>
    );
  };

  if (activeTab === 'nearby') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Recherche</Text>
          <TouchableOpacity
            onPress={() => setShowNearbyMap(true)}
          >
            <Ionicons
              name="map-outline"
              size={24}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        </View>

        {renderSearchTabs()}

        <ScrollView
          style={styles.nearbyContentScroll}
          contentContainerStyle={styles.nearbyContentScrollInner}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.proximityIntroCard}>
            <Text style={styles.proximityIntroTitle}>Profils connectes autour de toi</Text>
            <Text style={styles.proximityIntroSubtitle}>
              Affichage en direct des profils en ligne dans un rayon de 10 km.
            </Text>
          </View>

          <View style={styles.nearbyToolbar}>
            <View style={styles.nearbyPillsRow}>
              <View style={styles.nearbyCountPill}>
                <Ionicons name="people-outline" size={14} color={colors.pink500} />
                <Text style={styles.nearbyCountText} numberOfLines={1}>
                  {nearbyUsers.length} profil{nearbyUsers.length > 1 ? 's' : ''} trouves
                </Text>
              </View>
              <View style={styles.nearbyActivePill}>
                <Ionicons name="radio-button-on" size={10} color={colors.green400} />
                <Text style={styles.nearbyActiveText} numberOfLines={1}>
                  {nearbyActiveCount} actif{nearbyActiveCount > 1 ? 's' : ''} maintenant
                </Text>
              </View>
            </View>
          </View>

          {isLoadingNearby ? (
            <View style={styles.nearbyLiveHint}>
              <Ionicons name="sync-outline" size={12} color={colors.textSecondary} />
              <Text style={styles.nearbyLiveHintText}>Mise a jour en direct...</Text>
            </View>
          ) : null}

          {nearbyCenter ? (
            <View style={styles.nearbyInlineMapSection}>
              <View style={styles.nearbyInlineMapHeader}>
                <Text style={styles.nearbyInlineMapTitle}>Carte des profils a proximite</Text>
                <TouchableOpacity onPress={() => setShowNearbyMap(true)} activeOpacity={0.8}>
                  <Text style={styles.nearbyInlineMapLink}>Agrandir</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.nearbyInlineMapContainer}>
                {renderNearbyMap(styles.nearbyInlineMap, 'inline')}
              </View>
            </View>
          ) : null}

          {nearbyCenter ? (
            <View style={styles.nearbyListHeader}>
              <Text style={styles.nearbyListTitle}>Profils a proximite (temps reel)</Text>
            </View>
          ) : null}

          {!nearbyCenter ? (
            <View style={styles.nearbyStateCard}>
              <Text style={styles.nearbyStateTitle}>Position indisponible</Text>
              <Text style={styles.nearbyStateSubtitle}>
                Active la localisation pour afficher les profils a proximite.
              </Text>
            </View>
          ) : isLoadingNearby && nearbyUsers.length === 0 ? (
            <View style={styles.nearbyStateCard}>
              <Text style={styles.nearbyStateTitle}>Chargement des profils proches...</Text>
            </View>
          ) : nearbyUsers.length === 0 ? (
            <View style={styles.nearbyStateCard}>
              <Text style={styles.nearbyStateTitle}>Aucun profil a proximite</Text>
              <Text style={styles.nearbyStateSubtitle}>
                Aucun profil detecte dans un rayon de 10 km pour le moment.
              </Text>
            </View>
          ) : (
            <View style={styles.nearbyCardsList}>
              {nearbyUsers.map((nearbyUser) => {
              const nearbyImageSource = getImageSource(nearbyUser.photo, nearbyUser.gender || 'female');
              const isNearbyRemoteImage =
                !!nearbyImageSource &&
                typeof nearbyImageSource === 'object' &&
                'uri' in nearbyImageSource;
              const isNearbyOnline = calculateOnlineStatus(nearbyUser.lastSeen);
              const nearbyStatusLabel = isNearbyOnline ? 'Actif maintenant' : 'Hors ligne';

              return (
                <TouchableOpacity
                  key={nearbyUser.id}
                  style={styles.nearbyCard}
                  activeOpacity={0.8}
                  onPress={() => handleViewProfile(nearbyUser)}
                >
                  <View style={styles.nearbyCardImageWrap}>
                    {isNearbyRemoteImage ? (
                      <ImageWithFallback source={nearbyImageSource} style={styles.nearbyCardImage} />
                    ) : (
                      <Image source={nearbyImageSource} style={styles.nearbyCardImage} resizeMode="cover" />
                    )}
                    {calculateOnlineStatus(nearbyUser.lastSeen) ? <View style={styles.nearbyOnlineDot} /> : null}
                  </View>
                  <View style={styles.nearbyCardBody}>
                    <View style={styles.nearbyCardHeader}>
                      <Text style={styles.nearbyCardName}>{nearbyUser.pseudo}</Text>
                      <View
                        style={[
                          styles.nearbyStatusPill,
                          isNearbyOnline
                            ? styles.nearbyStatusPillOnline
                            : styles.nearbyStatusPillOffline,
                        ]}
                      >
                        <View
                          style={[
                            styles.nearbyStatusDot,
                            { backgroundColor: isNearbyOnline ? colors.green500 : colors.textTertiary },
                          ]}
                        />
                        <Text
                          style={[
                            styles.nearbyStatusText,
                            isNearbyOnline
                              ? styles.nearbyStatusTextOnline
                              : styles.nearbyStatusTextOffline,
                          ]}
                        >
                          {nearbyStatusLabel}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.nearbyCardDescription} numberOfLines={1}>
                      {nearbyUser.description?.trim() || 'Aucune description'}
                    </Text>
                    <View style={styles.nearbyMetaRow}>
                      <View style={styles.nearbyMetaItem}>
                        <Ionicons name="location-outline" size={12} color={colors.textSecondary} />
                        <Text style={styles.nearbyMetaText}>
                          {nearbyUser.distance !== undefined ? `${nearbyUser.distance.toFixed(1)} km` : 'N/A'}
                        </Text>
                      </View>
                      <View style={styles.nearbyMetaItem}>
                        <Ionicons name="star" size={12} color={colors.yellow500} />
                        <Text style={styles.nearbyMetaText}>
                          {(nearbyUser.rating || 0).toFixed(1)}
                        </Text>
                      </View>
                      <View style={styles.nearbyMetaItem}>
                        <Ionicons name="person-outline" size={12} color={colors.textSecondary} />
                        <Text style={styles.nearbyMetaText}>{nearbyUser.age} ans</Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.nearbyCardArrowWrap}>
                    <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                  </View>
                </TouchableOpacity>
              );
              })}
            </View>
          )}
        </ScrollView>

        <Modal
          statusBarTranslucent
          visible={showNearbyMap}
          transparent={false}
          animationType="slide"
          onRequestClose={() => setShowNearbyMap(false)}
        >
          <SafeAreaView style={styles.proximityMapModal}>
            <View style={styles.proximityMapHeader}>
              <Text style={styles.proximityMapTitle}>Carte des profils a proximite</Text>
              <TouchableOpacity onPress={() => setShowNearbyMap(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.proximityMapBody}>
              {renderNearbyMap(styles.proximityMap, 'modal')}
            </View>
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    );
  }

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
        {renderSearchTabs()}
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
        {renderSearchTabs()}

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
        {renderSearchTabs()}

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
        {renderSearchTabs()}

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
  searchTabs: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSecondary,
    backgroundColor: colors.background,
  },
  searchTabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
    paddingVertical: 10,
    backgroundColor: colors.backgroundSecondary,
  },
  searchTabButtonActive: {
    backgroundColor: colors.pink600,
    borderColor: colors.pink600,
  },
  searchTabText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  searchTabTextActive: {
    color: colors.text,
  },
  disabledMapButton: {
    opacity: 0.5,
  },
  nearbyToolbar: {
    marginHorizontal: 24,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  nearbyPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'nowrap',
    width: '100%',
  },
  nearbyCountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: `${colors.pink500}44`,
    backgroundColor: `${colors.pink500}18`,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  nearbyActivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: `${colors.green500}66`,
    backgroundColor: `${colors.green500}20`,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  nearbyCountText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  nearbyActiveText: {
    color: colors.green400,
    fontSize: 12,
    fontWeight: '700',
  },
  nearbyLiveHint: {
    marginHorizontal: 24,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  nearbyLiveHintText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  nearbyInlineMapSection: {
    marginHorizontal: 24,
    marginBottom: 10,
    gap: 8,
  },
  nearbyInlineMapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nearbyInlineMapTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  nearbyInlineMapLink: {
    color: colors.pink500,
    fontSize: 12,
    fontWeight: '600',
  },
  nearbyInlineMapContainer: {
    height: 230,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderSecondary,
    backgroundColor: colors.backgroundTertiary,
  },
  nearbyListHeader: {
    marginHorizontal: 24,
    marginBottom: 6,
  },
  nearbyListTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  nearbyInlineMap: {
    flex: 1,
  },
  proximityIntroCard: {
    marginTop: 12,
    marginHorizontal: 24,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
    backgroundColor: `${colors.backgroundSecondary}B8`,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  proximityIntroTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  proximityIntroSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  nearbyContentScroll: {
    flex: 1,
  },
  nearbyContentScrollInner: {
    paddingBottom: 24,
  },
  nearbyScroll: {
    flex: 1,
  },
  nearbyScrollContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 10,
  },
  nearbyStateCard: {
    marginHorizontal: 24,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
    backgroundColor: `${colors.backgroundSecondary}B8`,
    gap: 6,
  },
  nearbyStateTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  nearbyStateSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  nearbyCardsList: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 10,
  },
  nearbyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
    backgroundColor: `${colors.backgroundSecondary}D8`,
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 2,
  },
  nearbyCardImageWrap: {
    position: 'relative',
  },
  nearbyCardImage: {
    width: 54,
    height: 54,
    borderRadius: 12,
  },
  nearbyOnlineDot: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.background,
    backgroundColor: colors.green500,
  },
  nearbyCardBody: {
    flex: 1,
    gap: 4,
  },
  nearbyCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  nearbyStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  nearbyStatusPillOnline: {
    borderColor: `${colors.green500}88`,
    backgroundColor: `${colors.green500}24`,
  },
  nearbyStatusPillOffline: {
    borderColor: colors.border,
    backgroundColor: `${colors.backgroundTertiary}E0`,
  },
  nearbyStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  nearbyStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  nearbyStatusTextOnline: {
    color: colors.green400,
  },
  nearbyStatusTextOffline: {
    color: colors.textSecondary,
  },
  nearbyCardName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  nearbyCardDescription: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  nearbyMetaRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 2,
  },
  nearbyMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  nearbyMetaText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  nearbyCardArrowWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 20,
  },
  proximityMapModal: {
    flex: 1,
    backgroundColor: colors.background,
  },
  proximityMapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSecondary,
    backgroundColor: `${colors.backgroundSecondary}B0`,
  },
  proximityMapTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  proximityMapBody: {
    flex: 1,
  },
  proximityMap: {
    flex: 1,
  },
  nearbyMapCurrentMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.pink500,
    borderWidth: 3,
    borderColor: '#ffffff',
    shadowColor: colors.pink500,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 6,
    zIndex: 20,
  },
  nearbyMapUserMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.purple400,
    borderWidth: 2,
    borderColor: '#ffffff',
    shadowColor: colors.purple500,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  mapPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundTertiary,
    gap: 8,
  },
  mapPlaceholderText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
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

