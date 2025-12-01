import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
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

export function RatingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Charger les ratings au démarrage
  useEffect(() => {
    if (user) {
      refreshRatings();
    }
  }, [user]);

  // Rafraîchir les ratings
  const refreshRatings = async () => {
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
  };

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
      const { data, error } = await supabase
        .from('ratings')
        .insert({
          rater_id: user.id,
          rated_id: ratedId,
          rating,
          comment,
          booking_id: bookingId,
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
        setRatings([newRating, ...ratings]);
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
        setRatings(ratings.map(r => r.id === ratingId ? updatedRating : r));
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
        .order('created_at', { ascending: false });

      if (error) {
        if (!isNetworkError(error)) {
          console.error('Error fetching user ratings:', error);
        }
        return [];
      }

      return data ? data.map(mapRatingFromDB) : [];
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
      const { data, error } = await supabase.rpc('calculate_user_rating', {
        user_id_param: userId,
      });

      if (error) {
        if (!isNetworkError(error)) {
          console.error('Error calculating user rating:', error);
        }
        // Fallback : calculer manuellement
        const userRatings = await getUserRatings(userId);
        if (userRatings.length === 0) {
          return { average: 0, count: 0 };
        }
        const sum = userRatings.reduce((acc, r) => acc + r.rating, 0);
        return { average: sum / userRatings.length, count: userRatings.length };
      }

      if (data && data.length > 0) {
        return {
          average: parseFloat(data[0].average_rating) || 0,
          count: data[0].total_ratings || 0,
        };
      }

      return { average: 0, count: 0 };
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



