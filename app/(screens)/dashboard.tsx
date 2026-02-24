/* eslint-disable react-hooks/exhaustive-deps */
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
import { useOffer } from '../../context/OfferContext';
import { useRating } from '../../context/RatingContext';
import { useUser } from '../../context/UserContext';
import { getDefaultProfileImage } from '../../lib/defaultImages';
import { isMapboxAvailable } from '../../lib/mapbox';
import { Offer, OfferType, User } from '../../types';

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
    console.warn('Failed to load Mapbox components');
  }
}

type Tab = 'home' | 'search' | 'messages' | 'notifications' | 'profile';

const PROXIMITY_RADIUS_KM = 10;
const ONLINE_WINDOW_MINUTES = 2;
const ONLINE_WINDOW_MS = ONLINE_WINDOW_MINUTES * 60 * 1000;

const OFFER_TYPE_LABELS: Record<OfferType, string> = {
  drink: 'A boire',
  food: 'A manger',
  transport: 'Transport',
  gift: 'Present',
};

const OFFER_TYPE_ICONS: Record<OfferType, keyof typeof Ionicons.glyphMap> = {
  drink: 'wine-outline',
  food: 'restaurant-outline',
  transport: 'car-outline',
  gift: 'gift-outline',
};

const isOfferAvailable = (offer: Offer, now: Date) => {
  if (offer.status !== 'active') return false;
  const expiresAt = new Date(offer.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) return false;
  return expiresAt.getTime() > now.getTime();
};

/**
 * Fonction utilitaire pour obtenir la source d'image correcte pour React Native Image
 * Ã¨ Ã      / ()      Ã©
 */
const getImageSource = (photoUrl: string | null | undefined, gender: 'male' | 'female' = 'female') => {
  // Ã©      v
  if (photoUrl && typeof photoUrl === 'string' && photoUrl.trim() !== '') {
    const trimmedUrl = photoUrl.trim();
    
    // Rejeter les URIs locales (file://) - elles ne sont pas accessibles depuis d'autres appareils
    if (trimmedUrl.startsWith('file://')) {
      console.warn(`URI locale detectee (non accessible): ${trimmedUrl.substring(0, 50)}... - Utilisation de l'image par defaut`);
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
  
  // ,  '  Ã©   
  return gender === 'male' 
    ? require('../../assets/images/avatar_men.png')
    : require('../../assets/images/avatar_woman.png');
};

//  Ã©Ã©    
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
  //  Ã©  Ã©v  - 
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
  const { offers, refreshOffers } = useOffer();
  const [nowMs, setNowMs] = useState(Date.now());
  
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

  //    -     v  Ã©
  //    Ã©v  -    Ã¨  
  const authCheckRef = useRef({ hasChecked: false, timeoutId: null as ReturnType<typeof setTimeout> | null });
  
  useEffect(() => {
    // y   Ã©Ã©
    if (authCheckRef.current.timeoutId) {
      clearTimeout(authCheckRef.current.timeoutId);
      authCheckRef.current.timeoutId = null;
    }
    
    // Ne rien faire pendant le chargement initial
    if (isLoading) {
      authCheckRef.current.hasChecked = false;
      return;
    }
    
    //  '  vÃ©Ã©     Ã©
    if (!authCheckRef.current.hasChecked) {
      authCheckRef.current.hasChecked = true;
    }
    
    // Ã© ' v  Ã©  Ã©v  Ã¨  
    //       Ã»  ' '  Ã©
    authCheckRef.current.timeoutId = setTimeout(() => {
      //  vÃ©  '     Ã©  ' '  Ã©
      if (authCheckRef.current.hasChecked && !isLoading && !isAuthenticated && !user) {
        router.replace('/(screens)/auth');
      }
    }, ) // Ã© Ã© Ã      Ã©vÃ©
    
    return () => {
      if (authCheckRef.current.timeoutId) {
        clearTimeout(authCheckRef.current.timeoutId);
        authCheckRef.current.timeoutId = null;
      }
    };
  }, [isAuthenticated, isLoading, user, router]);

  // Ã© '    v  
  const pathname = usePathname();
  useFocusEffect(
    useCallback(() => {
      //      , Ã© '  Ã  ''
      if (pathname === '/(screens)/dashboard') {
        setActiveTab('home');
      }
    }, [pathname])
  );

  //   v      ()
  const isDashboardFocusedRef = useRef(false);
  const initialLoadDone = useRef(false);
  const lastLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const locationPermissionRequestedRef = useRef(false);
  const lastLocationUpdateTimeRef = useRef<number>(0); // Pour limiter les mises a jour de position dans Supabase
  const isLoadingUsersRef = useRef(false); // Pour eviter les appels multiples simultanes
  const lastLoadUsersTimeRef = useRef<number>(0); // Pour limiter les chargements d'utilisateurs
  const pendingSubscriptionRef = useRef<Location.LocationSubscription | null>(null); // Pour tracker les subscriptions en cours de creation
  const activeTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set()); // Pour tracker tous les timers actifs

  const isUserOnlineNow = useCallback((lastSeen?: string): boolean => {
    if (!lastSeen || typeof lastSeen !== 'string') return false;

    const parsedMs = Date.parse(lastSeen);
    if (!Number.isFinite(parsedMs)) return false;

    const nowMs = Date.now();
    if (parsedMs > nowMs + 5000) return false;
    return nowMs - parsedMs <= ONLINE_WINDOW_MS;
  }, []);

  const nearbyUsers = useMemo(() => {
    return availableUsers.filter((u) => {
      return (
        u.distance !== undefined &&
        Number.isFinite(u.distance) &&
        u.distance >= 0 &&
        u.distance <= PROXIMITY_RADIUS_KM &&
        isUserOnlineNow(u.lastSeen)
      );
    });
  }, [availableUsers, isUserOnlineNow]);

  const availableOffers = useMemo(() => {
    const now = new Date(nowMs);
    return offers
      .filter((offer) => isOfferAvailable(offer, now))
      .sort((a, b) => {
        const aExpires = new Date(a.expiresAt).getTime();
        const bExpires = new Date(b.expiresAt).getTime();
        if (aExpires !== bExpires) return aExpires - bExpires;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [offers, nowMs]);

  const offersPreview = useMemo(() => availableOffers.slice(0, 3), [availableOffers]);

  const formatOfferTimeLeft = useCallback((expiresAt: string) => {
    const end = new Date(expiresAt);
    if (Number.isNaN(end.getTime())) return 'Disponibilite inconnue';

    const diffMs = end.getTime() - nowMs;
    if (diffMs <= 0) return 'Expiree';

    const totalMinutes = Math.ceil(diffMs / (1000 * 60));
    if (totalMinutes < 60) return `Expire dans ${totalMinutes} min`;

    const totalHours = Math.floor(totalMinutes / 60);
    const remainingMinutes = totalMinutes % 60;
    if (totalHours < 24) {
      return remainingMinutes > 0
        ? `Expire dans ${totalHours}h${remainingMinutes}`
        : `Expire dans ${totalHours}h`;
    }

    const days = Math.floor(totalHours / 24);
    return `Expire dans ${days} jour${days > 1 ? 's' : ''}`;
  }, [nowMs]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshOffers();
    }, [])
  );

  // Ã©/Ãª        
  useFocusEffect(
    useCallback(() => {
      // Marquer que le dashboard est actif
      isDashboardFocusedRef.current = true;

      //  Ã©  v   Ã©
      if (!isAuthenticated || !user) {
        return;
      }

      //   Ã©  v   
      //      yÃ¨      x Ã©
      //  Ã©v     Ã´  

      // Charger les utilisateurs disponibles au premier focus
      if (!initialLoadDone.current) {
        initialLoadDone.current = true;
        //         ( )    Ã©
        if (user.lat && user.lng) {
          const profileLocation = { lat: user.lat, lng: user.lng };
          setUserLocation(profileLocation);
          //    Ã© v    
          loadAvailableUsers(profileLocation);
        } else {
          // ,    (  Ã      v)
          loadAvailableUsers();
        }
      }

      //       Ã¨   (  )
      if (!locationPermissionRequestedRef.current) {
        locationPermissionRequestedRef.current = true;
        // Ã©      Ã¨- ( )
        requestLocationPermission().catch(() => {
          // Ignorer les erreurs, ne pas bloquer l'authentification
        });
      }

      // Ã©  v   (Ãª    '   Ã©)
      startLocationTracking().then((subscription) => {
        // Ã© '       Ã© v '  
        if (isDashboardFocusedRef.current && isAuthenticated && user) {
          locationSubscriptionRef.current = subscription;
          pendingSubscriptionRef.current = null; // Nettoyer la ref
        } else if (subscription) {
          //   '    , Ãª Ã©
          console.log('Dashboard non actif, arret immediat du tracking GPS');
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
        console.log('Cleanup dashboard - Arret de toutes les operations');
        //     '   
        isDashboardFocusedRef.current = false;
        
        // Ãª    
        activeTimersRef.current.forEach((timer) => {
          clearTimeout(timer);
        });
        activeTimersRef.current.clear();
        
        // Ãª      
        isLoadingUsersRef.current = false;
        
        //   v    
        // Ãª '      Ã©   x
        if (pendingSubscriptionRef.current) {
          console.log('Arret de la subscription GPS en cours de creation');
          pendingSubscriptionRef.current.remove();
          pendingSubscriptionRef.current = null;
        }
        
        // Ãª    Ã©   
        if (locationSubscriptionRef.current) {
          console.log('Arret de la subscription GPS stockee');
          locationSubscriptionRef.current.remove();
          locationSubscriptionRef.current = null;
        }

        //  v '  Ã©   ,     'Ãª
      };
    }, [isAuthenticated, user])
  );

  //          Ã   (  Ã©       )
  //     Ã©v    Ã©
  useEffect(() => {
    // Ne recharger que si le dashboard est actif
    if (!isDashboardFocusedRef.current) {
      return;
    }

    if (!userLocation || !isAuthenticated || !user) {
      return;
    }

    // Ã©     v Ã©  Ã¨ v (   Ã¨)
    // .      ',  .    
    const hasChanged = !lastLocationRef.current || 
      Math.abs(lastLocationRef.current.lat - userLocation.lat) > 0.001 ||
      Math.abs(lastLocationRef.current.lng - userLocation.lng) > 0.001;
    
    if (hasChanged) {
      //     Ã©v    Ã©
      const debounceTimer = setTimeout(() => {
        // Ã© Ã  v       v  
        if (!isDashboardFocusedRef.current) {
          return;
        }
        lastLocationRef.current = userLocation;
        loadAvailableUsers(userLocation);
      }, ) //    v    Ã©v    Ã©

      //    Ã      
      activeTimersRef.current.add(debounceTimer);

      return () => {
        clearTimeout(debounceTimer);
        activeTimersRef.current.delete(debounceTimer);
      };
    }
  }, [userLocation?.lat, userLocation?.lng, isAuthenticated, user]);

  // Ã©y      ' v    (Ã¨   Ã¨)
  // Seulement si le dashboard est actif
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      // Ne faire quelque chose que si le dashboard est actif
      if (!isDashboardFocusedRef.current) {
        return;
      }
      
      if (nextAppState === 'active' && isAuthenticated && user && locationPermissionRequestedRef.current) {
        // Ã©y      ' v  Ã¨
        //   Ã¨   Ã©  Ã©v  
        const timer = setTimeout(() => {
          // Ã© Ã  v      
          if (!isDashboardFocusedRef.current) {
            return;
          }
          if (isAuthenticated && user) {
            requestLocationPermission().catch(() => {});
          }
        }, 500);
        
        //    Ã      
        activeTimersRef.current.add(timer);
      }
    });

    return () => {
      subscription.remove();
      // y    Ã© Ã  
      activeTimersRef.current.forEach((timer) => {
        clearTimeout(timer);
      });
      activeTimersRef.current.clear();
    };
  }, [isAuthenticated, user]);

  const requestLocationPermission = async () => {
    try {
      // Ã© '   v    vÃ©
      const isLocationEnabled = await Location.hasServicesEnabledAsync();
      if (!isLocationEnabled) {
        //  Ã  ' ' v v   ( )
        // Ne pas bloquer l'authentification, juste informer
        Alert.alert(
          'Localisation desactivee',
          'Pour afficher les utilisateurs a proximite, veuillez activer la localisation dans les parametres de votre appareil.',
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
              text: 'Ouvrir les parametres',
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
        console.warn('Permission de localisation refusee');
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
      // y '  Ã©Ã©     
      try {
        const cachedLocationStr = await AsyncStorage.getItem('user_location');
        if (cachedLocationStr) {
          const cachedLocation = JSON.parse(cachedLocationStr);
          //      Ã©    Ã©
          //      ,   Ã©Ã©  
          if (cachedLocation.lat && cachedLocation.lng) {
            setUserLocation(cachedLocation);
          }
        }
      } catch {
        // Ignorer les erreurs de cache
      }

      //     v  Ã©      Ã© 
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
          //  Ã    Ã¨- v   Ã©
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

      //  Ã          Ã¨- ( )
      if (user) {
        updateLocation(newLocation.lat, newLocation.lng).catch(() => {
          // Ignorer les erreurs silencieusement
        });
      }

      // v     v  v    Ã©v   Ã    Ã©
      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 30000, // Mettre a jour toutes les 30 secondes
          distanceInterval: 100, // Ou tous les 100 metres
        },
        (location) => {
          //   Ã          
          //      
          if (!isDashboardFocusedRef.current) {
            //  Ã¨   Ã     '    
            //     ' 'Ãª  
            return;
          }

          const updatedLocation = {
            lat: location.coords.latitude,
            lng: location.coords.longitude,
          };

          // Ã©     v Ã©  Ã¨ v v   Ã  
          //  Ã©v   Ã       Ã´  
          const hasChanged = !userLocation || 
            Math.abs(userLocation.lat - updatedLocation.lat) > 0.001 ||
            Math.abs(userLocation.lng - updatedLocation.lng) > 0.001;

          if (hasChanged) {
            setUserLocation(updatedLocation);
            // Sauvegarder dans le cache
            AsyncStorage.setItem('user_location', JSON.stringify(updatedLocation)).catch(() => {});

            //  Ã          Ã¨- (v )
            //     Ã©v   Ã    Ã©
            if (user && isAuthenticated) {
              //   Ã        x
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
      // Ã© '    Ã¨ 
      if (error.message?.includes('location is unavailable') || error.message?.includes('timeout')) {
        console.log('Localisation non disponible ou timeout');
        // Utiliser la position du profil utilisateur si disponible
        if (user?.lat && user?.lng) {
          const profileLocation = { lat: user.lat, lng: user.lng };
          setUserLocation(profileLocation);
          await AsyncStorage.setItem('user_location', JSON.stringify(profileLocation)).catch(() => {});
        } else {
          //   Ã©    Ã©   Ã©v
          const defaultLocation = { lat: -4.3276, lng: 15.3136 }; // Kinshasa par defaut
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
      console.log('Dashboard non actif, skip chargement des utilisateurs');
      isLoadingUsersRef.current = false; // Reinitialiser le flag
      return;
    }

    // v    
    if (isLoadingUsersRef.current) {
      console.log('Chargement des utilisateurs deja en cours, skip');
      return;
    }

    //    Ã  x    
    const now = Date.now();
    if (lastLoadUsersTimeRef.current && now - lastLoadUsersTimeRef.current < 5000) {
      console.log('Chargement des utilisateurs trop recent, skip');
      return;
    }

    try {
      isLoadingUsersRef.current = true;
      lastLoadUsersTimeRef.current = now;

      // Ã© Ã  v       v  
      if (!isDashboardFocusedRef.current) {
        console.log('Dashboard non actif apres le chargement, arret');
        isLoadingUsersRef.current = false;
        return;
      }

      // Utiliser la position fournie ou la position actuelle
      const currentLocation = locationOverride || userLocation;
      if (!currentLocation) {
        setAvailableUsers([]);
        return;
      }

      //      v ' 
      const users = await getAvailableUsers({
        center: currentLocation || undefined,
        radiusKm: PROXIMITY_RADIUS_KM,
        onlineWithinMinutes: ONLINE_WINDOW_MINUTES,
      });
      
      // Verifier a nouveau que le dashboard est toujours actif apres le chargement
      if (!isDashboardFocusedRef.current) {
        console.log('Dashboard non actif apres le chargement, arret');
        isLoadingUsersRef.current = false;
        return;
      }
      // Convertir les donnees de la DB en format User
      const formattedUsers: User[] = users.map((u: any) => {
        const userGender = (u.gender === 'male' || u.gender === 'female') ? u.gender : 'female';
        // Recuperer la photo depuis la DB
        const rawPhoto = u.photo || null;
        // Convertir les coordonnees de maniere robuste
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
          photo: rawPhoto || getDefaultProfileImage(userGender), // URL de la photo ou image par defaut
          rawPhoto: rawPhoto, // Conserver la photo brute pour determiner la source d'image
          description: u.description || '',
          rating: parseFloat(u.rating) || 0,
          reviewCount: u.review_count || 0,
          isSubscribed: u.is_subscribed || false,
          subscriptionStatus: u.subscription_status || 'pending',
          lastSeen: u.last_seen || 'Hors ligne', // Ne pas mettre 'En ligne' par defaut
          gender: userGender,
          lat: parseCoord(u.lat),
          lng: parseCoord(u.lng),
          isAvailable: u.is_available,
        };
      });

      // Calculer les distances si on a la position de l'utilisateur
      if (currentLocation) {
        formattedUsers.forEach((u) => {
          // Ã©   Ã©  v ( ,  ,  v  )
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
            // Ã© v
            u.distance = undefined;
          }
        });

        // Filtrer les utilisateurs strictement en ligne et dans un rayon de 10 km
        const filteredUsers = formattedUsers.filter((u) => {
          if (u.distance === undefined || isNaN(u.distance)) return false;
          if (u.distance < 0 || u.distance > PROXIMITY_RADIUS_KM) return false;
          return isUserOnlineNow(u.lastSeen);
        });

        // Trier par distance
        filteredUsers.sort((a, b) => (a.distance || 999) - (b.distance || 999));

        setAvailableUsers(filteredUsers);

        //   v Ã©     Ã¨- ( )
        // Ne pas attendre pour afficher les utilisateurs
        const ratingsMap = new Map<string, { average: number; count: number }>();
        //  v  v  Ã© '
        filteredUsers.forEach((u) => {
          ratingsMap.set(u.id, { average: u.rating || 0, count: u.reviewCount || 0 });
        });
        setUserRatings(ratingsMap);

        //   v v  Ã¨-
        Promise.all(
          filteredUsers.map(async (u) => {
            try {
              const avgRating = await getUserAverageRating(u.id);
              ratingsMap.set(u.id, avgRating);
              //  Ã       Ã©
              setUserRatings(new Map(ratingsMap));
            } catch {
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
    } catch (error) {
      console.error('Error loading available users:', error);
    } finally {
      // Reinitialiser le flag de chargement
      isLoadingUsersRef.current = false;
    }
  }, [userLocation, getAvailableUsers, getUserAverageRating, isUserOnlineNow]);

  // Rafraichir la liste proche en continu, meme si l'utilisateur ne se deplace pas.
  useFocusEffect(
    useCallback(() => {
      if (!isAuthenticated || !user) {
        return;
      }

      const intervalId = setInterval(() => {
        if (!isDashboardFocusedRef.current) return;
        loadAvailableUsers(userLocation || undefined);
      }, 15000);

      return () => {
        clearInterval(intervalId);
      };
    }, [isAuthenticated, user, userLocation?.lat, userLocation?.lng, loadAvailableUsers])
  );

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

  //  Ã©   Ã©  
  const handleMarkerSelect = useCallback((markerId: string, user?: User) => {
    if (markerId === 'current-user') {
      setSelectedMarkerId(prev => prev === markerId ? null : markerId);
      setSelectedUserForCallout(null);
    } else if (user) {
      //  Ã©    ' Ã©Ã©
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

  const handleOpenOffer = useCallback((offer: Offer) => {
    router.push({
      pathname: '/(screens)/offer-details',
      params: { offerId: offer.id },
    });
  }, [router]);

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
              Ã©
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
                 Ã©v     x.{''}
              xÃ©z   -- v
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
              //      Ã¨ Ã© v    
              setTimeout(() => setMapReady(true), 100);
            }}
          >
            <Camera
              centerCoordinate={[userLocation.lng, userLocation.lat]}
              zoomLevel={13}
              animationMode="flyTo"
              animationDuration={2000}
            />
            
            {/*   '  - zx Ã©vÃ©  Ãª - */}
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

            {/*      - zx    Ãª     */}
            {mapReady ? (() => {
              const validUsers = nearbyUsers.filter((nearbyUser) => {
                return (
                  nearbyUser.lat !== undefined &&
                  nearbyUser.lat !== null &&
                  nearbyUser.lng !== undefined &&
                  nearbyUser.lng !== null
                );
              });

              //    Ã  .  ( Ã¨ )
              const usersAtZero = validUsers.filter(u => 
                u.distance === 0 || (u.distance !== undefined && u.distance < 0.001)
              );
              const usersAtZeroCount = usersAtZero.length;

              // Ã©  x    Ã  . 
              let zeroIndex = 0;

              return validUsers.map((user) => {
                //    Ã  .  (Ãª ), Ã© Ã©Ã¨        
                let latOffset = 0;
                let lngOffset = 0;
                
                if (user.distance === 0 || (user.distance !== undefined && user.distance < 0.001)) {
                  // Ã©      
                  //     v . Ã© (v  Ã¨) - z   Ãª  v  Ã©Ã©
                  const radius = 0.0015;
                  // Angle en radians pour placer les marqueurs en cercle
                  //     ' Ã  .   Ã© Ã©
                  //  Ã   Ã© (Ã  )    
                  const angle = usersAtZeroCount > 1 ? (zeroIndex * 2 * Math.PI) / usersAtZeroCount : Math.PI / 4; // Par defaut a 45 degres si seul
                  // Calculer les offsets en latitude et longitude
                  //     Ãª Ã©          
                  const lat = user.lat || (userLocation?.lat || 0);
                  const latRad = lat * Math.PI / 180;
                  latOffset = radius * Math.cos(angle);
                  lngOffset = radius * Math.sin(angle) / Math.cos(latRad); // Ajustement pour la projection Mercator
                  
                  zeroIndex++;
                }
                
                // Ã©   Ã©  v v    
                const userLat = (user.lat || 0) + latOffset;
                const userLng = (user.lng || 0) + lngOffset;
                
                // Ã©   Ã©v   x
                if (!PointAnnotation || !userLocation || 
                    userLat === 0 || userLng === 0 ||
                    isNaN(userLat) || isNaN(userLng) ||
                    !isFinite(userLat) || !isFinite(userLng) ||
                    user.lat === undefined || user.lat === null ||
                    user.lng === undefined || user.lng === null) {
                  return null;
                }
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
                      />
                      {isUserOnlineNow(user.lastSeen) ? <View style={styles.onlineIndicator} /> : null}
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

      {/*      - ' Ã© */}
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
          <View style={styles.offersSummaryCard}>
            <View style={styles.offersSummaryIcon}>
              <Ionicons name="sparkles-outline" size={18} color={colors.pink500} />
            </View>
            <View style={styles.offersSummaryTextBox}>
              <Text style={styles.offersSummaryTitle}>Offres actives maintenant</Text>
              <Text style={styles.offersSummarySubtitle}>
                Tu vois seulement les offres disponibles et non expirees.
              </Text>
            </View>
            <Text style={styles.offersSummaryCount}>{availableOffers.length}</Text>
          </View>

          <TouchableOpacity
            style={styles.offerTabContent}
            onPress={() => router.push('/(screens)/create-offer')}
          >
            <Ionicons name="add-circle" size={24} color={colors.pink500} />
            <Text style={styles.offerTabContentText}>Creer une nouvelle offre</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.offerTabContent, styles.offerTabContentPink]}
            onPress={() => router.push('/(screens)/offers')}
          >
            <Ionicons name="gift" size={24} color="#ffffff" />
            <Text style={[styles.offerTabContentText, styles.offerTabContentTextPink]}>
              Voir toutes les offres
            </Text>
            <Ionicons name="chevron-forward" size={20} color="#ffffff" />
          </TouchableOpacity>

          {offersPreview.length > 0 ? (
            <View style={styles.offersPreviewList}>
              {offersPreview.map((offer) => {
                const offerTypesToDisplay = (offer.offerTypes && offer.offerTypes.length > 0)
                  ? offer.offerTypes
                  : (offer.offerType ? [offer.offerType] : []);

                return (
                  <TouchableOpacity
                    key={offer.id}
                    style={styles.offerPreviewCard}
                    onPress={() => handleOpenOffer(offer)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.offerPreviewHeader}>
                      <View style={styles.offerPreviewTypes}>
                        {offerTypesToDisplay.slice(0, 2).map((type, index) => (
                          <View key={`${offer.id}-${type}-${index}`} style={styles.offerPreviewTypeBadge}>
                            <Ionicons
                              name={OFFER_TYPE_ICONS[type]}
                              size={12}
                              color={colors.pink500}
                            />
                            <Text style={styles.offerPreviewTypeText}>{OFFER_TYPE_LABELS[type]}</Text>
                          </View>
                        ))}
                      </View>
                      <Badge variant="success" style={styles.offerPreviewStatusBadge}>
                        Disponible
                      </Badge>
                    </View>

                    <Text style={styles.offerPreviewTitle} numberOfLines={1}>
                      {offer.title}
                    </Text>

                    <View style={styles.offerPreviewMeta}>
                      <View style={styles.offerPreviewMetaItem}>
                        <Ionicons name="person-outline" size={13} color={colors.textSecondary} />
                        <Text style={styles.offerPreviewMetaText} numberOfLines={1}>
                          {offer.author?.pseudo || 'Utilisateur'}
                        </Text>
                      </View>
                      {offer.location ? (
                        <View style={styles.offerPreviewMetaItem}>
                          <Ionicons name="location-outline" size={13} color={colors.textSecondary} />
                          <Text style={styles.offerPreviewMetaText} numberOfLines={1}>
                            {offer.location}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.offerPreviewFooter}>
                      <View style={styles.offerPreviewTimeBadge}>
                        <Ionicons name="time-outline" size={12} color={colors.pink400} />
                        <Text style={styles.offerPreviewTimeText}>
                          {formatOfferTimeLeft(offer.expiresAt)}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <View style={styles.offersEmptyCard}>
              <Ionicons name="gift-outline" size={20} color={colors.textTertiary} />
              <Text style={styles.offersEmptyText}>Aucune offre active pour le moment.</Text>
            </View>
          )}
        </View>

        <Text style={styles.sectionTitle}>Ã€ proximitÃ©</Text>
        {nearbyUsers.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={48} color={colors.textTertiary} />
            <Text style={styles.emptyStateText}>
              {userLocation 
                ? 'Aucun utilisateur disponible dans un rayon de 10 km'
                : 'En attente de votre position...'}
            </Text>
          </View>
        ) : (
          nearbyUsers.map((user) => (
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
              {isUserOnlineNow(user.lastSeen) ? <View style={styles.onlineBadge} /> : null}
            </View>
            <View style={styles.userInfo}>
              <View style={styles.userHeader}>
                <Text style={styles.userName}>{user.pseudo}</Text>
                <Text style={styles.userSeparator}>Â·</Text>
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
  offersSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: `${colors.pink500}44`,
    backgroundColor: `${colors.pink500}14`,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  offersSummaryIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${colors.pink500}22`,
  },
  offersSummaryTextBox: {
    flex: 1,
  },
  offersSummaryTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  offersSummarySubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  offersSummaryCount: {
    color: colors.pink400,
    fontSize: 22,
    fontWeight: '700',
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
  offersPreviewList: {
    gap: 10,
  },
  offerPreviewCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  offerPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  offerPreviewTypes: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
  },
  offerPreviewTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundTertiary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    gap: 4,
  },
  offerPreviewTypeText: {
    color: colors.pink400,
    fontSize: 11,
    fontWeight: '600',
  },
  offerPreviewStatusBadge: {
    backgroundColor: `${colors.green500}22`,
  },
  offerPreviewTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  offerPreviewMeta: {
    gap: 6,
  },
  offerPreviewMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  offerPreviewMetaText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 12,
  },
  offerPreviewFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.borderSecondary,
  },
  offerPreviewTimeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  offerPreviewTimeText: {
    color: colors.pink400,
    fontSize: 12,
    fontWeight: '600',
  },
  offersEmptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
    backgroundColor: `${colors.backgroundSecondary}70`,
  },
  offersEmptyText: {
    color: colors.textSecondary,
    fontSize: 13,
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
  //    Ã©     y
  //  Ã©  Ãª  ,     Ã©    v  Ãª Ã©
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



















