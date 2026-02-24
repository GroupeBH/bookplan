/* eslint-disable react-hooks/exhaustive-deps */
import { Ionicons } from '@expo/vector-icons';
import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { isMapboxAvailable, MAPBOX_ACCESS_TOKEN } from '../../lib/mapbox';

let DatePicker: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dateTimePickerModule = require('@react-native-community/datetimepicker');
  DatePicker = dateTimePickerModule.default;
} catch {
  DatePicker = null;
}

// Import conditionnel de Mapbox
let Mapbox: any = null;
let MapView: any = null;
let Camera: any = null;

if (isMapboxAvailable) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mapboxModule = require('@rnmapbox/maps');
    Mapbox = mapboxModule.default;
    MapView = mapboxModule.MapView;
    Camera = mapboxModule.Camera;
  } catch {
    console.warn('Failed to load Mapbox components');
  }
}

const TIME_STEP_MINUTES = 15;
const TIME_OPTIONS = Array.from({ length: (24 * 60) / TIME_STEP_MINUTES }, (_, index) => {
  const totalMinutes = index * TIME_STEP_MINUTES;
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const minutes = String(totalMinutes % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
});

type AddressSuggestion = {
  latitude: number;
  longitude: number;
  fullAddress: string;
  name?: string;
  street?: string;
};

const getRoundedTimeString = (date: Date) => {
  const rounded = new Date(date);
  rounded.setSeconds(0, 0);

  const minute = rounded.getMinutes();
  const remainder = minute % TIME_STEP_MINUTES;
  const minutesToAdd = remainder === 0 ? 0 : TIME_STEP_MINUTES - remainder;
  rounded.setMinutes(minute + minutesToAdd);

  const hours = String(rounded.getHours()).padStart(2, '0');
  const minutes = String(rounded.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

export default function BookingScreen() {
  const router = useRouter();
  const { selectedUser } = useUser();
  const { user: currentUser } = useAuth();
  const { createBooking, getCompanionshipTopics } = useBooking();
  const [requestSent, setRequestSent] = useState(false);
  const [requestAccepted] = useState(false);
  const [createdBookingId, setCreatedBookingId] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
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
  const [mapAddressPreview, setMapAddressPreview] = useState('');
  const [isResolvingMapAddress, setIsResolvingMapAddress] = useState(false);
  const [mapRegion, setMapRegion] = useState<{ latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } | null>(null);
  const [isLoadingAddress, setIsLoadingAddress] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<AddressSuggestion[]>([]);
  // Etats pour l'autocomplete
  const [locationSuggestions, setLocationSuggestions] = useState<AddressSuggestion[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapSearchTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapAddressTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraRef = React.useRef<any>(null);
  const mapCenterRef = React.useRef<{ lat: number; lng: number } | null>(null);
  const mapAddressRequestIdRef = React.useRef(0);
  const mapInitializedRef = React.useRef(false);
  const isSearchingRef = React.useRef(false);
  const lastSearchQueryRef = React.useRef<string>('');
  const hasSearchResultsRef = React.useRef(false);

  const formatTimeValue = useCallback((date: Date) => {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }, []);

  const timePickerValue = useMemo(() => {
    const baseDate = dateInput ? new Date(`${dateInput}T00:00:00`) : selectedDate;
    const safeBaseDate = Number.isNaN(baseDate.getTime()) ? new Date() : new Date(baseDate);
    const [hours, minutes] = timeInput.split(':').map(Number);

    if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
      safeBaseDate.setHours(hours, minutes, 0, 0);
    }

    return safeBaseDate;
  }, [dateInput, selectedDate, timeInput]);
  const [iosTimeDraft, setIosTimeDraft] = useState<Date>(timePickerValue);
  const timeOptions = useMemo(() => {
    if (!timeInput || TIME_OPTIONS.includes(timeInput)) {
      return TIME_OPTIONS;
    }

    return [...TIME_OPTIONS, timeInput].sort((a, b) => a.localeCompare(b));
  }, [timeInput]);

  useEffect(() => {
    if (!showTimePicker) return;
    setIosTimeDraft(timePickerValue);
  }, [showTimePicker, timePickerValue]);

  const handleTimePickerChange = (_event: DateTimePickerEvent, pickedDate?: Date) => {
    if (!pickedDate) {
      if (Platform.OS === 'android') {
        setShowTimePicker(false);
      }
      return;
    }

    if (Platform.OS === 'ios') {
      setIosTimeDraft(pickedDate);
      return;
    }

    setTimeInput(formatTimeValue(pickedDate));
    setShowTimePicker(false);
  };

  const handleTimeConfirm = () => {
    const value = Platform.OS === 'ios' ? iosTimeDraft : timePickerValue;
    setTimeInput(formatTimeValue(value));
    setShowTimePicker(false);
  };

  const handleFallbackTimeSelect = (value: string) => {
    setTimeInput(value);
    setShowTimePicker(false);
  };

  // Initialiser les inputs avec la date/heure actuelle
  React.useEffect(() => {
    const now = new Date();
    setSelectedDate(now);
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    setDateInput(`${year}-${month}-${day}`);
    setTimeInput(getRoundedTimeString(now));
  }, []);

  // Charger les sujets de compagnie disponibles (chargement immediat au montage)
  React.useEffect(() => {
    const loadTopics = async () => {
      // Ne pas afficher le loading si on ? deja des sujets (cache)
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

  // Precharger les sujets quand on clique sur le bouton (avant d'ouvrir le modal)
  const handleOpenTopicPicker = useCallback(async () => {
    // Si les sujets ne sont pas encore charges, les charger avant d'ouvrir le modal
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
    // Ouvrir le modal (meme si les sujets sont en cours de chargement, ils s'afficheront d?s qu'ils sont prets)
    setShowTopicPicker(true);
  }, [topics.length, isLoadingTopics, getCompanionshipTopics]);

  // Initialiser la carte avec la position de l'utilisateur (optimis? pour performance)
  useEffect(() => {
    const initializeMap = async () => {
      // Position par defaut (Kinshasa) - utilisee immediatement pour un chargement instantan?
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
        // Continuer en arriere-plan pour obtenir une position plus precise si possible
        updateLocationInBackground();
        return;
      }

      // Sinon, definir la position par defaut immediatement
      setMapRegion(defaultRegion);
      setSelectedLocation({
        lat: defaultRegion.latitude,
        lng: defaultRegion.longitude,
      });

      // Essayer d'obtenir la position GPS en arriere-plan (non bloquant)
      updateLocationInBackground();
    };

    // Fonction pour mettre ? jour la position en arriere-plan
    const updateLocationInBackground = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          return; // Garder la position par defaut ou celle de l'utilisateur
        }

        // Utiliser Promise.race avec un timeout pour eviter d'attendre trop longtemps
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
        } catch {
          // En cas d'erreur ou timeout, garder la position deja definie (par defaut ou utilisateur)
          // Ne pas afficher d'erreur, la carte est deja charg?e
        }
      } catch {
        // En cas d'erreur generale, garder la position deja definie
      }
    };

    if (showMapPicker && !mapInitializedRef.current) {
      initializeMap();
      mapInitializedRef.current = true;
    } else if (!showMapPicker) {
      mapInitializedRef.current = false;
    }
  }, [showMapPicker, currentUser?.lat, currentUser?.lng]);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      if (mapSearchTimeoutRef.current) {
        clearTimeout(mapSearchTimeoutRef.current);
      }

      if (mapAddressTimeoutRef.current) {
        clearTimeout(mapAddressTimeoutRef.current);
      }
    };
  }, []);

  // Fonction pour obtenir l'adresse ? partir des coordonnees (g?ocodage inverse)
  const resolveAddressFromCoordinates = useCallback(async (lat: number, lng: number) => {
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

      return addressParts.join(', ') || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }

    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }, []);

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    try {
      setIsLoadingAddress(true);
      const fullAddress = await resolveAddressFromCoordinates(lat, lng);
      setLocation(fullAddress);
      setMapAddressPreview(fullAddress);
      return fullAddress;
    } catch (error) {
      console.error('Error reverse geocoding:', error);
      const coordAddress = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      setLocation(coordAddress);
      setMapAddressPreview(coordAddress);
      return coordAddress;
    } finally {
      setIsLoadingAddress(false);
    }
  }, [resolveAddressFromCoordinates]);

  const extractCoordinatesFromMapEvent = useCallback((event: any): { lat: number; lng: number } | null => {
    const coordinates = event?.properties?.center ?? event?.geometry?.coordinates ?? event?.coordinates;

    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      return null;
    }

    const [lng, lat] = coordinates;
    if (typeof lat !== 'number' || typeof lng !== 'number' || !isFinite(lat) || !isFinite(lng)) {
      return null;
    }

    return { lat, lng };
  }, []);

  const getZoomLevelFromLongitudeDelta = useCallback((longitudeDelta?: number) => {
    const safeLongitudeDelta = Math.max(longitudeDelta ?? 0.05, 0.0001);
    return Math.max(3, Math.min(18, Math.log2(360 / safeLongitudeDelta)));
  }, []);

  const focusMapOnCoordinates = useCallback((lat: number, lng: number, zoomLevel?: number) => {
    if (!cameraRef.current?.setCamera) return;

    const resolvedZoomLevel = typeof zoomLevel === 'number'
      ? zoomLevel
      : getZoomLevelFromLongitudeDelta(mapRegion?.longitudeDelta);

    cameraRef.current.setCamera({
      centerCoordinate: [lng, lat],
      zoomLevel: resolvedZoomLevel,
      animationDuration: 280,
    });
  }, [getZoomLevelFromLongitudeDelta, mapRegion?.longitudeDelta]);

  const updateSelectedLocationFromMap = useCallback((lat: number, lng: number) => {
    mapCenterRef.current = { lat, lng };
    setSelectedLocation((prev) => {
      if (prev && Math.abs(prev.lat - lat) < 0.000001 && Math.abs(prev.lng - lng) < 0.000001) {
        return prev;
      }
      return { lat, lng };
    });
  }, []);

  const resolveMapAddressPreview = useCallback(async (lat: number, lng: number) => {
    const requestId = ++mapAddressRequestIdRef.current;
    setIsResolvingMapAddress(true);

    try {
      const address = await resolveAddressFromCoordinates(lat, lng);
      if (mapAddressRequestIdRef.current === requestId) {
        setMapAddressPreview(address);
      }
    } catch {
      if (mapAddressRequestIdRef.current === requestId) {
        setMapAddressPreview(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      }
    } finally {
      if (mapAddressRequestIdRef.current === requestId) {
        setIsResolvingMapAddress(false);
      }
    }
  }, [resolveAddressFromCoordinates]);

  const scheduleMapAddressPreview = useCallback((lat: number, lng: number) => {
    if (mapAddressTimeoutRef.current) {
      clearTimeout(mapAddressTimeoutRef.current);
    }

    mapAddressTimeoutRef.current = setTimeout(() => {
      resolveMapAddressPreview(lat, lng);
    }, 300);
  }, [resolveMapAddressPreview]);

  // Gerer le clic sur la carte (Mapbox)
  const handleMapPress = (event: any) => {
    const coordinates = extractCoordinatesFromMapEvent(event);
    if (!coordinates) return;

    updateSelectedLocationFromMap(coordinates.lat, coordinates.lng);
    focusMapOnCoordinates(coordinates.lat, coordinates.lng);
    scheduleMapAddressPreview(coordinates.lat, coordinates.lng);
  };

  const handleMapCameraChanged = (event: any) => {
    const coordinates = extractCoordinatesFromMapEvent(event);
    if (!coordinates) return;
    mapCenterRef.current = coordinates;
  };

  const handleMapIdle = (event: any) => {
    const coordinates = extractCoordinatesFromMapEvent(event) ?? mapCenterRef.current;
    if (!coordinates) return;

    updateSelectedLocationFromMap(coordinates.lat, coordinates.lng);
    scheduleMapAddressPreview(coordinates.lat, coordinates.lng);
  };

  // Confirmer la selection de la carte
  const handleConfirmMapLocation = async () => {
    if (selectedLocation) {
      await reverseGeocode(selectedLocation.lat, selectedLocation.lng);
      setShowMapPicker(false);
    }
  };

  useEffect(() => {
    if (!showMapPicker) {
      setIsResolvingMapAddress(false);
      if (mapAddressTimeoutRef.current) {
        clearTimeout(mapAddressTimeoutRef.current);
      }
      return;
    }

    if (selectedLocation) {
      scheduleMapAddressPreview(selectedLocation.lat, selectedLocation.lng);
    }
  }, [showMapPicker, scheduleMapAddressPreview]);

  // Construire une adresse complete ? partir d'un resultat de g?ocodage
  const buildFullAddress = (result: any): string => {
    const addressParts = [];
    
    // Ajouter le numero et la rue
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
    
    // Ajouter la region/province
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
    
    // Si on ? des parties, les joindre
    if (addressParts.length > 0) {
      return addressParts.join(', ');
    }
    
    // Si aucune partie d'adresse, essayer de construire quelque chose de lisible
    // ou retourner un message generique plutot que les coordonnees
    if (result.name) {
      return result.name;
    }
    
    // Dernier recours : utiliser les coordonnees formatees de maniere plus lisible
    return `Lat: ${result.latitude.toFixed(4)}, Lng: ${result.longitude.toFixed(4)}`;
  };

  // Rechercher des suggestions d'adresse pendant la saisie (autocomplete)
  const searchAddressCandidates = useCallback(async (rawQuery: string): Promise<AddressSuggestion[]> => {
    const query = rawQuery.trim();
    if (!query || query.length < 2) {
      return [];
    }

    const fallbackToExpo = async (): Promise<AddressSuggestion[]> => {
      const expoResults = await Location.geocodeAsync(query);

      return expoResults.slice(0, 5).map((result) => {
        const fullAddress = buildFullAddress(result);
        return {
          latitude: result.latitude,
          longitude: result.longitude,
          fullAddress,
          name: fullAddress,
        };
      });
    };

    if (!MAPBOX_ACCESS_TOKEN) {
      return fallbackToExpo();
    }

    try {
      const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?autocomplete=true&language=fr&limit=5&types=address,place,locality,neighborhood,poi&access_token=${MAPBOX_ACCESS_TOKEN}`;
      const response = await fetch(endpoint);

      if (!response.ok) {
        throw new Error(`Mapbox geocoding status ${response.status}`);
      }

      const payload = await response.json();
      const features = Array.isArray(payload?.features) ? payload.features : [];

      const mapboxResults = features
        .map((feature: any): AddressSuggestion | null => {
          if (!Array.isArray(feature?.center) || feature.center.length < 2) {
            return null;
          }

          const [longitude, latitude] = feature.center;
          if (typeof latitude !== 'number' || typeof longitude !== 'number') {
            return null;
          }

          const label = typeof feature.place_name === 'string' && feature.place_name.trim().length > 0
            ? feature.place_name
            : buildFullAddress({ latitude, longitude, name: feature.text });

          return {
            latitude,
            longitude,
            fullAddress: label,
            name: feature.text || label,
          };
        })
        .filter((item: AddressSuggestion | null): item is AddressSuggestion => item !== null);

      if (mapboxResults.length > 0) {
        return mapboxResults;
      }

      return fallbackToExpo();
    } catch (error) {
      console.log('Mapbox geocoding unavailable, fallback to Expo geocoder', error);
      return fallbackToExpo();
    }
  }, []);

  const searchLocationSuggestions = async (query: string) => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery || trimmedQuery.length < 2) {
      setLocationSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setIsLoadingSuggestions(true);
    try {
      const results = await searchAddressCandidates(trimmedQuery);
      
      if (results.length > 0) {
        // Limiter ? 5 suggestions
        setLocationSuggestions(results);
        setShowSuggestions(true);
      } else {
        setLocationSuggestions([]);
        setShowSuggestions(false);
      }
    } catch (error) {
      console.log('Error searching location suggestions:', error);
      setLocationSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  // Gerer le changement de texte dans le champ de lieu avec debounce
  const handleLocationChange = (text: string) => {
    setLocation(text);
    setShowSuggestions(text.trim().length >= 2);

    // Annuler le timeout precedent
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Debounce: attendre 300ms apres la derniere frappe avant de rechercher
    searchTimeoutRef.current = setTimeout(() => {
      searchLocationSuggestions(text);
    }, 300);
  };

  // Selectionner une suggestion d'autocomplete
  const handleSelectSuggestion = (suggestion: AddressSuggestion) => {
    const fullAddress = suggestion.fullAddress || buildFullAddress(suggestion);
    setLocation(fullAddress);
    updateSelectedLocationFromMap(suggestion.latitude, suggestion.longitude);
    setMapRegion({
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });
    setLocationSuggestions([]);
    setShowSuggestions(false);
    Keyboard.dismiss();
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

    if (isSearchingRef.current) {
      return;
    }

    if (lastSearchQueryRef.current === trimmedQuery && hasSearchResultsRef.current) {
      return;
    }

    lastSearchQueryRef.current = trimmedQuery;
    isSearchingRef.current = true;
    setIsSearching(true);

    try {
      const results = await searchAddressCandidates(trimmedQuery);

      if (lastSearchQueryRef.current !== trimmedQuery) {
        return;
      }

      const normalizedResults = results.map((result) => ({
        ...result,
        fullAddress: result.fullAddress || buildFullAddress(result),
      }));

      setSearchResults(normalizedResults);
      hasSearchResultsRef.current = normalizedResults.length > 0;
    } catch (error) {
      console.error('Error searching address suggestions:', error);
      if (lastSearchQueryRef.current === trimmedQuery) {
        setSearchResults([]);
        hasSearchResultsRef.current = false;
      }
    } finally {
      isSearchingRef.current = false;
      setIsSearching(false);
    }
  }, [searchAddressCandidates]);
  // Gerer le changement de texte dans le champ de recherche du modal avec debounce
  const handleMapSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    
    // Annuler le timeout precedent
    if (mapSearchTimeoutRef.current) {
      clearTimeout(mapSearchTimeoutRef.current);
      mapSearchTimeoutRef.current = null;
    }

    // Si le texte est vide ou trop court, vider les resultats immediatement
    if (!text.trim() || text.length < 2) {
      setSearchResults([]);
      lastSearchQueryRef.current = '';
      hasSearchResultsRef.current = false;
      isSearchingRef.current = false;
      return;
    }

    // Debounce: attendre 300ms apres la derniere frappe avant de rechercher (plus rapide)
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
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) {
      Alert.alert('Erreur', 'Veuillez entrer une adresse a rechercher');
      return;
    }

    setIsSearching(true);
    setSearchResults([]);
    lastSearchQueryRef.current = trimmedQuery;

    try {
      const results = await searchAddressCandidates(trimmedQuery);
      const normalizedResults = results.map((result) => ({
        ...result,
        fullAddress: result.fullAddress || buildFullAddress(result),
      }));

      if (normalizedResults.length === 0) {
        Alert.alert('Aucun resultat', 'Aucune adresse trouvee pour cette recherche');
        hasSearchResultsRef.current = false;
        return;
      }

      setSearchResults(normalizedResults);
      hasSearchResultsRef.current = true;

      const firstResult = normalizedResults[0];
      setMapRegion({
        latitude: firstResult.latitude,
        longitude: firstResult.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
      updateSelectedLocationFromMap(firstResult.latitude, firstResult.longitude);
      focusMapOnCoordinates(firstResult.latitude, firstResult.longitude, getZoomLevelFromLongitudeDelta(0.01));
      setSearchQuery(firstResult.fullAddress);
      setLocation(firstResult.fullAddress);
      setMapAddressPreview(firstResult.fullAddress);
    } catch (error) {
      console.error('Error searching address:', error);
      Alert.alert('Erreur', 'Impossible de rechercher l\'adresse. Veuillez reessayer.');
      hasSearchResultsRef.current = false;
    } finally {
      setIsSearching(false);
    }
  };

  // Selectionner un resultat de recherche
  const handleSelectSearchResult = (result: AddressSuggestion) => {
    const region = {
      latitude: result.latitude,
      longitude: result.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    };
    setMapRegion(region);
    updateSelectedLocationFromMap(result.latitude, result.longitude);
    focusMapOnCoordinates(result.latitude, result.longitude, getZoomLevelFromLongitudeDelta(region.longitudeDelta));

    const fullAddress = result.fullAddress || buildFullAddress(result);
    setSearchQuery(fullAddress);
    setLocation(fullAddress);
    setMapAddressPreview(fullAddress);
    setSearchResults([]);
    hasSearchResultsRef.current = false;
    Keyboard.dismiss();
  };

  React.useEffect(() => {
    if (selectedUser) return;

    const timer = setTimeout(() => {
      try {
        router.back();
      } catch (error) {
        console.error('Error navigating back:', error);
        router.replace('/(screens)/dashboard');
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [selectedUser, router]);

  if (!selectedUser) {
    return null;
  }

  const handleDateSelect = (date: Date) => {
    // Normaliser la date ? minuit dans le fuseau horaire local pour eviter les problemes de conversion
    const normalizedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    setSelectedDate(normalizedDate);
    
    // Formater la date en YYYY-MM-DD en utilisant le fuseau horaire local
    const year = normalizedDate.getFullYear();
    const month = String(normalizedDate.getMonth() + 1).padStart(2, '0');
    const day = String(normalizedDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    setDateInput(dateStr);
    console.log('Date selectionnee dans le calendrier:', dateStr, 'Date originale:', normalizedDate);
  };

  const handleDateConfirm = () => {
    // Utiliser selectedDate au lieu de dateInput pour garantir qu'on utilise la date selectionnee
    if (!selectedDate) {
      Alert.alert('Erreur', 'Veuillez selectionner une date');
      return;
    }

    // Normaliser la date ? minuit dans le fuseau horaire local
    const normalizedDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
    
    // Formater la date en YYYY-MM-DD en utilisant le fuseau horaire local
    const year = normalizedDate.getFullYear();
    const month = String(normalizedDate.getMonth() + 1).padStart(2, '0');
    const day = String(normalizedDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    normalizedDate.setHours(0, 0, 0, 0);

    if (normalizedDate < today) {
      Alert.alert('Erreur', 'Vous ne pouvez selectionner que la date actuelle ou une date a venir');
      return;
    }

    // Mettre ? jour dateInput avec la date selectionnee
    setDateInput(dateStr);
    console.log('Date confirmee:', dateStr, 'Date normalisee:', normalizedDate);

    setShowDatePicker(false);
  };

  const handleSendRequest = async () => {
    if (!currentUser) return;

    // Valider la date et l'heure
    if (!dateInput || !timeInput) {
      Alert.alert('Erreur', 'Veuillez selectionner une date et une heure');
      return;
    }

    const dateStr = dateInput;
    const timeStr = timeInput;
    const combinedDateTime = new Date(`${dateStr}T${timeStr}:00`);
    
    if (isNaN(combinedDateTime.getTime())) {
      Alert.alert('Erreur', 'Veuillez selectionner une date et une heure valides');
      return;
    }

    // V?rifier que la date n'est pas dans le pass?
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(`${dateStr}T00:00:00`);
    selectedDate.setHours(0, 0, 0, 0);

    if (selectedDate < today) {
      Alert.alert('Erreur', 'Vous ne pouvez selectionner que la date actuelle ou une date a venir');
      return;
    }

    // V?rifier que l'heure est dans le futur si la date est aujourd'hui
    const validation = validateTime();
    if (!validation.isValid) {
      Alert.alert('Erreur', validation.errorMessage);
      return;
    }

    // Afficher immediatement le feedback visuel (optimiste)
    setRequestSent(true);
    setIsLoading(true);
    
    // Lancer la creation en arriere-plan (non bloquant pour l'UI)
    createBooking(
      selectedUser.id,
      combinedDateTime.toISOString(),
      parseInt(durationHours) || 1,
      location || undefined,
      selectedLocation?.lat ?? selectedUser.lat,
      selectedLocation?.lng ?? selectedUser.lng,
      notes || undefined,
      selectedTopicId || undefined
    )
      .then(({ error, booking }) => {
        if (error) {
          setRequestSent(false); // R?initialiser en cas d'erreur
          setCreatedBookingId(null);
          setIsLoading(false);
          Alert.alert('Erreur', error.message || 'Impossible de creer la demande');
          return;
        }

        // Succes - le feedback visuel est deja affich?
        setCreatedBookingId(booking?.id || null);
        setIsLoading(false);
        
        // Afficher la confirmation (optionnel, car le feedback visuel est deja l?)
        // Alert.alert('Succes', 'Votre demande a ete envoyee');
      })
      .catch((error: any) => {
        setRequestSent(false);
        setCreatedBookingId(null);
        setIsLoading(false);
        console.error('Error creating booking:', error);
        Alert.alert('Erreur', 'Une erreur est survenue lors de l\'envoi de la demande');
      });
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'Selectionner une date';
    const date = new Date(`${dateStr}T00:00:00`);
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
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

    // Si la date selectionnee est aujourd'hui
    if (selectedDate.getTime() === today.getTime()) {
      // V?rifier si l'heure est dans le futur
      const [hours, minutes] = timeInput.split(':').map(Number);
      if (isNaN(hours) || isNaN(minutes)) {
        // Format invalide, mais on ne bloque pas (sera valid? lors de l'envoi)
        return { isValid: true, errorMessage: '' };
      }

      const now = new Date();
      const selectedTime = new Date();
      selectedTime.setHours(hours, minutes, 0, 0);

      if (selectedTime <= now) {
        return {
          isValid: false,
          errorMessage: 'Vous devez choisir une heure a venir'
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
        keyboardVerticalOffset={Platform.OS === 'ios' ? 56 : 16}
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
            <Text style={styles.sectionTitle}>Details de la demande</Text>
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
              <TouchableOpacity
                style={styles.detailRow}
                onPress={() => setShowTimePicker(true)}
              >
                <Ionicons name="time-outline" size={20} color={colors.pink400} />
                <View style={styles.detailInfo}>
                  <Text style={styles.detailLabel}>Heure</Text>
                  <Text style={styles.detailValue}>{timeInput || 'Selectionner une heure'}</Text>
                  <Text style={styles.inputHint}>Choisissez l&apos;heure et les minutes</Text>
                  {timeValidation.errorMessage ? (
                    <Text style={styles.errorText}>{timeValidation.errorMessage}</Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
              </TouchableOpacity>
              <View style={styles.separator} />
              <View style={styles.detailRow}>
                <Ionicons name="hourglass-outline" size={20} color={colors.pink400} />
                <View style={styles.detailInfo}>
                  <Text style={styles.detailLabel}>Duree (heures)</Text>
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
                          // Delai pour permettre le clic sur une suggestion
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
                      ? topics.find(t => t.id === selectedTopicId)?.name || 'Selectionner un sujet'
                      : 'Selectionner un sujet'}
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
                    placeholder="Ajoutez des details..."
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
                Votre demande sera envoyee a {selectedUser.pseudo}. Une notification lui sera envoyee immediatement.
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
            <Text style={styles.pendingTitle}>Demande envoyee</Text>
            <Text style={styles.pendingSubtitle}>En attente de la reponse de {selectedUser.pseudo}</Text>
            <View style={{ marginTop: 20, gap: 12, width: '100%' }}>
              {createdBookingId ? (
                <Button
                  title="Voir les details"
                  onPress={() => router.replace(`/(screens)/booking-details?bookingId=${createdBookingId}`)}
                  icon={<Ionicons name="information-circle-outline" size={20} color="#ffffff" />}
                  style={styles.button}
                />
              ) : null}
              <Button
                title="Retour au profil"
                variant="outline"
                onPress={() => router.back()}
                style={styles.button}
              />
            </View>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn} style={styles.content}>
            <View style={styles.successContainer}>
              <View style={styles.successIcon}>
                <Ionicons name="checkmark-circle" size={40} color={colors.green500} />
              </View>
              <Text style={styles.successTitle}>Demande acceptee !</Text>
              <Text style={styles.successSubtitle}>
                {selectedUser.pseudo} a accepte votre demande de compagnie
              </Text>
            </View>

            <View style={styles.kycCard}>
              <Ionicons name="shield-checkmark" size={20} color={colors.yellow400} />
              <View style={styles.kycText}>
                <Text style={styles.kycTitle}>
                  Pour votre securite, nous recommandons une verification d&apos;identite instantanee.
                </Text>
                <Text style={styles.kycSubtitle}>
                  Prenez un selfie avec le signe OK pour confirmer votre identité.
                </Text>
              </View>
            </View>

            <Button
              title="Verification instantanee (KYC)"
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
            keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 16}
            style={styles.modalKeyboardView}
          >
            <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
              <Text style={styles.modalTitle}>Selectionner la date</Text>
              
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

      {DatePicker ? (
        Platform.OS === 'ios' ? (
          <Modal
            visible={showTimePicker}
            transparent
            animationType="slide"
            onRequestClose={() => setShowTimePicker(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Selectionner l&apos;heure</Text>
                <DatePicker
                  value={iosTimeDraft}
                  mode="time"
                  display="spinner"
                  is24Hour
                  minuteInterval={5}
                  onChange={handleTimePickerChange}
                  style={styles.timePicker}
                />
                <View style={styles.modalActions}>
                  <Button
                    title="Annuler"
                    onPress={() => setShowTimePicker(false)}
                    variant="outline"
                    style={styles.modalButton}
                  />
                  <Button
                    title="Confirmer"
                    onPress={handleTimeConfirm}
                    style={styles.modalButton}
                  />
                </View>
              </View>
            </View>
          </Modal>
        ) : (
          showTimePicker ? (
            <DatePicker
              value={timePickerValue}
              mode="time"
              display="default"
              is24Hour
              minuteInterval={5}
              onChange={handleTimePickerChange}
            />
          ) : null
        )
      ) : (
        <Modal
          visible={showTimePicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowTimePicker(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Selectionner l&apos;heure</Text>
              <ScrollView style={styles.timeOptionsList} showsVerticalScrollIndicator={false}>
                {timeOptions.map((timeOption) => {
                  const isSelected = timeInput === timeOption;
                  return (
                    <TouchableOpacity
                      key={timeOption}
                      style={[styles.timeOptionItem, isSelected && styles.timeOptionItemSelected]}
                      onPress={() => handleFallbackTimeSelect(timeOption)}
                    >
                      <Text style={[styles.timeOptionText, isSelected && styles.timeOptionTextSelected]}>
                        {timeOption}
                      </Text>
                      {isSelected ? <Ionicons name="checkmark-circle" size={18} color={colors.pink500} /> : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <View style={styles.modalActions}>
                <Button
                  title="Fermer"
                  onPress={() => setShowTimePicker(false)}
                  variant="outline"
                  style={styles.modalButton}
                />
              </View>
            </View>
          </View>
        </Modal>
      )}

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
            <Text style={styles.mapHeaderTitle}>Selectionner un lieu</Text>
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
                styleURL={Mapbox?.StyleURL?.Street || 'mapbox://styles/mapbox/streets-v12'}
                style={styles.map}
                logoEnabled={false}
                attributionEnabled={false}
                onPress={handleMapPress}
                onCameraChanged={handleMapCameraChanged}
                onMapIdle={handleMapIdle}
              >
                <Camera
                  ref={cameraRef}
                  defaultSettings={{
                    centerCoordinate: [mapRegion.longitude, mapRegion.latitude],
                    zoomLevel: getZoomLevelFromLongitudeDelta(mapRegion.longitudeDelta),
                  }}
                />
              </MapView>
              <View pointerEvents="none" style={styles.mapCenterMarkerOverlay}>
                <View style={styles.selectedLocationMarker}>
                  <Ionicons name="location" size={24} color={colors.pink500} />
                </View>
              </View>

              <View style={styles.mapFooter}>
                <View style={styles.mapInfo}>
                  {(isResolvingMapAddress || isLoadingAddress) ? (
                    <ActivityIndicator size="small" color={colors.pink500} />
                  ) : (
                    <Ionicons name="location" size={20} color={colors.pink500} />
                  )}
                  <Text style={styles.mapInfoText} numberOfLines={2}>
                    {mapAddressPreview ||
                      (selectedLocation
                        ? `${selectedLocation.lat.toFixed(6)}, ${selectedLocation.lng.toFixed(6)}`
                        : 'Deplacez la carte ou appuyez pour selectionner un lieu')}
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
    paddingBottom: 128,
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
    minHeight: 52,
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
  timePicker: {
    marginTop: 8,
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
  timeOptionsList: {
    maxHeight: 360,
  },
  timeOptionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSecondary,
  },
  timeOptionItemSelected: {
    backgroundColor: colors.background,
  },
  timeOptionText: {
    fontSize: 16,
    color: colors.text,
  },
  timeOptionTextSelected: {
    color: colors.pink500,
    fontWeight: '600',
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
  mapCenterMarkerOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -20 }, { translateY: -20 }],
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




