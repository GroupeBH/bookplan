import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CalendarPicker } from '../../components/CalendarPicker';
import { ImageWithFallback } from '../../components/ImageWithFallback';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { colors } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';
import { useBooking } from '../../context/BookingContext';
import { useUser } from '../../context/UserContext';
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

export default function BookingScreen() {
  const router = useRouter();
  const { selectedUser } = useUser();
  const { user: currentUser } = useAuth();
  const { createBooking, getCompanionshipTopics, refreshBookings } = useBooking();
  const [requestSent, setRequestSent] = useState(false);
  const [requestAccepted, setRequestAccepted] = useState(false);
  const [bookingDate, setBookingDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
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

  // Initialiser les inputs avec la date/heure actuelle
  React.useEffect(() => {
    const now = new Date();
    setSelectedDate(now);
    setDateInput(now.toISOString().split('T')[0]); // Format YYYY-MM-DD
    setTimeInput(now.toTimeString().slice(0, 5)); // Format HH:MM
  }, []);

  // Charger les sujets de compagnie disponibles (chargement immédiat au montage)
  React.useEffect(() => {
    const loadTopics = async () => {
      // Ne pas afficher le loading si on a déjà des sujets (cache)
      if (topics.length === 0) {
        setIsLoadingTopics(true);
      }
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

  // Précharger les sujets quand on clique sur le bouton (avant d'ouvrir le modal)
  const handleOpenTopicPicker = useCallback(async () => {
    // Si les sujets ne sont pas encore chargés, les charger avant d'ouvrir le modal
    if (topics.length === 0 && !isLoadingTopics) {
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
    }
    // Ouvrir le modal (même si les sujets sont en cours de chargement, ils s'afficheront dès qu'ils sont prêts)
    setShowTopicPicker(true);
  }, [topics.length, isLoadingTopics, getCompanionshipTopics]);

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
      if (currentUser?.lat && currentUser?.lng) {
        const userRegion = {
          latitude: currentUser.lat,
          longitude: currentUser.lng,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        };
        setMapRegion(userRegion);
        setSelectedLocation({
          lat: currentUser.lat,
          lng: currentUser.lng,
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

    if (showMapPicker && !mapInitializedRef.current) {
      initializeMap();
      mapInitializedRef.current = true;
    } else if (!showMapPicker) {
      mapInitializedRef.current = false;
    }
  }, [showMapPicker, currentUser?.lat, currentUser?.lng]);

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
    
    // Si on a des parties, les joindre
    if (addressParts.length > 0) {
      return addressParts.join(', ');
    }
    
    // Si aucune partie d'adresse, essayer de construire quelque chose de lisible
    // ou retourner un message générique plutôt que les coordonnées
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

  // Rechercher une adresse (bouton recherche)
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
        
        // Centrer la carte sur le premier résultat avec animation
        const firstResult = enrichedResults[0];
        if (firstResult) {
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
          
          // Mettre à jour le champ de recherche avec l'adresse complète
          const fullAddress = firstResult.fullAddress || buildFullAddress(firstResult);
          setSearchQuery(fullAddress);
          
          // Mettre à jour le champ lieu dans le formulaire principal
          setLocation(fullAddress);
        }
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

  if (!selectedUser) {
    // Utiliser setTimeout pour s'assurer que le composant est monté avant la navigation
    React.useEffect(() => {
      const timer = setTimeout(() => {
        try {
          router.back();
        } catch (error) {
          console.error('Error navigating back:', error);
          // En cas d'erreur, utiliser router.replace pour forcer la navigation
          router.replace('/(screens)/dashboard');
        }
      }, 100);
      return () => clearTimeout(timer);
    }, []);
    return null;
  }

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setDateInput(date.toISOString().split('T')[0]); // Format YYYY-MM-DD
  };

  const handleDateConfirm = () => {
    // Vérifier que la date est valide
    if (!dateInput) {
      Alert.alert('Erreur', 'Veuillez sélectionner une date');
      return;
    }

    const selectedDate = new Date(`${dateInput}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    selectedDate.setHours(0, 0, 0, 0);

    if (selectedDate < today) {
      Alert.alert('Erreur', 'Vous ne pouvez sélectionner que la date actuelle ou une date à venir');
      return;
    }

    // Combiner avec l'heure actuelle pour setBookingDate (sera mis à jour avec l'heure saisie)
    const timeStr = timeInput || '00:00';
    const combinedDateTime = new Date(`${dateInput}T${timeStr}:00`);
    setBookingDate(combinedDateTime);
    setShowDatePicker(false);
  };

  const handleSendRequest = async () => {
    if (!currentUser) return;

    // Valider la date et l'heure
    if (!dateInput || !timeInput) {
      Alert.alert('Erreur', 'Veuillez sélectionner une date et saisir une heure');
      return;
    }

    const dateStr = dateInput;
    const timeStr = timeInput;
    const combinedDateTime = new Date(`${dateStr}T${timeStr}:00`);
    
    if (isNaN(combinedDateTime.getTime())) {
      Alert.alert('Erreur', 'Veuillez sélectionner une date et une heure valides');
      return;
    }

    // Vérifier que la date n'est pas dans le passé
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(`${dateStr}T00:00:00`);
    selectedDate.setHours(0, 0, 0, 0);

    if (selectedDate < today) {
      Alert.alert('Erreur', 'Vous ne pouvez sélectionner que la date actuelle ou une date à venir');
      return;
    }

    // Vérifier que l'heure est dans le futur si la date est aujourd'hui
    const validation = validateTime();
    if (!validation.isValid) {
      Alert.alert('Erreur', validation.errorMessage);
      return;
    }

    // Afficher immédiatement le feedback visuel (optimiste)
    setRequestSent(true);
    setIsLoading(true);
    
    // Lancer la création en arrière-plan (non bloquant pour l'UI)
    createBooking(
      selectedUser.id,
      combinedDateTime.toISOString(),
      parseInt(durationHours) || 1,
      location || undefined,
      selectedUser.lat,
      selectedUser.lng,
      notes || undefined,
      selectedTopicId || undefined
    )
      .then(({ error, booking }) => {
        if (error) {
          setRequestSent(false); // Réinitialiser en cas d'erreur
          setIsLoading(false);
          Alert.alert('Erreur', error.message || 'Impossible de créer la demande');
          return;
        }

        // Succès - le feedback visuel est déjà affiché
        setIsLoading(false);
        
        // Afficher la confirmation (optionnel, car le feedback visuel est déjà là)
        // Alert.alert('Succès', 'Votre demande a été envoyée');
      })
      .catch((error: any) => {
        setRequestSent(false);
        setIsLoading(false);
        console.error('Error creating booking:', error);
        Alert.alert('Erreur', 'Une erreur est survenue lors de l\'envoi de la demande');
      });
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

  // Valider si l'heure est dans le futur (si la date est aujourd'hui)
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Demande de compagnie</Text>
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
              <View style={styles.separator} />
              <TouchableOpacity
                style={styles.detailRow}
                onPress={handleOpenTopicPicker}
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
                    numberOfLines={4}
                    style={styles.notesInput}
                    containerStyle={{ marginTop: 8 }}
                    textAlignVertical="top"
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
              disabled={isLoading || !timeValidation.isValid}
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
      </KeyboardAvoidingView>

      {/* Date/Time Picker Modal */}
      <Modal
        visible={showDatePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowDatePicker(false)}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
            style={styles.modalKeyboardView}
          >
            <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
              <Text style={styles.modalTitle}>Sélectionner la date</Text>
              
              <ScrollView
                style={styles.modalScrollView}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.modalScrollContent}
                nestedScrollEnabled={true}
                bounces={true}
              >
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
                  onPress={handleDateConfirm}
                  style={styles.modalButton}
                />
              </View>
            </View>
          </KeyboardAvoidingView>
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
                onChangeText={handleMapSearchChange}
                placeholder="Rechercher une adresse..."
                style={styles.searchInput}
                containerStyle={styles.searchInputWrapper}
                onSubmitEditing={handleSearchAddress}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    Keyboard.dismiss(); // Fermer le clavier
                    setSearchQuery('');
                    setSearchResults([]);
                    lastSearchQueryRef.current = '';
                    hasSearchResultsRef.current = false;
                    isSearchingRef.current = false;
                    if (mapSearchTimeoutRef.current) {
                      clearTimeout(mapSearchTimeoutRef.current);
                      mapSearchTimeoutRef.current = null;
                    }
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
            
            {/* Search Results - Suggestions */}
            {searchResults && searchResults.length > 0 && (
              <View style={styles.searchResultsContainer}>
                <ScrollView 
                  style={styles.searchResultsList} 
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled={true}
                  showsVerticalScrollIndicator={false}
                >
                  {searchResults.map((result, index) => {
                    const fullAddress = result.fullAddress || buildFullAddress(result);
                    const displayName = result.name || result.street || 'Adresse';
                    
                    return (
                      <TouchableOpacity
                        key={`result-${index}-${result.latitude}-${result.longitude}`}
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
                    draggable
                    onDragEnd={(feature: any) => {
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
            
            {isLoadingTopics && topics.length === 0 ? (
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
  keyboardAvoidingView: {
    flex: 1,
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
    paddingBottom: 100, // Espace supplémentaire en bas pour permettre le scroll avec le clavier
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
    minHeight: 100,
    maxHeight: 200,
    textAlignVertical: 'top',
    fontSize: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalKeyboardView: {
    width: '100%',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.backgroundSecondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '90%',
    minHeight: 600,
    width: '100%',
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
  errorText: {
    fontSize: 12,
    color: colors.red500 || '#ef4444',
    marginTop: 4,
  },
  modalScrollView: {
    maxHeight: 400,
  },
  modalScrollContent: {
    paddingBottom: 20,
  },
  calendarContainer: {
    marginBottom: 24,
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
    backgroundColor: `${colors.pink500}20`,
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
    position: 'relative',
    zIndex: 1000,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 12,
    position: 'relative',
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

