import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import Mapbox, { MapView, PointAnnotation, Camera } from '@rnmapbox/maps';
import '../../lib/mapbox'; // Initialiser Mapbox avec le token
import { colors } from '../../constants/colors';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ImageWithFallback } from '../../components/ImageWithFallback';
import { useUser } from '../../context/UserContext';
import { useBooking } from '../../context/BookingContext';
import { useAuth } from '../../context/AuthContext';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

export default function BookingScreen() {
  const router = useRouter();
  const { selectedUser } = useUser();
  const { user: currentUser } = useAuth();
  const { createBooking, getCompanionshipTopics, refreshBookings } = useBooking();
  const [requestSent, setRequestSent] = useState(false);
  const [requestAccepted, setRequestAccepted] = useState(false);
  const [bookingDate, setBookingDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateInput, setDateInput] = useState('');
  const [timeInput, setTimeInput] = useState('');
  const [durationHours, setDurationHours] = useState('1');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [topics, setTopics] = useState<any[]>([]);
  const [isLoadingTopics, setIsLoadingTopics] = useState(false);
  const [showTopicPicker, setShowTopicPicker] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [mapRegion, setMapRegion] = useState<{ latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } | null>(null);
  const [isLoadingAddress, setIsLoadingAddress] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // Initialiser les inputs avec la date/heure actuelle
  React.useEffect(() => {
    const now = new Date();
    setDateInput(now.toISOString().split('T')[0]); // Format YYYY-MM-DD
    setTimeInput(now.toTimeString().slice(0, 5)); // Format HH:MM
  }, []);

  // Charger les sujets de compagnie disponibles
  React.useEffect(() => {
    const loadTopics = async () => {
      setIsLoadingTopics(true);
      try {
        const { error, topics: loadedTopics } = await getCompanionshipTopics();
        if (!error && loadedTopics) {
          setTopics(loadedTopics);
        }
      } catch (error) {
        console.error('Error loading topics:', error);
      } finally {
        setIsLoadingTopics(false);
      }
    };
    loadTopics();
  }, [getCompanionshipTopics]);

  // Initialiser la carte avec la position de l'utilisateur
  useEffect(() => {
    const initializeMap = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          // Utiliser une position par défaut (Kinshasa)
          const defaultRegion: Region = {
            latitude: -4.3276,
            longitude: 15.3136,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          };
          setMapRegion(defaultRegion);
          setSelectedLocation({
            lat: -4.3276,
            lng: 15.3136,
          });
          return;
        }

        try {
          const currentLocation = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
            timeout: 5000, // Timeout de 5 secondes
          });

          const region: Region = {
            latitude: currentLocation.coords.latitude,
            longitude: currentLocation.coords.longitude,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          };
          setMapRegion(region);
          setSelectedLocation({
            lat: currentLocation.coords.latitude,
            lng: currentLocation.coords.longitude,
          });
        } catch (locationError: any) {
          // Si la localisation n'est pas disponible (émulateur, services désactivés, etc.)
          // Utiliser une position par défaut sans afficher d'erreur
          if (locationError.message?.includes('location is unavailable') || 
              locationError.message?.includes('Current location is unavailable')) {
            const defaultRegion: Region = {
              latitude: -4.3276,
              longitude: 15.3136,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            };
            setMapRegion(defaultRegion);
            setSelectedLocation({
              lat: -4.3276,
              lng: 15.3136,
            });
          } else {
            // Pour les autres erreurs, utiliser aussi la position par défaut
            const defaultRegion: Region = {
              latitude: -4.3276,
              longitude: 15.3136,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            };
            setMapRegion(defaultRegion);
            setSelectedLocation({
              lat: -4.3276,
              lng: 15.3136,
            });
          }
        }
      } catch (error: any) {
        // En cas d'erreur générale, utiliser une position par défaut
        const defaultRegion: Region = {
          latitude: -4.3276,
          longitude: 15.3136,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        };
        setMapRegion(defaultRegion);
        setSelectedLocation({
          lat: -4.3276,
          lng: 15.3136,
        });
      }
    };

    if (showMapPicker) {
      initializeMap();
    }
  }, [showMapPicker]);

  // Fonction pour obtenir l'adresse à partir des coordonnées (géocodage inverse)
  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      setIsLoadingAddress(true);
      const addresses = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      
      if (addresses && addresses.length > 0) {
        const address = addresses[0];
        // Construire l'adresse complète
        const addressParts = [
          address.street,
          address.streetNumber,
          address.district,
          address.city,
          address.region,
          address.country,
        ].filter(Boolean);
        
        const fullAddress = addressParts.join(', ') || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        setLocation(fullAddress);
        return fullAddress;
      } else {
        // Si pas d'adresse trouvée, utiliser les coordonnées
        const coordAddress = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        setLocation(coordAddress);
        return coordAddress;
      }
    } catch (error) {
      console.error('Error reverse geocoding:', error);
      // En cas d'erreur, utiliser les coordonnées
      const coordAddress = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      setLocation(coordAddress);
      return coordAddress;
    } finally {
      setIsLoadingAddress(false);
    }
  };

  // Gérer le clic sur la carte (Mapbox)
  const handleMapPress = (event: any) => {
    const { geometry } = event;
    if (geometry && geometry.coordinates) {
      const [longitude, latitude] = geometry.coordinates;
      setSelectedLocation({ lat: latitude, lng: longitude });
    }
  };

  // Confirmer la sélection de la carte
  const handleConfirmMapLocation = async () => {
    if (selectedLocation) {
      await reverseGeocode(selectedLocation.lat, selectedLocation.lng);
      setShowMapPicker(false);
    }
  };

  // Construire une adresse complète à partir d'un résultat de géocodage
  const buildFullAddress = (result: any): string => {
    const addressParts = [];
    
    // Ajouter le numéro et la rue
    if (result.streetNumber && result.street) {
      addressParts.push(`${result.streetNumber} ${result.street}`);
    } else if (result.street) {
      addressParts.push(result.street);
    }
    
    // Ajouter le quartier/district
    if (result.district) {
      addressParts.push(result.district);
    }
    
    // Ajouter la ville
    if (result.city) {
      addressParts.push(result.city);
    }
    
    // Ajouter la région/province
    if (result.region) {
      addressParts.push(result.region);
    }
    
    // Ajouter le code postal si disponible
    if (result.postalCode) {
      addressParts.push(result.postalCode);
    }
    
    // Ajouter le pays
    if (result.country) {
      addressParts.push(result.country);
    }
    
    // Si on a des parties, les joindre, sinon utiliser les coordonnées
    return addressParts.length > 0 
      ? addressParts.join(', ')
      : `${result.latitude.toFixed(6)}, ${result.longitude.toFixed(6)}`;
  };

  // Rechercher une adresse
  const handleSearchAddress = async () => {
    if (!searchQuery.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer une adresse à rechercher');
      return;
    }

    setIsSearching(true);
    setSearchResults([]);

    try {
      // Utiliser le géocodage pour rechercher l'adresse
      const results = await Location.geocodeAsync(searchQuery);
      
      if (results && results.length > 0) {
        // Enrichir les résultats avec l'adresse complète
        const enrichedResults = results.map((result: any) => ({
          ...result,
          fullAddress: buildFullAddress(result),
        }));
        
        setSearchResults(enrichedResults);
        
        // Centrer la carte sur le premier résultat
        const firstResult = enrichedResults[0];
        const region: Region = {
          latitude: firstResult.latitude,
          longitude: firstResult.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        };
        setMapRegion(region);
        setSelectedLocation({
          lat: firstResult.latitude,
          lng: firstResult.longitude,
        });
      } else {
        Alert.alert('Aucun résultat', 'Aucune adresse trouvée pour cette recherche');
      }
    } catch (error: any) {
      console.error('Error searching address:', error);
      Alert.alert('Erreur', 'Impossible de rechercher l\'adresse. Veuillez réessayer.');
    } finally {
      setIsSearching(false);
    }
  };

  // Sélectionner un résultat de recherche
  const handleSelectSearchResult = async (result: any) => {
    const region: Region = {
      latitude: result.latitude,
      longitude: result.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    };
    setMapRegion(region);
    setSelectedLocation({
      lat: result.latitude,
      lng: result.longitude,
    });
    
    // Récupérer l'adresse complète via géocodage inverse pour s'assurer d'avoir toutes les informations
    try {
      const addresses = await Location.reverseGeocodeAsync({
        latitude: result.latitude,
        longitude: result.longitude,
      });
      
      if (addresses && addresses.length > 0) {
        const fullAddress = buildFullAddress(addresses[0]);
        setLocation(fullAddress);
      } else {
        // Utiliser l'adresse construite depuis le résultat de recherche
        const fullAddress = result.fullAddress || buildFullAddress(result);
        setLocation(fullAddress);
      }
    } catch (error) {
      // En cas d'erreur, utiliser l'adresse construite depuis le résultat
      const fullAddress = result.fullAddress || buildFullAddress(result);
      setLocation(fullAddress);
    }
    
    setSearchResults([]);
    setSearchQuery('');
  };

  if (!selectedUser) {
    router.back();
    return null;
  }

  const handleDateConfirm = () => {
    // Combiner date et heure
    const dateStr = dateInput; // YYYY-MM-DD
    const timeStr = timeInput; // HH:MM
    const combinedDateTime = new Date(`${dateStr}T${timeStr}:00`);
    
    if (isNaN(combinedDateTime.getTime())) {
      Alert.alert('Erreur', 'Date ou heure invalide');
      return;
    }

    if (combinedDateTime < new Date()) {
      Alert.alert('Erreur', 'La date et l\'heure doivent être dans le futur');
      return;
    }

    setBookingDate(combinedDateTime);
    setShowDatePicker(false);
  };

  const handleSendRequest = async () => {
    if (!currentUser) return;

    // Valider la date
    const dateStr = dateInput;
    const timeStr = timeInput;
    const combinedDateTime = new Date(`${dateStr}T${timeStr}:00`);
    
    if (isNaN(combinedDateTime.getTime())) {
      Alert.alert('Erreur', 'Veuillez sélectionner une date et une heure valides');
      return;
    }

    if (combinedDateTime < new Date()) {
      Alert.alert('Erreur', 'La date et l\'heure doivent être dans le futur');
      return;
    }

    setIsLoading(true);
    setRequestSent(true); // Afficher immédiatement le feedback visuel
    
    try {
      const { error, booking } = await createBooking(
        selectedUser.id,
        combinedDateTime.toISOString(),
        parseInt(durationHours) || 1,
        location || undefined,
        selectedUser.lat,
        selectedUser.lng,
        notes || undefined,
        selectedTopicId || undefined
      );

      if (error) {
        setRequestSent(false); // Réinitialiser en cas d'erreur
        Alert.alert('Erreur', error.message || 'Impossible de créer la demande');
        setIsLoading(false);
        return;
      }

      // Rafraîchir les bookings en arrière-plan (sans attendre)
      refreshBookings().catch(err => console.error('Error refreshing bookings:', err));
      
      // Afficher la confirmation immédiatement
      Alert.alert('Succès', 'Votre demande a été envoyée', [
        {
          text: 'OK',
          onPress: () => {
            // Retourner au profil pour voir la demande active
            router.back();
          },
        },
      ]);
      
      setIsLoading(false);
    } catch (error: any) {
      setRequestSent(false); // Réinitialiser en cas d'erreur
      Alert.alert('Erreur', 'Une erreur est survenue');
      console.error('Create booking error:', error);
      setIsLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'Sélectionner une date';
    const date = new Date(`${dateStr}T00:00:00`);
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (timeStr: string) => {
    if (!timeStr) return 'Sélectionner une heure';
    return timeStr;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Demande de compagnie</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* User Card */}
        <View style={styles.userCard}>
          <ImageWithFallback source={{ uri: selectedUser.photo }} style={styles.userImage} />
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{selectedUser.pseudo}</Text>
            <Text style={styles.userAge}>{selectedUser.age} ans</Text>
          </View>
        </View>

        {!requestSent ? (
          <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.content}>
            <Text style={styles.sectionTitle}>Détails de la demande</Text>
            <View style={styles.detailsCard}>
              <TouchableOpacity
                style={styles.detailRow}
                onPress={() => setShowDatePicker(true)}
              >
                <Ionicons name="calendar-outline" size={20} color={colors.pink400} />
                <View style={styles.detailInfo}>
                  <Text style={styles.detailLabel}>Date et heure</Text>
                  <Text style={styles.detailValue}>
                    {formatDate(dateInput)} à {formatTime(timeInput)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
              </TouchableOpacity>
              <View style={styles.separator} />
              <View style={styles.detailRow}>
                <Ionicons name="time-outline" size={20} color={colors.pink400} />
                <View style={styles.detailInfo}>
                  <Text style={styles.detailLabel}>Durée (heures)</Text>
                  <Input
                    value={durationHours}
                    onChangeText={setDurationHours}
                    keyboardType="number-pad"
                    style={styles.durationInput}
                    containerStyle={{ marginTop: 8 }}
                  />
                </View>
              </View>
              <View style={styles.separator} />
              <View style={styles.detailRow}>
                <Ionicons name="location-outline" size={20} color={colors.pink400} />
                <View style={styles.detailInfo}>
                  <Text style={styles.detailLabel}>Lieu (optionnel)</Text>
                  <View style={styles.locationInputContainer}>
                    <Input
                      value={location}
                      onChangeText={setLocation}
                      placeholder="À définir ensemble"
                      style={styles.locationInput}
                      containerStyle={{ marginTop: 8, flex: 1 }}
                    />
                    <TouchableOpacity
                      style={styles.mapButton}
                      onPress={() => setShowMapPicker(true)}
                    >
                      <Ionicons name="map-outline" size={20} color={colors.pink500} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
              <View style={styles.separator} />
              <TouchableOpacity
                style={styles.detailRow}
                onPress={() => setShowTopicPicker(true)}
              >
                <Ionicons name="bookmark-outline" size={20} color={colors.pink400} />
                <View style={styles.detailInfo}>
                  <Text style={styles.detailLabel}>Sujet de compagnie (optionnel)</Text>
                  <Text style={styles.detailValue}>
                    {selectedTopicId 
                      ? topics.find(t => t.id === selectedTopicId)?.name || 'Sélectionner un sujet'
                      : 'Sélectionner un sujet'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
              </TouchableOpacity>
              <View style={styles.separator} />
              <View style={styles.detailRow}>
                <Ionicons name="document-text-outline" size={20} color={colors.pink400} />
                <View style={styles.detailInfo}>
                  <Text style={styles.detailLabel}>Notes (optionnel)</Text>
                  <Input
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Ajoutez des détails..."
                    multiline
                    numberOfLines={3}
                    style={styles.notesInput}
                    containerStyle={{ marginTop: 8 }}
                  />
                </View>
              </View>
            </View>

            <View style={styles.infoCard}>
              <Text style={styles.infoText}>
                Votre demande sera envoyée à {selectedUser.pseudo}. Une notification lui sera envoyée immédiatement.
              </Text>
            </View>

            <Button
              title="Envoyer la demande"
              onPress={handleSendRequest}
              icon={<Ionicons name="send" size={20} color="#ffffff" />}
              style={styles.button}
              loading={isLoading}
              disabled={isLoading}
            />
          </Animated.View>
        ) : !requestAccepted ? (
          <Animated.View entering={FadeIn} style={styles.pendingContainer}>
            <View style={styles.pendingIcon}>
              <Ionicons name="time-outline" size={40} color={colors.pink400} />
            </View>
            <Text style={styles.pendingTitle}>Demande envoyée</Text>
            <Text style={styles.pendingSubtitle}>En attente de la réponse de {selectedUser.pseudo}</Text>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn} style={styles.content}>
            <View style={styles.successContainer}>
              <View style={styles.successIcon}>
                <Ionicons name="checkmark-circle" size={40} color={colors.green500} />
              </View>
              <Text style={styles.successTitle}>Demande acceptée !</Text>
              <Text style={styles.successSubtitle}>
                {selectedUser.pseudo} a accepté votre demande de compagnie
              </Text>
            </View>

            <View style={styles.kycCard}>
              <Ionicons name="shield-checkmark" size={20} color={colors.yellow400} />
              <View style={styles.kycText}>
                <Text style={styles.kycTitle}>
                  Pour votre sécurité, nous recommandons une vérification d'identité instantanée.
                </Text>
                <Text style={styles.kycSubtitle}>
                  Prenez un selfie avec le signe ✌️ pour confirmer votre identité.
                </Text>
              </View>
            </View>

            <Button
              title="Vérification instantanée (KYC)"
              onPress={() => router.push('/(screens)/kyc')}
              icon={<Ionicons name="shield-checkmark" size={20} color="#ffffff" />}
              style={styles.button}
            />
            <Button
              title="Passer pour le moment"
              onPress={() => router.push('/(screens)/chat')}
              variant="outline"
              style={styles.button}
            />
          </Animated.View>
        )}
      </ScrollView>

      {/* Date/Time Picker Modal */}
      <Modal
        visible={showDatePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Sélectionner la date et l'heure</Text>
            
            <View style={styles.dateTimeInputs}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Date</Text>
                <Input
                  value={dateInput}
                  onChangeText={setDateInput}
                  placeholder="YYYY-MM-DD"
                  keyboardType="default"
                  containerStyle={styles.modalInput}
                />
                <Text style={styles.inputHint}>Format: AAAA-MM-JJ (ex: 2024-12-25)</Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Heure</Text>
                <Input
                  value={timeInput}
                  onChangeText={setTimeInput}
                  placeholder="HH:MM"
                  keyboardType="default"
                  containerStyle={styles.modalInput}
                />
                <Text style={styles.inputHint}>Format: HH:MM (ex: 20:00)</Text>
              </View>
            </View>

            <View style={styles.modalActions}>
              <Button
                title="Annuler"
                onPress={() => setShowDatePicker(false)}
                variant="outline"
                style={styles.modalButton}
              />
              <Button
                title="Confirmer"
                onPress={handleDateConfirm}
                style={styles.modalButton}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Map Picker Modal */}
      <Modal
        visible={showMapPicker}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setShowMapPicker(false)}
      >
        <SafeAreaView style={styles.mapModalContainer}>
          <View style={styles.mapHeader}>
            <TouchableOpacity onPress={() => setShowMapPicker(false)}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.mapHeaderTitle}>Sélectionner un lieu</Text>
            <View style={{ width: 24 }} />
          </View>

          {/* Search Bar */}
          <View style={styles.searchContainer}>
            <View style={styles.searchInputContainer}>
              <Ionicons name="search" size={20} color={colors.textTertiary} style={styles.searchIcon} />
              <Input
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Rechercher une adresse..."
                style={styles.searchInput}
                containerStyle={styles.searchInputWrapper}
                onSubmitEditing={handleSearchAddress}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                  style={styles.clearButton}
                >
                  <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              onPress={handleSearchAddress}
              style={styles.searchButton}
              disabled={isSearching || !searchQuery.trim()}
            >
              {isSearching ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Ionicons name="search" size={20} color="#ffffff" />
              )}
            </TouchableOpacity>
          </View>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <View style={styles.searchResultsContainer}>
              <ScrollView style={styles.searchResultsList} keyboardShouldPersistTaps="handled">
                {searchResults.map((result, index) => {
                  const fullAddress = result.fullAddress || buildFullAddress(result);
                  const displayName = result.name || result.street || 'Adresse';
                  
                  return (
                    <TouchableOpacity
                      key={index}
                      style={styles.searchResultItem}
                      onPress={() => handleSelectSearchResult(result)}
                    >
                      <Ionicons name="location" size={20} color={colors.pink500} />
                      <View style={styles.searchResultText}>
                        <Text style={styles.searchResultName} numberOfLines={1}>
                          {displayName}
                        </Text>
                        <Text style={styles.searchResultAddress} numberOfLines={2}>
                          {fullAddress}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {mapRegion ? (
            <View style={styles.mapContainer}>
              <MapView
                styleURL={Mapbox.StyleURL.Street}
                style={styles.map}
                logoEnabled={false}
                attributionEnabled={false}
                onPress={handleMapPress}
              >
                <Camera
                  centerCoordinate={[mapRegion.longitude, mapRegion.latitude]}
                  zoomLevel={Math.log2(360 / mapRegion.longitudeDelta)}
                  animationMode="flyTo"
                  animationDuration={2000}
                />
                
                {selectedLocation && (
                  <PointAnnotation
                    id="selected-location"
                    coordinate={[selectedLocation.lng, selectedLocation.lat]}
                    draggable
                    onDragEnd={(feature) => {
                      const [longitude, latitude] = feature.geometry.coordinates;
                      setSelectedLocation({
                        lat: latitude,
                        lng: longitude,
                      });
                    }}
                    anchor={{ x: 0.5, y: 0.5 }}
                  >
                    <View style={styles.selectedLocationMarker}>
                      <Ionicons name="location" size={24} color={colors.pink500} />
                    </View>
                  </PointAnnotation>
                )}
              </MapView>

              <View style={styles.mapFooter}>
                <View style={styles.mapInfo}>
                  {isLoadingAddress ? (
                    <ActivityIndicator size="small" color={colors.pink500} />
                  ) : (
                    <Ionicons name="location" size={20} color={colors.pink500} />
                  )}
                  <Text style={styles.mapInfoText}>
                    {selectedLocation
                      ? `${selectedLocation.lat.toFixed(6)}, ${selectedLocation.lng.toFixed(6)}`
                      : 'Appuyez sur la carte pour sélectionner un lieu'}
                  </Text>
                </View>
                <Button
                  title="Confirmer"
                  onPress={handleConfirmMapLocation}
                  disabled={!selectedLocation || isLoadingAddress}
                  loading={isLoadingAddress}
                  style={styles.mapConfirmButton}
                />
              </View>
            </View>
          ) : (
            <View style={styles.mapLoadingContainer}>
              <ActivityIndicator size="large" color={colors.pink500} />
              <Text style={styles.mapLoadingText}>Chargement de la carte...</Text>
            </View>
          )}
        </SafeAreaView>
      </Modal>

      {/* Topic Picker Modal */}
      <Modal
        visible={showTopicPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTopicPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Choisir un sujet de compagnie</Text>
            
            {isLoadingTopics ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.pink500} />
                <Text style={styles.loadingText}>Chargement des sujets...</Text>
              </View>
            ) : (
              <ScrollView style={styles.topicsList} showsVerticalScrollIndicator={true}>
                <TouchableOpacity
                  style={[
                    styles.topicItem,
                    selectedTopicId === null && styles.topicItemSelected,
                  ]}
                  onPress={() => {
                    setSelectedTopicId(null);
                    setShowTopicPicker(false);
                  }}
                >
                  <Ionicons 
                    name="close-circle-outline" 
                    size={24} 
                    color={selectedTopicId === null ? colors.pink500 : colors.textTertiary} 
                  />
                  <Text style={[
                    styles.topicName,
                    selectedTopicId === null && styles.topicNameSelected,
                  ]}>
                    Aucun sujet
                  </Text>
                  {selectedTopicId === null && (
                    <Ionicons name="checkmark-circle" size={20} color={colors.pink500} />
                  )}
                </TouchableOpacity>
                
                {topics.map((topic) => (
                  <TouchableOpacity
                    key={topic.id}
                    style={[
                      styles.topicItem,
                      selectedTopicId === topic.id && styles.topicItemSelected,
                    ]}
                    onPress={() => {
                      setSelectedTopicId(topic.id);
                      setShowTopicPicker(false);
                    }}
                  >
                    {topic.icon ? (
                      <Ionicons 
                        name={topic.icon as any} 
                        size={24} 
                        color={selectedTopicId === topic.id ? colors.pink500 : colors.textTertiary} 
                      />
                    ) : (
                      <Ionicons 
                        name="bookmark-outline" 
                        size={24} 
                        color={selectedTopicId === topic.id ? colors.pink500 : colors.textTertiary} 
                      />
                    )}
                    <View style={styles.topicInfo}>
                      <Text style={[
                        styles.topicName,
                        selectedTopicId === topic.id && styles.topicNameSelected,
                      ]}>
                        {topic.name}
                      </Text>
                      {topic.description && (
                        <Text style={styles.topicDescription} numberOfLines={2}>
                          {topic.description}
                        </Text>
                      )}
                    </View>
                    {selectedTopicId === topic.id && (
                      <Ionicons name="checkmark-circle" size={20} color={colors.pink500} />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <View style={styles.modalActions}>
              <Button
                title="Annuler"
                onPress={() => setShowTopicPicker(false)}
                variant="outline"
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    gap: 24,
  },
  userCard: {
    backgroundColor: `${colors.backgroundSecondary}80`,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
    borderRadius: 24,
    overflow: 'hidden',
  },
  userImage: {
    width: '100%',
    height: 256,
  },
  userInfo: {
    padding: 16,
    gap: 4,
  },
  userName: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  userAge: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  content: {
    gap: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  detailsCard: {
    backgroundColor: `${colors.backgroundSecondary}80`,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  detailInfo: {
    flex: 1,
    gap: 4,
  },
  detailLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  separator: {
    height: 1,
    backgroundColor: colors.borderSecondary,
  },
  infoCard: {
    backgroundColor: `${colors.pink500}33`,
    borderWidth: 1,
    borderColor: `${colors.pink500}4d`,
    borderRadius: 16,
    padding: 16,
  },
  infoText: {
    fontSize: 14,
    color: colors.pink400,
    lineHeight: 20,
  },
  button: {
    marginTop: 0,
  },
  pendingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 16,
  },
  pendingIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${colors.pink500}33`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pendingTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  pendingSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  successContainer: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 24,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${colors.green500}33`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  successSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  kycCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: `${colors.yellow500}33`,
    borderWidth: 1,
    borderColor: `${colors.yellow500}4d`,
    borderRadius: 16,
    padding: 16,
  },
  kycText: {
    flex: 1,
    gap: 8,
  },
  kycTitle: {
    fontSize: 14,
    color: colors.yellow400,
    lineHeight: 20,
  },
  kycSubtitle: {
    fontSize: 12,
    color: colors.yellow400,
    opacity: 0.7,
  },
  durationInput: {
    height: 40,
    fontSize: 16,
  },
  locationInput: {
    height: 40,
    fontSize: 16,
  },
  notesInput: {
    minHeight: 80,
    textAlignVertical: 'top',
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.backgroundSecondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 24,
  },
  dateTimeInputs: {
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  modalInput: {
    marginTop: 0,
  },
  inputHint: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: -4,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  modalButton: {
    flex: 1,
    marginTop: 0,
  },
  locationInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mapButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: `${colors.pink500}20`,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  mapModalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  mapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: `${colors.backgroundSecondary}80`,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSecondary,
  },
  mapHeaderTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  mapContainer: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  selectedLocationMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.pink50,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.pink500,
  },
  mapFooter: {
    backgroundColor: colors.backgroundSecondary,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.borderSecondary,
    gap: 12,
  },
  mapInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mapInfoText: {
    flex: 1,
    fontSize: 14,
    color: colors.textSecondary,
  },
  mapConfirmButton: {
    marginTop: 0,
  },
  mapLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  mapLoadingText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.backgroundSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSecondary,
    gap: 8,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 40,
    fontSize: 14,
    color: colors.text,
  },
  searchInputWrapper: {
    marginTop: 0,
    flex: 1,
  },
  clearButton: {
    marginLeft: 8,
    padding: 4,
  },
  searchButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.pink500,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchResultsContainer: {
    maxHeight: 200,
    backgroundColor: colors.backgroundSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSecondary,
  },
  searchResultsList: {
    flex: 1,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSecondary,
    gap: 12,
  },
  searchResultText: {
    flex: 1,
    gap: 4,
  },
  searchResultName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  searchResultAddress: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  loadingContainer: {
    paddingVertical: 32,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  topicsList: {
    maxHeight: 400,
    marginVertical: 16,
  },
  topicItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
    marginBottom: 8,
    gap: 12,
  },
  topicItemSelected: {
    backgroundColor: `${colors.pink500}20`,
    borderColor: colors.pink500,
  },
  topicInfo: {
    flex: 1,
    gap: 4,
  },
  topicName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  topicNameSelected: {
    color: colors.pink500,
  },
  topicDescription: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
});

