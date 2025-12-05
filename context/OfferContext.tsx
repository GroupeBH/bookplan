import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { Offer, OfferApplication, OfferType } from '../types';
import { useAuth } from './AuthContext';
import { isNetworkError } from '../lib/errorUtils';
import { sendPushNotification } from '../lib/pushNotifications';

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
    offerType: OfferType,
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
  cancelOffer: (offerId: string, cancellationMessage?: string) => Promise<{ error: any }>;
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
      const { data, error } = await supabase
        .from('offers')
        .select('*')
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) {
        if (error.code === 'PGRST116' || error.code === '42P01') {
          console.log('⚠️ Table offers n\'existe pas encore');
          setOffers([]);
        } else if (isNetworkError(error)) {
          console.log('⚠️ Erreur réseau lors du chargement des offres');
          setOffers([]);
        } else {
          console.error('Error fetching offers:', error);
        }
        return;
      }

      if (data) {
        // Charger les profils des auteurs et compter les candidatures
        const offersWithCounts = await Promise.all(
          data.map(async (offer) => {
            // Charger le profil de l'auteur
            let authorProfile = null;
            try {
              const { data: profile } = await supabase
                .from('profiles')
                .select('id, pseudo, photo, age, rating, review_count')
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
                };
              }
            } catch (profileError) {
              console.error('Error loading author profile:', profileError);
            }

            // Compter les candidatures
            const { count } = await supabase
              .from('offer_applications')
              .select('*', { count: 'exact', head: true })
              .eq('offer_id', offer.id);
            
            return {
              ...mapOfferFromDB({ ...offer, author: authorProfile }),
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
                .select('id, pseudo, photo, age, rating, review_count')
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
                };
              }
            } catch (profileError) {
              console.error('Error loading author profile:', profileError);
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

            return {
              ...offer,
              author: authorProfile,
              selected_application: selectedApplication,
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

  // Créer une offre
  const createOffer = async (
    offerType: OfferType,
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

    try {
      const { data, error } = await supabase
        .from('offers')
        .insert({
          author_id: user.id,
          offer_type: offerType,
          title,
          description,
          notes,
          offer_date: offerDate,
          duration_hours: durationHours,
          location,
          lat,
          lng,
        })
        .select('*')
        .single();

      if (error) {
        console.error('Error creating offer:', error);
        return { error, offer: null };
      }

      // Charger le profil de l'auteur
      let authorProfile = null;
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, pseudo, photo, age, rating, review_count')
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
          };
        }
      } catch (profileError) {
        console.error('Error loading author profile:', profileError);
      }

      const offer = mapOfferFromDB({ ...data, author: authorProfile });
      
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

          for (const profile of availableUsers) {
            await sendPushNotification({
              userId: profile.id,
              title: 'Nouvelle offre disponible',
              body: `${user.pseudo} propose ${offerTypeLabels[offerType]}: ${title}`,
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
            .select('id, pseudo, photo, age, rating, review_count, description')
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
            };
          }
        } catch (profileError) {
          console.error('Error loading author profile:', profileError);
        }
      }

      return mapOfferFromDB({ ...data, author: authorProfile });
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
          await sendPushNotification({
            userId: offer.authorId,
            title: 'Nouvelle candidature',
            body: `${user.pseudo} a candidaté à votre offre "${offer.title}"`,
            data: { type: 'offer_application', offerId, applicationId: application.id },
          });
        }
      } catch (notifError) {
        console.error('Error sending push notification:', notifError);
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

      // Envoyer une notification au candidat sélectionné
      try {
        const application = await supabase
          .from('offer_applications')
          .select('applicant_id')
          .eq('id', applicationId)
          .single();

        if (application.data?.applicant_id) {
          const offer = await getOfferById(offerId);
          await sendPushNotification({
            userId: application.data.applicant_id,
            title: 'Candidature acceptée',
            body: `Votre candidature pour "${offer?.title}" a été acceptée !`,
            data: { type: 'offer_application_selected', offerId, applicationId },
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

      // Envoyer une notification au candidat rejeté
      try {
        const application = await supabase
          .from('offer_applications')
          .select('applicant_id, offer_id')
          .eq('id', applicationId)
          .single();

        if (application.data?.applicant_id) {
          const offer = await getOfferById(application.data.offer_id);
          await sendPushNotification({
            userId: application.data.applicant_id,
            title: 'Candidature refusée',
            body: `Votre candidature pour "${offer?.title}" a été refusée.`,
            data: { type: 'offer_application_rejected', offerId: application.data.offer_id, applicationId },
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

  // Obtenir les offres disponibles (pour l'affichage)
  const getAvailableOffers = async (): Promise<Offer[]> => {
    return offers;
  };

  // Mapper les données de la DB vers le type Offer
  const mapOfferFromDB = (dbOffer: any): Offer => ({
    id: dbOffer.id,
    authorId: dbOffer.author_id,
    offerType: dbOffer.offer_type,
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
  });

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
        cancelOffer,
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

