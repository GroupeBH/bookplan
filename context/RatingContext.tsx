import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { Rating } from '../types';
import { useAuth } from './AuthContext';
import { isNetworkError } from '../lib/errorUtils';

interface RatingContextType {
  ratings: Rating[];
  isLoading: boolean;
  createRating: (ratedId: string, rating: number, comment?: string, bookingId?: string) => Promise<{ error: any; rating: Rating | null }>;
  updateRating: (ratingId: string, rating: number, comment?: string) => Promise<{ error: any }>;
  getUserRatings: (userId: string) => Promise<Rating[]>;
  getUserAverageRating: (userId: string) => Promise<{ average: number; count: number }>;
  refreshRatings: () => Promise<void>;
}

const RatingContext = createContext<RatingContextType | undefined>(undefined);

const toTimestamp = (value?: string): number => {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
};

const dedupeLatestRatingsByRater = (items: Rating[]): Rating[] => {
  const sorted = [...items].sort((a, b) => {
    const bTime = Math.max(toTimestamp(b.updatedAt), toTimestamp(b.createdAt));
    const aTime = Math.max(toTimestamp(a.updatedAt), toTimestamp(a.createdAt));
    return bTime - aTime;
  });

  const byRater = new Map<string, Rating>();
  for (const item of sorted) {
    if (!byRater.has(item.raterId)) {
      byRater.set(item.raterId, item);
    }
  }

  return Array.from(byRater.values());
};

export function RatingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Rafraîchir les ratings
  const refreshRatings = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('ratings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100); // Limiter pour les performances

      if (error) {
        if (!isNetworkError(error)) {
          console.error('Error fetching ratings:', error);
        }
        return;
      }

      if (data) {
        setRatings(data.map(mapRatingFromDB));
      }
    } catch (error: any) {
      if (!isNetworkError(error)) {
        console.error('Error in refreshRatings:', error);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Charger les ratings au démarrage
  useEffect(() => {
    if (user) {
      refreshRatings();
    }
  }, [user, refreshRatings]);

  // Créer une note
  const createRating = async (
    ratedId: string,
    rating: number,
    comment?: string,
    bookingId?: string
  ) => {
    if (!user) {
      return { error: { message: 'Not authenticated' }, rating: null };
    }

    if (rating < 1 || rating > 5) {
      return { error: { message: 'Rating must be between 1 and 5' }, rating: null };
    }

    if (ratedId === user.id) {
      return { error: { message: 'Cannot rate yourself' }, rating: null };
    }

    try {
      const normalizedComment = comment?.trim() ? comment.trim() : null;
      const { data: existingRatings, error: existingError } = await supabase
        .from('ratings')
        .select('*')
        .eq('rater_id', user.id)
        .eq('rated_id', ratedId)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (existingError) {
        if (!isNetworkError(existingError)) {
          console.error('Error checking existing rating:', existingError);
        }
        return { error: existingError, rating: null };
      }

      const latestExisting = existingRatings && existingRatings.length > 0
        ? existingRatings[0]
        : null;

      if (latestExisting) {
        const nextBookingId = latestExisting.booking_id || bookingId || null;
        const { data: updatedData, error: updateError } = await supabase
          .from('ratings')
          .update({
            rating,
            comment: normalizedComment,
            booking_id: nextBookingId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', latestExisting.id)
          .eq('rater_id', user.id)
          .select()
          .single();

        if (updateError) {
          if (!isNetworkError(updateError)) {
            console.error('Error updating existing rating in create flow:', updateError);
          }
          return { error: updateError, rating: null };
        }

        if (updatedData) {
          const normalizedUpdatedRating = mapRatingFromDB(updatedData);
          setRatings((prev) => {
            const filtered = prev.filter(
              (r) => !(r.raterId === normalizedUpdatedRating.raterId && r.ratedId === normalizedUpdatedRating.ratedId)
            );
            return [normalizedUpdatedRating, ...filtered];
          });
          return { error: null, rating: normalizedUpdatedRating };
        }

        return { error: { message: 'No data returned' }, rating: null };
      }

      const { data, error } = await supabase
        .from('ratings')
        .insert({
          rater_id: user.id,
          rated_id: ratedId,
          rating,
          comment: normalizedComment,
          booking_id: bookingId || null,
        })
        .select()
        .single();

      if (error) {
        if (!isNetworkError(error)) {
          console.error('Error creating rating:', error);
        }
        return { error, rating: null };
      }

      if (data) {
        const newRating = mapRatingFromDB(data);
        setRatings((prev) => {
          const filtered = prev.filter(
            (r) => !(r.raterId === newRating.raterId && r.ratedId === newRating.ratedId)
          );
          return [newRating, ...filtered];
        });
        return { error: null, rating: newRating };
      }

      return { error: { message: 'No data returned' }, rating: null };
    } catch (error: any) {
      if (!isNetworkError(error)) {
        console.error('Error in createRating:', error);
      }
      return { error, rating: null };
    }
  };

  // Mettre à jour une note
  const updateRating = async (ratingId: string, rating: number, comment?: string) => {
    if (!user) {
      return { error: { message: 'Not authenticated' } };
    }

    if (rating < 1 || rating > 5) {
      return { error: { message: 'Rating must be between 1 and 5' } };
    }

    try {
      const { data, error } = await supabase
        .from('ratings')
        .update({ rating, comment, updated_at: new Date().toISOString() })
        .eq('id', ratingId)
        .eq('rater_id', user.id) // Seul celui qui a créé la note peut la modifier
        .select()
        .single();

      if (error) {
        if (!isNetworkError(error)) {
          console.error('Error updating rating:', error);
        }
        return { error };
      }

      if (data) {
        const updatedRating = mapRatingFromDB(data);
        setRatings((prev) => {
          const filtered = prev.filter(
            (r) => !(r.raterId === updatedRating.raterId && r.ratedId === updatedRating.ratedId)
          );
          return [updatedRating, ...filtered];
        });
        return { error: null };
      }

      return { error: { message: 'No data returned' } };
    } catch (error: any) {
      if (!isNetworkError(error)) {
        console.error('Error in updateRating:', error);
      }
      return { error };
    }
  };

  // Obtenir les notes d'un utilisateur
  const getUserRatings = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('ratings')
        .select('*')
        .eq('rated_id', userId)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (error) {
        if (!isNetworkError(error)) {
          console.error('Error fetching user ratings:', error);
        }
        return [];
      }

      if (!data) return [];
      return dedupeLatestRatingsByRater(data.map(mapRatingFromDB));
    } catch (error: any) {
      if (!isNetworkError(error)) {
        console.error('Error in getUserRatings:', error);
      }
      return [];
    }
  };

  // Obtenir la moyenne des notes d'un utilisateur
  const getUserAverageRating = async (userId: string) => {
    try {
      const userRatings = await getUserRatings(userId);
      if (userRatings.length === 0) return { average: 0, count: 0 };
      const sum = userRatings.reduce((acc, r) => acc + r.rating, 0);
      return { average: sum / userRatings.length, count: userRatings.length };
    } catch (error: any) {
      if (!isNetworkError(error)) {
        console.error('Error in getUserAverageRating:', error);
      }
      return { average: 0, count: 0 };
    }
  };

  // Mapper les données de la DB vers le type Rating
  const mapRatingFromDB = (dbRating: any): Rating => ({
    id: dbRating.id,
    raterId: dbRating.rater_id,
    ratedId: dbRating.rated_id,
    rating: parseFloat(dbRating.rating),
    comment: dbRating.comment,
    bookingId: dbRating.booking_id,
    createdAt: dbRating.created_at,
    updatedAt: dbRating.updated_at,
  });

  return (
    <RatingContext.Provider
      value={{
        ratings,
        isLoading,
        createRating,
        updateRating,
        getUserRatings,
        getUserAverageRating,
        refreshRatings,
      }}
    >
      {children}
    </RatingContext.Provider>
  );
}

export function useRating() {
  const context = useContext(RatingContext);
  if (context === undefined) {
    throw new Error('useRating must be used within a RatingProvider');
  }
  return context;
}



