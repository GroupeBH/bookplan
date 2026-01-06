import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { isNetworkError } from '../lib/errorUtils';
import { sendPushNotification } from '../lib/pushNotifications';
import { supabase } from '../lib/supabase';
import { Offer, OfferApplication, OfferType } from '../types';
import { useAuth } from './AuthContext';

// Vérifier si un ID est un UUID valide
const isValidUUID = (id: string | undefined): boolean => {
  if (!id) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

interface OfferContextType {
  offers: Offer[];
  myOffers: Offer[];
  isLoading: boolean;
  createOffer: (
    offerTypes: OfferType[],
    title: string,
    offerDate: string,
    durationHours: number,
    description?: string,
    notes?: string,
    location?: string,
    lat?: number,
    lng?: number
  ) => Promise<{ error: any; offer: Offer | null }>;
  getAvailableOffers: () => Promise<Offer[]>;
  getOfferById: (offerId: string) => Promise<Offer | null>;
  getOfferApplications: (offerId: string) => Promise<OfferApplication[]>;
  applyToOffer: (offerId: string, message: string) => Promise<{ error: any; application: OfferApplication | null }>;
  selectApplication: (offerId: string, applicationId: string) => Promise<{ error: any }>;
  rejectApplication: (applicationId: string, rejectionMessage: string) => Promise<{ error: any }>;
  cancelSelectedApplication: (offerId: string, applicationId: string, cancellationMessage?: string) => Promise<{ error: any }>;
  cancelMyApplication: (applicationId: string) => Promise<{ error: any }>;
  cancelOffer: (offerId: string, cancellationMessage?: string) => Promise<{ error: any }>;
  deleteOffer: (offerId: string) => Promise<{ error: any }>;
  reactivateOffer: (offerId: string) => Promise<{ error: any }>;
  updateOffer: (offerId: string, offerTypes: OfferType[], title: string, offerDate: string, durationHours: number, description?: string, notes?: string, location?: string, lat?: number, lng?: number) => Promise<{ error: any; offer: Offer | null }>;
  refreshOffers: () => Promise<void>;
  refreshMyOffers: () => Promise<void>;
}

const OfferContext = createContext<OfferContextType | undefined>(undefined);

export function OfferProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [myOffers, setMyOffers] = useState<Offer[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Charger les offres au démarrage
  useEffect(() => {
    if (user) {
      refreshOffers();
      refreshMyOffers();
    }
  }, [user]);

  // Rafraîchir les offres disponibles
  const refreshOffers = async () => {
    if (!user) return;

    if (!isValidUUID(user.id)) {
      console.log('🔧 Mode développement : Utilisateur local, pas de requête Supabase pour les offres');
      setOffers([]);
      return;
    }

    setIsLoading(true);
    try {
      // La politique RLS permet maintenant à tous les utilisateurs authentifiés
      // de voir les offres actives (pas seulement ceux qui sont disponibles)
      console.log('👤 Chargement des offres pour l\'utilisateur:', { 
        userId: user.id
      });

      const nowISO = new Date().toISOString();
      console.log('🔍 Chargement des offres disponibles...', { 
        now: nowISO,
        userId: user.id 
      });
      
      // Test: Vérifier d'abord si on peut voir toutes les offres actives (sans filtre d'auteur)
      // pour diagnostiquer si le problème vient de la politique RLS
      const { data: testData, error: testError } = await supabase
        .from('offers')
        .select('id, title, status, expires_at, author_id')
        .eq('status', 'active')
        .gt('expires_at', nowISO);
      
      console.log('🧪 Test - Toutes les offres actives (sans filtre auteur):', {
        count: testData?.length || 0,
        offers: testData?.map(o => ({ id: o.id, title: o.title, authorId: o.author_id })),
        error: testError?.message
      });
      
      // La politique RLS "Authenticated users can view active offers" filtre automatiquement:
      // - status = 'active'
      // - expires_at > NOW()
      // - L'utilisateur doit être authentifié (auth.uid() IS NOT NULL)
      // On ajoute aussi des filtres explicites pour être sûr et exclure nos propres offres
      console.log('🔍 Requête Supabase pour récupérer les offres (excluant mes propres offres)...');
      const { data, error } = await supabase
        .from('offers')
        .select('*')
        .eq('status', 'active')
        .gt('expires_at', nowISO)
        .neq('author_id', user.id) // Exclure les offres de l'utilisateur actuel
        .order('created_at', { ascending: false });
      
      console.log('📊 Résultat de la requête:', {
        hasData: !!data,
        dataLength: data?.length || 0,
        hasError: !!error,
        errorMessage: error?.message,
        errorCode: error?.code
      });

      if (error) {
        if (error.code === 'PGRST116' || error.code === '42P01') {
          console.log('⚠️ Table offers n\'existe pas encore');
          setOffers([]);
        } else if (isNetworkError(error)) {
          console.log('⚠️ Erreur réseau lors du chargement des offres');
          setOffers([]);
        } else {
          console.error('❌ Error fetching offers:', error);
        }
        setIsLoading(false);
        return;
      }

      console.log('📋 Offres récupérées (avant filtrage):', data?.length || 0);
      
      if (data && data.length > 0) {
        console.log('📋 Détails des offres récupérées:', data.map(o => ({
          id: o.id,
          title: o.title,
          status: o.status,
          expiresAt: o.expires_at,
          authorId: o.author_id,
          offerDate: o.offer_date,
          durationHours: o.duration_hours
        })));
      } else {
        console.log('⚠️ Aucune offre récupérée de la base de données');
      }
      
      // Filtrer manuellement les offres actives et non expirées
      // (la politique RLS devrait déjà le faire, mais on double-vérifie)
      const now = new Date();
      const activeOffers = (data || []).filter(offer => {
        const expiresAt = new Date(offer.expires_at);
        const isActive = offer.status === 'active' && expiresAt > now;
        if (!isActive) {
          console.log('⚠️ Offre filtrée:', {
            id: offer.id,
            title: offer.title,
            status: offer.status,
            expiresAt: offer.expires_at,
            isExpired: expiresAt <= now,
            now: now.toISOString()
          });
        }
        return isActive;
      });

      console.log('✅ Offres actives après filtrage:', activeOffers.length);

      if (activeOffers.length > 0) {
        // Charger les profils des auteurs, les types et compter les candidatures
        const offersWithCounts = await Promise.all(
          activeOffers.map(async (offer) => {
            // Charger le profil de l'auteur
            let authorProfile = null;
            try {
              const { data: profile } = await supabase
                .from('profiles')
                .select('id, pseudo, photo, age, rating, review_count, gender')
                .eq('id', offer.author_id)
                .single();
              
              if (profile) {
                authorProfile = {
                  id: profile.id,
                  pseudo: profile.pseudo || 'Utilisateur',
                  photo: profile.photo || '',
                  age: profile.age || 0,
                  rating: parseFloat(profile.rating) || 0,
                  reviewCount: profile.review_count || 0,
                  gender: profile.gender || 'female',
                };
              }
            } catch (profileError) {
              console.error('Error loading author profile:', profileError);
            }

            // Charger les types de l'offre
            let offerTypes: OfferType[] = [];
            try {
              const { data: types } = await supabase
                .from('offer_offer_types')
                .select('offer_type')
                .eq('offer_id', offer.id);
              
              if (types && types.length > 0) {
                offerTypes = types.map(t => t.offer_type as OfferType);
              } else {
                // Fallback : utiliser le type de l'offre si la table de relation n'a pas de données
                offerTypes = offer.offer_type ? [offer.offer_type as OfferType] : [];
              }
            } catch (typesError) {
              console.error('Error loading offer types:', typesError);
              // Fallback : utiliser le type de l'offre
              offerTypes = offer.offer_type ? [offer.offer_type as OfferType] : [];
            }

            // Compter les candidatures
            const { count } = await supabase
              .from('offer_applications')
              .select('*', { count: 'exact', head: true })
              .eq('offer_id', offer.id);
            
            return {
              ...mapOfferFromDB({ ...offer, author: authorProfile, offerTypes }),
              applicationCount: count || 0,
            };
          })
        );
        setOffers(offersWithCounts);
      } else {
        setOffers([]);
      }
    } catch (error: any) {
      if (error?.message?.includes('Network request failed') || error?.message?.includes('Failed to fetch')) {
        console.log('⚠️ Erreur réseau lors du chargement des offres');
      } else {
        console.log('⚠️ Erreur lors du chargement des offres:', error?.message || error);
      }
      setOffers([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Rafraîchir mes offres
  const refreshMyOffers = async () => {
    if (!user) return;

    if (!isValidUUID(user.id)) {
      setMyOffers([]);
      return;
    }

    try {
      // D'abord, marquer les offres expirées
      try {
        await supabase.rpc('expire_offers');
      } catch (expireError) {
        // Si la fonction n'existe pas encore, on continue quand même
        console.log('⚠️ Fonction expire_offers non disponible:', expireError);
      }

      const { data, error } = await supabase
        .from('offers')
        .select('*')
        .eq('author_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        if (error.code === 'PGRST116' || error.code === '42P01') {
          setMyOffers([]);
        } else if (isNetworkError(error)) {
          console.log('⚠️ Erreur réseau lors du chargement de mes offres');
          setMyOffers([]);
        } else {
          console.error('Error fetching my offers:', error);
        }
        return;
      }

      if (data) {
        // Charger les profils des auteurs et les candidatures sélectionnées
        const offersWithData = await Promise.all(
          data.map(async (offer) => {
            // Charger le profil de l'auteur (qui est l'utilisateur actuel)
            let authorProfile = null;
            try {
              const { data: profile } = await supabase
                .from('profiles')
                .select('id, pseudo, photo, age, rating, review_count, gender')
                .eq('id', offer.author_id)
                .single();
              
              if (profile) {
                authorProfile = {
                  id: profile.id,
                  pseudo: profile.pseudo || 'Utilisateur',
                  photo: profile.photo || '',
                  age: profile.age || 0,
                  rating: parseFloat(profile.rating) || 0,
                  reviewCount: profile.review_count || 0,
                  gender: profile.gender || 'female',
                };
              }
            } catch (profileError) {
              console.error('Error loading author profile:', profileError);
            }

            // Compter les candidatures
            let applicationCount = 0;
            try {
              const { count } = await supabase
                .from('offer_applications')
                .select('*', { count: 'exact', head: true })
                .eq('offer_id', offer.id);
              
              applicationCount = count || 0;
            } catch (countError) {
              console.error('Error counting applications:', countError);
            }

            // Charger la candidature sélectionnée si elle existe
            let selectedApplication = null;
            if (offer.selected_application_id) {
              try {
                const { data: application } = await supabase
                  .from('offer_applications')
                  .select('id, applicant_id, message, status')
                  .eq('id', offer.selected_application_id)
                  .single();
                
                if (application) {
                  // Charger le profil du candidat
                  let applicantProfile = null;
                  try {
                    const { data: applicantProfileData } = await supabase
                      .from('profiles')
                      .select('id, pseudo, photo, age')
                      .eq('id', application.applicant_id)
                      .single();
                    
                    if (applicantProfileData) {
                      applicantProfile = {
                        id: applicantProfileData.id,
                        pseudo: applicantProfileData.pseudo || 'Utilisateur',
                        photo: applicantProfileData.photo || '',
                        age: applicantProfileData.age || 0,
                      };
                    }
                  } catch (applicantError) {
                    console.error('Error loading applicant profile:', applicantError);
                  }

                  selectedApplication = {
                    ...application,
                    applicant: applicantProfile,
                  };
                }
              } catch (appError) {
                console.error('Error loading selected application:', appError);
              }
            }

            // Charger les types de l'offre
            let offerTypes: OfferType[] = [];
            try {
              const { data: types } = await supabase
                .from('offer_offer_types')
                .select('offer_type')
                .eq('offer_id', offer.id);
              
              if (types && types.length > 0) {
                offerTypes = types.map(t => t.offer_type as OfferType);
              } else {
                // Fallback : utiliser le type de l'offre si la table de relation n'a pas de données
                offerTypes = offer.offer_type ? [offer.offer_type as OfferType] : [];
              }
            } catch (typesError) {
              console.error('Error loading offer types:', typesError);
              // Fallback : utiliser le type de l'offre
              offerTypes = offer.offer_type ? [offer.offer_type as OfferType] : [];
            }

            // Vérifier si l'offre est expirée et mettre à jour le statut si nécessaire
            const expiresAt = new Date(offer.expires_at);
            const now = new Date();
            const isExpired = expiresAt <= now && (offer.status === 'active' || offer.status === 'closed');
            
            // Si l'offre est expirée, mettre à jour le statut dans la base de données
            if (isExpired && offer.status !== 'expired') {
              try {
                await supabase
                  .from('offers')
                  .update({ status: 'expired', updated_at: new Date().toISOString() })
                  .eq('id', offer.id);
              } catch (updateError) {
                console.error('Error updating expired offer status:', updateError);
              }
            }

            return {
              ...offer,
              author: authorProfile,
              offerTypes,
              selected_application: selectedApplication,
              application_count: applicationCount,
              // Mettre à jour le statut si l'offre est expirée
              status: isExpired ? 'expired' : offer.status,
            };
          })
        );
        
        setMyOffers(offersWithData.map(mapOfferFromDB));
      } else {
        setMyOffers([]);
      }
    } catch (error: any) {
      console.log('⚠️ Erreur lors du chargement de mes offres:', error?.message || error);
      setMyOffers([]);
    }
  };

  // Créer une offre avec plusieurs types
  const createOffer = async (
    offerTypes: OfferType[],
    title: string,
    offerDate: string,
    durationHours: number,
    description?: string,
    notes?: string,
    location?: string,
    lat?: number,
    lng?: number
  ): Promise<{ error: any; offer: Offer | null }> => {
    if (!user) {
      return { error: 'Utilisateur non connecté', offer: null };
    }

    if (!offerTypes || offerTypes.length === 0) {
      return { error: { message: 'Au moins un type d\'offre est requis' }, offer: null };
    }

    try {
      // Créer l'offre (utiliser le premier type pour rétrocompatibilité)
      // Le trigger calculera automatiquement expires_at = offer_date + duration_hours
      console.log('📝 Création d\'une offre:', {
        authorId: user.id,
        title,
        offerDate,
        durationHours,
        status: 'active'
      });

      const { data, error } = await supabase
        .from('offers')
        .insert({
          author_id: user.id,
          offer_type: offerTypes[0], // Premier type pour rétrocompatibilité
          title,
          description,
          notes,
          offer_date: offerDate,
          duration_hours: durationHours,
          location,
          lat,
          lng,
          status: 'active', // S'assurer que le statut est 'active'
        })
        .select('*')
        .single();

      if (error) {
        console.error('❌ Error creating offer:', error);
        return { error, offer: null };
      }

      console.log('✅ Offre créée:', {
        id: data.id,
        status: data.status,
        expiresAt: data.expires_at,
        offerDate: data.offer_date,
        durationHours: data.duration_hours
      });

      // Insérer tous les types dans la table de relation
      const typeInserts = offerTypes.map(type => ({
        offer_id: data.id,
        offer_type: type,
      }));

      const { error: typesError } = await supabase
        .from('offer_offer_types')
        .insert(typeInserts);

      if (typesError) {
        console.error('Error creating offer types:', typesError);
        // Supprimer l'offre créée si l'insertion des types échoue
        await supabase.from('offers').delete().eq('id', data.id);
        return { error: typesError, offer: null };
      }

      // Charger le profil de l'auteur
      let authorProfile = null;
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, pseudo, photo, age, rating, review_count, gender')
          .eq('id', user.id)
          .single();
        
        if (profile) {
          authorProfile = {
            id: profile.id,
            pseudo: profile.pseudo || 'Utilisateur',
            photo: profile.photo || '',
            age: profile.age || 0,
            rating: parseFloat(profile.rating) || 0,
            reviewCount: profile.review_count || 0,
            gender: profile.gender || 'female',
          };
        }
      } catch (profileError) {
        console.error('Error loading author profile:', profileError);
      }

      const offer = mapOfferFromDB({ ...data, author: authorProfile, offerTypes });
      
      // Envoyer des notifications push à tous les utilisateurs disponibles
      try {
        const { data: availableUsers } = await supabase
          .from('profiles')
          .select('id')
          .eq('is_available', true)
          .neq('id', user.id);

        if (availableUsers) {
          const offerTypeLabels: Record<OfferType, string> = {
            drink: 'à boire',
            food: 'à manger',
            transport: 'remboursement transport',
            gift: 'présent',
          };

          // Construire le message avec tous les types
          const typesText = offer.offerTypes && offer.offerTypes.length > 0
            ? offer.offerTypes.map(t => offerTypeLabels[t]).join(', ')
            : offerTypeLabels[offer.offerType];

          for (const profile of availableUsers) {
            await sendPushNotification({
              userId: profile.id,
              title: 'Nouvelle offre disponible',
              body: `${user.pseudo} propose ${typesText}: ${title}`,
              data: { type: 'new_offer', offerId: offer.id },
            });
          }
        }
      } catch (notifError) {
        console.error('Error sending push notifications:', notifError);
        // Ne pas bloquer la création de l'offre si les notifications échouent
      }

      await refreshOffers();
      await refreshMyOffers();

      return { error: null, offer };
    } catch (error: any) {
      console.error('Error creating offer:', error);
      return { error, offer: null };
    }
  };

  // Obtenir une offre par ID
  const getOfferById = async (offerId: string): Promise<Offer | null> => {
    try {
      const { data, error } = await supabase
        .from('offers')
        .select('*')
        .eq('id', offerId)
        .single();

      if (error) {
        console.error('Error fetching offer:', error);
        return null;
      }

      // Charger le profil de l'auteur
      let authorProfile = null;
      if (data?.author_id) {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, pseudo, photo, age, rating, review_count, description, gender')
            .eq('id', data.author_id)
            .single();
          
          if (profile) {
            authorProfile = {
              id: profile.id,
              pseudo: profile.pseudo || 'Utilisateur',
              photo: profile.photo || '',
              age: profile.age || 0,
              rating: parseFloat(profile.rating) || 0,
              reviewCount: profile.review_count || 0,
              description: profile.description || '',
              gender: profile.gender || 'female',
            };
          }
        } catch (profileError) {
          console.error('Error loading author profile:', profileError);
        }
      }

      // Charger les types de l'offre
      let offerTypes: OfferType[] = [];
      try {
        const { data: types } = await supabase
          .from('offer_offer_types')
          .select('offer_type')
          .eq('offer_id', data.id);
        
        if (types && types.length > 0) {
          offerTypes = types.map(t => t.offer_type as OfferType);
        } else {
          // Fallback : utiliser le type de l'offre si la table de relation n'a pas de données
          offerTypes = data.offer_type ? [data.offer_type as OfferType] : [];
        }
      } catch (typesError) {
        console.error('Error loading offer types:', typesError);
        // Fallback : utiliser le type de l'offre
        offerTypes = data.offer_type ? [data.offer_type as OfferType] : [];
      }

      return mapOfferFromDB({ ...data, author: authorProfile, offerTypes });
    } catch (error) {
      console.error('Error fetching offer:', error);
      return null;
    }
  };

  // Obtenir les candidatures d'une offre
  const getOfferApplications = async (offerId: string): Promise<OfferApplication[]> => {
    try {
      const { data, error } = await supabase
        .from('offer_applications')
        .select('*')
        .eq('offer_id', offerId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching applications:', error);
        return [];
      }

      if (!data) return [];

      // Charger les profils des candidats
      const applicationsWithProfiles = await Promise.all(
        data.map(async (application) => {
          let applicantProfile = null;
          if (application.applicant_id) {
            try {
              const { data: profile } = await supabase
                .from('profiles')
                .select('id, pseudo, photo, age, rating, review_count, description')
                .eq('id', application.applicant_id)
                .single();
              
              if (profile) {
                applicantProfile = {
                  id: profile.id,
                  pseudo: profile.pseudo || 'Utilisateur',
                  photo: profile.photo || '',
                  age: profile.age || 0,
                  rating: parseFloat(profile.rating) || 0,
                  reviewCount: profile.review_count || 0,
                  description: profile.description || '',
                };
              }
            } catch (profileError) {
              console.error('Error loading applicant profile:', profileError);
            }
          }

          return {
            ...application,
            applicant: applicantProfile,
          };
        })
      );

      return applicationsWithProfiles.map(mapApplicationFromDB);
    } catch (error) {
      console.error('Error fetching applications:', error);
      return [];
    }
  };

  // Candidater à une offre
  const applyToOffer = async (
    offerId: string,
    message: string
  ): Promise<{ error: any; application: OfferApplication | null }> => {
    if (!user) {
      return { error: 'Utilisateur non connecté', application: null };
    }

    try {
      // Vérifier s'il y a déjà une candidature pour cette offre
      const { data: existingApplication } = await supabase
        .from('offer_applications')
        .select('id, status')
        .eq('offer_id', offerId)
        .eq('applicant_id', user.id)
        .single();

      // Si une candidature existe et n'a pas été annulée par le candidat (status != 'cancelled')
      // Note: 'cancelled' n'est pas dans le type actuel, mais on peut vérifier les statuts existants
      if (existingApplication && existingApplication.status !== 'expired') {
        // Si la candidature est pending, selected, ou rejected, on ne peut pas re-candidater
        if (existingApplication.status === 'pending' || existingApplication.status === 'selected' || existingApplication.status === 'rejected') {
          return { 
            error: { message: 'Vous avez déjà candidaté à cette offre' }, 
            application: null 
          };
        }
      }

      const { data, error } = await supabase
        .from('offer_applications')
        .insert({
          offer_id: offerId,
          applicant_id: user.id,
          message,
        })
        .select('*')
        .single();

      if (error) {
        // Si l'erreur est due à une contrainte unique, c'est qu'il y a déjà une candidature
        if (error.code === '23505') {
          return { 
            error: { message: 'Vous avez déjà candidaté à cette offre' }, 
            application: null 
          };
        }
        console.error('Error applying to offer:', error);
        return { error, application: null };
      }

      // Charger le profil du candidat
      let applicantProfile = null;
      if (data?.applicant_id) {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, pseudo, photo, age')
            .eq('id', data.applicant_id)
            .single();
          
          if (profile) {
            applicantProfile = {
              id: profile.id,
              pseudo: profile.pseudo || 'Utilisateur',
              photo: profile.photo || '',
              age: profile.age || 0,
            };
          }
        } catch (profileError) {
          console.error('Error loading applicant profile:', profileError);
        }
      }

      const application = mapApplicationFromDB({ ...data, applicant: applicantProfile });

      // Envoyer une notification à l'auteur de l'offre
      try {
        const offer = await getOfferById(offerId);
        if (offer?.authorId) {
          // Créer une notification dans la table notifications
          const { error: notificationError } = await supabase
            .from('notifications')
            .insert({
              user_id: offer.authorId,
              type: 'offer_application_received',
              title: 'Nouvelle candidature',
              message: `${user.pseudo} a candidaté à votre offre "${offer.title}"`,
              data: {
                offerId: offerId,
                applicationId: application.id,
                applicantId: user.id,
              },
            });

          if (notificationError && !isNetworkError(notificationError)) {
            console.error('Error creating notification:', notificationError);
          }

          // Envoyer aussi une notification push
          await sendPushNotification({
            userId: offer.authorId,
            title: 'Nouvelle candidature',
            body: `${user.pseudo} a candidaté à votre offre "${offer.title}"`,
            data: { type: 'offer_application', offerId, applicationId: application.id },
          });
        }
      } catch (notifError) {
        console.error('Error sending notification:', notifError);
      }

      await refreshOffers();
      await refreshMyOffers();

      return { error: null, application };
    } catch (error: any) {
      console.error('Error applying to offer:', error);
      return { error, application: null };
    }
  };

  // Sélectionner un candidat
  const selectApplication = async (
    offerId: string,
    applicationId: string
  ): Promise<{ error: any }> => {
    if (!user) {
      return { error: 'Utilisateur non connecté' };
    }

    try {
      const { error } = await supabase.rpc('select_offer_application', {
        p_offer_id: offerId,
        p_application_id: applicationId,
        p_author_id: user.id,
      });

      if (error) {
        console.error('Error selecting application:', error);
        return { error };
      }

      // Envoyer une notification au candidat sélectionné avec les données pour rediriger vers l'offre et démarrer une conversation
      try {
        const { data: application } = await supabase
          .from('offer_applications')
          .select('applicant_id')
          .eq('id', applicationId)
          .single();

        if (application?.applicant_id) {
          const offer = await getOfferById(offerId);
          const { data: authorProfile } = await supabase
            .from('profiles')
            .select('pseudo')
            .eq('id', user.id)
            .single();

          await sendPushNotification({
            userId: application.applicant_id,
            title: 'Candidature acceptée ! 🎉',
            body: `${authorProfile?.pseudo || 'L\'auteur'} a accepté votre candidature pour "${offer?.title}". Vous pouvez maintenant commencer une conversation !`,
            data: { 
              type: 'offer_application_selected', 
              offerId, 
              applicationId,
              authorId: user.id,
              canStartConversation: true
            },
          });
        }
      } catch (notifError) {
        console.error('Error sending push notification:', notifError);
      }

      await refreshOffers();
      await refreshMyOffers();

      return { error: null };
    } catch (error: any) {
      console.error('Error selecting application:', error);
      return { error };
    }
  };

  // Rejeter une candidature
  const rejectApplication = async (
    applicationId: string,
    rejectionMessage: string
  ): Promise<{ error: any }> => {
    if (!user) {
      return { error: 'Utilisateur non connecté' };
    }

    try {
      const { error } = await supabase.rpc('reject_offer_application', {
        p_application_id: applicationId,
        p_author_id: user.id,
        p_rejection_message: rejectionMessage,
      });

      if (error) {
        console.error('Error rejecting application:', error);
        return { error };
      }

      // Envoyer une notification gentille au candidat rejeté
      try {
        const { data: application } = await supabase
          .from('offer_applications')
          .select('applicant_id, offer_id')
          .eq('id', applicationId)
          .single();

        if (application?.applicant_id) {
          const offer = await getOfferById(application.offer_id);
          const { data: authorProfile } = await supabase
            .from('profiles')
            .select('pseudo')
            .eq('id', user.id)
            .single();

          // Message gentil pour le refus
          const friendlyMessage = rejectionMessage || 
            `Merci pour votre candidature à "${offer?.title}". Malheureusement, nous avons choisi un autre candidat pour cette fois. Nous espérons vous revoir bientôt !`;

          await sendPushNotification({
            userId: application.applicant_id,
            title: 'Réponse à votre candidature',
            body: friendlyMessage,
            data: { 
              type: 'offer_application_rejected', 
              offerId: application.offer_id, 
              applicationId 
            },
          });
        }
      } catch (notifError) {
        console.error('Error sending push notification:', notifError);
      }

      await refreshOffers();
      await refreshMyOffers();

      return { error: null };
    } catch (error: any) {
      console.error('Error rejecting application:', error);
      return { error };
    }
  };

  // Annuler une candidature acceptée (par l'auteur de l'offre)
  const cancelSelectedApplication = async (
    offerId: string,
    applicationId: string,
    cancellationMessage?: string
  ): Promise<{ error: any }> => {
    if (!user) {
      return { error: 'Utilisateur non connecté' };
    }

    try {
      // Vérifier que l'offre existe et que l'utilisateur est l'auteur
      const offer = await getOfferById(offerId);
      if (!offer || offer.authorId !== user.id) {
        return { error: { message: 'Vous n\'êtes pas l\'auteur de cette offre' } };
      }

      // Vérifier que l'offre est toujours active
      if (offer.status !== 'active' && offer.status !== 'closed') {
        return { error: { message: 'Cette offre n\'est plus disponible' } };
      }

      // Récupérer la candidature
      const { data: application } = await supabase
        .from('offer_applications')
        .select('applicant_id, status')
        .eq('id', applicationId)
        .eq('offer_id', offerId)
        .single();

      if (!application || application.status !== 'selected') {
        return { error: { message: 'Candidature invalide ou non sélectionnée' } };
      }

      // Réinitialiser l'offre (retirer la candidature sélectionnée et remettre le statut à active)
      const { error: updateError } = await supabase
        .from('offers')
        .update({
          selected_application_id: null,
          status: 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', offerId);

      if (updateError) {
        console.error('Error updating offer:', updateError);
        return { error: updateError };
      }

      // Marquer la candidature comme rejetée avec un message d'annulation
      const friendlyMessage = cancellationMessage || 
        `Votre candidature pour "${offer.title}" a été annulée. L'offre est à nouveau disponible.`;

      const { error: rejectError } = await supabase
        .from('offer_applications')
        .update({
          status: 'rejected',
          rejection_message: friendlyMessage,
          updated_at: new Date().toISOString(),
        })
        .eq('id', applicationId);

      if (rejectError) {
        console.error('Error updating application:', rejectError);
        return { error: rejectError };
      }

      // Envoyer une notification gentille au candidat
      try {
        const { data: authorProfile } = await supabase
          .from('profiles')
          .select('pseudo')
          .eq('id', user.id)
          .single();

        await sendPushNotification({
          userId: application.applicant_id,
          title: 'Annulation de candidature',
          body: friendlyMessage,
          data: { 
            type: 'offer_application_cancelled', 
            offerId, 
            applicationId 
          },
        });
      } catch (notifError) {
        console.error('Error sending push notification:', notifError);
      }

      await refreshOffers();
      await refreshMyOffers();

      return { error: null };
    } catch (error: any) {
      console.error('Error cancelling selected application:', error);
      return { error };
    }
  };

  // Annuler sa propre candidature (par le candidat)
  const cancelMyApplication = async (
    applicationId: string
  ): Promise<{ error: any }> => {
    if (!user) {
      return { error: 'Utilisateur non connecté' };
    }

    try {
      // Récupérer la candidature
      const { data: application } = await supabase
        .from('offer_applications')
        .select('offer_id, applicant_id, status')
        .eq('id', applicationId)
        .single();

      if (!application) {
        return { error: { message: 'Candidature introuvable' } };
      }

      // Vérifier que l'utilisateur est bien le candidat
      if (application.applicant_id !== user.id) {
        return { error: { message: 'Vous n\'êtes pas l\'auteur de cette candidature' } };
      }

      // Récupérer l'offre
      const offer = await getOfferById(application.offer_id);
      if (!offer) {
        return { error: { message: 'Offre introuvable' } };
      }

      // Supprimer la candidature (elle disparaît complètement)
      const { error: deleteError } = await supabase
        .from('offer_applications')
        .delete()
        .eq('id', applicationId);

      if (deleteError) {
        console.error('Error deleting application:', deleteError);
        return { error: deleteError };
      }

      // Si la candidature était sélectionnée, réinitialiser l'offre
      if (application.status === 'selected') {
        const { error: updateError } = await supabase
          .from('offers')
          .update({
            selected_application_id: null,
            status: 'active',
            updated_at: new Date().toISOString(),
          })
          .eq('id', application.offer_id);

        if (updateError) {
          console.error('Error updating offer:', updateError);
        }

        // Envoyer une notification à l'auteur de l'offre
        try {
          const { data: applicantProfile } = await supabase
            .from('profiles')
            .select('pseudo')
            .eq('id', user.id)
            .single();

          await sendPushNotification({
            userId: offer.authorId,
            title: 'Candidature annulée',
            body: `${applicantProfile?.pseudo || 'Un candidat'} a annulé sa candidature pour "${offer.title}". L'offre est à nouveau disponible.`,
            data: { 
              type: 'offer_application_cancelled_by_applicant', 
              offerId: application.offer_id, 
              applicationId 
            },
          });
        } catch (notifError) {
          console.error('Error sending push notification:', notifError);
        }
      }

      await refreshOffers();
      await refreshMyOffers();

      return { error: null };
    } catch (error: any) {
      console.error('Error cancelling my application:', error);
      return { error };
    }
  };

  // Annuler une offre
  const cancelOffer = async (
    offerId: string,
    cancellationMessage?: string
  ): Promise<{ error: any }> => {
    if (!user) {
      return { error: 'Utilisateur non connecté' };
    }

    try {
      const { error } = await supabase.rpc('cancel_offer', {
        p_offer_id: offerId,
        p_author_id: user.id,
        p_cancellation_message: cancellationMessage || 'L\'offre a été annulée par l\'auteur.',
      });

      if (error) {
        console.error('Error cancelling offer:', error);
        return { error };
      }

      // Envoyer des notifications aux candidats
      try {
        const applications = await getOfferApplications(offerId);
        const offer = await getOfferById(offerId);
        
        for (const application of applications) {
          if (application.status === 'pending' && application.applicantId) {
            await sendPushNotification({
              userId: application.applicantId,
              title: 'Offre annulée',
              body: `L'offre "${offer?.title}" a été annulée.`,
              data: { type: 'offer_cancelled', offerId },
            });
          }
        }
      } catch (notifError) {
        console.error('Error sending push notifications:', notifError);
      }

      await refreshOffers();
      await refreshMyOffers();

      return { error: null };
    } catch (error: any) {
      console.error('Error cancelling offer:', error);
      return { error };
    }
  };

  // Supprimer définitivement une offre (DELETE)
  const deleteOffer = async (
    offerId: string
  ): Promise<{ error: any }> => {
    if (!user) {
      return { error: 'Utilisateur non connecté' };
    }

    try {
      // Vérifier que l'utilisateur est bien l'auteur de l'offre
      const offer = await getOfferById(offerId);
      if (!offer || offer.authorId !== user.id) {
        return { error: { message: 'Vous n\'êtes pas l\'auteur de cette offre' } };
      }

      // Supprimer l'offre (les candidatures seront supprimées automatiquement grâce à ON DELETE CASCADE)
      const { error } = await supabase
        .from('offers')
        .delete()
        .eq('id', offerId)
        .eq('author_id', user.id);

      if (error) {
        console.error('Error deleting offer:', error);
        return { error };
      }

      await refreshOffers();
      await refreshMyOffers();

      return { error: null };
    } catch (error: any) {
      console.error('Error deleting offer:', error);
      return { error };
    }
  };

  // Réactiver une offre annulée
  const reactivateOffer = async (
    offerId: string
  ): Promise<{ error: any }> => {
    if (!user) {
      return { error: 'Utilisateur non connecté' };
    }

    try {
      // Vérifier que l'utilisateur est bien l'auteur de l'offre
      const offer = await getOfferById(offerId);
      if (!offer || offer.authorId !== user.id) {
        return { error: { message: 'Vous n\'êtes pas l\'auteur de cette offre' } };
      }

      // Vérifier que l'offre est bien annulée
      if (offer.status !== 'cancelled') {
        return { error: { message: 'Cette offre n\'est pas annulée' } };
      }

      // Réactiver l'offre
      const { error } = await supabase
        .from('offers')
        .update({ 
          status: 'active',
          updated_at: new Date().toISOString()
        })
        .eq('id', offerId)
        .eq('author_id', user.id);

      if (error) {
        console.error('Error reactivating offer:', error);
        return { error };
      }

      await refreshOffers();
      await refreshMyOffers();

      return { error: null };
    } catch (error: any) {
      console.error('Error reactivating offer:', error);
      return { error };
    }
  };

  // Obtenir les offres disponibles (pour l'affichage)
  const getAvailableOffers = async (): Promise<Offer[]> => {
    return offers;
  };

  // Mapper les données de la DB vers le type Offer
  const mapOfferFromDB = (dbOffer: any): Offer => {
    const offerTypes: OfferType[] = dbOffer.offerTypes || (dbOffer.offer_type ? [dbOffer.offer_type as OfferType] : []);
    return {
      id: dbOffer.id,
      authorId: dbOffer.author_id,
      offerType: offerTypes[0] || (dbOffer.offer_type as OfferType), // Premier type pour rétrocompatibilité
      offerTypes: offerTypes, // Tous les types
      title: dbOffer.title,
      description: dbOffer.description,
      notes: dbOffer.notes,
      offerDate: dbOffer.offer_date,
      durationHours: dbOffer.duration_hours,
      location: dbOffer.location,
      lat: dbOffer.lat,
      lng: dbOffer.lng,
      status: dbOffer.status,
      selectedApplicationId: dbOffer.selected_application_id,
      expiresAt: dbOffer.expires_at,
      createdAt: dbOffer.created_at,
      updatedAt: dbOffer.updated_at,
      applicationCount: dbOffer.application_count || dbOffer.applicationCount || 0,
      author: dbOffer.author ? {
        id: dbOffer.author.id,
        pseudo: dbOffer.author.pseudo || 'Utilisateur',
        photo: dbOffer.author.photo || '',
        age: dbOffer.author.age || 0,
        rating: dbOffer.author.rating || 0,
        reviewCount: dbOffer.author.review_count || 0,
        description: dbOffer.author.description || '',
        gender: dbOffer.author.gender || 'male',
        isSubscribed: dbOffer.author.is_subscribed || false,
        subscriptionStatus: dbOffer.author.subscription_status || 'pending',
        lastSeen: dbOffer.author.last_seen || '',
    } : undefined,
    selectedApplication: dbOffer.selected_application ? mapApplicationFromDB(dbOffer.selected_application) : undefined,
    };
  };

  // Mapper les données de la DB vers le type OfferApplication
  const mapApplicationFromDB = (dbApplication: any): OfferApplication => ({
    id: dbApplication.id,
    offerId: dbApplication.offer_id,
    applicantId: dbApplication.applicant_id,
    message: dbApplication.message,
    status: dbApplication.status,
    rejectionMessage: dbApplication.rejection_message,
    createdAt: dbApplication.created_at,
    updatedAt: dbApplication.updated_at,
    applicant: dbApplication.applicant ? {
      id: dbApplication.applicant.id,
      pseudo: dbApplication.applicant.pseudo || 'Utilisateur',
      photo: dbApplication.applicant.photo || '',
      age: dbApplication.applicant.age || 0,
      rating: dbApplication.applicant.rating || 0,
      reviewCount: dbApplication.applicant.review_count || 0,
      description: dbApplication.applicant.description || '',
      gender: dbApplication.applicant.gender || 'male',
      isSubscribed: dbApplication.applicant.is_subscribed || false,
      subscriptionStatus: dbApplication.applicant.subscription_status || 'pending',
      lastSeen: dbApplication.applicant.last_seen || '',
    } : undefined,
  });

  // Mettre à jour une offre existante
  const updateOffer = async (
    offerId: string,
    offerTypes: OfferType[],
    title: string,
    offerDate: string,
    durationHours: number,
    description?: string,
    notes?: string,
    location?: string,
    lat?: number,
    lng?: number
  ): Promise<{ error: any; offer: Offer | null }> => {
    if (!user) {
      return { error: 'Utilisateur non connecté', offer: null };
    }

    if (!offerTypes || offerTypes.length === 0) {
      return { error: { message: 'Au moins un type d\'offre est requis' }, offer: null };
    }

    try {
      // Vérifier que l'utilisateur est bien l'auteur de l'offre
      const existingOffer = await getOfferById(offerId);
      if (!existingOffer || existingOffer.authorId !== user.id) {
        return { error: { message: 'Vous n\'êtes pas l\'auteur de cette offre' }, offer: null };
      }

      // Mettre à jour l'offre
      const { data, error } = await supabase
        .from('offers')
        .update({
          offer_type: offerTypes[0], // Premier type pour rétrocompatibilité
          title,
          description,
          notes,
          offer_date: offerDate,
          duration_hours: durationHours,
          location,
          lat,
          lng,
          updated_at: new Date().toISOString(),
        })
        .eq('id', offerId)
        .select('*')
        .single();

      if (error) {
        console.error('Error updating offer:', error);
        return { error, offer: null };
      }

      // Supprimer les anciens types et insérer les nouveaux
      const { error: deleteError } = await supabase
        .from('offer_offer_types')
        .delete()
        .eq('offer_id', offerId);

      if (deleteError) {
        console.error('Error deleting old offer types:', deleteError);
        return { error: deleteError, offer: null };
      }

      const typeInserts = offerTypes.map(type => ({
        offer_id: offerId,
        offer_type: type,
      }));

      const { error: typesError } = await supabase
        .from('offer_offer_types')
        .insert(typeInserts);

      if (typesError) {
        console.error('Error updating offer types:', typesError);
        return { error: typesError, offer: null };
      }

      console.log(`✅ Offer types updated: ${offerTypes.length} types inserted for offer ${offerId}`);

      // Charger le profil de l'auteur
      let authorProfile = null;
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, pseudo, photo, age, rating, review_count, gender')
          .eq('id', user.id)
          .single();
        
        if (profile) {
          authorProfile = {
            id: profile.id,
            pseudo: profile.pseudo || 'Utilisateur',
            photo: profile.photo || '',
            age: profile.age || 0,
            rating: parseFloat(profile.rating) || 0,
            reviewCount: profile.review_count || 0,
            gender: profile.gender || 'female',
          };
        }
      } catch (profileError) {
        console.error('Error loading author profile:', profileError);
      }

      const offer = mapOfferFromDB({ ...data, author: authorProfile, offerTypes });
      
      // Rafraîchir les offres
      await refreshMyOffers();
      await refreshOffers();

      return { error: null, offer };
    } catch (error: any) {
      console.error('Error updating offer:', error);
      return { error, offer: null };
    }
  };

  return (
    <OfferContext.Provider
      value={{
        offers,
        myOffers,
        isLoading,
        createOffer,
        getAvailableOffers,
        getOfferById,
        getOfferApplications,
        applyToOffer,
        selectApplication,
        rejectApplication,
        cancelSelectedApplication,
        cancelMyApplication,
        cancelOffer,
        deleteOffer,
        reactivateOffer,
        updateOffer,
        refreshOffers,
        refreshMyOffers,
      }}
    >
      {children}
    </OfferContext.Provider>
  );
}

export function useOffer() {
  const context = useContext(OfferContext);
  if (context === undefined) {
    throw new Error('useOffer must be used within an OfferProvider');
  }
  return context;
}

