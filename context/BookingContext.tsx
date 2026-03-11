import React, { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import {
  canAcceptPendingBooking,
  deriveBookingStatus,
  isBookingLive,
} from '../lib/bookingLifecycle';
import { isNetworkError } from '../lib/errorUtils';
import { sendBookingNotification } from '../lib/pushNotifications';
import { supabase } from '../lib/supabase';
import { Booking } from '../types';
import { useAuth } from './AuthContext';
import { useNotification } from './NotificationContext';

// VÃ©rifier si un ID est un UUID valide (pas un ID de dÃ©veloppement)
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
  // TolÃ©rer 5s d'Ã©cart d'horloge max.
  if (parsedMs > nowMs + 5000) return false;
  return nowMs - parsedMs <= onlineWindowMs;
};

const isBookingStillLive = (
  status: unknown,
  bookingDateValue: unknown,
  durationHoursValue?: unknown
): boolean => {
  return isBookingLive(status, bookingDateValue, durationHoursValue, Date.now());
};

export function BookingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { createNotification } = useNotification();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const bookingCheckIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Charger les bookings au dÃ©marrage
  useEffect(() => {
    if (user) {
      refreshBookings();
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // RafraÃ®chir les bookings
  const refreshBookings = async () => {
    if (!user) return;

    // En mode dÃ©veloppement, si l'utilisateur n'a pas d'UUID valide, ne pas faire de requÃªte
    if (!isValidUUID(user.id)) {
      console.log('ðŸ”§ Mode dÃ©veloppement : Utilisateur local, pas de requÃªte Supabase pour les bookings');
      setBookings([]);
      return;
    }

    setIsLoading(true);
    try {
      // RÃ©cupÃ©rer toutes les demandes sauf celles qui sont annulÃ©es ou rejetÃ©es
      // (on garde pending, accepted, completed pour l'historique)
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .or(`requester_id.eq.${user.id},provider_id.eq.${user.id}`)
        .in('status', ['pending', 'accepted', 'rejected', 'completed', 'cancelled', 'expired'])
        .order('created_at', { ascending: false });

      if (error) {
        // Ne pas afficher l'erreur si la table n'existe pas encore ou si c'est une erreur de permissions
        if (error.code === 'PGRST116' || error.code === '42P01') {
          console.log('âš ï¸ Table bookings n\'existe pas encore ou erreur de permissions');
          setBookings([]);
        } else if (isNetworkError(error)) {
          // Erreur rÃ©seau silencieuse
          console.log('âš ï¸ Erreur rÃ©seau lors du chargement des bookings');
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
      // GÃ©rer les erreurs rÃ©seau gracieusement
      if (error?.message?.includes('Network request failed') || error?.message?.includes('Failed to fetch')) {
        // Erreur rÃ©seau silencieuse - ne pas polluer la console
        console.log('âš ï¸ Erreur rÃ©seau lors du chargement des bookings');
      } else {
        console.log('âš ï¸ Erreur lors du chargement des bookings:', error?.message || error);
      }
      setBookings([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Obtenir la demande active avec un utilisateur spÃ©cifique (dÃ©finie avant createBooking)
  const getActiveBookingWithUser = React.useCallback(async (userId: string): Promise<Booking | null> => {
    if (!user?.id) return null;

    try {
      // Chercher les bookings oÃ¹ l'utilisateur actuel est le requester et l'autre est le provider
      // Exclure explicitement les demandes annulÃ©es, rejetÃ©es et complÃ©tÃ©es
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
        // Ne pas logger les erreurs rÃ©seau rÃ©pÃ©tÃ©es
        if (!isNetworkError(error1)) {
          console.error('Error fetching active booking (requester):', error1);
        }
      }

      if (data1) {
        // Double vÃ©rification : s'assurer que le statut n'est pas cancelled ou rejected
        if (data1.status === 'cancelled' || data1.status === 'rejected') {
          console.log('âš ï¸ Demande trouvÃ©e mais avec statut invalide:', data1.status);
          return null;
        }
        if (!isBookingStillLive(data1.status, data1.booking_date, data1.duration_hours)) {
          return null;
        }
        console.log('âœ… Demande active trouvÃ©e (requester):', data1.id, data1.status);
        return mapBookingFromDB(data1);
      }

      // Chercher les bookings oÃ¹ l'utilisateur actuel est le provider et l'autre est le requester
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
        // Ne pas logger les erreurs rÃ©seau rÃ©pÃ©tÃ©es
        if (!isNetworkError(error2)) {
          console.error('Error fetching active booking (provider):', error2);
        }
      }

      if (data2) {
        // Double vÃ©rification : s'assurer que le statut n'est pas cancelled ou rejected
        if (data2.status === 'cancelled' || data2.status === 'rejected') {
          console.log('âš ï¸ Demande trouvÃ©e mais avec statut invalide:', data2.status);
          return null;
        }
        if (!isBookingStillLive(data2.status, data2.booking_date, data2.duration_hours)) {
          return null;
        }
        console.log('âœ… Demande active trouvÃ©e (provider):', data2.id, data2.status);
        return mapBookingFromDB(data2);
      }

      console.log('â„¹ï¸ Aucune demande active trouvÃ©e pour l\'utilisateur:', userId);
      return null;
    } catch (error: any) {
      // Ne pas logger les erreurs rÃ©seau rÃ©pÃ©tÃ©es
      if (!isNetworkError(error)) {
        console.error('Error in getActiveBookingWithUser:', error);
      }
      return null;
    }
  }, [user?.id]);

  // CrÃ©er une demande de compagnie
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

    // VÃ©rifier d'abord dans le state local (plus rapide) avant de faire une requÃªte
    const localActiveBooking = bookings.find(
      b => ((b.requesterId === user.id && b.providerId === providerId) ||
           (b.providerId === user.id && b.requesterId === providerId)) &&
           isBookingStillLive(b.status, b.bookingDate, b.durationHours)
    );
    
    if (localActiveBooking) {
      if (localActiveBooking.status === 'pending') {
        return { error: { message: 'Vous avez dÃ©jÃ  une demande en attente avec cet utilisateur' }, booking: null };
      }
      if (localActiveBooking.status === 'accepted') {
        return { error: { message: 'Vous avez dÃ©jÃ  une compagnie acceptÃ©e avec cet utilisateur' }, booking: null };
      }
    }

    // En mode dÃ©veloppement, si l'utilisateur n'a pas d'UUID valide, simuler la crÃ©ation
    if (!isValidUUID(user.id)) {
      console.log('ðŸ”§ Mode dÃ©veloppement : Simulation de crÃ©ation de booking');
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
        // Ne pas logger les erreurs rÃ©seau rÃ©pÃ©tÃ©es
        if (!isNetworkError(error)) {
          console.error('Error creating booking:', error);
        }
        return { error, booking: null };
      }

      if (data) {
        const newBooking = mapBookingFromDB(data);
        // Mise Ã  jour optimiste : ajouter immÃ©diatement au state local
        setBookings((prev) => [newBooking, ...prev.filter((b) => b.id !== newBooking.id)]);
        
        // RafraÃ®chir les bookings en arriÃ¨re-plan (non bloquant) - pour synchroniser avec la DB
        refreshBookings().catch(() => {
          // Ignorer les erreurs de rafraÃ®chissement
        });
        
        const bookingRequestMessage = `${user.pseudo || 'Un utilisateur'} vous a envoyÃ© une demande de compagnie`;
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
      // GÃ©rer les erreurs rÃ©seau gracieusement
      if (isNetworkError(error)) {
        console.log('âš ï¸ Erreur rÃ©seau lors de la crÃ©ation du booking');
        return { error: { message: 'Erreur de connexion. VÃ©rifiez votre connexion internet.' }, booking: null };
      }
      console.error('Error in createBooking:', error);
      return { error, booking: null };
    }
  };

  // Mettre Ã  jour le statut d'un booking
  const updateBookingStatus = async (bookingId: string, status: Booking['status']) => {
    if (!user) {
      return { error: { message: 'Not authenticated' } };
    }

    const currentLocalBooking = bookings.find((b) => b.id === bookingId);
    if (currentLocalBooking?.status === status && status !== 'completed' && status !== 'expired') {
      return { error: null };
    }

    try {
      const { data: currentDbBooking, error: currentDbBookingError } = await supabase
        .from('bookings')
        .select('id, status, booking_date, duration_hours')
        .eq('id', bookingId)
        .single();

      if (currentDbBookingError || !currentDbBooking) {
        return { error: currentDbBookingError || { message: 'Booking not found' } };
      }

      const nowMs = Date.now();
      const currentDerivedStatus = deriveBookingStatus(
        currentDbBooking.status,
        currentDbBooking.booking_date,
        currentDbBooking.duration_hours,
        nowMs
      );

      if (status === 'accepted') {
        if (
          !canAcceptPendingBooking(
            currentDbBooking.status,
            currentDbBooking.booking_date,
            currentDbBooking.duration_hours,
            nowMs
          )
        ) {
          return {
            error: {
              message:
                currentDerivedStatus === 'expired'
                  ? 'Cette demande est cloturee car la date est depassee. Elle ne peut plus etre acceptee.'
                  : 'Cette demande n est plus en attente et ne peut plus etre acceptee.',
            },
          };
        }
      }

      if (status === 'rejected' && currentDerivedStatus !== 'pending') {
        return {
          error: { message: 'Cette demande n est plus en attente.' },
        };
      }

      if (status === 'expired') {
        const canExpire =
          currentDbBooking.status === 'pending' &&
          currentDerivedStatus === 'expired';
        if (!canExpire) {
          return {
            error: { message: 'Cette demande ne peut pas etre cloturee.' },
          };
        }
      }

      const { data, error } = await supabase
        .from('bookings')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', bookingId)
        .select()
        .single();

      if (error) {
        // Ne pas logger les erreurs rÃ©seau rÃ©pÃ©tÃ©es
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
          // Notifier le requester que sa demande a Ã©tÃ© acceptÃ©e
          const requesterId = updatedBooking.requesterId;
          const { data: providerProfile } = await supabase
            .from('profiles')
            .select('pseudo')
            .eq('id', user.id)
            .single();
          const message = `${providerProfile?.pseudo || 'Un utilisateur'} a acceptÃ© votre demande de compagnie`;

          await Promise.allSettled([
            createNotification(
              requesterId,
              'booking_request_accepted',
              'Demande de compagnie acceptÃ©e',
              message,
              { bookingId: bookingId, userId: user.id }
            ),
            sendBookingNotification(
              requesterId,
              bookingId,
              'accepted',
              'Demande de compagnie acceptÃ©e',
              message
            ),
          ]);
        } else if (status === 'rejected') {
          // Notifier le requester que sa demande a Ã©tÃ© rejetÃ©e
          const requesterId = updatedBooking.requesterId;
          const { data: providerProfile } = await supabase
            .from('profiles')
            .select('pseudo')
            .eq('id', user.id)
            .single();
          const message = `${providerProfile?.pseudo || 'Un utilisateur'} a rejetÃ© votre demande de compagnie`;

          await Promise.allSettled([
            createNotification(
              requesterId,
              'booking_request_rejected',
              'Demande de compagnie rejetÃ©e',
              message,
              { bookingId: bookingId, userId: user.id }
            ),
            sendBookingNotification(
              requesterId,
              bookingId,
              'rejected',
              'Demande de compagnie rejetÃ©e',
              message
            ),
          ]);
        } else if (status === 'completed') {
          // Notifier les deux utilisateurs que la compagnie est terminÃ©e
          const requesterId = updatedBooking.requesterId;
          const providerId = updatedBooking.providerId;
          
          await Promise.allSettled([
            createNotification(
              requesterId,
              'booking_request_accepted',
              'Compagnie terminÃ©e',
              'Votre compagnie est terminÃ©e. Ouvrez les dÃ©tails pour noter, modifier votre avis ou demander une prolongation.',
              { bookingId: bookingId }
            ),
            createNotification(
              providerId,
              'booking_request_accepted',
              'Compagnie terminÃ©e',
              'Votre compagnie est terminÃ©e. Ouvrez les dÃ©tails pour noter, modifier votre avis ou demander une prolongation.',
              { bookingId: bookingId }
            ),
            sendBookingNotification(
              requesterId,
              bookingId,
              'completed',
              'Compagnie terminÃ©e',
              'Votre compagnie est terminÃ©e. Ouvrez les dÃ©tails pour noter ou prolonger.'
            ),
            sendBookingNotification(
              providerId,
              bookingId,
              'completed',
              'Compagnie terminÃ©e',
              'Votre compagnie est terminÃ©e. Ouvrez les dÃ©tails pour noter ou prolonger.'
            ),
          ]);
        } else if (status === 'cancelled') {
          // DÃ©terminer qui a annulÃ©
          const isRequester = updatedBooking.requesterId === user.id;
          const otherUserId = isRequester ? updatedBooking.providerId : updatedBooking.requesterId;
          const message = `${user.pseudo || 'Un utilisateur'} a annulÃ© la compagnie`;

          await Promise.allSettled([
            createNotification(
              otherUserId,
              'booking_request_rejected',
              'Compagnie annulÃ©e',
              message,
              { bookingId: bookingId, userId: user.id }
            ),
            sendBookingNotification(
              otherUserId,
              bookingId,
              'cancelled',
              'Compagnie annulÃ©e',
              message
            ),
          ]);
        }
        
        return { error: null };
      }

      return { error: { message: 'No data returned' } };
    } catch (error: any) {
      // Ne pas logger les erreurs rÃ©seau rÃ©pÃ©tÃ©es
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
        // Ne pas logger les erreurs rÃ©seau rÃ©pÃ©tÃ©es
        if (!isNetworkError(error)) {
          console.error('Error fetching user bookings:', error);
        }
        return [];
      }

      return data ? data.map(mapBookingFromDB) : [];
    } catch (error: any) {
      // Ne pas logger les erreurs rÃ©seau rÃ©pÃ©tÃ©es
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
      // En mode dÃ©veloppement, si l'utilisateur n'a pas d'UUID valide, retourner un tableau vide
      if (!isValidUUID(user?.id)) {
        console.log('ðŸ”§ Mode dÃ©veloppement : Utilisateur local, pas de requÃªte Supabase');
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
        // Ne pas logger les erreurs rÃ©seau rÃ©pÃ©tÃ©es
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
      // Ne pas logger les erreurs rÃ©seau rÃ©pÃ©tÃ©es
      if (!isNetworkError(error)) {
        console.error('Error in getAvailableUsers:', error);
      }
      return [];
    }
  };

  // Obtenir tous les utilisateurs (pour la page recherche - en ligne et hors ligne)
  const getAllUsers = async () => {
    try {
      // En mode dÃ©veloppement, si l'utilisateur n'a pas d'UUID valide, retourner un tableau vide
      if (!isValidUUID(user?.id)) {
        console.log('ðŸ”§ Mode dÃ©veloppement : Utilisateur local, pas de requÃªte Supabase');
        return [];
      }

      let query = supabase
        .from('profiles')
        .select('id, pseudo, age, phone, photo, description, is_subscribed, subscription_status, last_seen, gender, lat, lng, is_available, current_booking_id, created_at')
        .eq('is_available', true)
        // Trier par date de crÃ©ation (nouveaux en premier)
        .order('created_at', { ascending: false });

      // Exclure l'utilisateur actuel seulement si c'est un UUID valide
      if (user?.id && isValidUUID(user.id)) {
        query = query.neq('id', user.id);
      }

      const { data, error } = await query;

      if (error) {
        // Ne pas logger les erreurs rÃ©seau rÃ©pÃ©tÃ©es
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
            // RÃ©cupÃ©rer la moyenne et le nombre d'avis depuis la table ratings
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
      // Ne pas logger les erreurs rÃ©seau rÃ©pÃ©tÃ©es
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
        // Ne pas logger les erreurs rÃ©seau rÃ©pÃ©tÃ©es
        if (!isNetworkError(error)) {
          console.error('Error cancelling booking:', error);
        }
        return { error };
      }

      if (!data || !data.success) {
        return { error: { message: data?.error || 'Impossible d\'annuler la demande' } };
      }

      // Mapper le booking retournÃ©
      const updatedBooking = mapBookingFromDB(data.booking);
      setBookings((prev) => prev.map((b) => (b.id === bookingId ? updatedBooking : b)));
      
      // RafraÃ®chir les bookings pour avoir la liste Ã  jour
      refreshBookings().catch(() => {
        // Ignorer les erreurs de rafraÃ®chissement arriÃ¨re-plan
      });
      
      return { error: null };
    } catch (error: any) {
      // Ne pas logger les erreurs rÃ©seau rÃ©pÃ©tÃ©es
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
      // RÃ©cupÃ©rer le booking actuel
      const { data: currentBooking, error: fetchError } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', bookingId)
        .single();

      if (fetchError || !currentBooking) {
        return { error: { message: 'Booking not found' } };
      }

      // VÃ©rifier que c'est le requester qui demande la prolongation
      if (currentBooking.requester_id !== user.id) {
        return { error: { message: 'Only the requester can extend a booking' } };
      }

      // Mettre Ã  jour la durÃ©e
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
        // Ne pas logger les erreurs rÃ©seau rÃ©pÃ©tÃ©es
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
      // Ne pas logger les erreurs rÃ©seau rÃ©pÃ©tÃ©es
      if (!isNetworkError(error)) {
        console.error('Error in extendBooking:', error);
      }
      return { error };
    }
  };

  // VÃ©rifier si une compagnie est terminÃ©e
  const checkBookingEndTime = () => {
    if (!user) return;

    const nowMs = Date.now();
    const relevantBookings = bookings.filter(
      (b) => b.requesterId === user.id || b.providerId === user.id
    );

    relevantBookings.forEach((booking) => {
      const derivedStatus = deriveBookingStatus(
        booking.status,
        booking.bookingDate,
        booking.durationHours,
        nowMs
      );

      if (booking.status === 'accepted' && derivedStatus === 'completed') {
        updateBookingStatus(booking.id, 'completed').catch(() => {
          // Ignore best-effort transition errors
        });
      }

      if (booking.status === 'pending' && derivedStatus === 'expired') {
        updateBookingStatus(booking.id, 'expired').catch(() => {
          // Ignore best-effort transition errors
        });
      }
    });
  };

  // VÃ©rifier et envoyer les notifications de rappel 3h avant le rendez-vous
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
      
      // VÃ©rifier si on est dans la fenÃªtre de rappel (entre 3h avant et 2h59 avant)
      const timeDiff = now.getTime() - reminderTime.getTime();
      const oneMinute = 60 * 1000;
      
      if (timeDiff >= 0 && timeDiff < oneMinute && now < bookingDate) {
        // VÃ©rifier si une notification de rappel a dÃ©jÃ  Ã©tÃ© envoyÃ©e pour ce booking
        const reminderKeyRequester = `reminder_${booking.id}_requester`;
        const reminderKeyProvider = `reminder_${booking.id}_provider`;
        const reminderSentRequester = (global as any).bookingReminders?.[reminderKeyRequester];
        const reminderSentProvider = (global as any).bookingReminders?.[reminderKeyProvider];
        
        try {
          // RÃ©cupÃ©rer les informations des deux utilisateurs
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

          // Envoyer la notification au requester s'il ne l'a pas encore reÃ§ue
          if (!reminderSentRequester) {
            await createNotification(
              booking.requesterId,
              'booking_reminder',
              'Rappel de rendez-vous',
              `Votre rendez-vous avec ${providerName} est prÃ©vu pour le ${formattedDate} Ã  ${formattedTime}`,
              { bookingId: booking.id, userId: booking.providerId }
            );
            
            // Marquer comme envoyÃ©
            if (!(global as any).bookingReminders) {
              (global as any).bookingReminders = {};
            }
            (global as any).bookingReminders[reminderKeyRequester] = true;
            console.log('âœ… Notification de rappel envoyÃ©e au requester pour le booking:', booking.id);
          }

          // Envoyer la notification au provider s'il ne l'a pas encore reÃ§ue
          if (!reminderSentProvider) {
            await createNotification(
              booking.providerId,
              'booking_reminder',
              'Rappel de rendez-vous',
              `Votre rendez-vous avec ${requesterName} est prÃ©vu pour le ${formattedDate} Ã  ${formattedTime}`,
              { bookingId: booking.id, userId: booking.requesterId }
            );
            
            // Marquer comme envoyÃ©
            if (!(global as any).bookingReminders) {
              (global as any).bookingReminders = {};
            }
            (global as any).bookingReminders[reminderKeyProvider] = true;
            console.log('âœ… Notification de rappel envoyÃ©e au provider pour le booking:', booking.id);
          }
        } catch (error: any) {
          if (!isNetworkError(error)) {
            console.error('Error sending booking reminder:', error);
          }
        }
      }
    }
  };

  // DÃ©marrer la vÃ©rification pÃ©riodique des bookings
  useEffect(() => {
    if (user && bookings.length > 0) {
      // VÃ©rifier toutes les minutes
      bookingCheckIntervalRef.current = setInterval(() => {
        checkBookingEndTime();
        checkBookingReminders(); // VÃ©rifier aussi les rappels
      }, 60000); // 1 minute

      return () => {
        if (bookingCheckIntervalRef.current) {
          clearInterval(bookingCheckIntervalRef.current);
        }
      };
    }
  }, [user, bookings]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mapper les donnÃ©es de la DB vers le type Booking
  const mapBookingFromDB = (dbBooking: any): Booking => ({
    id: dbBooking.id,
    requesterId: dbBooking.requester_id,
    providerId: dbBooking.provider_id,
    status: deriveBookingStatus(dbBooking.status, dbBooking.booking_date, dbBooking.duration_hours),
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

