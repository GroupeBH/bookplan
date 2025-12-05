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
import { useOffer } from '../../context/OfferContext';
import { useAuth } from '../../context/AuthContext';
import { OfferType } from '../../types';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

const OFFER_TYPES: { value: OfferType; label: string; icon: string }[] = [
  { value: 'drink', label: 'À boire', icon: 'wine-outline' },
  { value: 'food', label: 'À manger', icon: 'restaurant-outline' },
  { value: 'transport', label: 'Remboursement transport', icon: 'car-outline' },
  { value: 'gift', label: 'Présent', icon: 'gift-outline' },
];

export default function CreateOfferScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { createOffer } = useOffer();
  const [offerType, setOfferType] = useState<OfferType | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [dateInput, setDateInput] = useState('');
  const [timeInput, setTimeInput] = useState('');
  const [durationHours, setDurationHours] = useState('1');
  const [location, setLocation] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [mapRegion, setMapRegion] = useState<{ latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } | null>(null);
  const [isLoadingAddress, setIsLoadingAddress] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // Initialiser les inputs avec la date/heure actuelle
  useEffect(() => {
    const now = new Date();
    setDateInput(now.toISOString().split('T')[0]);
    setTimeInput(now.toTimeString().slice(0, 5));
  }, []);

  // Initialiser la carte avec la position de l'utilisateur
  useEffect(() => {
    const initializeMap = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          const defaultRegion: Region = {
            latitude: -4.3276,
            longitude: 15.3136,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          };
          setMapRegion(defaultRegion);
          setSelectedLocation({ lat: -4.3276, lng: 15.3136 });
          return;
        }

        try {
          const currentLocation = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
            timeout: 5000,
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
          const defaultRegion: Region = {
            latitude: -4.3276,
            longitude: 15.3136,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          };
          setMapRegion(defaultRegion);
          setSelectedLocation({ lat: -4.3276, lng: 15.3136 });
        }
      } catch (error: any) {
        const defaultRegion: Region = {
          latitude: -4.3276,
          longitude: 15.3136,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        };
        setMapRegion(defaultRegion);
        setSelectedLocation({ lat: -4.3276, lng: 15.3136 });
      }
    };

    if (showMapPicker) {
      initializeMap();
    }
  }, [showMapPicker]);

  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      setIsLoadingAddress(true);
      const addresses = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      
      if (addresses && addresses.length > 0) {
        const address = addresses[0];
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
        const coordAddress = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        setLocation(coordAddress);
        return coordAddress;
      }
    } catch (error) {
      console.error('Error reverse geocoding:', error);
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

  const handleConfirmMapLocation = async () => {
    if (selectedLocation) {
      await reverseGeocode(selectedLocation.lat, selectedLocation.lng);
      setShowMapPicker(false);
    }
  };

  const buildFullAddress = (result: any): string => {
    const addressParts = [];
    
    if (result.streetNumber && result.street) {
      addressParts.push(`${result.streetNumber} ${result.street}`);
    } else if (result.street) {
      addressParts.push(result.street);
    }
    
    if (result.district) addressParts.push(result.district);
    if (result.city) addressParts.push(result.city);
    if (result.region) addressParts.push(result.region);
    if (result.postalCode) addressParts.push(result.postalCode);
    if (result.country) addressParts.push(result.country);
    
    return addressParts.length > 0 
      ? addressParts.join(', ')
      : `${result.latitude.toFixed(6)}, ${result.longitude.toFixed(6)}`;
  };

  const handleSearchAddress = async () => {
    if (!searchQuery.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer une adresse à rechercher');
      return;
    }

    setIsSearching(true);
    setSearchResults([]);

    try {
      const results = await Location.geocodeAsync(searchQuery);
      
      if (results && results.length > 0) {
        const enrichedResults = results.map((result: any) => ({
          ...result,
          fullAddress: buildFullAddress(result),
        }));
        
        setSearchResults(enrichedResults);
        
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
    
    try {
      const addresses = await Location.reverseGeocodeAsync({
        latitude: result.latitude,
        longitude: result.longitude,
      });
      
      if (addresses && addresses.length > 0) {
        const fullAddress = buildFullAddress(addresses[0]);
        setLocation(fullAddress);
      } else {
        const fullAddress = result.fullAddress || buildFullAddress(result);
        setLocation(fullAddress);
      }
    } catch (error) {
      const fullAddress = result.fullAddress || buildFullAddress(result);
      setLocation(fullAddress);
    }
    
    setSearchResults([]);
    setSearchQuery('');
  };

  const handleCreateOffer = async () => {
    if (!offerType) {
      Alert.alert('Erreur', 'Veuillez sélectionner un type d\'offre');
      return;
    }

    if (!title.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer un titre');
      return;
    }

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

    const duration = parseFloat(durationHours) || 1;
    if (duration <= 0) {
      Alert.alert('Erreur', 'La durée doit être supérieure à 0');
      return;
    }

    setIsLoading(true);
    try {
      const { error, offer } = await createOffer(
        offerType,
        title.trim(),
        combinedDateTime.toISOString(),
        duration,
        description.trim() || undefined,
        notes.trim() || undefined,
        location.trim() || undefined,
        selectedLocation?.lat,
        selectedLocation?.lng
      );

      if (error) {
        Alert.alert('Erreur', error.message || 'Impossible de créer l\'offre');
        setIsLoading(false);
        return;
      }

      Alert.alert('Succès', 'Votre offre a été créée et sera visible par tous les utilisateurs disponibles', [
        {
          text: 'OK',
          onPress: () => {
            router.back();
          },
        },
      ]);
    } catch (error: any) {
      Alert.alert('Erreur', 'Une erreur est survenue');
      console.error('Create offer error:', error);
    } finally {
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
        <Text style={styles.headerTitle}>Créer une offre</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Animated.View entering={FadeIn} style={styles.content}>
          <Text style={styles.sectionTitle}>Type d'offre</Text>
          <View style={styles.offerTypesContainer}>
            {OFFER_TYPES.map((type) => (
              <TouchableOpacity
                key={type.value}
                style={[
                  styles.offerTypeCard,
                  offerType === type.value && styles.offerTypeCardActive,
                ]}
                onPress={() => setOfferType(type.value)}
              >
                <Ionicons
                  name={type.icon as any}
                  size={32}
                  color={offerType === type.value ? colors.pink500 : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.offerTypeLabel,
                    offerType === type.value && styles.offerTypeLabelActive,
                  ]}
                >
                  {type.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Titre de l'offre *</Text>
          <Input
            value={title}
            onChangeText={setTitle}
            placeholder="Ex: Café au centre-ville"
            containerStyle={styles.input}
          />

          <Text style={styles.sectionTitle}>Description (optionnel)</Text>
          <Input
            value={description}
            onChangeText={setDescription}
            placeholder="Décrivez votre offre..."
            multiline
            numberOfLines={3}
            containerStyle={styles.input}
          />

          <Text style={styles.sectionTitle}>Détails de l'offre</Text>
          <View style={styles.detailsCard}>
            <TouchableOpacity
              style={styles.detailRow}
              onPress={() => {
                // Simple date/time input - could be enhanced with a proper picker
                Alert.alert('Date et heure', 'Format: AAAA-MM-JJ HH:MM');
              }}
            >
              <Ionicons name="calendar-outline" size={20} color={colors.pink400} />
              <View style={styles.detailInfo}>
                <Text style={styles.detailLabel}>Date et heure</Text>
                <Text style={styles.detailValue}>
                  {formatDate(dateInput)} à {formatTime(timeInput)}
                </Text>
              </View>
            </TouchableOpacity>
            <View style={styles.separator} />
            <View style={styles.detailRow}>
              <Ionicons name="time-outline" size={20} color={colors.pink400} />
              <View style={styles.detailInfo}>
                <Text style={styles.detailLabel}>Durée (heures)</Text>
                <Input
                  value={durationHours}
                  onChangeText={setDurationHours}
                  keyboardType="decimal-pad"
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
                    placeholder="À définir"
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
          </View>

          <Text style={styles.sectionTitle}>Date et heure</Text>
          <View style={styles.dateTimeInputs}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Date (AAAA-MM-JJ)</Text>
              <Input
                value={dateInput}
                onChangeText={setDateInput}
                placeholder="2024-12-25"
                containerStyle={styles.modalInput}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Heure (HH:MM)</Text>
              <Input
                value={timeInput}
                onChangeText={setTimeInput}
                placeholder="20:00"
                containerStyle={styles.modalInput}
              />
            </View>
          </View>

          <Text style={styles.sectionTitle}>Note personnelle (optionnel)</Text>
          <Input
            value={notes}
            onChangeText={setNotes}
            placeholder="Ajoutez une note personnelle..."
            multiline
            numberOfLines={3}
            containerStyle={styles.input}
          />

          <View style={styles.infoCard}>
            <Ionicons name="information-circle-outline" size={20} color={colors.pink400} />
            <Text style={styles.infoText}>
              Votre offre sera visible par tous les utilisateurs disponibles. Ils pourront candidater et vous pourrez choisir parmi les candidats.
            </Text>
          </View>

          <Button
            title="Créer l'offre"
            onPress={handleCreateOffer}
            icon={<Ionicons name="add-circle" size={20} color="#ffffff" />}
            style={styles.button}
            loading={isLoading}
            disabled={isLoading || !offerType || !title.trim()}
          />
        </Animated.View>
      </ScrollView>

      {/* Map Picker Modal */}
      <Modal
        visible={showMapPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMapPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sélectionner un lieu</Text>
              <TouchableOpacity onPress={() => setShowMapPicker(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchContainer}>
              <Input
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Rechercher une adresse..."
                containerStyle={styles.searchInput}
              />
              <TouchableOpacity
                style={styles.searchButton}
                onPress={handleSearchAddress}
                disabled={isSearching}
              >
                {isSearching ? (
                  <ActivityIndicator size="small" color={colors.pink500} />
                ) : (
                  <Ionicons name="search" size={20} color={colors.pink500} />
                )}
              </TouchableOpacity>
            </View>

            {searchResults.length > 0 && (
              <ScrollView style={styles.searchResults}>
                {searchResults.map((result, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.searchResultItem}
                    onPress={() => handleSelectSearchResult(result)}
                  >
                    <Ionicons name="location" size={20} color={colors.pink500} />
                    <Text style={styles.searchResultText} numberOfLines={2}>
                      {result.fullAddress}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {mapRegion && (
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
                    anchor={{ x: 0.5, y: 0.5 }}
                  >
                    <View style={styles.selectedLocationMarker}>
                      <Ionicons name="location" size={24} color={colors.pink500} />
                    </View>
                  </PointAnnotation>
                )}
              </MapView>
            )}

            {isLoadingAddress && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={colors.pink500} />
              </View>
            )}

            <View style={styles.modalActions}>
              <Button
                title="Annuler"
                onPress={() => setShowMapPicker(false)}
                variant="outline"
                style={styles.modalButton}
              />
              <Button
                title="Confirmer"
                onPress={handleConfirmMapLocation}
                style={styles.modalButton}
                disabled={!selectedLocation}
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  content: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
    marginTop: 8,
  },
  offerTypesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  offerTypeCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  offerTypeCardActive: {
    borderColor: colors.pink500,
    backgroundColor: colors.backgroundTertiary,
  },
  offerTypeLabel: {
    marginTop: 8,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  offerTypeLabelActive: {
    color: colors.pink400,
    fontWeight: '600',
  },
  input: {
    marginBottom: 16,
  },
  detailsCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
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
  durationInput: {
    maxWidth: 100,
  },
  locationInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locationInput: {
    flex: 1,
  },
  mapButton: {
    padding: 8,
  },
  dateTimeInputs: {
    gap: 16,
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  modalInput: {
    marginBottom: 0,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  button: {
    marginBottom: 24,
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
    maxHeight: '90%',
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
  searchContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    marginBottom: 0,
  },
  searchButton: {
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchResults: {
    maxHeight: 150,
    marginBottom: 16,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
    marginBottom: 8,
    gap: 12,
  },
  searchResultText: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  map: {
    height: 300,
    borderRadius: 12,
    marginBottom: 16,
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
  loadingOverlay: {
    position: 'absolute',
    top: 100,
    left: 0,
    right: 0,
    bottom: 100,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
  },
});


