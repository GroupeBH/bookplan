import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { usePathname, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Image, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge } from '../../components/ui/Badge';
import { colors } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';
import { useBooking } from '../../context/BookingContext';
import { useMessage } from '../../context/MessageContext';
import { useNotification } from '../../context/NotificationContext';
import { useRating } from '../../context/RatingContext';
import { useUser } from '../../context/UserContext';
import { getDefaultProfileImage } from '../../lib/defaultImages';
import { isMapboxAvailable } from '../../lib/mapbox';
import { User } from '../../types';

// Import conditionnel de Mapbox
let Mapbox: any = null;
let MapView: any = null;
let PointAnnotation: any = null;
let Camera: any = null;
let Callout: any = null;

if (isMapboxAvailable) {
  try {
    const mapboxModule = require('@rnmapbox/maps');
    Mapbox = mapboxModule.default;
    MapView = mapboxModule.MapView;
    PointAnnotation = mapboxModule.PointAnnotation;
    Camera = mapboxModule.Camera;
    Callout = mapboxModule.Callout;
  } catch (error) {
    console.warn('Failed to load Mapbox components');
  }
}

const mockUsers: User[] = [
  {
    id: '1',
    pseudo: 'Amina',
    age: 24,
    photo: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400',
    description: 'Passionnée de danse et de sorties entre amis',
    distance: 2.3,
    rating: 4.8,
    reviewCount: 23,
    isSubscribed: true,
    subscriptionStatus: 'active',
    lastSeen: 'En ligne',
    gender: 'female',
    lat: -4.3276,
    lng: 15.3136,
  },
  {
    id: '2',
    pseudo: 'Joël',
    age: 28,
    photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
    description: 'Entrepreneur, aime les discussions profondes',
    distance: 3.7,
    rating: 4.5,
    reviewCount: 18,
    isSubscribed: true,
    subscriptionStatus: 'active',
    lastSeen: 'Il y a 5 min',
    gender: 'male',
    lat: -4.3376,
    lng: 15.3236,
  },
  {
    id: '3',
    pseudo: 'Grace',
    age: 26,
    photo: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400',
    description: 'Amatrice de bonne musique et de soirées',
    distance: 1.5,
    rating: 4.9,
    reviewCount: 31,
    isSubscribed: true,
    subscriptionStatus: 'active',
    lastSeen: 'En ligne',
    gender: 'female',
    lat: -4.3176,
    lng: 15.3036,
  },
  {
    id: '4',
    pseudo: 'Patrick',
    age: 30,
    photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400',
    description: 'Sportif et sociable',
    distance: 5.2,
    rating: 4.3,
    reviewCount: 15,
    isSubscribed: true,
    subscriptionStatus: 'active',
    lastSeen: 'Il y a 1h',
    gender: 'male',
    lat: -4.3476,
    lng: 15.3336,
  },
];

type Tab = 'home' | 'search' | 'messages' | 'notifications' | 'profile';

/**
 * Fonction utilitaire pour obtenir la source d'image correcte pour React Native Image
 * Gère à la fois les URLs HTTP/HTTPS (Supabase) et les images locales par défaut
 */
const getImageSource = (photoUrl: string | null | undefined, gender: 'male' | 'female' = 'female') => {
  // Vérifier si on a une URL valide
  if (photoUrl && typeof photoUrl === 'string' && photoUrl.trim() !== '') {
    const trimmedUrl = photoUrl.trim();
    
    // Rejeter les URIs locales (file://) - elles ne sont pas accessibles depuis d'autres appareils
    if (trimmedUrl.startsWith('file://')) {
      console.warn(`⚠️ URI locale détectée (non accessible): ${trimmedUrl.substring(0, 50)}... - Utilisation de l'image par défaut`);
      return gender === 'male' 
        ? require('../../assets/images/avatar_men.png')
        : require('../../assets/images/avatar_woman.png');
    }
    
    // Si c'est une URL HTTP/HTTPS valide (Supabase Storage, etc.)
    // Accepter toutes les URLs HTTPS et HTTP (sauf les URLs locales du serveur Expo)
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

// Composant mémorisé pour le callout utilisateur
const UserCallout = React.memo(({ 
  user, 
  onViewProfile, 
  onClose 
}: { 
  user: User; 
  onViewProfile: (user: User) => void;
  onClose: () => void;
}) => {
  const imageSource = useMemo(() => {
    const rawPhoto = (user as any).rawPhoto || user.photo || null;
    return getImageSource(rawPhoto, user.gender);
  }, [(user as any).rawPhoto, user.photo, user.gender]);

  const handlePress = useCallback(() => {
    onClose();
    onViewProfile(user);
  }, [user, onClose, onViewProfile]);

  return (
    <View style={styles.calloutContainer}>
      <View style={styles.calloutHeader}>
        <Image
          source={imageSource}
          style={styles.calloutImage}
          resizeMode="cover"
        />
        <View style={styles.calloutInfo}>
          <Text style={styles.calloutName}>{user.pseudo}</Text>
          <View style={styles.calloutDistance}>
            <Ionicons name="location" size={12} color={colors.textSecondary} />
            <Text style={styles.calloutDistanceText}>
              {user.distance !== undefined ? `${user.distance.toFixed(2)} km` : 'N/A'}
            </Text>
          </View>
        </View>
      </View>
      <TouchableOpacity
        style={styles.calloutButton}
        onPress={handlePress}
        activeOpacity={0.7}
      >
        <Text style={styles.calloutButtonText}>Profil</Text>
        <Ionicons name="chevron-forward" size={16} color="#ffffff" />
      </TouchableOpacity>
    </View>
  );
}, (prevProps, nextProps) => {
  // Comparaison personnalisée pour éviter les re-renders inutiles
  const prevRawPhoto = (prevProps.user as any).rawPhoto || prevProps.user.photo;
  const nextRawPhoto = (nextProps.user as any).rawPhoto || nextProps.user.photo;
  return prevProps.user.id === nextProps.user.id &&
         prevRawPhoto === nextRawPhoto &&
         prevProps.user.pseudo === nextProps.user.pseudo &&
         prevProps.user.distance === nextProps.user.distance &&
         prevProps.user.gender === nextProps.user.gender;
});

UserCallout.displayName = 'UserCallout';

export default function Dashboard() {
  const router = useRouter();
  const { currentUser, setSelectedUser } = useUser();
  const { isAuthenticated, isLoading, user, updateLocation } = useAuth();
  const { getAvailableUsers } = useBooking();
  const { getUserAverageRating } = useRating();
  const { conversations } = useMessage();
  const { unreadCount: unreadNotificationsCount } = useNotification();
  
  // Calculer le total des messages non lus
  const totalUnreadMessages = useMemo(() => {
    return conversations.reduce((total, conv) => {
      return total + (conv.unreadCount || 0);
    }, 0);
  }, [conversations]);
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const [userRatings, setUserRatings] = useState<Map<string, { average: number; count: number }>>(new Map());
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [selectedUserForCallout, setSelectedUserForCallout] = useState<User | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Protection de route - ne rediriger que si vraiment non authentifié
  // Utiliser useRef pour éviter les re-renders inutiles et les problèmes de timing
  const authCheckRef = useRef({ hasChecked: false, timeoutId: null as NodeJS.Timeout | null });
  
  useEffect(() => {
    // Nettoyer le timeout précédent
    if (authCheckRef.current.timeoutId) {
      clearTimeout(authCheckRef.current.timeoutId);
      authCheckRef.current.timeoutId = null;
    }
    
    // Ne rien faire pendant le chargement initial
    if (isLoading) {
      authCheckRef.current.hasChecked = false;
      return;
    }
    
    // Marquer qu'on a vérifié une fois le chargement terminé
    if (!authCheckRef.current.hasChecked) {
      authCheckRef.current.hasChecked = true;
    }
    
    // Vérifier l'authentification avec un délai pour éviter les problèmes de timing
    // Ne rediriger que si on est sûr que l'utilisateur n'est pas authentifié
    authCheckRef.current.timeoutId = setTimeout(() => {
      // Double vérification : s'assurer que le chargement est terminé et qu'on n'est pas authentifié
      if (authCheckRef.current.hasChecked && !isLoading && !isAuthenticated && !user) {
        router.replace('/(screens)/auth');
      }
    }, 500); // Délai réduit à 500ms pour une meilleure réactivité
    
    return () => {
      if (authCheckRef.current.timeoutId) {
        clearTimeout(authCheckRef.current.timeoutId);
        authCheckRef.current.timeoutId = null;
      }
    };
  }, [isAuthenticated, isLoading, user, router]);

  // Réinitialiser l'onglet actif quand on revient au dashboard
  const pathname = usePathname();
  useFocusEffect(
    useCallback(() => {
      // Si on est sur le dashboard, réinitialiser l'onglet actif à 'home'
      if (pathname === '/(screens)/dashboard') {
        setActiveTab('home');
      }
    }, [pathname])
  );

  // État pour savoir si le dashboard est actif (focus)
  const isDashboardFocusedRef = useRef(false);
  const initialLoadDone = useRef(false);
  const lastLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const locationPermissionRequestedRef = useRef(false);
  const lastLocationUpdateTimeRef = useRef<number>(0); // Pour limiter les mises à jour de position dans Supabase
  const isLoadingUsersRef = useRef(false); // Pour éviter les appels multiples simultanés
  const lastLoadUsersTimeRef = useRef<number>(0); // Pour limiter les chargements d'utilisateurs
  const pendingSubscriptionRef = useRef<Location.LocationSubscription | null>(null); // Pour tracker les subscriptions en cours de création
  const activeTimersRef = useRef<Set<NodeJS.Timeout>>(new Set()); // Pour tracker tous les timers actifs

  // Démarrer/arrêter le tracking uniquement quand le dashboard est focus
  useFocusEffect(
    useCallback(() => {
      // Marquer que le dashboard est actif
      isDashboardFocusedRef.current = true;

      // Ne démarrer le suivi que si authentifié
      if (!isAuthenticated || !user) {
        return;
      }

      // NE PAS démarrer le LocationService sur le dashboard
      // Le dashboard utilise son propre système de tracking local qui est mieux optimisé
      // Cela évite les conflits et les icônes qui clignotent

      // Charger les utilisateurs disponibles au premier focus
      if (!initialLoadDone.current) {
        initialLoadDone.current = true;
        // Utiliser la position du profil utilisateur en premier (si disponible) pour un chargement instantané
        if (user.lat && user.lng) {
          const profileLocation = { lat: user.lat, lng: user.lng };
          setUserLocation(profileLocation);
          // Charger les utilisateurs immédiatement avec la position du profil
          loadAvailableUsers(profileLocation);
        } else {
          // Sinon, charger sans position (sera mis à jour quand la position arrive)
          loadAvailableUsers();
        }
      }

      // Demander la permission de localisation de manière non bloquante (une seule fois)
      if (!locationPermissionRequestedRef.current) {
        locationPermissionRequestedRef.current = true;
        // Démarrer la demande de permission en arrière-plan (non bloquant)
        requestLocationPermission().catch(() => {
          // Ignorer les erreurs, ne pas bloquer l'authentification
        });
      }

      // Démarrer le suivi de position (même si la permission n'est pas encore accordée)
      startLocationTracking().then((subscription) => {
        // Vérifier qu'on est toujours sur le dashboard et authentifié avant d'assigner la subscription
        if (isDashboardFocusedRef.current && isAuthenticated && user) {
          locationSubscriptionRef.current = subscription;
          pendingSubscriptionRef.current = null; // Nettoyer la ref
        } else if (subscription) {
          // Si on n'est plus sur le dashboard, arrêter immédiatement
          console.log('🛑 Dashboard non actif, arrêt immédiat du tracking GPS');
          subscription.remove();
          locationSubscriptionRef.current = null;
          pendingSubscriptionRef.current = null;
        }
      }).catch(() => {
        // Ignorer les erreurs de localisation, ne pas bloquer l'authentification
        pendingSubscriptionRef.current = null;
      });

      // Cleanup quand on quitte le dashboard
      return () => {
        console.log('🛑 Cleanup dashboard - Arrêt de toutes les opérations');
        // Marquer que le dashboard n'est plus actif IMMÉDIATEMENT
        isDashboardFocusedRef.current = false;
        
        // Arrêter tous les timers actifs
        activeTimersRef.current.forEach((timer) => {
          clearTimeout(timer);
        });
        activeTimersRef.current.clear();
        
        // Arrêter le chargement des utilisateurs en cours
        isLoadingUsersRef.current = false;
        
        // Arrêter le suivi de position local IMMÉDIATEMENT
        // Arrêter d'abord la subscription en cours de création si elle existe
        if (pendingSubscriptionRef.current) {
          console.log('🛑 Arrêt de la subscription GPS en cours de création');
          pendingSubscriptionRef.current.remove();
          pendingSubscriptionRef.current = null;
        }
        
        // Arrêter aussi la subscription stockée dans la ref
        if (locationSubscriptionRef.current) {
          console.log('🛑 Arrêt de la subscription GPS stockée');
          locationSubscriptionRef.current.remove();
          locationSubscriptionRef.current = null;
        }

        // Le LocationService n'est pas utilisé sur le dashboard, donc pas besoin de l'arrêter
      };
    }, [isAuthenticated, user, loadAvailableUsers])
  );

  // Recharger les utilisateurs quand la position GPS est mise à jour (seulement si différente et si on est sur le dashboard)
  // Utiliser un debounce pour éviter les rechargements trop fréquents
  useEffect(() => {
    // Ne recharger que si le dashboard est actif
    if (!isDashboardFocusedRef.current) {
      return;
    }

    if (!userLocation || !isAuthenticated || !user) {
      return;
    }

    // Vérifier si la position a vraiment changé de manière significative (au moins 100 mètres)
    // 0.001 degré ≈ 111 mètres à l'équateur, donc 0.001 est un bon seuil
    const hasChanged = !lastLocationRef.current || 
      Math.abs(lastLocationRef.current.lat - userLocation.lat) > 0.001 ||
      Math.abs(lastLocationRef.current.lng - userLocation.lng) > 0.001;
    
    if (hasChanged) {
      // Utiliser un debounce pour éviter les rechargements trop fréquents
      const debounceTimer = setTimeout(() => {
        // Vérifier à nouveau que le dashboard est toujours actif avant de charger
        if (!isDashboardFocusedRef.current) {
          return;
        }
        lastLocationRef.current = userLocation;
        loadAvailableUsers(userLocation);
      }, 2000); // Attendre 2 secondes avant de recharger pour éviter les appels trop fréquents

      // Ajouter le timer à la liste des timers actifs
      activeTimersRef.current.add(debounceTimer);

      return () => {
        clearTimeout(debounceTimer);
        activeTimersRef.current.delete(debounceTimer);
      };
    }
  }, [userLocation?.lat, userLocation?.lng, isAuthenticated, user, loadAvailableUsers]);

  // Réessayer la demande de localisation quand l'app revient au premier plan (après retour des paramètres)
  // Seulement si le dashboard est actif
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      // Ne faire quelque chose que si le dashboard est actif
      if (!isDashboardFocusedRef.current) {
        return;
      }
      
      if (nextAppState === 'active' && isAuthenticated && user && locationPermissionRequestedRef.current) {
        // Réessayer de demander la permission si l'utilisateur revient des paramètres
        // Mais seulement après un court délai pour éviter les boucles
        const timer = setTimeout(() => {
          // Vérifier à nouveau que le dashboard est toujours actif
          if (!isDashboardFocusedRef.current) {
            return;
          }
          if (isAuthenticated && user) {
            requestLocationPermission().catch(() => {});
          }
        }, 500);
        
        // Ajouter le timer à la liste des timers actifs
        activeTimersRef.current.add(timer);
      }
    });

    return () => {
      subscription.remove();
      // Nettoyer tous les timers liés à AppState
      activeTimersRef.current.forEach((timer) => {
        clearTimeout(timer);
      });
      activeTimersRef.current.clear();
    };
  }, [isAuthenticated, user]);

  const requestLocationPermission = async () => {
    try {
      // Vérifier d'abord si les services de localisation sont activés
      const isLocationEnabled = await Location.hasServicesEnabledAsync();
      if (!isLocationEnabled) {
        // Demander à l'utilisateur s'il veut activer la localisation (non bloquant)
        // Ne pas bloquer l'authentification, juste informer
        Alert.alert(
          'Localisation désactivée',
          'Pour afficher les utilisateurs à proximité, veuillez activer la localisation dans les paramètres de votre appareil.',
          [
            {
              text: 'Plus tard',
              style: 'cancel',
              onPress: () => {
                // L'utilisateur peut continuer sans localisation
                console.log('Utilisateur a choisi de ne pas activer la localisation maintenant');
              },
            },
            {
              text: 'Ouvrir les paramètres',
              onPress: () => {
                if (Platform.OS === 'ios') {
                  Linking.openURL('app-settings:');
                } else {
                  Linking.openSettings();
                }
              },
            },
          ],
          { cancelable: true }
        );
        return;
      }

      // Demander la permission de localisation
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.warn('Permission de localisation refusée');
        // Ne pas bloquer, l'utilisateur peut continuer sans localisation
        return;
      }
    } catch (error) {
      console.error('Error requesting location permission:', error);
      // Ne pas bloquer en cas d'erreur
    }
  };

  const startLocationTracking = async (): Promise<Location.LocationSubscription | null> => {
    try {
      // Essayer d'abord de récupérer la position depuis le cache
      try {
        const cachedLocationStr = await AsyncStorage.getItem('user_location');
        if (cachedLocationStr) {
          const cachedLocation = JSON.parse(cachedLocationStr);
          // Utiliser la position en cache immédiatement pour un chargement instantané
          // Ne pas charger les utilisateurs ici, cela sera géré par useFocusEffect
          if (cachedLocation.lat && cachedLocation.lng) {
            setUserLocation(cachedLocation);
          }
        }
      } catch (e) {
        // Ignorer les erreurs de cache
      }

      // Obtenir la position actuelle avec la précision la plus basse pour une réponse rapide
      const locationPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Lowest, // Plus rapide que Balanced
      });

      // Timeout de 3 secondes pour ne pas bloquer
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Location timeout')), 3000)
      );

      let location;
      try {
        location = await Promise.race([locationPromise, timeoutPromise]) as Location.LocationObject;
      } catch (error) {
        // Si timeout ou erreur, utiliser la position du profil utilisateur si disponible
        if (user?.lat && user?.lng) {
          const profileLocation = { lat: user.lat, lng: user.lng };
          setUserLocation(profileLocation);
          await AsyncStorage.setItem('user_location', JSON.stringify(profileLocation));
          // Mettre à jour en arrière-plan avec une meilleure précision
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }).then((betterLocation) => {
            const newLocation = {
              lat: betterLocation.coords.latitude,
              lng: betterLocation.coords.longitude,
            };
            setUserLocation(newLocation);
            AsyncStorage.setItem('user_location', JSON.stringify(newLocation));
            if (user && isAuthenticated) {
              updateLocation(newLocation.lat, newLocation.lng).catch(() => {});
            }
          }).catch(() => {});
          return null;
        }
        throw error;
      }

      const newLocation = {
        lat: location.coords.latitude,
        lng: location.coords.longitude,
      };

      setUserLocation(newLocation);
      // Sauvegarder dans le cache
      await AsyncStorage.setItem('user_location', JSON.stringify(newLocation));

      // Mettre à jour la position dans le profil Supabase en arrière-plan (non bloquant)
      if (user) {
        updateLocation(newLocation.lat, newLocation.lng).catch(() => {
          // Ignorer les erreurs silencieusement
        });
      }

      // Suivre les changements de position avec des intervalles plus longs pour éviter les mises à jour trop fréquentes
      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 30000, // Mettre à jour toutes les 30 secondes (réduit la charge et les icônes qui clignotent)
          distanceInterval: 100, // Ou tous les 100 mètres (réduit les mises à jour)
        },
        (location) => {
          // Ne mettre à jour la position que si le dashboard est actif
          // Vérifier IMMÉDIATEMENT au début du callback
          if (!isDashboardFocusedRef.current) {
            // Ignorer complètement les mises à jour si on n'est plus sur le dashboard
            // Le cleanup dans useFocusEffect s'occupera d'arrêter la subscription
            return;
          }

          const updatedLocation = {
            lat: location.coords.latitude,
            lng: location.coords.longitude,
          };

          // Vérifier si la position a vraiment changé de manière significative avant de mettre à jour
          // Cela évite les mises à jour inutiles qui causent les icônes qui clignotent
          const hasChanged = !userLocation || 
            Math.abs(userLocation.lat - updatedLocation.lat) > 0.001 ||
            Math.abs(userLocation.lng - updatedLocation.lng) > 0.001;

          if (hasChanged) {
            setUserLocation(updatedLocation);
            // Sauvegarder dans le cache
            AsyncStorage.setItem('user_location', JSON.stringify(updatedLocation)).catch(() => {});

            // Mettre à jour la position dans le profil Supabase en arrière-plan (avec last_seen)
            // Utiliser un debounce pour éviter les mises à jour trop fréquentes
            if (user && isAuthenticated) {
              // Ne mettre à jour que toutes les 30 secondes maximum
              const now = Date.now();
              if (!lastLocationUpdateTimeRef.current || now - lastLocationUpdateTimeRef.current > 30000) {
                lastLocationUpdateTimeRef.current = now;
                updateLocation(updatedLocation.lat, updatedLocation.lng).catch(() => {
                  // Ignorer les erreurs silencieusement
                });
              }
            }
          }
        }
      );

      return subscription;
    } catch (error: any) {
      // Gérer l'erreur de localisation de manière gracieuse
      if (error.message?.includes('location is unavailable') || error.message?.includes('timeout')) {
        console.log('⚠️ Localisation non disponible ou timeout');
        // Utiliser la position du profil utilisateur si disponible
        if (user?.lat && user?.lng) {
          const profileLocation = { lat: user.lat, lng: user.lng };
          setUserLocation(profileLocation);
          await AsyncStorage.setItem('user_location', JSON.stringify(profileLocation)).catch(() => {});
        } else {
          // Optionnel : définir une position par défaut pour le développement
          const defaultLocation = { lat: -4.3276, lng: 15.3136 }; // Kinshasa par défaut
          setUserLocation(defaultLocation);
        }
      } else {
        console.error('Error starting location tracking:', error);
      }
      return null;
    }
  };

  const loadAvailableUsers = useCallback(async (locationOverride?: { lat: number; lng: number }) => {
    // NE PAS charger si on n'est pas sur le dashboard
    if (!isDashboardFocusedRef.current) {
      console.log('⏭️ Dashboard non actif, skip chargement des utilisateurs');
      isLoadingUsersRef.current = false; // Réinitialiser le flag
      return;
    }

    // Éviter les appels multiples simultanés
    if (isLoadingUsersRef.current) {
      console.log('⏭️ Chargement des utilisateurs déjà en cours, skip');
      return;
    }

    // Limiter les chargements à maximum toutes les 10 secondes
    const now = Date.now();
    if (lastLoadUsersTimeRef.current && now - lastLoadUsersTimeRef.current < 10000) {
      console.log('⏭️ Chargement des utilisateurs trop récent, skip');
      return;
    }

    try {
      isLoadingUsersRef.current = true;
      lastLoadUsersTimeRef.current = now;

      // Vérifier à nouveau que le dashboard est toujours actif avant de continuer
      if (!isDashboardFocusedRef.current) {
        console.log('⏭️ Dashboard non actif pendant le chargement, arrêt');
        isLoadingUsersRef.current = false;
        return;
      }

      // Utiliser la position fournie ou la position actuelle
      const currentLocation = locationOverride || userLocation;
      
      // Charger les utilisateurs en parallèle avec d'autres opérations
      const users = await getAvailableUsers();
      
      // Vérifier à nouveau que le dashboard est toujours actif après le chargement
      if (!isDashboardFocusedRef.current) {
        console.log('⏭️ Dashboard non actif après le chargement, arrêt');
        isLoadingUsersRef.current = false;
        return;
      }
      
      // Log pour déboguer la récupération des photos
      console.log('📸 DEBUG: Utilisateurs récupérés:', users.length);
      const jhonUser = users.find((u: any) => u.pseudo === 'Jhon' || u.pseudo === 'jhon');
      if (jhonUser) {
        console.log('🔍 DEBUG Jhon - Données brutes depuis DB:', {
          id: jhonUser.id,
          pseudo: jhonUser.pseudo,
          photo: jhonUser.photo,
          p_photo: jhonUser.p_photo,
          allKeys: Object.keys(jhonUser),
        });
      }
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

      // Convertir les données de la DB en format User
      const formattedUsers: User[] = users.map((u: any) => {
        const userGender = (u.gender === 'male' || u.gender === 'female') ? u.gender : 'female';
        // Récupérer la photo depuis la DB
        const rawPhoto = u.photo || null;
        
        // Log pour déboguer les photos
        if (u.pseudo === 'Jhon' || u.pseudo === 'jhon') {
          console.log(`🔍 DEBUG Photo pour ${u.pseudo}:`, {
            id: u.id,
            photo: u.photo,
            rawPhoto: rawPhoto,
            hasPhoto: !!rawPhoto,
            photoType: typeof rawPhoto,
            photoLength: rawPhoto ? rawPhoto.length : 0,
            photoPreview: rawPhoto ? rawPhoto.substring(0, 100) : 'null',
          });
        }
        
        // Convertir les coordonnées de manière robuste
        const parseCoord = (coord: any): number | undefined => {
          if (coord == null || coord === '') return undefined;
          const parsed = typeof coord === 'string' ? parseFloat(coord) : coord;
          return !isNaN(parsed) && isFinite(parsed) ? parsed : undefined;
        };

        return {
          id: u.id,
          pseudo: u.pseudo || 'Utilisateur',
          age: u.age || 25,
          phone: u.phone,
          photo: rawPhoto || getDefaultProfileImage(userGender), // URL de la photo ou image par défaut (pour compatibilité)
          rawPhoto: rawPhoto, // Conserver la photo brute pour déterminer la source d'image
          description: u.description || '',
          rating: parseFloat(u.rating) || 0,
          reviewCount: u.review_count || 0,
          isSubscribed: u.is_subscribed || false,
          subscriptionStatus: u.subscription_status || 'pending',
          lastSeen: u.last_seen || 'Hors ligne', // Ne pas mettre 'En ligne' par défaut
          gender: userGender,
          lat: parseCoord(u.lat),
          lng: parseCoord(u.lng),
          isAvailable: u.is_available,
        };
      });

      // Calculer les distances si on a la position de l'utilisateur
      if (currentLocation) {
        formattedUsers.forEach((u) => {
          // Vérifier que les coordonnées sont valides (non null, non undefined, et convertibles en nombre)
          const lat = typeof u.lat === 'string' ? parseFloat(u.lat) : u.lat;
          const lng = typeof u.lng === 'string' ? parseFloat(u.lng) : u.lng;
          
          if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) {
            u.distance = calculateDistance(
              currentLocation.lat,
              currentLocation.lng,
              lat,
              lng
            );
          } else {
            // Coordonnées invalides
            u.distance = undefined;
          }
        });

        // Filtrer les utilisateurs à 0-10 km seulement
        // Inclure les utilisateurs avec distance = 0 (même endroit)
        const filteredUsers = formattedUsers.filter((u) => {
          // Inclure les utilisateurs avec distance calculée entre 0 et 10 km
          if (u.distance !== undefined && !isNaN(u.distance)) {
            return u.distance >= 0 && u.distance <= 10;
          }
          // Exclure les utilisateurs sans distance (pas de coordonnées valides)
          return false;
        });

        // Trier par distance
        filteredUsers.sort((a, b) => (a.distance || 999) - (b.distance || 999));

        setAvailableUsers(filteredUsers);

        // Charger les avis réels pour chaque utilisateur en arrière-plan (non bloquant)
        // Ne pas attendre pour afficher les utilisateurs
        const ratingsMap = new Map<string, { average: number; count: number }>();
        // Initialiser avec les valeurs par défaut d'abord
        filteredUsers.forEach((u) => {
          ratingsMap.set(u.id, { average: u.rating || 0, count: u.reviewCount || 0 });
        });
        setUserRatings(ratingsMap);

        // Charger les vrais avis en arrière-plan
        Promise.all(
          filteredUsers.map(async (u) => {
            try {
              const avgRating = await getUserAverageRating(u.id);
              ratingsMap.set(u.id, avgRating);
              // Mettre à jour les ratings une fois chargés
              setUserRatings(new Map(ratingsMap));
            } catch (error) {
              // Ignorer les erreurs silencieusement
            }
          })
        ).catch(() => {
          // Ignorer les erreurs
        });
      } else {
        // Si pas de position, ne pas afficher d'utilisateurs
        setAvailableUsers([]);
      }
      
      // Log pour déboguer
      const finalUsers = currentLocation ? formattedUsers.filter((u) => {
        return u.distance !== undefined && u.distance >= 0 && u.distance <= 10;
      }) : [];
      
      // Log détaillé pour déboguer les utilisateurs au même endroit
      const usersAtSameLocation = formattedUsers.filter((u) => {
        return u.distance !== undefined && u.distance < 0.01; // Moins de 10 mètres
      });
      
      if (usersAtSameLocation.length > 0) {
        console.log('📍 Utilisateurs au même endroit:', usersAtSameLocation.map(u => ({
          id: u.id,
          pseudo: u.pseudo,
          distance: u.distance?.toFixed(4),
          lat: u.lat,
          lng: u.lng,
          lastSeen: u.lastSeen,
          isAvailable: u.isAvailable,
        })));
      }
      
      console.log('📊 Utilisateurs disponibles:', {
        total: formattedUsers.length,
        avecCoordonnees: formattedUsers.filter(u => u.lat != null && u.lng != null).length,
        sansCoordonnees: formattedUsers.filter(u => u.lat == null || u.lng == null).length,
        avecDistance: formattedUsers.filter(u => u.distance !== undefined).length,
        dansRayon10km: finalUsers.length,
        auMemeEndroit: usersAtSameLocation.length,
        userLocation: currentLocation ? `${currentLocation.lat}, ${currentLocation.lng}` : 'non disponible',
      });
    } catch (error) {
      console.error('Error loading available users:', error);
    } finally {
      // Réinitialiser le flag de chargement
      isLoadingUsersRef.current = false;
    }
  }, [userLocation, getAvailableUsers, getUserAverageRating]);

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

  const handleViewProfile = useCallback((user: User) => {
    setSelectedUser(user);
    router.push('/(screens)/user-profile');
  }, [setSelectedUser, router]);

  // Handler optimisé pour la sélection des marqueurs
  const handleMarkerSelect = useCallback((markerId: string, user?: User) => {
    if (markerId === 'current-user') {
      setSelectedMarkerId(prev => prev === markerId ? null : markerId);
      setSelectedUserForCallout(null);
    } else if (user) {
      // Afficher immédiatement le modal pour l'utilisateur sélectionné
      setSelectedMarkerId(markerId);
      setSelectedUserForCallout(user);
    } else {
      setSelectedMarkerId(prev => prev === markerId ? null : markerId);
      setSelectedUserForCallout(null);
    }
  }, []);

  // Handler pour fermer le callout
  const handleCloseCallout = useCallback(() => {
    setSelectedMarkerId(null);
    setSelectedUserForCallout(null);
  }, []);

  const handleTabClick = (tab: Tab) => {
    setActiveTab(tab);
    if (tab === 'search') router.push('/(screens)/search');
    if (tab === 'messages') router.push('/(screens)/chat');
    if (tab === 'notifications') router.push('/(screens)/notifications');
    if (tab === 'profile') router.push('/(screens)/profile');
  };

  const tabs = [
    { id: 'home' as Tab, icon: 'home', label: 'Accueil' },
    { id: 'search' as Tab, icon: 'search', label: 'Recherche' },
    { id: 'messages' as Tab, icon: 'chatbubbles', label: 'Messages' },
    { id: 'notifications' as Tab, icon: 'notifications-outline', label: 'Notifications' },
    { id: 'profile' as Tab, icon: 'person', label: 'Profil' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image
            source={require('../../assets/images/kutana.png')}
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <Text style={styles.headerTitle}>KUTANA</Text>
        </View>
        <View style={styles.headerRight}>
          {currentUser?.isSubscribed && (
            <Badge variant="info" style={styles.badge}>
              Abonné
            </Badge>
          )}
          <TouchableOpacity
            style={styles.offersButton}
            onPress={() => router.push('/(screens)/settings')}
          >
            <Ionicons name="settings-outline" size={24} color={colors.pink500} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Map Section */}
      <View style={styles.mapSection}>
        {!isMapboxAvailable || !MapView ? (
          <View style={styles.mapPlaceholder}>
            <Ionicons name="map-outline" size={48} color={colors.purple400} />
            <Text style={styles.mapPlaceholderText}>Carte non disponible</Text>
            <Text style={styles.mapPlaceholderSubtext}>
              Un build de développement est requis pour utiliser Mapbox.{'\n'}
              Exécutez: eas build --profile development
            </Text>
          </View>
        ) : userLocation && userLocation.lng !== undefined && userLocation.lat !== undefined && Mapbox && Mapbox.StyleURL && MapView && Camera ? (
          <MapView
            styleURL={Mapbox.StyleURL.Street}
            style={styles.map}
            logoEnabled={false}
            attributionEnabled={false}
            onPress={handleCloseCallout}
            onDidFinishLoadingMap={() => {
              // Attendre que la carte soit complètement chargée avant de rendre les marqueurs
              setTimeout(() => setMapReady(true), 100);
            }}
          >
            <Camera
              centerCoordinate={[userLocation.lng, userLocation.lat]}
              zoomLevel={13}
              animationMode="flyTo"
              animationDuration={2000}
            />
            
            {/* Marker pour l'utilisateur actuel - zIndex élevé pour être au-dessus */}
            {mapReady && PointAnnotation && userLocation && 
             userLocation.lng !== undefined && userLocation.lat !== undefined &&
             isFinite(userLocation.lng) && isFinite(userLocation.lat) ? (
              <PointAnnotation
                id="current-user"
                coordinate={[userLocation.lng, userLocation.lat]}
                anchor={{ x: 0.5, y: 0.5 }}
                onSelected={() => handleMarkerSelect('current-user')}
              >
                <View style={styles.currentUserMarker}>
                  <Ionicons name="person" size={20} color="#ffffff" />
                </View>
              </PointAnnotation>
            ) : null}

            {/* Markers pour les utilisateurs disponibles - zIndex plus bas pour être sous le marqueur utilisateur */}
            {mapReady ? (() => {
              // Filtrer d'abord les utilisateurs valides
              const validUsers = availableUsers.filter((user) => {
                const hasCoords = user.lat !== undefined && user.lat !== null && user.lng !== undefined && user.lng !== null;
                // Vérifier aussi que la distance est dans la plage 0-10 km
                const inRange = user.distance !== undefined && user.distance >= 0 && user.distance <= 10;
                if (!hasCoords) {
                  console.log(`⚠️ Utilisateur ${user.pseudo} (${user.id}) n'a pas de coordonnées`);
                }
                if (hasCoords && !inRange) {
                  console.log(`⚠️ Utilisateur ${user.pseudo} (${user.id}) est à ${user.distance?.toFixed(1)} km, hors de la plage 0-10 km`);
                }
                return hasCoords && inRange;
              });

              // Compter les utilisateurs à 0.0 km (ou très proches)
              const usersAtZero = validUsers.filter(u => 
                u.distance === 0 || (u.distance !== undefined && u.distance < 0.001)
              );
              const usersAtZeroCount = usersAtZero.length;

              // Créer un index pour les utilisateurs à 0.0 km
              let zeroIndex = 0;

              return validUsers.map((user, index) => {
                // Pour les utilisateurs à 0.0 km (même position), décaler légèrement les marqueurs en cercle autour du marqueur utilisateur
                let latOffset = 0;
                let lngOffset = 0;
                
                if (user.distance === 0 || (user.distance !== undefined && user.distance < 0.001)) {
                  // Créer un cercle autour du marqueur utilisateur
                  // Distance du centre : environ 0.0015 degrés (environ 165 mètres) - assez grand pour être bien visible et séparé
                  const radius = 0.0015;
                  // Angle en radians pour placer les marqueurs en cercle
                  // Utiliser le nombre total d'utilisateurs à 0.0 km pour répartir équitablement
                  // Commencer à 0 degrés (à droite) pour le premier marqueur
                  const angle = usersAtZeroCount > 1 ? (zeroIndex * 2 * Math.PI) / usersAtZeroCount : Math.PI / 4; // Par défaut à 45 degrés si seul
                  // Calculer les offsets en latitude et longitude
                  // Note: la longitude doit être ajustée par le cosinus de la latitude pour un cercle correct
                  const lat = user.lat || (userLocation?.lat || 0);
                  const latRad = lat * Math.PI / 180;
                  latOffset = radius * Math.cos(angle);
                  lngOffset = radius * Math.sin(angle) / Math.cos(latRad); // Ajustement pour la projection Mercator
                  
                  zeroIndex++;
                }
                
                // Vérifier que les coordonnées sont valides avant de rendre le PointAnnotation
                const userLat = (user.lat || 0) + latOffset;
                const userLng = (user.lng || 0) + lngOffset;
                
                // Vérifications strictes pour éviter les erreurs Mapbox
                if (!PointAnnotation || !userLocation || 
                    userLat === 0 || userLng === 0 ||
                    isNaN(userLat) || isNaN(userLng) ||
                    !isFinite(userLat) || !isFinite(userLng) ||
                    user.lat === undefined || user.lat === null ||
                    user.lng === undefined || user.lng === null) {
                  return null;
                }
                
                console.log(`📍 Affichage marqueur pour ${user.pseudo} à (${user.lat}, ${user.lng}), distance: ${user.distance?.toFixed(3)} km, offset: (${latOffset.toFixed(6)}, ${lngOffset.toFixed(6)})`);
                return (
                  <PointAnnotation
                    key={user.id}
                    id={`user-${user.id}`}
                    coordinate={[userLng, userLat]}
                    anchor={{ x: 0.5, y: 0.5 }}
                    onSelected={() => handleMarkerSelect(`user-${user.id}`, user)}
                  >
                    <View style={styles.userMarker}>
                      <Image
                        source={getImageSource((user as any).rawPhoto || user.photo, user.gender)}
                        style={styles.markerImage}
                        resizeMode="cover"
                        defaultSource={user.gender === 'male' 
                          ? require('../../assets/images/avatar_men.png')
                          : require('../../assets/images/avatar_woman.png')}
                        onError={(error) => {
                          console.log(`❌ Erreur de chargement de l'image du marqueur pour ${user.pseudo}`);
                        }}
                        onLoad={() => {
                          console.log(`✅ Image du marqueur chargée avec succès pour ${user.pseudo}`);
                        }}
                      />
                      {(() => {
                        // Vérifier si l'utilisateur est vraiment en ligne avant d'afficher l'indicateur
                        const isOnline = (() => {
                          if (!user.lastSeen) return false;
                          if (user.lastSeen === 'En ligne' || user.lastSeen.toLowerCase() === 'en ligne') {
                            return true;
                          }
                          // Vérifier si c'est une date récente (moins de 5 minutes)
                          try {
                            const lastSeenDate = new Date(user.lastSeen);
                            if (isNaN(lastSeenDate.getTime())) return false;
                            const now = new Date();
                            const diffMs = now.getTime() - lastSeenDate.getTime();
                            const diffMinutes = diffMs / (1000 * 60);
                            return diffMinutes < 5;
                          } catch {
                            return false;
                          }
                        })();
                        return isOnline ? <View style={styles.onlineIndicator} /> : null;
                      })()}
                    </View>
                  </PointAnnotation>
                );
              }).filter(Boolean); // Filtrer les valeurs null
            })() : null}
          </MapView>
        ) : (
          <View style={styles.mapPlaceholder}>
            <Ionicons name="location" size={24} color={colors.purple400} style={{ opacity: 0.5 }} />
            <Text style={styles.mapPlaceholderText}>Chargement de la carte...</Text>
          </View>
        )}
      </View>

      {/* Modal pour le callout utilisateur - s'affiche immédiatement */}
      <Modal
        visible={selectedUserForCallout !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCloseCallout}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={handleCloseCallout}
        >
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            {selectedUserForCallout && (
              <UserCallout 
                user={selectedUserForCallout} 
                onViewProfile={handleViewProfile}
                onClose={handleCloseCallout}
              />
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Modal simple pour "Moi" */}
      <Modal
        visible={selectedMarkerId === 'current-user'}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCloseCallout}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={handleCloseCallout}
        >
          <View style={styles.modalContentSimple} onStartShouldSetResponder={() => true}>
            <Text style={styles.calloutText}>Moi</Text>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Users List */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        nestedScrollEnabled={true}
        bounces={true}
        scrollEventThrottle={16}
      >
        {/* Offers Section */}
        <View style={styles.offersTabsContainer}>
          <TouchableOpacity
            style={styles.offerTabContent}
            onPress={() => router.push('/(screens)/create-offer')}
          >
            <Ionicons name="add-circle" size={24} color={colors.pink500} />
            <Text style={styles.offerTabContentText}>Créer une nouvelle offre</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.offerTabContent, styles.offerTabContentPink]}
            onPress={() => router.push('/(screens)/offers')}
          >
            <Ionicons name="gift" size={24} color="#ffffff" />
            <Text style={[styles.offerTabContentText, styles.offerTabContentTextPink]}>
              Voir les propositions
            </Text>
            <Ionicons name="chevron-forward" size={20} color="#ffffff" />
          </TouchableOpacity>
        </View>
        
        <Text style={styles.sectionTitle}>À proximité</Text>
        {availableUsers.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={48} color={colors.textTertiary} />
            <Text style={styles.emptyStateText}>
              {userLocation 
                ? 'Aucun utilisateur disponible dans un rayon de 10 km'
                : 'En attente de votre position...'}
            </Text>
          </View>
        ) : (
          availableUsers
            .filter((user) => {
              // Filtrer pour ne garder que les utilisateurs à 0-10 km
              return user.distance !== undefined && user.distance >= 0 && user.distance <= 10;
            })
            .map((user) => (
          <TouchableOpacity
            key={user.id}
            style={styles.userCard}
            onPress={() => handleViewProfile(user)}
            activeOpacity={0.7}
          >
            <View style={styles.userImageContainer}>
              <Image
                source={getImageSource((user as any).rawPhoto || user.photo, user.gender)}
                style={styles.userImage}
                resizeMode="cover"
                defaultSource={user.gender === 'male' 
                  ? require('../../assets/images/avatar_men.png')
                  : require('../../assets/images/avatar_woman.png')}
              />
              {(() => {
                // Vérifier si l'utilisateur est vraiment en ligne
                const isOnline = (() => {
                  if (!user.lastSeen) return false;
                  if (user.lastSeen === 'En ligne' || user.lastSeen.toLowerCase() === 'en ligne') {
                    return true;
                  }
                  // Vérifier si c'est une date récente (moins de 5 minutes)
                  try {
                    const lastSeenDate = new Date(user.lastSeen);
                    if (isNaN(lastSeenDate.getTime())) return false;
                    const now = new Date();
                    const diffMs = now.getTime() - lastSeenDate.getTime();
                    const diffMinutes = diffMs / (1000 * 60);
                    return diffMinutes < 5;
                  } catch {
                    return false;
                  }
                })();
                return isOnline ? <View style={styles.onlineBadge} /> : null;
              })()}
            </View>
            <View style={styles.userInfo}>
              <View style={styles.userHeader}>
                <Text style={styles.userName}>{user.pseudo}</Text>
                <Text style={styles.userSeparator}>·</Text>
                <Text style={styles.userAge}>{user.age} ans</Text>
              </View>
              {user.description && user.description.trim() ? (
                <Text style={styles.userDescription} numberOfLines={1}>
                  {user.description}
                </Text>
              ) : (
                <Text style={styles.userDescription} numberOfLines={1}>
                  Aucune description
                </Text>
              )}
              <View style={styles.userMeta}>
                <View style={styles.metaItem}>
                  <Ionicons name="location" size={12} color={colors.textTertiary} />
                  <Text style={styles.metaText}>
                    {user.distance !== undefined ? `${user.distance.toFixed(2)} km` : 'N/A'}
                  </Text>
                </View>
                <View style={styles.metaItem}>
                  <Ionicons name="star" size={12} color={colors.yellow500} />
                  <Text style={styles.metaText}>
                    {(userRatings.get(user.id)?.average || user.rating || 0).toFixed(1)}
                  </Text>
                  <Text style={styles.metaTextSecondary}>
                    ({userRatings.get(user.id)?.count || user.reviewCount || 0})
                  </Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>
          ))
        )}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={styles.tab}
            onPress={() => handleTabClick(tab.id)}
          >
            <View style={styles.tabIconContainer}>
              <Ionicons
                name={tab.icon as any}
                size={24}
                color={activeTab === tab.id ? colors.pink500 : colors.textTertiary}
              />
              {/* Badge pour les messages non lus */}
              {tab.id === 'messages' && totalUnreadMessages > 0 && (
                <View style={styles.messageBadge}>
                  <Text style={styles.messageBadgeText}>
                    {totalUnreadMessages > 99 ? '99+' : totalUnreadMessages}
                  </Text>
                </View>
              )}
              {/* Badge pour les notifications non lues */}
              {tab.id === 'notifications' && unreadNotificationsCount > 0 && (
                <View style={styles.messageBadge}>
                  <Text style={styles.messageBadgeText}>
                    {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        ))}
      </View>
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerLogo: {
    width: 28,
    height: 28,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  badge: {
    marginLeft: 8,
  },
  offersButton: {
    padding: 4,
  },
  offersTabsContainer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: colors.background,
    marginTop: 16,
    marginBottom: 16,
    gap: 12,
  },
  offerTabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
  },
  offerTabContentPink: {
    backgroundColor: colors.pink500,
    borderColor: colors.pink500,
  },
  offerTabContentText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  offerTabContentTextPink: {
    color: '#ffffff',
  },
  mapSection: {
    height: 256,
    backgroundColor: colors.backgroundTertiary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  map: {
    flex: 1,
    width: '100%',
  },
  mapPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  mapPlaceholderText: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  mapPlaceholderSubtext: {
    marginTop: 8,
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  currentUserMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.pink500,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#ffffff',
    shadowColor: colors.pink500,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 10,
  },
  userMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.pink500,
    overflow: 'hidden',
    backgroundColor: colors.backgroundSecondary,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  markerImage: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
  },
  onlineIndicator: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.green500,
    borderWidth: 2,
    borderColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  userCard: {
    flexDirection: 'row',
    backgroundColor: `${colors.backgroundSecondary}80`,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    gap: 16, // Espacement entre la photo et les infos
  },
  userImageContainer: {
    position: 'relative',
  },
  userImage: {
    width: 64,
    height: 64,
    borderRadius: 16,
  },
  onlineBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.green500,
    borderWidth: 2,
    borderColor: colors.backgroundSecondary,
  },
  userInfo: {
    flex: 1,
    gap: 4,
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  userSeparator: {
    fontSize: 16,
    color: colors.textTertiary,
  },
  userAge: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  userDescription: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  userMeta: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
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
  metaTextSecondary: {
    fontSize: 12,
    color: colors.textTertiary,
    opacity: 0.6,
  },
  bottomNav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: `${colors.backgroundSecondary}80`,
    borderTopWidth: 1,
    borderTopColor: colors.borderSecondary,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  tabIconContainer: {
    position: 'relative',
  },
  messageBadge: {
    position: 'absolute',
    top: -6,
    right: -8,
    backgroundColor: colors.pink500,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: colors.backgroundSecondary,
  },
  messageBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  tabLabel: {
    fontSize: 9,
    fontWeight: '500',
  },
  // Note: currentUserMarker est défini plus haut dans les styles
  // Cette définition semble être un doublon, on la garde pour compatibilité mais elle ne devrait pas être utilisée
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 16,
  },
  emptyStateText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  calloutContainer: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 12,
    width: 220,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    overflow: 'hidden',
  },
  calloutContainerSimple: {
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  calloutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  calloutImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: colors.pink500,
    overflow: 'hidden',
  },
  calloutInfo: {
    flex: 1,
    gap: 4,
  },
  calloutName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  calloutDistance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  calloutDistanceText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  calloutText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    padding: 8,
  },
  calloutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.pink500,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 6,
    marginTop: 4,
  },
  calloutButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 16,
    width: '85%',
    maxWidth: 320,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  modalContentSimple: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 16,
    paddingHorizontal: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
});

