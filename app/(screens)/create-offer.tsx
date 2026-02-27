/* eslint-disable react-hooks/exhaustive-deps */
import { Ionicons } from '@expo/vector-icons';
import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CalendarPicker } from '../../components/CalendarPicker';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { colors } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';
import { useOffer } from '../../context/OfferContext';
import { isMapboxAvailable, MAPBOX_ACCESS_TOKEN } from '../../lib/mapbox';
import { OfferTargetGender, OfferType } from '../../types';

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

const OFFER_TYPES: { value: OfferType; label: string; icon: string }[] = [
  { value: 'drink', label: 'À boire', icon: 'wine-outline' },
  { value: 'food', label: 'À manger', icon: 'restaurant-outline' },
  { value: 'transport', label: 'Remboursement transport', icon: 'car-outline' },
  { value: 'gift', label: 'Présent', icon: 'gift-outline' },
];

const TARGET_AUDIENCE_OPTIONS: { value: OfferTargetGender; label: string }[] = [
  { value: 'all', label: 'Tous les sexes' },
  { value: 'female', label: 'Femmes uniquement' },
  { value: 'male', label: 'Hommes uniquement' },
];

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
  const [targetGender, setTargetGender] = useState<OfferTargetGender>('all');
  const [location, setLocation] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
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

  // Charger l'offre existante si on est en mode ?dition
  useEffect(() => {
    const loadOffer = async () => {
      if (!offerId) {
        // Mode creation : initialiser avec la date/heure actuelle
        const now = new Date();
        setSelectedDate(now);
        // Formater la date en YYYY-MM-DD en utilisant le fuseau horaire local
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        setDateInput(`${year}-${month}-${day}`);
        setTimeInput(getRoundedTimeString(now));
        return;
      }

      // Mode ?dition : charger l'offre existante
      setIsLoadingOffer(true);
      setIsEditMode(true);
      try {
        const offer = await getOfferById(offerId);
        if (offer) {
          // Pr?-remplir tous les champs
          setTitle(offer.title || '');
          setDescription(offer.description || '');
          setNotes(offer.notes || '');
          
          // Pr?-remplir les types d'offre
          if (offer.offerTypes && offer.offerTypes.length > 0) {
            setSelectedOfferTypes(offer.offerTypes);
          } else if (offer.offerType) {
            setSelectedOfferTypes([offer.offerType]);
          }
          
          // Pr?-remplir la date et l'heure
          const offerDate = new Date(offer.offerDate);
          setSelectedDate(offerDate);
          // Formater la date en YYYY-MM-DD en utilisant le fuseau horaire local
          const year = offerDate.getFullYear();
          const month = String(offerDate.getMonth() + 1).padStart(2, '0');
          const day = String(offerDate.getDate()).padStart(2, '0');
          setDateInput(`${year}-${month}-${day}`);
          const hours = offerDate.getHours().toString().padStart(2, '0');
          const minutes = offerDate.getMinutes().toString().padStart(2, '0');
          setTimeInput(`${hours}:${minutes}`);
          
          // Pr?-remplir la duree
          setDurationHours(offer.durationHours?.toString() || '1');
          setTargetGender(offer.targetGender || 'all');
          
          // Pr?-remplir le lieu
          setLocation(offer.location || '');
          
          // Pr?-remplir la position sur la carte si disponible
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

    if (showMapPicker) {
      // S'assurer que mapRegion est defini immediatement pour afficher la carte
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
    
    // Si on ? des parties, les joindre
    if (addressParts.length > 0) {
      return addressParts.join(', ');
    }
    
    // Si aucune partie d'adresse, essayer de construire quelque chose de lisible
    if (result.name) {
      return result.name;
    }
    
    // Dernier recours : utiliser les coordonnees formatees de maniere plus lisible
    return `Lat: ${result.latitude.toFixed(4)}, Lng: ${result.longitude.toFixed(4)}`;
  };

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

  // Rechercher des suggestions d'adresse pendant la saisie (autocomplete)
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
      Alert.alert('Erreur', 'Impossible de rechercher l\'adresse');
      hasSearchResultsRef.current = false;
    } finally {
      setIsSearching(false);
    }
  };

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
    console.log('Date selectionnee dans le calendrier (offre):', dateStr, 'Date originale:', normalizedDate);
  };

  const handleDateConfirm = () => {
    // Utiliser selectedDate pour garantir qu'on utilise la date selectionnee
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
      Alert.alert('Erreur', 'Vous ne pouvez sélectionner que la date actuelle ou une date à venir');
      return;
    }

    // Mettre ? jour dateInput avec la date selectionnee
    setDateInput(dateStr);
    console.log('Date confirmee (offre):', dateStr, 'Date normalisee:', normalizedDate);
    setShowDatePicker(false);
  };

  const handleCreateOffer = async () => {
    if (selectedOfferTypes.length === 0) {
      Alert.alert('Erreur', 'Veuillez selectionner au moins un type d\'offre');
      return;
    }

    if (!title.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer un titre');
      return;
    }

    if (!dateInput || !timeInput) {
      Alert.alert('Erreur', 'Veuillez sélectionner une date et une heure');
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
      Alert.alert('Erreur', 'La date et l\'heure doivent etre dans le futur');
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
        // Mode ?dition : mettre ? jour l'offre existante
        const { error } = await updateOffer(
          offerId,
          selectedOfferTypes,
          title.trim(),
          combinedDateTime.toISOString(),
          duration,
          description.trim() || undefined,
          notes.trim() || undefined,
          location.trim() || undefined,
          selectedLocation?.lat,
          selectedLocation?.lng,
          targetGender
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
        // Mode creation : creer une nouvelle offre
        const { error } = await createOffer(
          selectedOfferTypes,
          title.trim(),
          combinedDateTime.toISOString(),
          duration,
          description.trim() || undefined,
          notes.trim() || undefined,
          location.trim() || undefined,
          selectedLocation?.lat,
          selectedLocation?.lng,
          targetGender
        );

        if (error) {
          Alert.alert('Erreur', error.message || 'Impossible de creer l\'offre');
          setIsLoading(false);
          return;
        }

        // Rediriger immediatement sans attendre l'alerte
        router.back();
        
        // Afficher l'alerte de succ?s en arriere-plan (non bloquant)
        setTimeout(() => {
          Alert.alert(
            'Succès',
            `Votre offre avec ${selectedOfferTypes.length} type${selectedOfferTypes.length > 1 ? 's' : ''} a été créée (${targetGender === 'all' ? 'ouverte à tous les sexes' : targetGender === 'female' ? 'réservée aux femmes' : 'réservée aux hommes'})`
          );
        }, 300);
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
          <Text style={styles.headerTitle}>Modifier l&apos;offre</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.pink500} />
          <Text style={{ marginTop: 16, color: colors.textSecondary }}>
            Chargement de l&apos;offre...
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
          <Animated.View entering={FadeIn} style={styles.content}>
          <Text style={styles.sectionTitle}>Types d&apos;offre (sélection multiple)</Text>
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
                      // D?selectionner
                      setSelectedOfferTypes(prev => prev.filter(t => t !== type.value));
                    } else {
                      // Selectionner
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

          <Text style={styles.sectionTitle}>Titre de l&apos;offre *</Text>
          <Input
            value={title}
            onChangeText={setTitle}
            placeholder="Ex: Café au centre-ville"
            containerStyle={styles.input}
          />

          <Text style={styles.sectionTitle}>Audience de l&apos;offre</Text>
          <View style={styles.targetAudienceContainer}>
            {TARGET_AUDIENCE_OPTIONS.map((option) => {
              const isSelected = option.value === targetGender;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.targetAudienceOption,
                    isSelected && styles.targetAudienceOptionActive,
                  ]}
                  onPress={() => setTargetGender(option.value)}
                >
                  <Text
                    style={[
                      styles.targetAudienceOptionText,
                      isSelected && styles.targetAudienceOptionTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.sectionTitle}>Description (optionnel)</Text>
          <Input
            value={description}
            onChangeText={setDescription}
            placeholder="Decrivez votre offre..."
            multiline
            numberOfLines={3}
            containerStyle={styles.input}
          />

          <Text style={styles.sectionTitle}>Details de l&apos;offre</Text>
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
                <Text style={styles.detailValue}>{timeInput || 'Sélectionner une heure'}</Text>
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
              {targetGender === 'all'
                ? 'Votre offre sera visible par tous les utilisateurs disponibles. Ils pourront candidater et vous pourrez choisir parmi les candidats.'
                : `Votre offre sera réservée aux ${targetGender === 'female' ? 'femmes' : 'hommes'} et seuls ces profils recevront la notification.`}
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
                onPress={handleDateConfirm}
                style={styles.modalButton}
              />
            </View>
          </View>
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
                <Text style={styles.modalTitle}>Sélectionner l&apos;heure</Text>
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
              <Text style={styles.modalTitle}>Sélectionner l&apos;heure</Text>
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
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 16}
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
                      lastSearchQueryRef.current = '';
                      hasSearchResultsRef.current = false;
                      isSearchingRef.current = false;
                      Keyboard.dismiss();
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

            <View style={styles.mapSelectionInfo}>
              <View style={styles.mapInfoRow}>
                {(isResolvingMapAddress || isLoadingAddress) ? (
                  <ActivityIndicator size="small" color={colors.pink500} />
                ) : (
                  <Ionicons name="location" size={18} color={colors.pink500} />
                )}
                <Text style={styles.mapSelectionText} numberOfLines={2}>
                  {mapAddressPreview ||
                    (selectedLocation
                      ? `${selectedLocation.lat.toFixed(6)}, ${selectedLocation.lng.toFixed(6)}`
                      : 'Deplacez la carte ou appuyez pour choisir un lieu')}
                </Text>
              </View>
            </View>

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
    paddingBottom: 120,
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
  targetAudienceContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  targetAudienceOption: {
    borderWidth: 1,
    borderColor: colors.borderSecondary,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.backgroundSecondary,
  },
  targetAudienceOptionActive: {
    borderColor: colors.pink500,
    backgroundColor: colors.backgroundTertiary,
  },
  targetAudienceOptionText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  targetAudienceOptionTextActive: {
    color: colors.pink500,
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
    minHeight: 52,
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
  timePicker: {
    marginTop: 8,
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
    backgroundColor: colors.backgroundSecondary,
  },
  timeOptionText: {
    fontSize: 16,
    color: colors.text,
  },
  timeOptionTextSelected: {
    color: colors.pink500,
    fontWeight: '600',
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
  mapCenterMarkerOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -20 }, { translateY: -20 }],
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
  mapSelectionInfo: {
    marginTop: -8,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  mapInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  mapSelectionText: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
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



