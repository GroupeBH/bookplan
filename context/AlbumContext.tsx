import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { AlbumPhoto } from '../types';
import { isNetworkError } from '../lib/errorUtils';

interface AlbumContextType {
  albumPhotos: AlbumPhoto[];
  isLoading: boolean;
  getUserAlbumPhotos: (userId: string) => Promise<AlbumPhoto[]>;
  addAlbumPhoto: (userId: string, photoUrl: string, displayOrder?: number) => Promise<{ error: any; photo: AlbumPhoto | null }>;
  deleteAlbumPhoto: (photoId: string) => Promise<{ error: any; success: boolean }>;
  reorderAlbumPhotos: (userId: string, photoOrders: { id: string; order: number }[]) => Promise<{ error: any; success: boolean }>;
  refreshAlbumPhotos: (userId: string) => Promise<void>;
}

const AlbumContext = createContext<AlbumContextType | undefined>(undefined);

export function AlbumProvider({ children }: { children: ReactNode }) {
  const [albumPhotos, setAlbumPhotos] = useState<AlbumPhoto[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Obtenir les photos d'album d'un utilisateur
  const getUserAlbumPhotos = useCallback(async (userId: string): Promise<AlbumPhoto[]> => {
    if (!userId) return [];

    setIsLoading(true);
    try {
      // Essayer d'abord avec la fonction RPC, sinon utiliser une requête directe
      let data: any[] | null = null;
      let error: any = null;

      try {
        const rpcResult = await supabase.rpc('get_user_album_photos', {
          p_user_id: userId,
        });
        data = rpcResult.data;
        error = rpcResult.error;
      } catch (rpcError: any) {
        // Si la fonction RPC n'existe pas, utiliser une requête directe
        if (rpcError?.code === 'PGRST202' || rpcError?.message?.includes('Could not find the function')) {
          console.log('⚠️ Function get_user_album_photos not found, using direct query');
          const queryResult = await supabase
            .from('user_album_photos')
            .select('*')
            .eq('user_id', userId)
            .order('display_order', { ascending: true })
            .order('created_at', { ascending: true });
          data = queryResult.data;
          error = queryResult.error;
        } else {
          throw rpcError;
        }
      }

      if (error) {
        // Si la table n'existe pas encore, retourner un tableau vide
        if (error.code === 'PGRST116' || error.code === '42P01' || error.message?.includes('does not exist')) {
          console.log('⚠️ Table user_album_photos does not exist yet. Please run the migration.');
          return [];
        }
        if (!isNetworkError(error)) {
          console.error('Error fetching album photos:', error);
        }
        return [];
      }

      if (!data) return [];

      const photos: AlbumPhoto[] = data.map((photo: any) => ({
        id: photo.id,
        userId: photo.user_id,
        photoUrl: photo.photo_url,
        displayOrder: photo.display_order,
        createdAt: photo.created_at,
        updatedAt: photo.updated_at,
      }));

      // Si c'est pour l'utilisateur actuel, mettre à jour le state
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id === userId) {
        setAlbumPhotos(photos);
      }

      return photos;
    } catch (error: any) {
      if (!isNetworkError(error)) {
        console.error('Error in getUserAlbumPhotos:', error);
      }
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Ajouter une photo d'album
  const addAlbumPhoto = useCallback(async (
    userId: string,
    photoUrl: string,
    displayOrder?: number
  ): Promise<{ error: any; photo: AlbumPhoto | null }> => {
    if (!userId || !photoUrl) {
      return { error: { message: 'userId and photoUrl are required' }, photo: null };
    }

    setIsLoading(true);
    try {
      // Vérifier d'abord le nombre de photos existantes
      const existingPhotos = await getUserAlbumPhotos(userId);
      if (existingPhotos.length >= 5) {
        return { error: { message: 'Maximum 5 photos allowed per user' }, photo: null };
      }

      // Déterminer l'ordre d'affichage
      let finalDisplayOrder = displayOrder;
      if (finalDisplayOrder === undefined) {
        finalDisplayOrder = existingPhotos.length > 0 
          ? Math.max(...existingPhotos.map(p => p.displayOrder)) + 1 
          : 0;
      }

      // Essayer d'abord avec la fonction RPC, sinon utiliser une insertion directe
      let photoId: string | null = null;
      let error: any = null;

      try {
        const rpcResult = await supabase.rpc('add_album_photo', {
          p_user_id: userId,
          p_photo_url: photoUrl,
          p_display_order: finalDisplayOrder,
        });
        photoId = rpcResult.data;
        error = rpcResult.error;
      } catch (rpcError: any) {
        // Si la fonction RPC n'existe pas, utiliser une insertion directe
        if (rpcError?.code === 'PGRST202' || rpcError?.message?.includes('Could not find the function')) {
          console.log('⚠️ Function add_album_photo not found, using direct insert');
          const insertResult = await supabase
            .from('user_album_photos')
            .insert({
              user_id: userId,
              photo_url: photoUrl,
              display_order: finalDisplayOrder,
            })
            .select('id')
            .single();
          photoId = insertResult.data?.id || null;
          error = insertResult.error;
        } else {
          throw rpcError;
        }
      }

      if (error) {
        // Si la table n'existe pas encore
        if (error.code === 'PGRST116' || error.code === '42P01' || error.message?.includes('does not exist')) {
          return { error: { message: 'Table user_album_photos does not exist. Please run the migration.' }, photo: null };
        }
        if (!isNetworkError(error)) {
          console.error('Error adding album photo:', error);
        }
        return { error, photo: null };
      }

      if (!photoId) {
        return { error: { message: 'No photo ID returned' }, photo: null };
      }

      // Récupérer la photo créée
      const { data: photoData, error: fetchError } = await supabase
        .from('user_album_photos')
        .select('*')
        .eq('id', photoId)
        .single();

      if (fetchError || !photoData) {
        if (!isNetworkError(fetchError)) {
          console.error('Error fetching created photo:', fetchError);
        }
        return { error: fetchError || { message: 'Photo created but could not be fetched' }, photo: null };
      }

      const newPhoto: AlbumPhoto = {
        id: photoData.id,
        userId: photoData.user_id,
        photoUrl: photoData.photo_url,
        displayOrder: photoData.display_order,
        createdAt: photoData.created_at,
        updatedAt: photoData.updated_at,
      };

      // Mettre à jour le state si c'est pour l'utilisateur actuel
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id === userId) {
        setAlbumPhotos((prev) => [...prev, newPhoto].sort((a, b) => a.displayOrder - b.displayOrder));
      }

      return { error: null, photo: newPhoto };
    } catch (error: any) {
      if (!isNetworkError(error)) {
        console.error('Error in addAlbumPhoto:', error);
      }
      return { error, photo: null };
    } finally {
      setIsLoading(false);
    }
  }, [getUserAlbumPhotos]);

  // Supprimer une photo d'album
  const deleteAlbumPhoto = useCallback(async (photoId: string): Promise<{ error: any; success: boolean }> => {
    if (!photoId) {
      return { error: { message: 'photoId is required' }, success: false };
    }

    setIsLoading(true);
    try {
      // Essayer d'abord avec la fonction RPC, sinon utiliser une suppression directe
      let success = false;
      let error: any = null;

      try {
        const rpcResult = await supabase.rpc('delete_album_photo', {
          p_photo_id: photoId,
        });
        success = rpcResult.data === true;
        error = rpcResult.error;
      } catch (rpcError: any) {
        // Si la fonction RPC n'existe pas, utiliser une suppression directe
        if (rpcError?.code === 'PGRST202' || rpcError?.message?.includes('Could not find the function')) {
          console.log('⚠️ Function delete_album_photo not found, using direct delete');
          const deleteResult = await supabase
            .from('user_album_photos')
            .delete()
            .eq('id', photoId)
            .select();
          success = deleteResult.data && deleteResult.data.length > 0;
          error = deleteResult.error;
        } else {
          throw rpcError;
        }
      }

      if (error) {
        // Si la table n'existe pas encore
        if (error.code === 'PGRST116' || error.code === '42P01' || error.message?.includes('does not exist')) {
          return { error: { message: 'Table user_album_photos does not exist. Please run the migration.' }, success: false };
        }
        if (!isNetworkError(error)) {
          console.error('Error deleting album photo:', error);
        }
        return { error, success: false };
      }

      if (!success) {
        return { error: { message: 'Photo not found or could not be deleted' }, success: false };
      }

      // Retirer la photo du state
      setAlbumPhotos((prev) => prev.filter((photo) => photo.id !== photoId));

      return { error: null, success: true };
    } catch (error: any) {
      if (!isNetworkError(error)) {
        console.error('Error in deleteAlbumPhoto:', error);
      }
      return { error, success: false };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Réorganiser les photos
  const reorderAlbumPhotos = useCallback(async (
    userId: string,
    photoOrders: { id: string; order: number }[]
  ): Promise<{ error: any; success: boolean }> => {
    if (!userId || !photoOrders || photoOrders.length === 0) {
      return { error: { message: 'userId and photoOrders are required' }, success: false };
    }

    setIsLoading(true);
    try {
      const ordersJson = photoOrders.map(({ id, order }) => ({ id, order }));
      const { data, error } = await supabase.rpc('reorder_album_photos', {
        p_user_id: userId,
        p_photo_orders: ordersJson as any, // Supabase convertira automatiquement en JSONB
      });

      if (error) {
        if (!isNetworkError(error)) {
          console.error('Error reordering album photos:', error);
        }
        return { error, success: false };
      }

      if (!data) {
        return { error: { message: 'Could not reorder photos' }, success: false };
      }

      // Rafraîchir les photos
      await refreshAlbumPhotos(userId);

      return { error: null, success: true };
    } catch (error: any) {
      if (!isNetworkError(error)) {
        console.error('Error in reorderAlbumPhotos:', error);
      }
      return { error, success: false };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Rafraîchir les photos d'album
  const refreshAlbumPhotos = useCallback(async (userId: string) => {
    await getUserAlbumPhotos(userId);
  }, [getUserAlbumPhotos]);

  return (
    <AlbumContext.Provider
      value={{
        albumPhotos,
        isLoading,
        getUserAlbumPhotos,
        addAlbumPhoto,
        deleteAlbumPhoto,
        reorderAlbumPhotos,
        refreshAlbumPhotos,
      }}
    >
      {children}
    </AlbumContext.Provider>
  );
}

export function useAlbum() {
  const context = useContext(AlbumContext);
  if (context === undefined) {
    throw new Error('useAlbum must be used within an AlbumProvider');
  }
  return context;
}

