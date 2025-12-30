import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { isNetworkError } from '../lib/errorUtils';
import { supabase } from '../lib/supabase';
import { InfoAccessRequest, User } from '../types';
import { useAuth } from './AuthContext';
import { useNotification } from './NotificationContext';

// Vérifier si un ID est un UUID valide (pas un ID de développement)
const isValidUUID = (id: string | undefined): boolean => {
  if (!id) return false;
  // UUID v4 pattern
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

interface AccessRequestContextType {
  accessRequests: InfoAccessRequest[];
  pendingRequests: InfoAccessRequest[]; // Demandes reçues en attente
  isLoading: boolean;
  requestAccess: (targetId: string) => Promise<{ error: any; request: InfoAccessRequest | null }>;
  updateAccessRequest: (requestId: string, status: 'accepted' | 'rejected') => Promise<{ error: any }>;
  hasAccess: (targetId: string) => boolean;
  canViewFullProfile: (targetId: string) => boolean;
  refreshRequests: () => Promise<void>;
}

const AccessRequestContext = createContext<AccessRequestContextType | undefined>(undefined);

export function AccessRequestProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { showNotification } = useNotification();
  const [accessRequests, setAccessRequests] = useState<InfoAccessRequest[]>([]);
  const [pendingRequests, setPendingRequests] = useState<InfoAccessRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Charger les demandes au démarrage
  useEffect(() => {
    if (user) {
      refreshRequests();
    }
  }, [user]);

  // Rafraîchir les demandes
  const refreshRequests = async () => {
    if (!user) return;

    // En mode développement, si l'utilisateur n'a pas d'UUID valide, ne pas faire de requête
    if (!isValidUUID(user.id)) {
      console.log('🔧 Mode développement : Utilisateur local, pas de requête Supabase pour les access requests');
      setAccessRequests([]);
      setPendingRequests([]);
      return;
    }

    setIsLoading(true);
    try {
      // Récupérer toutes les demandes où l'utilisateur est requester ou target
      const { data, error } = await supabase
        .from('info_access_requests')
        .select('*')
        .or(`requester_id.eq.${user.id},target_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (error) {
        if (!isNetworkError(error)) {
          console.error('Error fetching access requests:', error);
        }
        return;
      }

      if (data) {
        const requests = data.map(mapRequestFromDB);
        
        // Pour chaque demande, récupérer les informations du requester si requesterInfoRevealed est true
        const requestsWithRequesterInfo = await Promise.all(
          requests.map(async (request) => {
            if (request.requesterInfoRevealed && request.requesterId) {
              try {
                const { data: requesterProfile } = await supabase
                  .from('profiles')
                  .select('*')
                  .eq('id', request.requesterId)
                  .single();
                
                if (requesterProfile) {
                  const requester: User = {
                    id: requesterProfile.id,
                    pseudo: requesterProfile.pseudo || 'Utilisateur',
                    age: requesterProfile.age || 25,
                    phone: requesterProfile.phone || '',
                    photo: requesterProfile.photo || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
                    description: requesterProfile.description || '',
                    rating: parseFloat(requesterProfile.rating) || 0,
                    reviewCount: requesterProfile.review_count || 0,
                    isSubscribed: requesterProfile.is_subscribed || false,
                    subscriptionStatus: requesterProfile.subscription_status || 'pending',
                    lastSeen: requesterProfile.last_seen || 'En ligne',
                    gender: requesterProfile.gender || 'female',
                    lat: requesterProfile.lat ? parseFloat(requesterProfile.lat) : undefined,
                    lng: requesterProfile.lng ? parseFloat(requesterProfile.lng) : undefined,
                    isAvailable: requesterProfile.is_available ?? true,
                    currentBookingId: requesterProfile.current_booking_id,
                  };
                  return { ...request, requester };
                }
              } catch (err: any) {
                if (!isNetworkError(err)) {
                  console.error('Error fetching requester profile:', err);
                }
              }
            }
            return request;
          })
        );
        
        setAccessRequests(requestsWithRequesterInfo);
        // Filtrer les demandes en attente où l'utilisateur est le target
        setPendingRequests(requestsWithRequesterInfo.filter(r => r.targetId === user.id && r.status === 'pending'));
      }
    } catch (error: any) {
      if (!isNetworkError(error)) {
        console.error('Error in refreshRequests:', error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Demander l'accès aux informations d'un profil (optimisé pour performance)
  const requestAccess = async (targetId: string) => {
    if (!user) {
      return { error: { message: 'Not authenticated' }, request: null };
    }

    if (targetId === user.id) {
      return { error: { message: 'Cannot request access to own profile' }, request: null };
    }

    // En mode développement, si l'utilisateur n'a pas d'UUID valide, simuler la création
    if (!isValidUUID(user.id)) {
      console.log('🔧 Mode développement : Simulation de création d\'access request');
      const mockRequest: InfoAccessRequest = {
        id: `access-dev-${Date.now()}`,
        requesterId: user.id,
        targetId: targetId,
        status: 'pending',
        requesterInfoRevealed: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setAccessRequests([mockRequest, ...accessRequests]);
      return { error: null, request: mockRequest };
    }

    // Vérifier d'abord dans l'état local (plus rapide - pas de requête réseau)
    const existingLocalRequest = accessRequests.find(
      r => r.requesterId === user.id && r.targetId === targetId
    );

    // Si une demande existe déjà et est acceptée ou en attente, retourner immédiatement
    if (existingLocalRequest) {
      if (existingLocalRequest.status === 'accepted' || existingLocalRequest.status === 'pending') {
        return { error: null, request: existingLocalRequest };
      }
    }

    try {
      // Mise à jour optimiste : créer une demande temporaire dans l'état local immédiatement
      const tempId = `temp-${Date.now()}`;
      const optimisticRequest: InfoAccessRequest = {
        id: tempId,
        requesterId: user.id,
        targetId: targetId,
        status: 'pending',
        requesterInfoRevealed: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      // Mettre à jour l'état local immédiatement (optimiste)
      if (existingLocalRequest && existingLocalRequest.status === 'rejected') {
        setAccessRequests(accessRequests.map(r => r.id === existingLocalRequest.id ? optimisticRequest : r));
      } else if (!existingLocalRequest) {
        setAccessRequests([optimisticRequest, ...accessRequests]);
      }

      // Vérifier et créer en base de données (en arrière-plan, non bloquant)
      // Utiliser Promise.all avec un timeout pour éviter les blocages
      const dbOperation = Promise.race([
        (async () => {
          // Vérifier s'il existe déjà une demande en base
          const { data: existingRequest, error: fetchError } = await supabase
            .from('info_access_requests')
            .select('*')
            .eq('requester_id', user.id)
            .eq('target_id', targetId)
            .maybeSingle();

          if (fetchError && fetchError.code !== 'PGRST116') {
            if (!isNetworkError(fetchError)) {
              console.error('Error fetching existing access request:', fetchError);
            }
            throw fetchError;
          }

          // Si une demande existe déjà
          if (existingRequest) {
            const existing = mapRequestFromDB(existingRequest);
            
            // Si la demande est déjà acceptée ou en attente, utiliser celle-ci
            if (existing.status === 'accepted' || existing.status === 'pending') {
              // Remplacer la demande optimiste par la vraie
              setAccessRequests(accessRequests.map(r => 
                r.id === tempId ? existing : (r.id === existing.id ? existing : r)
              ));
              return existing;
            }
            
            // Si la demande a été refusée, la réactiver
            if (existing.status === 'rejected') {
              const { data: updatedData, error: updateError } = await supabase
                .from('info_access_requests')
                .update({
                  status: 'pending',
                  requester_info_revealed: true,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', existing.id)
                .select()
                .single();

              if (updateError) {
                if (!isNetworkError(updateError)) {
                  console.error('Error reactivating access request:', updateError);
                }
                throw updateError;
              }

              if (updatedData) {
                const reactivatedRequest = mapRequestFromDB(updatedData);
                // Remplacer la demande optimiste par la vraie
                setAccessRequests(accessRequests.map(r => 
                  r.id === tempId ? reactivatedRequest : (r.id === reactivatedRequest.id ? reactivatedRequest : r)
                ));
                return reactivatedRequest;
              }
            }
          }

          // Aucune demande existante, créer une nouvelle demande
          const { data, error } = await supabase
            .from('info_access_requests')
            .insert({
              requester_id: user.id,
              target_id: targetId,
              status: 'pending',
              requester_info_revealed: true,
            })
            .select()
            .single();

          if (error) {
            if (!isNetworkError(error)) {
              console.error('Error creating access request:', error);
            }
            throw error;
          }

          if (data) {
            const newRequest = mapRequestFromDB(data);
            // Remplacer la demande optimiste par la vraie
            setAccessRequests(accessRequests.map(r => 
              r.id === tempId ? newRequest : r
            ));
            return newRequest;
          }

          throw new Error('No data returned');
        })(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 5000)
        )
      ]).catch((error: any) => {
        // En cas d'erreur ou timeout, retirer la demande optimiste
        setAccessRequests(accessRequests.filter(r => r.id !== tempId));
        if (!isNetworkError(error)) {
          console.error('Error in requestAccess DB operation:', error);
        }
        return null;
      });

      // Retourner immédiatement la demande optimiste (non bloquant)
      // La vraie demande sera mise à jour en arrière-plan
      return { error: null, request: optimisticRequest };
    } catch (error: any) {
      if (!isNetworkError(error)) {
        console.error('Error in requestAccess:', error);
      }
      return { error, request: null };
    }
  };

  // Mettre à jour le statut d'une demande (accepter/refuser)
  const updateAccessRequest = async (requestId: string, status: 'accepted' | 'rejected') => {
    if (!user) {
      return { error: { message: 'Not authenticated' } };
    }

    try {
      // Récupérer la demande actuelle pour obtenir le requester_id
      const { data: currentRequest } = await supabase
        .from('info_access_requests')
        .select('requester_id')
        .eq('id', requestId)
        .single();

      const { data, error } = await supabase
        .from('info_access_requests')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', requestId)
        .eq('target_id', user.id) // Seul le target peut mettre à jour
        .select()
        .single();

      if (error) {
        if (!isNetworkError(error)) {
          console.error('Error updating access request:', error);
        }
        return { error };
      }

      if (data) {
        const updatedRequest = mapRequestFromDB(data);
        setAccessRequests(accessRequests.map(r => r.id === requestId ? updatedRequest : r));
        setPendingRequests(pendingRequests.filter(r => r.id !== requestId));
        
        // Envoyer une notification au requester si la demande est acceptée
        if (status === 'accepted' && currentRequest?.requester_id) {
          // Récupérer les informations du target (utilisateur actuel) pour la notification
          const { data: targetProfile } = await supabase
            .from('profiles')
            .select('pseudo')
            .eq('id', user.id)
            .single();
          
          await showNotification(
            'access',
            'Demande d\'accès acceptée',
            `${targetProfile?.pseudo || 'Un utilisateur'} a accepté votre demande d'accès à ses informations. Vous pouvez maintenant voir son profil complet.`,
            { requestId: requestId, targetId: user.id }
          );
        }
        
        // Rafraîchir les demandes pour mettre à jour les informations
        await refreshRequests();
        
        return { error: null };
      }

      return { error: { message: 'No data returned' } };
    } catch (error: any) {
      if (!isNetworkError(error)) {
        console.error('Error in updateAccessRequest:', error);
      }
      return { error };
    }
  };

  // Vérifier si l'utilisateur a accès aux informations d'un profil
  const hasAccess = (targetId: string): boolean => {
    if (!user || targetId === user.id) return true; // On a toujours accès à son propre profil

    const request = accessRequests.find(
      r => r.requesterId === user.id && r.targetId === targetId && r.status === 'accepted'
    );
    return !!request;
  };

  // Vérifier si on peut voir le profil complet (accès accepté ou demande en attente avec info révélée)
  const canViewFullProfile = (targetId: string): boolean => {
    if (!user || targetId === user.id) return true;

    const request = accessRequests.find(
      r => (r.requesterId === user.id && r.targetId === targetId) ||
           (r.targetId === user.id && r.requesterId === targetId)
    );

    if (!request) return false;

    // Si on est le requester et que la demande est acceptée, on voit tout
    if (request.requesterId === user.id && request.status === 'accepted') {
      return true;
    }

    // Si on est le target et que la demande est acceptée, on voit automatiquement les infos du requester
    // (accès mutuel)
    if (request.targetId === user.id && request.status === 'accepted') {
      return true;
    }

    // Si on est le target et que requester_info_revealed est true, on voit les infos du requester
    if (request.targetId === user.id && request.requesterInfoRevealed) {
      return true;
    }

    return false;
  };

  // Mapper les données de la DB vers le type InfoAccessRequest
  const mapRequestFromDB = (dbRequest: any): InfoAccessRequest => ({
    id: dbRequest.id,
    requesterId: dbRequest.requester_id,
    targetId: dbRequest.target_id,
    status: dbRequest.status,
    requesterInfoRevealed: dbRequest.requester_info_revealed,
    createdAt: dbRequest.created_at,
    updatedAt: dbRequest.updated_at,
  });

  return (
    <AccessRequestContext.Provider
      value={{
        accessRequests,
        pendingRequests,
        isLoading,
        requestAccess,
        updateAccessRequest,
        hasAccess,
        canViewFullProfile,
        refreshRequests,
      }}
    >
      {children}
    </AccessRequestContext.Provider>
  );
}

export function useAccessRequest() {
  const context = useContext(AccessRequestContext);
  if (context === undefined) {
    throw new Error('useAccessRequest must be used within an AccessRequestProvider');
  }
  return context;
}

