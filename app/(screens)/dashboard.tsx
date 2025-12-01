import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { colors } from '../../constants/colors';
import { Badge } from '../../components/ui/Badge';
import { ImageWithFallback } from '../../components/ImageWithFallback';
import { User } from '../../types';
import { useUser } from '../../context/UserContext';
import { useAuth } from '../../context/AuthContext';
import { useBooking } from '../../context/BookingContext';

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

type Tab = 'home' | 'search' | 'messages' | 'profile';

export default function Dashboard() {
  const router = useRouter();
  const { currentUser, setSelectedUser } = useUser();
  const { isAuthenticated, isLoading, user, updateUser } = useAuth();
  const { getAvailableUsers } = useBooking();
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(null);

  // Protection de route
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/(screens)/auth');
    }
  }, [isAuthenticated, isLoading]);

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

  // Charger les utilisateurs disponibles
  useEffect(() => {
    if (isAuthenticated && user) {
      loadAvailableUsers();
    }
  }, [isAuthenticated, user, userLocation]); // Recharger si la position change

  // Demander la permission de géolocalisation et suivre la position
  useEffect(() => {
    // Ne démarrer le suivi que si authentifié
    if (!isAuthenticated || !user) {
      // Arrêter le suivi si on n'est plus authentifié
      if (locationSubscriptionRef.current) {
        locationSubscriptionRef.current.remove();
        locationSubscriptionRef.current = null;
      }
      return;
    }

    requestLocationPermission();
    startLocationTracking().then((subscription) => {
      // Vérifier qu'on est toujours authentifié avant d'assigner la subscription
      if (isAuthenticated && user) {
        locationSubscriptionRef.current = subscription;
      } else if (subscription) {
        // Si on n'est plus authentifié, arrêter immédiatement
        subscription.remove();
      }
    });

    return () => {
      // Nettoyer le suivi de position
      if (locationSubscriptionRef.current) {
        locationSubscriptionRef.current.remove();
        locationSubscriptionRef.current = null;
      }
    };
  }, [isAuthenticated, user]);

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.warn('Permission de localisation refusée');
        return;
      }
    } catch (error) {
      console.error('Error requesting location permission:', error);
    }
  };

  const startLocationTracking = async (): Promise<Location.LocationSubscription | null> => {
    try {
      // Obtenir la position actuelle
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const newLocation = {
        lat: location.coords.latitude,
        lng: location.coords.longitude,
      };

      setUserLocation(newLocation);

      // Mettre à jour la position dans le profil Supabase
      if (user) {
        await updateUser({
          lat: newLocation.lat,
          lng: newLocation.lng,
        });
        // Recharger les utilisateurs disponibles avec la nouvelle position
        loadAvailableUsers();
      }

      // Suivre les changements de position
      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 5000, // Mettre à jour toutes les 5 secondes
          distanceInterval: 10, // Ou tous les 10 mètres
        },
        (location) => {
          const updatedLocation = {
            lat: location.coords.latitude,
            lng: location.coords.longitude,
          };

          setUserLocation(updatedLocation);

          // Mettre à jour la position dans le profil Supabase
          // Vérifier qu'on est toujours authentifié avant de mettre à jour
          if (user && isAuthenticated) {
            updateUser({
              lat: updatedLocation.lat,
              lng: updatedLocation.lng,
            }).catch((error) => {
              // Ignorer les erreurs si on n'est plus authentifié
              if (!isAuthenticated) {
                console.log('⚠️ Mise à jour de position ignorée (non authentifié)');
              } else {
                console.error('Error updating location:', error);
              }
            });
          }
        }
      );

      return subscription;
    } catch (error: any) {
      // Gérer l'erreur de localisation de manière gracieuse
      if (error.message?.includes('location is unavailable')) {
        console.log('⚠️ Localisation non disponible (émulateur ou permissions refusées)');
        // Optionnel : définir une position par défaut pour le développement
        const defaultLocation = { lat: -4.3276, lng: 15.3136 }; // Kinshasa par défaut
        setUserLocation(defaultLocation);
      } else {
        console.error('Error starting location tracking:', error);
      }
      return null;
    }
  };

  const loadAvailableUsers = async () => {
    try {
      const users = await getAvailableUsers();
      // Convertir les données de la DB en format User
      const formattedUsers: User[] = users.map((u: any) => ({
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

      // Calculer les distances si on a la position de l'utilisateur
      if (userLocation) {
        formattedUsers.forEach((u) => {
          if (u.lat && u.lng) {
            u.distance = calculateDistance(
              userLocation.lat,
              userLocation.lng,
              u.lat,
              u.lng
            );
          }
        });

        // Filtrer les utilisateurs à 0-10 km seulement
        const filteredUsers = formattedUsers.filter((u) => {
          // Inclure les utilisateurs avec distance calculée entre 0 et 10 km
          if (u.distance !== undefined) {
            return u.distance >= 0 && u.distance <= 10;
          }
          // Exclure les utilisateurs sans distance (pas de coordonnées)
          return false;
        });

        // Trier par distance
        filteredUsers.sort((a, b) => (a.distance || 999) - (b.distance || 999));

        setAvailableUsers(filteredUsers);
      } else {
        // Si pas de position, ne pas afficher d'utilisateurs
        setAvailableUsers([]);
      }
      
      // Log pour déboguer
      const finalUsers = userLocation ? formattedUsers.filter((u) => {
        return u.distance !== undefined && u.distance >= 0 && u.distance <= 10;
      }) : [];
      console.log('📊 Utilisateurs disponibles:', {
        total: formattedUsers.length,
        avecCoordonnees: formattedUsers.filter(u => u.lat && u.lng).length,
        sansCoordonnees: formattedUsers.filter(u => !u.lat || !u.lng).length,
        dansRayon10km: finalUsers.length,
        userLocation: userLocation ? `${userLocation.lat}, ${userLocation.lng}` : 'non disponible',
      });
    } catch (error) {
      console.error('Error loading available users:', error);
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

  const handleViewProfile = (user: User) => {
    setSelectedUser(user);
    router.push('/(screens)/user-profile');
  };

  const handleTabClick = (tab: Tab) => {
    setActiveTab(tab);
    if (tab === 'search') router.push('/(screens)/search');
    if (tab === 'messages') router.push('/(screens)/chat');
    if (tab === 'profile') router.push('/(screens)/profile');
  };

  const tabs = [
    { id: 'home' as Tab, icon: 'home', label: 'Accueil' },
    { id: 'search' as Tab, icon: 'search', label: 'Recherche' },
    { id: 'messages' as Tab, icon: 'chatbubbles', label: 'Messages' },
    { id: 'profile' as Tab, icon: 'person', label: 'Profil' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>BOOKPLAN</Text>
        {currentUser?.isSubscribed && (
          <Badge variant="info" style={styles.badge}>
            Abonné
          </Badge>
        )}
      </View>

      {/* Map Section */}
      <View style={styles.mapSection}>
        {userLocation ? (
          <MapView
            provider={PROVIDER_GOOGLE}
            style={styles.map}
            initialRegion={{
              latitude: userLocation.lat,
              longitude: userLocation.lng,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }}
            region={{
              latitude: userLocation.lat,
              longitude: userLocation.lng,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }}
            showsUserLocation={false}
            showsMyLocationButton={false}
            toolbarEnabled={false}
          >
            {/* Marker pour l'utilisateur actuel - zIndex élevé pour être au-dessus */}
            <Marker
              coordinate={{
                latitude: userLocation.lat,
                longitude: userLocation.lng,
              }}
              title="Je suis ici"
              pinColor={colors.pink500}
              zIndex={1000}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={styles.currentUserMarker}>
                <Ionicons name="person" size={20} color="#ffffff" />
              </View>
            </Marker>

            {/* Markers pour les utilisateurs disponibles - zIndex plus bas pour être sous le marqueur utilisateur */}
            {(() => {
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
                  // Distance du centre : environ 0.0005 degrés (environ 55 mètres) - plus grand pour être visible
                  const radius = 0.0005;
                  // Angle en radians pour placer les marqueurs en cercle
                  // Utiliser le nombre total d'utilisateurs à 0.0 km pour répartir équitablement
                  const angle = usersAtZeroCount > 1 ? (zeroIndex * 2 * Math.PI) / usersAtZeroCount : 0;
                  // Calculer les offsets en latitude et longitude
                  // Note: la longitude doit être ajustée par le cosinus de la latitude pour un cercle correct
                  const lat = user.lat || userLocation.lat;
                  const latRad = lat * Math.PI / 180;
                  latOffset = radius * Math.cos(angle);
                  lngOffset = radius * Math.sin(angle) / Math.cos(latRad); // Ajustement pour la projection Mercator
                  
                  zeroIndex++;
                }
                
                console.log(`📍 Affichage marqueur pour ${user.pseudo} à (${user.lat}, ${user.lng}), distance: ${user.distance?.toFixed(3)} km, offset: (${latOffset.toFixed(6)}, ${lngOffset.toFixed(6)})`);
                return (
                  <Marker
                    key={user.id}
                    coordinate={{
                      latitude: (user.lat || 0) + latOffset,
                      longitude: (user.lng || 0) + lngOffset,
                    }}
                    title={user.pseudo}
                    description={`${user.distance?.toFixed(1) || 'N/A'} km - ${user.rating.toFixed(1)} ⭐`}
                    onPress={() => handleViewProfile(user)}
                    zIndex={100}
                    anchor={{ x: 0.5, y: 0.5 }}
                  >
                    <View style={styles.userMarker}>
                      <ImageWithFallback
                        source={{ uri: user.photo }}
                        style={styles.markerImage}
                      />
                      <View style={styles.onlineIndicator} />
                    </View>
                  </Marker>
                );
              });
            })()}
          </MapView>
        ) : (
          <View style={styles.mapPlaceholder}>
            <Ionicons name="location" size={24} color={colors.purple400} style={{ opacity: 0.5 }} />
            <Text style={styles.mapPlaceholderText}>Chargement de la carte...</Text>
          </View>
        )}
      </View>

      {/* Users List */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        nestedScrollEnabled={true}
        bounces={true}
        scrollEventThrottle={16}
      >
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
              <ImageWithFallback
                source={{ uri: user.photo }}
                style={styles.userImage}
              />
              {user.lastSeen === 'En ligne' && <View style={styles.onlineBadge} />}
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
                    {user.distance !== undefined ? `${user.distance.toFixed(1)} km` : 'N/A'}
                  </Text>
                </View>
                <View style={styles.metaItem}>
                  <Ionicons name="star" size={12} color={colors.yellow500} />
                  <Text style={styles.metaText}>{user.rating.toFixed(1)}</Text>
                  <Text style={styles.metaTextSecondary}>({user.reviewCount || 0})</Text>
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
            <Ionicons
              name={tab.icon as any}
              size={24}
              color={activeTab === tab.id ? colors.pink500 : colors.textTertiary}
            />
            <Text
              style={[
                styles.tabLabel,
                { color: activeTab === tab.id ? colors.pink400 : colors.textTertiary },
              ]}
            >
              {tab.label}
            </Text>
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
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  badge: {
    marginLeft: 8,
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
    fontSize: 14,
    color: colors.textTertiary,
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
  },
  markerImage: {
    width: '100%',
    height: '100%',
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
    paddingHorizontal: 24,
    backgroundColor: `${colors.backgroundSecondary}80`,
    borderTopWidth: 1,
    borderTopColor: colors.borderSecondary,
  },
  tab: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  tabLabel: {
    fontSize: 12,
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
});

