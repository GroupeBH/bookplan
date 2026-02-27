import React, { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { isNetworkError } from '../lib/errorUtils';
import { sendBookingNotification } from '../lib/pushNotifications';
import { supabase } from '../lib/supabase';
import { Booking } from '../types';
import { useAuth } from './AuthContext';
import { useNotification } from './NotificationContext';

// Vérifier si un ID est un UUID valide (pas un ID de développement)
const isValidUUID = (id: string | undefined): boolean => {
  if (!id) return false;
  // UUID v4 pattern
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

interface BookingContextType {
  bookings: Booking[];
  isLoading: boolean;
  createBooking: (providerId: string, bookingDate: string, durationHours: number, location?: string, lat?: number, lng?: number, notes?: string, topicId?: string) => Promise<{ error: any; booking: Booking | null }>;
  getCompanionshipTopics: () => Promise<{ error: any; topics: any[] }>;
  updateBookingStatus: (bookingId: string, status: Booking['status']) => Promise<{ error: any }>;
  getUserBookings: (userId?: string) => Promise<Booking[]>;
  getAvailableUsers: (options?: {
    center?: { lat: number; lng: number };
    radiusKm?: number;
    onlineWithinMinutes?: number;
  }) => Promise<any[]>;
  getAllUsers: () => Promise<any[]>; // Pour la page recherche (tous les utilisateurs, pas seulement en ligne)
  refreshBookings: () => Promise<void>;
  getActiveBookingWithUser: (userId: string) => Promise<Booking | null>;
  cancelBooking: (bookingId: string) => Promise<{ error: any }>;
  extendBooking: (bookingId: string, additionalHours: number) => Promise<{ error: any }>;
  checkBookingEndTime: () => void;
}

const BookingContext = createContext<BookingContextType | undefined>(undefined);

const toRadians = (value: number): number => (value * Math.PI) / 180;

const calculateDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const isProfileOnlineNow = (lastSeen: unknown, onlineWindowMs: number): boolean => {
  if (typeof lastSeen !== 'string' || !lastSeen.trim()) return false;

  const parsedMs = Date.parse(lastSeen);
  if (!Number.isFinite(parsedMs)) return false;

  const nowMs = Date.now();
  // Tolérer 5s d'écart d'horloge max.
  if (parsedMs > nowMs + 5000) return false;
  return nowMs - parsedMs <= onlineWindowMs;
};

const HOUR_MS = 60 * 60 * 1000;

const parseTimeMs = (value: unknown): number | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const isBookingStillLive = (
  status: unknown,
  bookingDateValue: unknown,
  durationHoursValue?: unknown
): boolean => {
  if (status !== 'pending' && status !== 'accepted') return false;

  const bookingDateMs = parseTimeMs(bookingDateValue);
  if (bookingDateMs === null) return true;

  const now = Date.now();
  if (status === 'pending') {
    return bookingDateMs > now;
  }

  const durationHours = Number(durationHoursValue);
  const safeDuration = Number.isFinite(durationHours) && durationHours > 0 ? durationHours : 1;
  const bookingEndMs = bookingDateMs + safeDuration * HOUR_MS;
  return bookingEndMs > now;
};

export function BookingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { createNotification } = useNotification();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const bookingCheckIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Charger les bookings au démarrage
  useEffect(() => {
    if (user) {
      refreshBookings();
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rafraîchir les bookings
  const refreshBookings = async () => {
    if (!user) return;

    // En mode développement, si l'utilisateur n'a pas d'UUID valide, ne pas faire de requête
    if (!isValidUUID(user.id)) {
      console.log('🔧 Mode développement : Utilisateur local, pas de requête Supabase pour les bookings');
      setBookings([]);
      return;
    }

    setIsLoading(true);
    try {
      // Récupérer toutes les demandes sauf celles qui sont annulées ou rejetées
      // (on garde pending, accepted, completed pour l'historique)
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .or(`requester_id.eq.${user.id},provider_id.eq.${user.id}`)
        .in('status', ['pending', 'accepted', 'completed'])
        .order('created_at', { ascending: false });

      if (error) {
        // Ne pas afficher l'erreur si la table n'existe pas encore ou si c'est une erreur de permissions
        if (error.code === 'PGRST116' || error.code === '42P01') {
          console.log('⚠️ Table bookings n\'existe pas encore ou erreur de permissions');
          setBookings([]);
        } else if (isNetworkError(error)) {
          // Erreur réseau silencieuse
          console.log('⚠️ Erreur réseau lors du chargement des bookings');
          setBookings([]);
        } else {
          console.error('Error fetching bookings:', error);
        }
        return;
      }

      if (data) {
        setBookings(data.map(mapBookingFromDB));
      } else {
        setBookings([]);
      }
    } catch (error: any) {
      // Gérer les erreurs réseau gracieusement
      if (error?.message?.includes('Network request failed') || error?.message?.includes('Failed to fetch')) {
        // Erreur réseau silencieuse - ne pas polluer la console
        console.log('⚠️ Erreur réseau lors du chargement des bookings');
      } else {
        console.log('⚠️ Erreur lors du chargement des bookings:', error?.message || error);
      }
      setBookings([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Obtenir la demande active avec un utilisateur spécifique (définie avant createBooking)
  const getActiveBookingWithUser = React.useCallback(async (userId: string): Promise<Booking | null> => {
    if (!user?.id) return null;

    try {
      // Chercher les bookings où l'utilisateur actuel est le requester et l'autre est le provider
      // Exclure explicitement les demandes annulées, rejetées et complétées
      const { data: data1, error: error1 } = await supabase
        .from('bookings')
        .select('*')
        .eq('requester_id', user.id)
        .eq('provider_id', userId)
        .in('status', ['pending', 'accepted'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error1 && error1.code !== 'PGRST116') {
        // Ne pas logger les erreurs réseau répétées
        if (!isNetworkError(error1)) {
          console.error('Error fetching active booking (requester):', error1);
        }
      }

      if (data1) {
        // Double vérification : s'assurer que le statut n'est pas cancelled ou rejected
        if (data1.status === 'cancelled' || data1.status === 'rejected') {
          console.log('⚠️ Demande trouvée mais avec statut invalide:', data1.status);
          return null;
        }
        if (!isBookingStillLive(data1.status, data1.booking_date, data1.duration_hours)) {
          return null;
        }
        console.log('✅ Demande active trouvée (requester):', data1.id, data1.status);
        return mapBookingFromDB(data1);
      }

      // Chercher les bookings où l'utilisateur actuel est le provider et l'autre est le requester
      const { data: data2, error: error2 } = await supabase
        .from('bookings')
        .select('*')
        .eq('requester_id', userId)
        .eq('provider_id', user.id)
        .in('status', ['pending', 'accepted'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error2 && error2.code !== 'PGRST116') {
        // Ne pas logger les erreurs réseau répétées
        if (!isNetworkError(error2)) {
          console.error('Error fetching active booking (provider):', error2);
        }
      }

      if (data2) {
        // Double vérification : s'assurer que le statut n'est pas cancelled ou rejected
        if (data2.status === 'cancelled' || data2.status === 'rejected') {
          console.log('⚠️ Demande trouvée mais avec statut invalide:', data2.status);
          return null;
        }
        if (!isBookingStillLive(data2.status, data2.booking_date, data2.duration_hours)) {
          return null;
        }
        console.log('✅ Demande active trouvée (provider):', data2.id, data2.status);
        return mapBookingFromDB(data2);
      }

      console.log('ℹ️ Aucune demande active trouvée pour l\'utilisateur:', userId);
      return null;
    } catch (error: any) {
      // Ne pas logger les erreurs réseau répétées
      if (!isNetworkError(error)) {
        console.error('Error in getActiveBookingWithUser:', error);
      }
      return null;
    }
  }, [user?.id]);

  // Créer une demande de compagnie
  // Obtenir les sujets de compagnie disponibles
  const getCompanionshipTopics = async () => {
    try {
      const { data, error } = await supabase
        .from('companionship_topics')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) {
        if (!isNetworkError(error)) {
          console.error('Error fetching companionship topics:', error);
        }
        return { error, topics: [] };
      }

      return { error: null, topics: data || [] };
    } catch (error: any) {
      if (!isNetworkError(error)) {
        console.error('Error in getCompanionshipTopics:', error);
      }
      return { error, topics: [] };
    }
  };

  const createBooking = async (
    providerId: string,
    bookingDate: string,
    durationHours: number = 1,
    location?: string,
    lat?: number,
    lng?: number,
    notes?: string,
    topicId?: string
  ) => {
    if (!user) {
      return { error: { message: 'Not authenticated' }, booking: null };
    }

    // Vérifier d'abord dans le state local (plus rapide) avant de faire une requête
    const localActiveBooking = bookings.find(
      b => ((b.requesterId === user.id && b.providerId === providerId) ||
           (b.providerId === user.id && b.requesterId === providerId)) &&
           isBookingStillLive(b.status, b.bookingDate, b.durationHours)
    );
    
    if (localActiveBooking) {
      if (localActiveBooking.status === 'pending') {
        return { error: { message: 'Vous avez déjà une demande en attente avec cet utilisateur' }, booking: null };
      }
      if (localActiveBooking.status === 'accepted') {
        return { error: { message: 'Vous avez déjà une compagnie acceptée avec cet utilisateur' }, booking: null };
      }
    }

    // En mode développement, si l'utilisateur n'a pas d'UUID valide, simuler la création
    if (!isValidUUID(user.id)) {
      console.log('🔧 Mode développement : Simulation de création de booking');
        const mockBooking: Booking = {
        id: `booking-dev-${Date.now()}`,
        requesterId: user.id,
        providerId: providerId,
        status: 'pending',
        bookingDate: bookingDate,
        durationHours: durationHours,
        location: location,
        lat: lat,
        lng: lng,
        notes: notes,
        topicId: topicId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setBookings([mockBooking, ...bookings]);
      return { error: null, booking: mockBooking };
    }

    try {
      const { data, error } = await supabase
        .from('bookings')
        .insert({
          requester_id: user.id,
          provider_id: providerId,
          booking_date: bookingDate,
          duration_hours: durationHours,
          location,
          lat,
          lng,
          notes,
          topic_id: topicId || null,
          status: 'pending',
        })
        .select()
        .single();

      if (error) {
        // Ne pas logger les erreurs réseau répétées
        if (!isNetworkError(error)) {
          console.error('Error creating booking:', error);
        }
        return { error, booking: null };
      }

      if (data) {
        const newBooking = mapBookingFromDB(data);
        // Mise à jour optimiste : ajouter immédiatement au state local
        setBookings((prev) => [newBooking, ...prev.filter((b) => b.id !== newBooking.id)]);
        
        // Rafraîchir les bookings en arrière-plan (non bloquant) - pour synchroniser avec la DB
        refreshBookings().catch(() => {
          // Ignorer les erreurs de rafraîchissement
        });
        
        const bookingRequestMessage = `${user.pseudo || 'Un utilisateur'} vous a envoyé une demande de compagnie`;
        Promise.allSettled([
          createNotification(
            providerId,
            'booking_request_received',
            'Nouvelle demande de compagnie',
            bookingRequestMessage,
            { bookingId: newBooking.id, userId: user.id }
          ),
          sendBookingNotification(
            providerId,
            newBooking.id,
            'request',
            'Nouvelle demande de compagnie',
            bookingRequestMessage
          ),
        ]).catch(() => {
          // Ignorer les erreurs de notification
        });
        
        return { error: null, booking: newBooking };
      }

      return { error: { message: 'No data returned' }, booking: null };
    } catch (error: any) {
      // Gérer les erreurs réseau gracieusement
      if (isNetworkError(error)) {
        console.log('⚠️ Erreur réseau lors de la création du booking');
        return { error: { message: 'Erreur de connexion. Vérifiez votre connexion internet.' }, booking: null };
      }
      console.error('Error in createBooking:', error);
      return { error, booking: null };
    }
  };

  // Mettre à jour le statut d'un booking
  const updateBookingStatus = async (bookingId: string, status: Booking['status']) => {
    if (!user) {
      return { error: { message: 'Not authenticated' } };
    }

    const currentLocalBooking = bookings.find((b) => b.id === bookingId);
    if (currentLocalBooking?.status === status) {
      return { error: null };
    }

    try {
      const { data, error } = await supabase
        .from('bookings')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', bookingId)
        .select()
        .single();

      if (error) {
        // Ne pas logger les erreurs réseau répétées
        if (!isNetworkError(error)) {
          console.error('Error updating booking:', error);
        }
        return { error };
      }

      if (data) {
        const updatedBooking = mapBookingFromDB(data);
        setBookings((prev) => prev.map((b) => (b.id === bookingId ? updatedBooking : b)));
        
        // Envoyer une notification selon le statut
        if (status === 'accepted') {
          // Notifier le requester que sa demande a été acceptée
          const requesterId = updatedBooking.requesterId;
          const { data: providerProfile } = await supabase
            .from('profiles')
            .select('pseudo')
            .eq('id', user.id)
            .single();
          const message = `${providerProfile?.pseudo || 'Un utilisateur'} a accepté votre demande de compagnie`;

          await Promise.allSettled([
            createNotification(
              requesterId,
              'booking_request_accepted',
              'Demande de compagnie acceptée',
              message,
              { bookingId: bookingId, userId: user.id }
            ),
            sendBookingNotification(
              requesterId,
              bookingId,
              'accepted',
              'Demande de compagnie acceptée',
              message
            ),
          ]);
        } else if (status === 'rejected') {
          // Notifier le requester que sa demande a été rejetée
          const requesterId = updatedBooking.requesterId;
          const { data: providerProfile } = await supabase
            .from('profiles')
            .select('pseudo')
            .eq('id', user.id)
            .single();
          const message = `${providerProfile?.pseudo || 'Un utilisateur'} a rejeté votre demande de compagnie`;

          await Promise.allSettled([
            createNotification(
              requesterId,
              'booking_request_rejected',
              'Demande de compagnie rejetée',
              message,
              { bookingId: bookingId, userId: user.id }
            ),
            sendBookingNotification(
              requesterId,
              bookingId,
              'rejected',
              'Demande de compagnie rejetée',
              message
            ),
          ]);
        } else if (status === 'completed') {
          // Notifier les deux utilisateurs que la compagnie est terminée
          const requesterId = updatedBooking.requesterId;
          const providerId = updatedBooking.providerId;
          
          await Promise.allSettled([
            createNotification(
              requesterId,
              'booking_request_accepted',
              'Compagnie terminée',
              'Votre compagnie est terminée. Ouvrez les détails pour noter, modifier votre avis ou demander une prolongation.',
              { bookingId: bookingId }
            ),
            createNotification(
              providerId,
              'booking_request_accepted',
              'Compagnie terminée',
              'Votre compagnie est terminée. Ouvrez les détails pour noter, modifier votre avis ou demander une prolongation.',
              { bookingId: bookingId }
            ),
            sendBookingNotification(
              requesterId,
              bookingId,
              'completed',
              'Compagnie terminée',
              'Votre compagnie est terminée. Ouvrez les détails pour noter ou prolonger.'
            ),
            sendBookingNotification(
              providerId,
              bookingId,
              'completed',
              'Compagnie terminée',
              'Votre compagnie est terminée. Ouvrez les détails pour noter ou prolonger.'
            ),
          ]);
        } else if (status === 'cancelled') {
          // Déterminer qui a annulé
          const isRequester = updatedBooking.requesterId === user.id;
          const otherUserId = isRequester ? updatedBooking.providerId : updatedBooking.requesterId;
          const message = `${user.pseudo || 'Un utilisateur'} a annulé la compagnie`;

          await Promise.allSettled([
            createNotification(
              otherUserId,
              'booking_request_rejected',
              'Compagnie annulée',
              message,
              { bookingId: bookingId, userId: user.id }
            ),
            sendBookingNotification(
              otherUserId,
              bookingId,
              'cancelled',
              'Compagnie annulée',
              message
            ),
          ]);
        }
        
        return { error: null };
      }

      return { error: { message: 'No data returned' } };
    } catch (error: any) {
      // Ne pas logger les erreurs réseau répétées
      if (!isNetworkError(error)) {
        console.error('Error in updateBookingStatus:', error);
      }
      return { error };
    }
  };

  // Obtenir les bookings d'un utilisateur
  const getUserBookings = async (userId?: string) => {
    const targetUserId = userId || user?.id;
    if (!targetUserId) return [];

    try {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .or(`requester_id.eq.${targetUserId},provider_id.eq.${targetUserId}`)
        .order('booking_date', { ascending: false });

      if (error) {
        // Ne pas logger les erreurs réseau répétées
        if (!isNetworkError(error)) {
          console.error('Error fetching user bookings:', error);
        }
        return [];
      }

      return data ? data.map(mapBookingFromDB) : [];
    } catch (error: any) {
      // Ne pas logger les erreurs réseau répétées
      if (!isNetworkError(error)) {
        console.error('Error in getUserBookings:', error);
      }
      return [];
    }
  };

  // Obtenir les utilisateurs disponibles (uniquement ceux en ligne)
  const getAvailableUsers = async (options?: {
    center?: { lat: number; lng: number };
    radiusKm?: number;
    onlineWithinMinutes?: number;
  }) => {
    try {
      // En mode développement, si l'utilisateur n'a pas d'UUID valide, retourner un tableau vide
      if (!isValidUUID(user?.id)) {
        console.log('🔧 Mode développement : Utilisateur local, pas de requête Supabase');
        return [];
      }

      const center = options?.center;
      const radiusKm = Math.max(1, Math.min(options?.radiusKm ?? 10, 100));
      const onlineWithinMinutes = Math.max(1, Math.min(options?.onlineWithinMinutes ?? 2, 10));
      const onlineWindowMs = onlineWithinMinutes * 60 * 1000;

      let query = supabase
        .from('profiles')
        .select('id, pseudo, age, phone, photo, description, rating, review_count, is_subscribed, subscription_status, last_seen, gender, lat, lng, is_available, current_booking_id')
        .eq('is_available', true)
        // S'assurer qu'ils ont une position (lat et lng)
        .not('lat', 'is', null)
        .not('lng', 'is', null);

      if (center && Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
        const latDelta = radiusKm / 111.32;
        const cosLat = Math.cos(toRadians(center.lat));
        const lngDelta = radiusKm / Math.max(111.32 * Math.abs(cosLat), 1e-6);

        query = query
          .gte('lat', center.lat - latDelta)
          .lte('lat', center.lat + latDelta)
          .gte('lng', center.lng - lngDelta)
          .lte('lng', center.lng + lngDelta);
      }

      // Exclure l'utilisateur actuel seulement si c'est un UUID valide
      if (user?.id && isValidUUID(user.id)) {
        query = query.neq('id', user.id);
      }

      const { data, error } = await query;

      if (error) {
        // Ne pas logger les erreurs réseau répétées
        if (!isNetworkError(error)) {
          console.error('Error fetching available users:', error);
        }
        return [];
      }

      if (!data) return [];

      const filteredData = data.filter((profile: any) => {
        if (!isValidUUID(profile?.id)) return false;
        if (!isProfileOnlineNow(profile?.last_seen, onlineWindowMs)) return false;

        if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) {
          return true;
        }

        const lat = Number(profile?.lat);
        const lng = Number(profile?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;

        const distanceKm = calculateDistanceKm(center.lat, center.lng, lat, lng);
        return Number.isFinite(distanceKm) && distanceKm <= radiusKm;
      });

      return filteredData;
    } catch (error: any) {
      // Ne pas logger les erreurs réseau répétées
      if (!isNetworkError(error)) {
        console.error('Error in getAvailableUsers:', error);
      }
      return [];
    }
  };

  // Obtenir tous les utilisateurs (pour la page recherche - en ligne et hors ligne)
  const getAllUsers = async () => {
    try {
      // En mode développement, si l'utilisateur n'a pas d'UUID valide, retourner un tableau vide
      if (!isValidUUID(user?.id)) {
        console.log('🔧 Mode développement : Utilisateur local, pas de requête Supabase');
        return [];
      }

      let query = supabase
        .from('profiles')
        .select('id, pseudo, age, phone, photo, description, is_subscribed, subscription_status, last_seen, gender, lat, lng, is_available, current_booking_id, created_at')
        .eq('is_available', true)
        // Trier par date de création (nouveaux en premier)
        .order('created_at', { ascending: false });

      // Exclure l'utilisateur actuel seulement si c'est un UUID valide
      if (user?.id && isValidUUID(user.id)) {
        query = query.neq('id', user.id);
      }

      const { data, error } = await query;

      if (error) {
        // Ne pas logger les erreurs réseau répétées
        if (!isNetworkError(error)) {
          console.error('Error fetching all users:', error);
        }
        return [];
      }

      if (!data || data.length === 0) {
        return [];
      }

      // Calculer les avis pour chaque utilisateur depuis la table ratings
      const usersWithRatings = await Promise.all(
        data.map(async (profile: any) => {
          try {
            // Récupérer la moyenne et le nombre d'avis depuis la table ratings
            const { data: ratingsData, error: ratingsError } = await supabase
              .from('ratings')
              .select('rating')
              .eq('rated_id', profile.id);

            if (ratingsError && !isNetworkError(ratingsError)) {
              console.error(`Error fetching ratings for user ${profile.id}:`, ratingsError);
            }

            let rating = 0;
            let reviewCount = 0;

            if (ratingsData && ratingsData.length > 0) {
              reviewCount = ratingsData.length;
              const sum = ratingsData.reduce((acc: number, r: any) => acc + parseFloat(r.rating || 0), 0);
              rating = reviewCount > 0 ? sum / reviewCount : 0;
            }

            return {
              ...profile,
              rating: rating,
              review_count: reviewCount,
            };
          } catch (err: any) {
            if (!isNetworkError(err)) {
              console.error(`Error calculating ratings for user ${profile.id}:`, err);
            }
            return {
              ...profile,
              rating: 0,
              review_count: 0,
            };
          }
        })
      );

      return usersWithRatings;
    } catch (error: any) {
      // Ne pas logger les erreurs réseau répétées
      if (!isNetworkError(error)) {
        console.error('Error in getAllUsers:', error);
      }
      return [];
    }
  };


  // Annuler une demande
  const cancelBooking = async (bookingId: string) => {
    if (!user) {
      return { error: { message: 'Not authenticated' } };
    }

    try {
      // Utiliser la fonction RPC pour annuler le booking
      const { data, error } = await supabase
        .rpc('cancel_booking', { p_booking_id: bookingId });

      if (error) {
        // Ne pas logger les erreurs réseau répétées
        if (!isNetworkError(error)) {
          console.error('Error cancelling booking:', error);
        }
        return { error };
      }

      if (!data || !data.success) {
        return { error: { message: data?.error || 'Impossible d\'annuler la demande' } };
      }

      // Mapper le booking retourné
      const updatedBooking = mapBookingFromDB(data.booking);
      setBookings((prev) => prev.map((b) => (b.id === bookingId ? updatedBooking : b)));
      
      // Rafraîchir les bookings pour avoir la liste à jour
      refreshBookings().catch(() => {
        // Ignorer les erreurs de rafraîchissement arrière-plan
      });
      
      return { error: null };
    } catch (error: any) {
      // Ne pas logger les erreurs réseau répétées
      if (!isNetworkError(error)) {
        console.error('Error in cancelBooking:', error);
      }
      return { error };
    }
  };

  // Prolonger une compagnie
  const extendBooking = async (bookingId: string, additionalHours: number) => {
    if (!user) {
      return { error: { message: 'Not authenticated' } };
    }

    try {
      // Récupérer le booking actuel
      const { data: currentBooking, error: fetchError } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', bookingId)
        .single();

      if (fetchError || !currentBooking) {
        return { error: { message: 'Booking not found' } };
      }

      // Vérifier que c'est le requester qui demande la prolongation
      if (currentBooking.requester_id !== user.id) {
        return { error: { message: 'Only the requester can extend a booking' } };
      }

      // Mettre à jour la durée
      const newDuration = currentBooking.duration_hours + additionalHours;
      const { data, error } = await supabase
        .from('bookings')
        .update({ 
          duration_hours: newDuration,
          updated_at: new Date().toISOString() 
        })
        .eq('id', bookingId)
        .select()
        .single();

      if (error) {
        // Ne pas logger les erreurs réseau répétées
        if (!isNetworkError(error)) {
          console.error('Error extending booking:', error);
        }
        return { error };
      }

      if (data) {
        const updatedBooking = mapBookingFromDB(data);
        setBookings((prev) => prev.map((b) => (b.id === bookingId ? updatedBooking : b)));
        return { error: null };
      }

      return { error: { message: 'No data returned' } };
    } catch (error: any) {
      // Ne pas logger les erreurs réseau répétées
      if (!isNetworkError(error)) {
        console.error('Error in extendBooking:', error);
      }
      return { error };
    }
  };

  // Vérifier si une compagnie est terminée
  const checkBookingEndTime = () => {
    if (!user) return;

    const now = new Date();
    const activeBookings = bookings.filter(b => 
      b.status === 'accepted' && 
      (b.requesterId === user.id || b.providerId === user.id)
    );

    activeBookings.forEach(booking => {
      const bookingDate = new Date(booking.bookingDate);
      const endTime = new Date(bookingDate.getTime() + booking.durationHours * 60 * 60 * 1000);
      
      // Si la compagnie est terminée (avec une marge de 1 minute)
      if (now >= endTime && now.getTime() - endTime.getTime() < 60000) {
        // Marquer comme complétée
        updateBookingStatus(booking.id, 'completed').then(() => {
          // Afficher le modal de fin de compagnie
          // Cette logique sera gérée dans les composants
        });
      }
    });
  };

  // Vérifier et envoyer les notifications de rappel 3h avant le rendez-vous
  const checkBookingReminders = async () => {
    if (!user) return;

    const now = new Date();
    const activeBookings = bookings.filter(b => 
      b.status === 'accepted' && 
      (b.requesterId === user.id || b.providerId === user.id)
    );

    for (const booking of activeBookings) {
      const bookingDate = new Date(booking.bookingDate);
      const reminderTime = new Date(bookingDate.getTime() - 3 * 60 * 60 * 1000); // 3 heures avant
      
      // Vérifier si on est dans la fenêtre de rappel (entre 3h avant et 2h59 avant)
      const timeDiff = now.getTime() - reminderTime.getTime();
      const oneMinute = 60 * 1000;
      
      if (timeDiff >= 0 && timeDiff < oneMinute && now < bookingDate) {
        // Vérifier si une notification de rappel a déjà été envoyée pour ce booking
        const reminderKeyRequester = `reminder_${booking.id}_requester`;
        const reminderKeyProvider = `reminder_${booking.id}_provider`;
        const reminderSentRequester = (global as any).bookingReminders?.[reminderKeyRequester];
        const reminderSentProvider = (global as any).bookingReminders?.[reminderKeyProvider];
        
        try {
          // Récupérer les informations des deux utilisateurs
          const { data: requesterProfile } = await supabase
            .from('profiles')
            .select('pseudo')
            .eq('id', booking.requesterId)
            .single();
          
          const { data: providerProfile } = await supabase
            .from('profiles')
            .select('pseudo')
            .eq('id', booking.providerId)
            .single();

          const requesterName = requesterProfile?.pseudo || 'l\'utilisateur';
          const providerName = providerProfile?.pseudo || 'l\'utilisateur';
          
          const formattedDate = bookingDate.toLocaleDateString('fr-FR', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
          const formattedTime = bookingDate.toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
          });

          // Envoyer la notification au requester s'il ne l'a pas encore reçue
          if (!reminderSentRequester) {
            await createNotification(
              booking.requesterId,
              'booking_reminder',
              'Rappel de rendez-vous',
              `Votre rendez-vous avec ${providerName} est prévu pour le ${formattedDate} à ${formattedTime}`,
              { bookingId: booking.id, userId: booking.providerId }
            );
            
            // Marquer comme envoyé
            if (!(global as any).bookingReminders) {
              (global as any).bookingReminders = {};
            }
            (global as any).bookingReminders[reminderKeyRequester] = true;
            console.log('✅ Notification de rappel envoyée au requester pour le booking:', booking.id);
          }

          // Envoyer la notification au provider s'il ne l'a pas encore reçue
          if (!reminderSentProvider) {
            await createNotification(
              booking.providerId,
              'booking_reminder',
              'Rappel de rendez-vous',
              `Votre rendez-vous avec ${requesterName} est prévu pour le ${formattedDate} à ${formattedTime}`,
              { bookingId: booking.id, userId: booking.requesterId }
            );
            
            // Marquer comme envoyé
            if (!(global as any).bookingReminders) {
              (global as any).bookingReminders = {};
            }
            (global as any).bookingReminders[reminderKeyProvider] = true;
            console.log('✅ Notification de rappel envoyée au provider pour le booking:', booking.id);
          }
        } catch (error: any) {
          if (!isNetworkError(error)) {
            console.error('Error sending booking reminder:', error);
          }
        }
      }
    }
  };

  // Démarrer la vérification périodique des bookings
  useEffect(() => {
    if (user && bookings.length > 0) {
      // Vérifier toutes les minutes
      bookingCheckIntervalRef.current = setInterval(() => {
        checkBookingEndTime();
        checkBookingReminders(); // Vérifier aussi les rappels
      }, 60000); // 1 minute

      return () => {
        if (bookingCheckIntervalRef.current) {
          clearInterval(bookingCheckIntervalRef.current);
        }
      };
    }
  }, [user, bookings]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mapper les données de la DB vers le type Booking
  const mapBookingFromDB = (dbBooking: any): Booking => ({
    id: dbBooking.id,
    requesterId: dbBooking.requester_id,
    providerId: dbBooking.provider_id,
    status: dbBooking.status,
    bookingDate: dbBooking.booking_date,
    durationHours: dbBooking.duration_hours,
    location: dbBooking.location,
    lat: dbBooking.lat,
    lng: dbBooking.lng,
    notes: dbBooking.notes,
    topicId: dbBooking.topic_id,
    topic: dbBooking.topic ? {
      id: dbBooking.topic.id,
      name: dbBooking.topic.name,
      description: dbBooking.topic.description,
      icon: dbBooking.topic.icon,
      isActive: dbBooking.topic.is_active,
      displayOrder: dbBooking.topic.display_order,
    } : undefined,
    createdAt: dbBooking.created_at,
    updatedAt: dbBooking.updated_at,
    extensionRequestedHours: dbBooking.extension_requested_hours,
    extensionRequestedAt: dbBooking.extension_requested_at,
    extensionRequestedBy: dbBooking.extension_requested_by,
  });

  return (
    <BookingContext.Provider
      value={{
        bookings,
        isLoading,
        createBooking,
        updateBookingStatus,
        getUserBookings,
        getAvailableUsers,
        getAllUsers,
        refreshBookings,
        getActiveBookingWithUser,
        cancelBooking,
        extendBooking,
        checkBookingEndTime,
        getCompanionshipTopics,
      }}
    >
      {children}
    </BookingContext.Provider>
  );
}

export function useBooking() {
  const context = useContext(BookingContext);
  if (context === undefined) {
    throw new Error('useBooking must be used within a BookingProvider');
  }
  return context;
}
