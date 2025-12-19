import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { isNetworkError } from '../lib/errorUtils';

interface LikeContextType {
  likedUsers: string[]; // IDs des utilisateurs likés
  isLoading: boolean;
  likeUser: (userId: string) => Promise<boolean>;
  unlikeUser: (userId: string) => Promise<boolean>;
  isUserLiked: (userId: string) => boolean;
  refreshLikes: () => Promise<void>;
}

const LikeContext = createContext<LikeContextType | undefined>(undefined);

export function LikeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [likedUsers, setLikedUsers] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Charger la liste des utilisateurs likés
  const refreshLikes = useCallback(async () => {
    if (!user?.id) {
      setLikedUsers([]);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_likes')
        .select('liked_id')
        .eq('liker_id', user.id);

      if (error) {
        if (!isNetworkError(error)) {
          console.error('Error fetching liked users:', error);
        }
        return;
      }

      if (data) {
        setLikedUsers(data.map((item: any) => item.liked_id));
      }
    } catch (error: any) {
      if (!isNetworkError(error)) {
        console.error('Error in refreshLikes:', error);
      }
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Liker un utilisateur (avec mise à jour optimiste)
  const likeUser = useCallback(async (userId: string): Promise<boolean> => {
    if (!user?.id || !userId || user.id === userId) return false;

    // Mise à jour optimiste : mettre à jour l'état local IMMÉDIATEMENT
    const wasLiked = likedUsers.includes(userId);
    if (!wasLiked) {
      setLikedUsers(prev => [...prev, userId]);
    }

    try {
      const { error } = await supabase
        .from('user_likes')
        .insert({
          liker_id: user.id,
          liked_id: userId,
        });

      if (error) {
        // Si l'erreur est due à une contrainte unique (déjà liké), c'est OK
        if (error.code === '23505') {
          // Déjà liké, l'état est déjà à jour
          return true;
        }
        
        // En cas d'erreur, annuler la mise à jour optimiste (rollback)
        if (!wasLiked) {
          setLikedUsers(prev => prev.filter(id => id !== userId));
        }
        
        if (!isNetworkError(error)) {
          console.error('Error liking user:', error);
        }
        return false;
      }

      // Succès : l'état est déjà à jour grâce à la mise à jour optimiste
      return true;
    } catch (error: any) {
      // En cas d'erreur, annuler la mise à jour optimiste (rollback)
      if (!wasLiked) {
        setLikedUsers(prev => prev.filter(id => id !== userId));
      }
      
      if (!isNetworkError(error)) {
        console.error('Error in likeUser:', error);
      }
      return false;
    }
  }, [user?.id, likedUsers]);

  // Unliker un utilisateur (avec mise à jour optimiste)
  const unlikeUser = useCallback(async (userId: string): Promise<boolean> => {
    if (!user?.id || !userId) return false;

    // Mise à jour optimiste : mettre à jour l'état local IMMÉDIATEMENT
    const wasLiked = likedUsers.includes(userId);
    if (wasLiked) {
      setLikedUsers(prev => prev.filter(id => id !== userId));
    }

    try {
      const { error } = await supabase
        .from('user_likes')
        .delete()
        .eq('liker_id', user.id)
        .eq('liked_id', userId);

      if (error) {
        // En cas d'erreur, annuler la mise à jour optimiste (rollback)
        if (wasLiked) {
          setLikedUsers(prev => [...prev, userId]);
        }
        
        if (!isNetworkError(error)) {
          console.error('Error unliking user:', error);
        }
        return false;
      }

      // Succès : l'état est déjà à jour grâce à la mise à jour optimiste
      return true;
    } catch (error: any) {
      // En cas d'erreur, annuler la mise à jour optimiste (rollback)
      if (wasLiked) {
        setLikedUsers(prev => [...prev, userId]);
      }
      
      if (!isNetworkError(error)) {
        console.error('Error in unlikeUser:', error);
      }
      return false;
    }
  }, [user?.id, likedUsers]);

  // Vérifier si un utilisateur est liké
  const isUserLiked = useCallback((userId: string): boolean => {
    return likedUsers.includes(userId);
  }, [likedUsers]);

  // Charger les likes au montage
  useEffect(() => {
    if (user?.id) {
      refreshLikes();
    } else {
      setLikedUsers([]);
    }
  }, [user?.id, refreshLikes]);

  return (
    <LikeContext.Provider
      value={{
        likedUsers,
        isLoading,
        likeUser,
        unlikeUser,
        isUserLiked,
        refreshLikes,
      }}
    >
      {children}
    </LikeContext.Provider>
  );
}

export function useLike() {
  const context = useContext(LikeContext);
  if (context === undefined) {
    throw new Error('useLike must be used within a LikeProvider');
  }
  return context;
}

