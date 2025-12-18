import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { isNetworkError } from '../lib/errorUtils';

interface BlockedUser {
  blockedId: string;
  blockedPseudo: string;
  blockedPhoto: string;
  blockedAt: string;
}

interface BlockContextType {
  blockedUsers: BlockedUser[];
  isLoading: boolean;
  blockUser: (userId: string) => Promise<boolean>;
  unblockUser: (userId: string) => Promise<boolean>;
  isUserBlocked: (userId1: string, userId2: string) => Promise<boolean>;
  refreshBlockedUsers: () => Promise<void>;
}

const BlockContext = createContext<BlockContextType | undefined>(undefined);

export function BlockProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Charger la liste des utilisateurs bloqués
  const refreshBlockedUsers = useCallback(async () => {
    if (!user?.id) {
      setBlockedUsers([]);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_blocked_users');

      if (error) {
        if (!isNetworkError(error)) {
          console.error('Error fetching blocked users:', error);
        }
        return;
      }

      if (data) {
        setBlockedUsers(data.map((item: any) => ({
          blockedId: item.blocked_id,
          blockedPseudo: item.blocked_pseudo || 'Utilisateur',
          blockedPhoto: item.blocked_photo || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
          blockedAt: item.blocked_at,
        })));
      }
    } catch (error: any) {
      if (!isNetworkError(error)) {
        console.error('Error in refreshBlockedUsers:', error);
      }
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Bloquer un utilisateur
  const blockUser = useCallback(async (userId: string): Promise<boolean> => {
    if (!user?.id || !userId || user.id === userId) return false;

    try {
      const { data, error } = await supabase.rpc('block_user', {
        p_blocked_id: userId,
      });

      if (error) {
        if (!isNetworkError(error)) {
          console.error('Error blocking user:', error);
        }
        return false;
      }

      if (data && data.length > 0 && !data[0].success) {
        return false;
      }

      // Rafraîchir la liste
      await refreshBlockedUsers();
      return true;
    } catch (error: any) {
      if (!isNetworkError(error)) {
        console.error('Error in blockUser:', error);
      }
      return false;
    }
  }, [user?.id, refreshBlockedUsers]);

  // Débloquer un utilisateur
  const unblockUser = useCallback(async (userId: string): Promise<boolean> => {
    if (!user?.id || !userId) return false;

    try {
      const { data, error } = await supabase.rpc('unblock_user', {
        p_blocked_id: userId,
      });

      if (error) {
        if (!isNetworkError(error)) {
          console.error('Error unblocking user:', error);
        }
        return false;
      }

      if (data && data.length > 0 && !data[0].success) {
        return false;
      }

      // Rafraîchir la liste
      await refreshBlockedUsers();
      return true;
    } catch (error: any) {
      if (!isNetworkError(error)) {
        console.error('Error in unblockUser:', error);
      }
      return false;
    }
  }, [user?.id, refreshBlockedUsers]);

  // Vérifier si un utilisateur est bloqué
  const isUserBlocked = useCallback(async (userId1: string, userId2: string): Promise<boolean> => {
    if (!userId1 || !userId2 || userId1 === userId2) return false;

    try {
      const { data, error } = await supabase.rpc('is_user_blocked', {
        p_user1_id: userId1,
        p_user2_id: userId2,
      });

      if (error) {
        if (!isNetworkError(error)) {
          console.error('Error checking if user is blocked:', error);
        }
        return false;
      }

      return data === true;
    } catch (error: any) {
      if (!isNetworkError(error)) {
        console.error('Error in isUserBlocked:', error);
      }
      return false;
    }
  }, []);

  // Charger les utilisateurs bloqués au montage
  useEffect(() => {
    if (user?.id) {
      refreshBlockedUsers();
    } else {
      setBlockedUsers([]);
    }
  }, [user?.id, refreshBlockedUsers]);

  return (
    <BlockContext.Provider
      value={{
        blockedUsers,
        isLoading,
        blockUser,
        unblockUser,
        isUserBlocked,
        refreshBlockedUsers,
      }}
    >
      {children}
    </BlockContext.Provider>
  );
}

export function useBlock() {
  const context = useContext(BlockContext);
  if (context === undefined) {
    throw new Error('useBlock must be used within a BlockProvider');
  }
  return context;
}











