import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal, ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { isMapboxAvailable } from '../../lib/mapbox';

// Import conditionnel de Mapbox
let Mapbox: any = null;
let MapView: any = null;
let PointAnnotation: any = null;
let Camera: any = null;

if (isMapboxAvailable) {
  try {
    const mapboxModule = require('@rnmapbox/maps');
    Mapbox = mapboxModule.default;
    MapView = mapboxModule.MapView;
    PointAnnotation = mapboxModule.PointAnnotation;
    Camera = mapboxModule.Camera;
  } catch (error) {
    console.warn('Failed to load Mapbox components');
  }
}
import { colors } from '../../constants/colors';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { CalendarPicker } from '../../components/CalendarPicker';
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
  const { offerId } = useLocalSearchParams<{ offerId?: string }>();
  const { user } = useAuth();
  const { createOffer, getOfferById, updateOffer } = useOffer();
  const [isLoadingOffer, setIsLoadingOffer] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedOfferTypes, setSelectedOfferTypes] = useState<OfferType[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dateInput, setDateInput] = useState('');
  const [timeInput, setTimeInput] = useState('');
  const [durationHours, setDurationHours] = useState('1');
  const [location, setLocation] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [mapRegion, setMapRegion] = useState<{ latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } | null>(null);
  const [isLoadingAddress, setIsLoadingAddress] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  // États pour l'autocomplete
  const [locationSuggestions, setLocationSuggestions] = useState<any[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapSearchTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapInitializedRef = React.useRef(false);
  const isSearchingRef = React.useRef(false);
  const lastSearchQueryRef = React.useRef<string>('');
  const hasSearchResultsRef = React.useRef(false);

  // Charger l'offre existante si on est en mode édition
  useEffect(() => {
    const loadOffer = async () => {
      if (!offerId) {
        // Mode création : initialiser avec la date/heure actuelle
        const now = new Date();
        setSelectedDate(now);
        setDateInput(now.toISOString().split('T')[0]);
        setTimeInput(now.toTimeString().slice(0, 5));
        return;
      }

      // Mode édition : charger l'offre existante
      setIsLoadingOffer(true);
      setIsEditMode(true);
      try {
        const offer = await getOfferById(offerId);
        if (offer) {
          // Pré-remplir tous les champs
          setTitle(offer.title || '');
          setDescription(offer.description || '');
          setNotes(offer.notes || '');
          
          // Pré-remplir les types d'offre
          if (offer.offerTypes && offer.offerTypes.length > 0) {
            setSelectedOfferTypes(offer.offerTypes);
          } else if (offer.offerType) {
            setSelectedOfferTypes([offer.offerType]);
          }
          
          // Pré-remplir la date et l'heure
          const offerDate = new Date(offer.offerDate);
          setSelectedDate(offerDate);
          setDateInput(offerDate.toISOString().split('T')[0]);
          const hours = offerDate.getHours().toString().padStart(2, '0');
          const minutes = offerDate.getMinutes().toString().padStart(2, '0');
          setTimeInput(`${hours}:${minutes}`);
          
          // Pré-remplir la durée
          setDurationHours(offer.durationHours?.toString() || '1');
          
          // Pré-remplir le lieu
          setLocation(offer.location || '');
          
          // Pré-remplir la position sur la carte si disponible
          if (offer.lat && offer.lng) {
            setSelectedLocation({
              lat: offer.lat,
              lng: offer.lng,
            });
            setMapRegion({
              latitude: offer.lat,
              longitude: offer.lng,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            });
          }
        }
      } catch (error) {
        console.error('Error loading offer:', error);
        Alert.alert('Erreur', 'Impossible de charger l\'offre');
      } finally {
        setIsLoadingOffer(false);
      }
    };

    loadOffer();
  }, [offerId, getOfferById]);

  // Initialiser la carte avec la position de l'utilisateur (optimisé pour performance)
  useEffect(() => {
    const initializeMap = async () => {
      // Position par défaut (Kinshasa) - utilisée immédiatement pour un chargement instantané
      const defaultRegion = {
        latitude: -4.3276,
        longitude: 15.3136,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };

      // Utiliser d'abord la position de l'utilisateur actuel si disponible (plus rapide)
      if (user?.lat && user?.lng) {
        const userRegion = {
          latitude: user.lat,
          longitude: user.lng,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        };
        setMapRegion(userRegion);
        setSelectedLocation({
          lat: user.lat,
          lng: user.lng,
        });
        // Continuer en arrière-plan pour obtenir une position plus précise si possible
        updateLocationInBackground();
        return;
      }

      // Sinon, définir la position par défaut immédiatement
      setMapRegion(defaultRegion);
      setSelectedLocation({
        lat: defaultRegion.latitude,
        lng: defaultRegion.longitude,
      });

      // Essayer d'obtenir la position GPS en arrière-plan (non bloquant)
      updateLocationInBackground();
    };

    // Fonction pour mettre à jour la position en arrière-plan
    const updateLocationInBackground = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          return; // Garder la position par défaut ou celle de l'utilisateur
        }

        // Utiliser Promise.race avec un timeout pour éviter d'attendre trop longtemps
        const locationPromise = Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Lowest, // Plus rapide que Balanced
        });

        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Location timeout')), 2000)
        );

        try {
          const currentLocation = await Promise.race([locationPromise, timeoutPromise]) as any;

          const region = {
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
          // En cas d'erreur ou timeout, garder la position déjà définie (par défaut ou utilisateur)
          // Ne pas afficher d'erreur, la carte est déjà chargée
        }
      } catch (error: any) {
        // En cas d'erreur générale, garder la position déjà définie
      }
    };

    if (showMapPicker) {
      // S'assurer que mapRegion est défini immédiatement pour afficher la carte
      if (!mapRegion) {
        const defaultRegion = {
          latitude: -4.3276,
          longitude: 15.3136,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        };
        setMapRegion(defaultRegion);
        setSelectedLocation({
          lat: defaultRegion.latitude,
          lng: defaultRegion.longitude,
        });
      }
      
      if (!mapInitializedRef.current) {
        initializeMap();
        mapInitializedRef.current = true;
      }
    } else {
      mapInitializedRef.current = false;
    }
  }, [showMapPicker, user]);

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
    
    // Si on a des parties, les joindre
    if (addressParts.length > 0) {
      return addressParts.join(', ');
    }
    
    // Si aucune partie d'adresse, essayer de construire quelque chose de lisible
    if (result.name) {
      return result.name;
    }
    
    // Dernier recours : utiliser les coordonnées formatées de manière plus lisible
    return `Lat: ${result.latitude.toFixed(4)}, Lng: ${result.longitude.toFixed(4)}`;
  };

  // Rechercher des suggestions d'adresse pendant la saisie (autocomplete)
  const searchLocationSuggestions = async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setLocationSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setIsLoadingSuggestions(true);
    try {
      const results = await Location.geocodeAsync(query);
      
      if (results && results.length > 0) {
        // Limiter à 5 suggestions
        const limitedResults = results.slice(0, 5).map((result: any) => ({
          ...result,
          fullAddress: buildFullAddress(result),
        }));
        setLocationSuggestions(limitedResults);
        setShowSuggestions(true);
      } else {
        setLocationSuggestions([]);
        setShowSuggestions(false);
      }
    } catch (error: any) {
      console.log('Error searching location suggestions:', error);
      setLocationSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  // Gérer le changement de texte dans le champ de lieu avec debounce
  const handleLocationChange = (text: string) => {
    setLocation(text);
    setShowSuggestions(true);

    // Annuler le timeout précédent
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Débounce: attendre 500ms après la dernière frappe avant de rechercher
    searchTimeoutRef.current = setTimeout(() => {
      searchLocationSuggestions(text);
    }, 500);
  };

  // Sélectionner une suggestion d'autocomplete
  const handleSelectSuggestion = async (suggestion: any) => {
    const fullAddress = suggestion.fullAddress || buildFullAddress(suggestion);
    setLocation(fullAddress);
    setSelectedLocation({
      lat: suggestion.latitude,
      lng: suggestion.longitude,
    });
    setLocationSuggestions([]);
    setShowSuggestions(false);
  };

  // Rechercher des suggestions d'adresse pendant la saisie dans le modal (autocomplete)
  const searchMapAddressSuggestions = useCallback(async (query: string) => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery || trimmedQuery.length < 2) {
      setSearchResults([]);
      lastSearchQueryRef.current = '';
      hasSearchResultsRef.current = false;
      isSearchingRef.current = false;
      return;
    }

    // Éviter les recherches multiples simultanées
    if (isSearchingRef.current) {
      // Si une recherche est en cours, attendre qu'elle se termine
      return;
    }

    // Si c'est la même requête que la dernière recherche réussie ET qu'on a déjà des résultats, ne pas relancer
    if (lastSearchQueryRef.current === trimmedQuery && hasSearchResultsRef.current) {
      return;
    }

    lastSearchQueryRef.current = trimmedQuery;
    isSearchingRef.current = true;
    setIsSearching(true);
    
    try {
      const results = await Location.geocodeAsync(trimmedQuery);
      
      // Vérifier que la requête n'a pas changé pendant la recherche
      if (lastSearchQueryRef.current !== trimmedQuery) {
        isSearchingRef.current = false;
        setIsSearching(false);
        return;
      }
      
      if (results && results.length > 0) {
        // Enrichir les résultats avec le géocodage inverse pour obtenir des adresses complètes
        const enrichedResults = await Promise.all(
          results.slice(0, 5).map(async (result: any) => {
            try {
              // Essayer d'obtenir l'adresse complète via géocodage inverse
              const reverseResults = await Location.reverseGeocodeAsync({
                latitude: result.latitude,
                longitude: result.longitude,
              });
              
              if (reverseResults && reverseResults.length > 0) {
                const reverseResult = reverseResults[0];
                const addressParts = [];
                
                if (reverseResult.streetNumber && reverseResult.street) {
                  addressParts.push(`${reverseResult.streetNumber} ${reverseResult.street}`);
                } else if (reverseResult.street) {
                  addressParts.push(reverseResult.street);
                }
                
                if (reverseResult.district) addressParts.push(reverseResult.district);
                if (reverseResult.city) addressParts.push(reverseResult.city);
                if (reverseResult.region) addressParts.push(reverseResult.region);
                if (reverseResult.postalCode) addressParts.push(reverseResult.postalCode);
                if (reverseResult.country) addressParts.push(reverseResult.country);
                
                return {
                  ...result,
                  fullAddress: addressParts.length > 0 
                    ? addressParts.join(', ')
                    : buildFullAddress(result),
                };
              }
            } catch (reverseError) {
              // Si le géocodage inverse échoue, utiliser la construction normale
            }
            
            return {
              ...result,
              fullAddress: buildFullAddress(result),
            };
          })
        );
        
        // Ne mettre à jour que si la requête n'a pas changé entre-temps
        if (lastSearchQueryRef.current === trimmedQuery) {
          setSearchResults(enrichedResults);
          hasSearchResultsRef.current = true;
        }
      } else {
        if (lastSearchQueryRef.current === trimmedQuery) {
          setSearchResults([]);
          hasSearchResultsRef.current = false;
        }
      }
    } catch (error: any) {
      console.error('Error searching address suggestions:', error);
      if (lastSearchQueryRef.current === trimmedQuery) {
        setSearchResults([]);
        hasSearchResultsRef.current = false;
      }
    } finally {
      // Toujours réinitialiser le flag de recherche
      isSearchingRef.current = false;
      setIsSearching(false);
    }
  }, []);

  // Gérer le changement de texte dans le champ de recherche du modal avec debounce
  const handleMapSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    
    // Annuler le timeout précédent
    if (mapSearchTimeoutRef.current) {
      clearTimeout(mapSearchTimeoutRef.current);
      mapSearchTimeoutRef.current = null;
    }

    // Si le texte est vide ou trop court, vider les résultats immédiatement
    if (!text.trim() || text.length < 2) {
      setSearchResults([]);
      lastSearchQueryRef.current = '';
      hasSearchResultsRef.current = false;
      return;
    }

    // Débounce: attendre 300ms après la dernière frappe avant de rechercher (plus rapide)
    mapSearchTimeoutRef.current = setTimeout(() => {
      const trimmedText = text.trim();
      if (trimmedText && trimmedText.length >= 2) {
        searchMapAddressSuggestions(trimmedText);
      }
      mapSearchTimeoutRef.current = null;
    }, 300);
  }, [searchMapAddressSuggestions]);

  const handleSearchAddress = async () => {
    if (!searchQuery.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer une adresse à rechercher');
      return;
    }

    setIsSearching(true);
    setSearchResults([]);

    try {
      // Utiliser le géocodage pour rechercher l'adresse
      const results = await Location.geocodeAsync(searchQuery.trim());
      
      if (results && results.length > 0) {
        // Enrichir les résultats avec l'adresse complète (comme dans searchMapAddressSuggestions)
        const enrichedResults = await Promise.all(
          results.slice(0, 5).map(async (result: any) => {
            try {
              // Essayer d'obtenir l'adresse complète via géocodage inverse
              const reverseResults = await Location.reverseGeocodeAsync({
                latitude: result.latitude,
                longitude: result.longitude,
              });
              
              if (reverseResults && reverseResults.length > 0) {
                const reverseResult = reverseResults[0];
                const addressParts = [];
                
                if (reverseResult.streetNumber && reverseResult.street) {
                  addressParts.push(`${reverseResult.streetNumber} ${reverseResult.street}`);
                } else if (reverseResult.street) {
                  addressParts.push(reverseResult.street);
                }
                
                if (reverseResult.district) addressParts.push(reverseResult.district);
                if (reverseResult.city) addressParts.push(reverseResult.city);
                if (reverseResult.region) addressParts.push(reverseResult.region);
                if (reverseResult.postalCode) addressParts.push(reverseResult.postalCode);
                if (reverseResult.country) addressParts.push(reverseResult.country);
                
                return {
                  ...result,
                  fullAddress: addressParts.length > 0 
                    ? addressParts.join(', ')
                    : buildFullAddress(result),
                };
              }
            } catch (reverseError) {
              // Si le géocodage inverse échoue, utiliser la construction normale
            }
            
            return {
              ...result,
              fullAddress: buildFullAddress(result),
            };
          })
        );
        
        setSearchResults(enrichedResults);
        hasSearchResultsRef.current = true;
        
        // Centrer la carte sur le premier résultat
        if (enrichedResults.length > 0) {
          const firstResult = enrichedResults[0];
          const region = {
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
          
          // Mettre à jour le champ lieu avec l'adresse complète
          const fullAddress = firstResult.fullAddress || buildFullAddress(firstResult);
          setLocation(fullAddress);
        }
      } else {
        Alert.alert('Aucun résultat', 'Aucune adresse trouvée pour cette recherche');
        hasSearchResultsRef.current = false;
      }
    } catch (error: any) {
      console.error('Error searching address:', error);
      Alert.alert('Erreur', 'Impossible de rechercher l\'adresse');
      hasSearchResultsRef.current = false;
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSearchResult = async (result: any) => {
    // Centrer la carte sur l'adresse sélectionnée avec animation
    const region = {
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
    
    // Fermer les résultats de recherche et mettre l'adresse dans le champ
    const fullAddress = result.fullAddress || buildFullAddress(result);
    setSearchQuery(fullAddress);
    setSearchResults([]);
    hasSearchResultsRef.current = false;
    
    // Récupérer l'adresse complète via géocodage inverse pour s'assurer d'avoir toutes les informations
    try {
      const addresses = await Location.reverseGeocodeAsync({
        latitude: result.latitude,
        longitude: result.longitude,
      });
      
      if (addresses && addresses.length > 0) {
        const completeAddress = buildFullAddress(addresses[0]);
        setLocation(completeAddress);
      } else {
        setLocation(fullAddress);
      }
    } catch (error) {
      setLocation(fullAddress);
    }
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setDateInput(date.toISOString().split('T')[0]); // Format YYYY-MM-DD
  };

  const handleCreateOffer = async () => {
    if (selectedOfferTypes.length === 0) {
      Alert.alert('Erreur', 'Veuillez sélectionner au moins un type d\'offre');
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

    // Valider la date et l'heure
    const validation = validateTime();
    if (!validation.isValid) {
      Alert.alert('Erreur', validation.errorMessage);
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
      if (isEditMode && offerId) {
        // Mode édition : mettre à jour l'offre existante
        const { error, offer } = await updateOffer(
          offerId,
          selectedOfferTypes,
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
          Alert.alert('Erreur', error.message || 'Impossible de modifier l\'offre');
          setIsLoading(false);
          return;
        }

        Alert.alert(
          'Succès', 
          'Votre offre a été modifiée avec succès', 
          [
            {
              text: 'OK',
              onPress: () => {
                router.back();
              },
            },
          ]
        );
      } else {
        // Mode création : créer une nouvelle offre
        const { error, offer } = await createOffer(
          selectedOfferTypes,
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

        Alert.alert(
          'Succès', 
          `Votre offre avec ${selectedOfferTypes.length} type${selectedOfferTypes.length > 1 ? 's' : ''} a été créée et sera visible par tous les utilisateurs disponibles`, 
          [
            {
              text: 'OK',
              onPress: () => {
                router.back();
              },
            },
          ]
        );
      }
    } catch (error: any) {
      Alert.alert('Erreur', 'Une erreur est survenue');
      console.error('Create/Update offer error:', error);
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

  // Validation de l'heure
  const validateTime = (): { isValid: boolean; errorMessage: string } => {
    // Si pas de date ou d'heure, on ne valide pas (l'utilisateur doit d'abord remplir)
    if (!dateInput || !timeInput) {
      return { isValid: true, errorMessage: '' };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const selectedDate = new Date(`${dateInput}T00:00:00`);
    selectedDate.setHours(0, 0, 0, 0);

    // Si la date sélectionnée est aujourd'hui
    if (selectedDate.getTime() === today.getTime()) {
      // Vérifier si l'heure est dans le futur
      const [hours, minutes] = timeInput.split(':').map(Number);
      if (isNaN(hours) || isNaN(minutes)) {
        // Format invalide, mais on ne bloque pas (sera validé lors de l'envoi)
        return { isValid: true, errorMessage: '' };
      }

      const now = new Date();
      const selectedTime = new Date();
      selectedTime.setHours(hours, minutes, 0, 0);

      if (selectedTime <= now) {
        return {
          isValid: false,
          errorMessage: 'Vous devez choisir une heure à venir'
        };
      }
    }

    // Si la date est dans le futur, l'heure est toujours valide
    return { isValid: true, errorMessage: '' };
  };

  const timeValidation = validateTime();

  // Afficher un indicateur de chargement pendant le chargement de l'offre
  if (isLoadingOffer) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Modifier l'offre</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.pink500} />
          <Text style={{ marginTop: 16, color: colors.textSecondary }}>
            Chargement de l'offre...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isEditMode ? 'Modifier l\'offre' : 'Créer une offre'}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={true}
          nestedScrollEnabled={true}
        >
          <Animated.View entering={FadeIn} style={styles.content}>
          <Text style={styles.sectionTitle}>Types d'offre (sélection multiple)</Text>
          <View style={styles.offerTypesContainer}>
            {OFFER_TYPES.map((type) => {
              const isSelected = selectedOfferTypes.includes(type.value);
              return (
                <TouchableOpacity
                  key={type.value}
                  style={[
                    styles.offerTypeCard,
                    isSelected && styles.offerTypeCardActive,
                  ]}
                  onPress={() => {
                    if (isSelected) {
                      // Désélectionner
                      setSelectedOfferTypes(prev => prev.filter(t => t !== type.value));
                    } else {
                      // Sélectionner
                      setSelectedOfferTypes(prev => [...prev, type.value]);
                    }
                  }}
                >
                  <Ionicons
                    name={type.icon as any}
                    size={32}
                    color={isSelected ? colors.pink500 : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.offerTypeLabel,
                      isSelected && styles.offerTypeLabelActive,
                    ]}
                  >
                    {type.label}
                  </Text>
                  {isSelected && (
                    <View style={styles.checkmarkContainer}>
                      <Ionicons name="checkmark-circle" size={20} color={colors.pink500} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
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
              onPress={() => setShowDatePicker(true)}
            >
              <Ionicons name="calendar-outline" size={20} color={colors.pink400} />
              <View style={styles.detailInfo}>
                <Text style={styles.detailLabel}>Date</Text>
                <Text style={styles.detailValue}>
                  {formatDate(dateInput)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
            </TouchableOpacity>
            <View style={styles.separator} />
            <View style={styles.detailRow}>
              <Ionicons name="time-outline" size={20} color={colors.pink400} />
              <View style={styles.detailInfo}>
                <Text style={styles.detailLabel}>Heure</Text>
                <Input
                  value={timeInput}
                  onChangeText={setTimeInput}
                  placeholder="HH:MM"
                  keyboardType="default"
                  style={styles.durationInput}
                  containerStyle={{ marginTop: 8 }}
                />
                <Text style={styles.inputHint}>Format: HH:MM (ex: 20:00)</Text>
                {timeValidation.errorMessage ? (
                  <Text style={styles.errorText}>{timeValidation.errorMessage}</Text>
                ) : null}
              </View>
            </View>
            <View style={styles.separator} />
            <View style={styles.detailRow}>
              <Ionicons name="hourglass-outline" size={20} color={colors.pink400} />
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
                  <View style={{ flex: 1, position: 'relative' }}>
                    <Input
                      value={location}
                      onChangeText={handleLocationChange}
                      onFocus={() => {
                        if (locationSuggestions.length > 0) {
                          setShowSuggestions(true);
                        }
                      }}
                      onBlur={() => {
                        // Délai pour permettre le clic sur une suggestion
                        setTimeout(() => setShowSuggestions(false), 200);
                      }}
                      placeholder="Rechercher un lieu..."
                      style={styles.locationInput}
                      containerStyle={{ marginTop: 8, flex: 1 }}
                    />
                    {/* Suggestions d'autocomplete */}
                    {showSuggestions && locationSuggestions.length > 0 && (
                      <View style={styles.suggestionsContainer}>
                        <ScrollView 
                          style={styles.suggestionsList}
                          keyboardShouldPersistTaps="handled"
                          nestedScrollEnabled
                        >
                          {locationSuggestions.map((suggestion, index) => (
                            <TouchableOpacity
                              key={index}
                              style={styles.suggestionItem}
                              onPress={() => handleSelectSuggestion(suggestion)}
                            >
                              <Ionicons name="location" size={18} color={colors.pink500} />
                              <View style={styles.suggestionText}>
                                <Text style={styles.suggestionAddress} numberOfLines={2}>
                                  {suggestion.fullAddress}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                    {isLoadingSuggestions && (
                      <View style={styles.suggestionsContainer}>
                        <View style={styles.suggestionItem}>
                          <ActivityIndicator size="small" color={colors.pink500} />
                          <Text style={[styles.suggestionText, { marginLeft: 8 }]}>
                            Recherche...
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>
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


          <Text style={styles.sectionTitle}>Note personnelle (optionnel)</Text>
          <Input
            value={notes}
            onChangeText={setNotes}
            placeholder="Ajoutez une note personnelle..."
            multiline
            numberOfLines={4}
            style={styles.notesInput}
            containerStyle={styles.input}
            textAlignVertical="top"
          />

          <View style={styles.infoCard}>
            <Ionicons name="information-circle-outline" size={20} color={colors.pink400} />
            <Text style={styles.infoText}>
              Votre offre sera visible par tous les utilisateurs disponibles. Ils pourront candidater et vous pourrez choisir parmi les candidats.
            </Text>
          </View>

          <Button
            title={isEditMode ? "Modifier l'offre" : "Créer l'offre"}
            onPress={handleCreateOffer}
            icon={<Ionicons name={isEditMode ? "checkmark-circle" : "add-circle"} size={20} color="#ffffff" />}
            style={styles.button}
            loading={isLoading || isLoadingOffer}
            disabled={isLoading || isLoadingOffer || selectedOfferTypes.length === 0 || !title.trim() || !timeValidation.isValid}
          />
        </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Date Picker Modal */}
      <Modal
        visible={showDatePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Sélectionner la date</Text>
            
            <ScrollView style={styles.modalScrollView} showsVerticalScrollIndicator={false}>
              {/* Calendrier */}
              <View style={styles.calendarContainer}>
                <CalendarPicker
                  selectedDate={selectedDate}
                  onDateSelect={handleDateSelect}
                  minimumDate={new Date()}
                />
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <Button
                title="Annuler"
                onPress={() => setShowDatePicker(false)}
                variant="outline"
                style={styles.modalButton}
              />
              <Button
                title="Confirmer"
                onPress={() => setShowDatePicker(false)}
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
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <SafeAreaView style={styles.mapModalContainer}>
            <View style={styles.mapHeader}>
              <TouchableOpacity onPress={() => setShowMapPicker(false)}>
                <Ionicons name="arrow-back" size={24} color={colors.text} />
              </TouchableOpacity>
              <Text style={styles.mapHeaderTitle}>Sélectionner un lieu</Text>
              <View style={{ width: 24 }} />
            </View>

            <View style={styles.searchContainer}>
              <View style={styles.searchInputContainer}>
                <Ionicons name="search" size={20} color={colors.textTertiary} style={styles.searchIcon} />
                <Input
                  value={searchQuery}
                  onChangeText={handleMapSearchChange}
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
                      hasSearchResultsRef.current = false;
                      Keyboard.dismiss();
                      if (mapSearchTimeoutRef.current) {
                        clearTimeout(mapSearchTimeoutRef.current);
                      }
                    }}
                    style={styles.clearButton}
                  >
                    <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity
                style={styles.searchButton}
                onPress={handleSearchAddress}
                disabled={isSearching || !searchQuery.trim()}
              >
                {isSearching ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Ionicons name="search" size={20} color="#ffffff" />
                )}
              </TouchableOpacity>
              
              {/* Search Results - Suggestions */}
              {searchResults.length > 0 && (
                <View style={styles.searchResultsContainer}>
                  <ScrollView 
                    style={styles.searchResultsList} 
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled={true}
                  >
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
            </View>

            {mapRegion && Mapbox && Mapbox.StyleURL ? (
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
                    animationDuration={500}
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
              </View>
            ) : (
              <View style={[styles.map, { justifyContent: 'center', alignItems: 'center', backgroundColor: colors.backgroundSecondary }]}>
                <ActivityIndicator size="large" color={colors.pink500} />
                <Text style={{ marginTop: 16, color: colors.textSecondary }}>
                  Chargement de la carte...
                </Text>
              </View>
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
          </SafeAreaView>
        </KeyboardAvoidingView>
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
    position: 'relative',
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
  checkmarkContainer: {
    position: 'absolute',
    top: 8,
    right: 8,
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
  suggestionsContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
    maxHeight: 200,
    zIndex: 1000,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  suggestionsList: {
    maxHeight: 200,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSecondary,
  },
  suggestionText: {
    flex: 1,
    marginLeft: 12,
  },
  suggestionAddress: {
    fontSize: 14,
    color: colors.text,
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
  inputHint: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: -4,
  },
  errorText: {
    fontSize: 12,
    color: colors.red500 || '#ef4444',
    marginTop: 4,
  },
  notesInput: {
    minHeight: 100,
    maxHeight: 200,
    textAlignVertical: 'top',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  modalScrollView: {
    maxHeight: 500,
  },
  calendarContainer: {
    marginBottom: 20,
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
    position: 'relative',
    zIndex: 1000,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchIcon: {
    marginRight: 0,
  },
  searchInput: {
    flex: 1,
    marginBottom: 0,
  },
  searchInputWrapper: {
    flex: 1,
    marginBottom: 0,
  },
  clearButton: {
    padding: 4,
  },
  searchButton: {
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.pink500,
    borderRadius: 12,
    minWidth: 50,
  },
  searchResultsContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    maxHeight: 250,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
    borderTopWidth: 0,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    zIndex: 1000,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    marginTop: 4,
  },
  searchResultsList: {
    flex: 1,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSecondary,
    gap: 12,
  },
  searchResultText: {
    flex: 1,
  },
  searchResultName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  searchResultAddress: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  mapContainer: {
    flex: 1,
    marginTop: 16,
    marginBottom: 24,
    borderRadius: 12,
    overflow: 'hidden',
    minHeight: 300,
  },
  map: {
    flex: 1,
    borderRadius: 12,
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
    marginTop: 24,
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 16,
  },
  modalButton: {
    flex: 1,
  },
  mapModalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  mapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSecondary,
  },
  mapHeaderTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
});


