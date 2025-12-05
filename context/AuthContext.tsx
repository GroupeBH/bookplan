import * as Location from 'expo-location';
import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { isNetworkError } from '../lib/errorUtils';
import { supabase } from '../lib/supabase';
import { User } from '../types';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  // Authentification par téléphone avec OTP interne
  sendOTP: (phone: string) => Promise<{ error: any; otpCode?: string }>;
  verifyOTP: (phone: string, token: string, pseudo?: string, lat?: number, lng?: number, password?: string, specialty?: string) => Promise<{ error: any; user: User | null }>;
  // Authentification par mot de passe
  signUpWithPassword: (phone: string, password: string, pseudo: string, age?: number, gender?: 'male' | 'female', lat?: number, lng?: number, specialty?: string) => Promise<{ error: any; user: User | null }>;
  loginWithPassword: (phone: string, password: string) => Promise<{ error: any; user: User | null }>;
  // Réinitialisation de mot de passe
  resetPassword: (phone: string) => Promise<{ error: any }>;
  // Gestion de session
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  // Mise à jour du profil
  updateUser: (userData: Partial<User>) => Promise<void>;
  // Mise à jour de la position
  updateLocation: (lat: number, lng: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Stockage temporaire des OTP (en production, utiliser Redis ou une table dédiée)
const otpStorage = new Map<string, { code: string; expiresAt: number }>();

// Générer un code OTP aléatoire à 6 chiffres
const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Stockage du mapping téléphone -> email pour pouvoir retrouver l'email lors de la connexion
const phoneToEmailMap = new Map<string, string>();

// Email par défaut pour créer les utilisateurs (en attendant la configuration OTP)
const DEFAULT_EMAIL = 'jonathantshombe@gmail.com';

// Générer un email temporaire valide basé sur le téléphone
// IMPORTANT: Cette fonction doit être DÉTERMINISTE - elle doit toujours générer le même email pour le même téléphone
// Format: {defaultEmail}+{phoneHash}@gmail.com (Gmail supporte les aliases avec +)
const generateTempEmail = (phone: string, useExisting: boolean = true): string => {
  // Normaliser le téléphone (enlever tous les caractères non numériques sauf le +)
  const normalizedPhone = phone.startsWith('+') ? phone : `+${phone}`;
  const phoneDigits = normalizedPhone.replace(/[^0-9]/g, '');
  
  // Utiliser les 8 derniers chiffres pour générer l'email de manière déterministe
  const phoneHash = phoneDigits.slice(-8); // 8 derniers chiffres
  const email = `jonathantshombe+${phoneHash}@gmail.com`;
  
  // Stocker dans la Map pour réutilisation dans la même session (optionnel)
  if (useExisting) {
    phoneToEmailMap.set(normalizedPhone, email);
    phoneToEmailMap.set(phone, email); // Stocker aussi avec le format original
  }
  
  return email;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  // Flag pour indiquer qu'on est en train de se déconnecter
  const isLoggingOutRef = React.useRef(false);

  // Vérifier l'authentification au démarrage et écouter les changements
  useEffect(() => {
    checkAuth();

    // Écouter les changements d'authentification Supabase
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.id);
      
      // Ignorer TOUS les changements d'état si on est en train de se déconnecter
      if (isLoggingOutRef.current) {
        console.log('🚪 Déconnexion en cours, ignore le changement d\'état:', event);
        return;
      }

      if (session?.user) {
        await loadUserProfile(session.user.id);
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Charger le profil utilisateur depuis Supabase
  const loadUserProfile = async (userId: string) => {
    // Ne pas charger le profil si on est en train de se déconnecter
    if (isLoggingOutRef.current) {
      console.log('🚪 Déconnexion en cours, skip loadUserProfile');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        // Gérer spécifiquement les erreurs réseau
        const isNetworkErr = isNetworkError(error) || 
                            error?.message?.includes('Network request failed') || 
                            error?.message?.includes('Failed to fetch');
        
        if (isNetworkErr) {
          console.log('⚠️ Erreur réseau lors du chargement du profil. Vérifiez votre connexion internet.');
        } else if (!isNetworkError(error)) {
          console.error('Error loading user profile:', error);
        }
        setIsAuthenticated(false);
        setUser(null);
        return;
      }

      // Vérifier à nouveau si on est toujours en train de se déconnecter
      if (isLoggingOutRef.current) {
        console.log('🚪 Déconnexion en cours pendant loadUserProfile, annulation');
        setIsAuthenticated(false);
        setUser(null);
        return;
      }

      if (data) {
        const userProfile: User = {
          id: data.id,
          pseudo: data.pseudo || 'Utilisateur',
          age: data.age || 25,
          phone: data.phone || '',
          photo: data.photo || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
          description: data.description !== null && data.description !== undefined ? data.description : '',
          specialty: data.specialty || undefined,
          rating: parseFloat(data.rating) || 0,
          reviewCount: data.review_count || 0,
          isSubscribed: data.is_subscribed || false,
          subscriptionStatus: data.subscription_status || 'pending',
          lastSeen: data.last_seen || 'En ligne',
          gender: data.gender || 'female',
          lat: data.lat ? parseFloat(data.lat) : undefined,
          lng: data.lng ? parseFloat(data.lng) : undefined,
          isAvailable: data.is_available ?? true,
          currentBookingId: data.current_booking_id,
        };
        console.log('📥 loadUserProfile - Profil chargé:', {
          id: userProfile.id,
          description: userProfile.description,
          pseudo: userProfile.pseudo,
          age: userProfile.age,
        });
        setUser(userProfile);
        setIsAuthenticated(true);
      }
    } catch (error: any) {
      // Capturer toutes les erreurs réseau, y compris les TypeError et AuthRetryableFetchError
      const isNetworkErr = isNetworkError(error) || 
                          error?.name === 'AuthRetryableFetchError' ||
                          error?.name === 'AuthPKCEGrantCodeExchangeError' ||
                          error?.message?.includes('Network request failed') || 
                          error?.message?.includes('Failed to fetch') ||
                          error?.name === 'TypeError';
      
      if (isNetworkErr) {
        console.log('⚠️ Erreur réseau lors du chargement du profil. Vérifiez votre connexion internet.');
        console.log('🔍 Type d\'erreur:', error?.name || 'Unknown');
      } else if (!isNetworkError(error)) {
        console.error('Error in loadUserProfile:', error);
      }
      setIsAuthenticated(false);
      setUser(null);
    }
  };

  const checkAuth = async () => {
    // Ne pas vérifier l'authentification si on est en train de se déconnecter
    if (isLoggingOutRef.current) {
      console.log('🚪 Déconnexion en cours, skip checkAuth');
      return;
    }

    try {
      setIsLoading(true);
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        // Gérer spécifiquement les erreurs réseau
        const isNetworkErr = isNetworkError(error) || 
                            error?.message?.includes('Network request failed') || 
                            error?.message?.includes('Failed to fetch');
        
        if (isNetworkErr) {
          console.log('⚠️ Erreur réseau lors de la vérification de session. Vérifiez votre connexion internet.');
        } else if (!isNetworkError(error)) {
          console.error('Error getting session:', error);
        }
        setIsAuthenticated(false);
        setUser(null);
        return;
      }

      // Vérifier à nouveau si on est toujours en train de se déconnecter
      if (isLoggingOutRef.current) {
        console.log('🚪 Déconnexion en cours pendant checkAuth, annulation');
        setIsAuthenticated(false);
        setUser(null);
        return;
      }

      if (session?.user) {
        await loadUserProfile(session.user.id);
      } else {
        setIsAuthenticated(false);
        setUser(null);
      }
    } catch (error: any) {
      // Capturer toutes les erreurs réseau, y compris les TypeError et AuthRetryableFetchError
      const isNetworkErr = isNetworkError(error) || 
                          error?.name === 'AuthRetryableFetchError' ||
                          error?.name === 'AuthPKCEGrantCodeExchangeError' ||
                          error?.message?.includes('Network request failed') || 
                          error?.message?.includes('Failed to fetch') ||
                          error?.name === 'TypeError';
      
      if (isNetworkErr) {
        console.log('⚠️ Erreur réseau lors de la vérification de session. Vérifiez votre connexion internet.');
        console.log('🔍 Type d\'erreur:', error?.name || 'Unknown');
      } else if (!isNetworkError(error)) {
        console.error('Error checking auth:', error);
      }
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Envoyer un code OTP (notification interne)
  const sendOTP = async (phone: string): Promise<{ error: any; otpCode?: string }> => {
    try {
      const formattedPhone = phone.startsWith('+') ? phone : `+${phone}`;
      
      // Générer un code OTP aléatoire
      const otpCode = generateOTP();
      const expiresAt = Date.now() + 10 * 60 * 1000; // Expire dans 10 minutes

      // Stocker l'OTP temporairement
      otpStorage.set(formattedPhone, { code: otpCode, expiresAt });

      // Afficher la notification interne avec l'OTP
      Alert.alert(
        'Code de vérification',
        `Votre code OTP est : ${otpCode}\n\nNuméro : ${formattedPhone}\n\n⚠️ En production, ce code sera envoyé par SMS`,
        [{ text: 'OK' }]
      );

      console.log(`📱 OTP généré pour ${formattedPhone}: ${otpCode}`);
      console.log('⚠️ En production, ce code sera envoyé par SMS via votre fournisseur OTP');

      return { error: null, otpCode };
    } catch (error) {
      console.error('Error in sendOTP:', error);
      return { error };
    }
  };

  // Stockage temporaire des OTP vérifiés (pour créer le compte plus tard avec le mot de passe)
  const verifiedOTPStorage = new Map<string, { verifiedAt: number; expiresAt: number }>();

  // Vérifier le code OTP (sans créer le compte - le compte sera créé avec le mot de passe)
  const verifyOTP = async (
    phone: string,
    token: string,
    pseudo?: string,
    lat?: number,
    lng?: number,
    password?: string, // Nouveau paramètre : mot de passe optionnel
    specialty?: string // Savoir-faire particulier
  ): Promise<{ error: any; user: User | null }> => {
    try {
      const formattedPhone = phone.startsWith('+') ? phone : `+${phone}`;

      // Si un mot de passe est fourni, cela signifie qu'on crée le compte
      // Vérifier d'abord que l'OTP a été vérifié récemment
      if (password) {
        const verifiedOTP = verifiedOTPStorage.get(formattedPhone);
        if (!verifiedOTP || verifiedOTP.expiresAt < Date.now()) {
          return { error: { message: 'Code OTP expiré ou non vérifié. Veuillez recommencer.' }, user: null };
        }
        // Supprimer l'OTP vérifié du stockage
        verifiedOTPStorage.delete(formattedPhone);
      } else {
        // Si pas de mot de passe fourni, vérifier l'OTP
        const storedOTP = otpStorage.get(formattedPhone);
        
        if (!storedOTP) {
          return { error: { message: 'Code OTP expiré ou invalide. Veuillez demander un nouveau code.' }, user: null };
        }

        if (storedOTP.expiresAt < Date.now()) {
          otpStorage.delete(formattedPhone);
          return { error: { message: 'Code OTP expiré. Veuillez demander un nouveau code.' }, user: null };
        }

        if (storedOTP.code !== token) {
          return { error: { message: 'Code OTP incorrect.' }, user: null };
        }

        // OTP valide, supprimer du stockage
        otpStorage.delete(formattedPhone);

        // Stocker que l'OTP est vérifié (valide pendant 30 minutes pour laisser le temps de remplir le formulaire)
        verifiedOTPStorage.set(formattedPhone, {
          verifiedAt: Date.now(),
          expiresAt: Date.now() + 30 * 60 * 1000, // 30 minutes
        });
        console.log('✅ OTP vérifié. Le compte sera créé avec le mot de passe saisi par l\'utilisateur.');
        // Retourner null pour indiquer que l'OTP est vérifié mais le compte n'est pas encore créé
        return { error: null, user: null };
      }

      // Vérifier si l'utilisateur existe déjà dans profiles
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('phone', formattedPhone)
        .single();

      let authUser;
      let isNewUser = false;

      if (existingProfile) {
        // Utilisateur existant - récupérer la session ou se connecter
        // On va utiliser signInWithPassword avec un mot de passe temporaire
        // Mais d'abord, vérifier si on a une session active
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user && session.user.id === existingProfile.id) {
          // Session active, utiliser cet utilisateur
          authUser = session.user;
        } else {
          // Utilisateur existant dans profiles mais pas de session
          // On ne peut pas créer un nouveau compte, l'utilisateur doit se connecter avec son mot de passe
          return { error: { message: 'Ce numéro de téléphone est déjà enregistré. Veuillez vous connecter avec votre mot de passe ou utiliser "Mot de passe oublié" si vous ne vous en souvenez plus.' }, user: null };
        }
      } else {
        // Nouvel utilisateur - créer dans Supabase Auth avec le mot de passe saisi par l'utilisateur
        const tempEmail = generateTempEmail(formattedPhone);

        console.log('\n🔐 ========== CRÉATION COMPTE VIA OTP ==========');
        console.log('📱 Téléphone:', formattedPhone);
        console.log('📧 Email temporaire:', tempEmail);
        console.log('🔑 Mot de passe: *** (fourni par l\'utilisateur)');
        console.log('💾 Stockage: auth.users.encrypted_password (hashé par Supabase)');
        console.log('===============================================\n');

        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: tempEmail,
          password: password, // Utiliser le mot de passe saisi par l'utilisateur
          options: {
            data: {
              pseudo: pseudo || 'Utilisateur',
              phone: formattedPhone,
            },
            emailRedirectTo: undefined, // Pas de redirection email
          },
        });

        if (signUpError) {
          if (!isNetworkError(signUpError)) {
            console.error('Error creating user:', signUpError);
          }
          // Si l'utilisateur existe déjà avec cet email, essayer de se connecter
          if (signUpError.message.includes('already registered') || signUpError.message.includes('User already registered')) {
            console.log('⚠️ Utilisateur déjà enregistré, tentative de connexion avec le mot de passe fourni...');
            const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
              email: tempEmail,
              password: password,
            });

            if (signInError) {
              // L'email existe mais pas le bon mot de passe
              console.log('❌ Connexion échouée:', signInError.message);
              return { error: { message: 'Un compte existe déjà avec ce numéro. Veuillez vous connecter avec votre mot de passe.' }, user: null };
            }
            authUser = signInData?.user;
            console.log('✅ Connexion réussie avec le compte existant');

            // S'assurer que le profil existe pour cet utilisateur existant
            if (authUser?.id) {
              try {
                const { data: existingProfile } = await supabase
                  .from('profiles')
                  .select('id')
                  .eq('id', authUser.id)
                  .single();

                if (!existingProfile) {
                  console.log('⚠️ Le profil n\'existe pas pour cet utilisateur existant, création...');
                  // Essayer d'utiliser la fonction ensure_profile_exists si elle existe
                  const { error: ensureError } = await supabase.rpc('ensure_profile_exists', {
                    p_user_id: authUser.id,
                  });

                  if (ensureError) {
                    // Si la fonction n'existe pas ou échoue, créer le profil manuellement
                    console.log('⚠️ Fonction ensure_profile_exists non disponible, création directe...');
                    const { error: insertError } = await supabase
                      .from('profiles')
                      .insert({
                        id: authUser.id,
                        phone: formattedPhone,
                        pseudo: pseudo || 'Utilisateur',
                      });

                    if (insertError) {
                      console.error('❌ Erreur lors de la création manuelle du profil:', insertError);
                    } else {
                      console.log('✅ Profil créé manuellement pour l\'utilisateur existant');
                    }
                  } else {
                    console.log('✅ Profil créé via ensure_profile_exists pour l\'utilisateur existant');
                  }
                }
              } catch (error) {
                console.error('❌ Erreur lors de la vérification/création du profil:', error);
              }
            }
          } else {
            return { error: signUpError, user: null };
          }
        } else {
          authUser = signUpData?.user;
          console.log('✅ Compte créé avec succès. User ID:', authUser?.id);
          console.log('🔑 Mot de passe fourni lors de la création:', password ? 'OUI (***)' : 'NON');
          
          // Vérifier que le mot de passe a bien été stocké
          if (authUser?.id) {
            try {
              // Attendre un peu pour que Supabase traite la création
              await new Promise(resolve => setTimeout(resolve, 500));
              
              const { data: userInfo, error: userInfoError } = await supabase.rpc('verify_user_info', {
                p_user_id: authUser.id,
              });
              
              if (!userInfoError && userInfo && userInfo.length > 0) {
                console.log('🔍 Vérification du mot de passe stocké:', {
                  has_password: userInfo[0].has_password,
                  email: userInfo[0].email,
                  confirmed_at: userInfo[0].confirmed_at
                });
                
                if (!userInfo[0].has_password) {
                  console.error('❌ ERREUR: Le mot de passe n\'a PAS été stocké lors de la création du compte!');
                  console.error('💡 Cela peut arriver si Supabase a des restrictions sur les emails non vérifiés.');
                } else {
                  console.log('✅ Le mot de passe a bien été stocké dans auth.users');
                }
              }
            } catch (error) {
              console.warn('⚠️ Erreur lors de la vérification du mot de passe:', error);
            }
          }
          
          // Marquer l'email comme vérifié automatiquement (car c'est un email temporaire)
          if (authUser?.id) {
            try {
              const { error: verifyError } = await supabase.rpc('verify_user_email', {
                p_user_id: authUser.id,
              });
              if (verifyError) {
                console.warn('⚠️ Impossible de marquer l\'email comme vérifié:', verifyError);
                // Ne pas bloquer la création du compte si cette étape échoue
              } else {
                console.log('✅ Email marqué comme vérifié automatiquement');
              }
            } catch (error) {
              console.warn('⚠️ Erreur lors de la vérification de l\'email:', error);
              // Ne pas bloquer la création du compte si cette étape échoue
            }

            // S'assurer que le profil existe (au cas où le trigger n'a pas fonctionné)
            try {
              const { data: existingProfile } = await supabase
                .from('profiles')
                .select('id')
                .eq('id', authUser.id)
                .single();

              if (!existingProfile) {
                console.log('⚠️ Le profil n\'existe pas, création manuelle...');
                // Essayer d'utiliser la fonction ensure_profile_exists si elle existe
                const { error: ensureError } = await supabase.rpc('ensure_profile_exists', {
                  p_user_id: authUser.id,
                });

                if (ensureError) {
                  // Si la fonction n'existe pas ou échoue, créer le profil manuellement
                  console.log('⚠️ Fonction ensure_profile_exists non disponible, création directe...');
                  const { error: insertError } = await supabase
                    .from('profiles')
                    .insert({
                      id: authUser.id,
                      phone: formattedPhone,
                      pseudo: pseudo || 'Utilisateur',
                    });

                  if (insertError) {
                    console.error('❌ Erreur lors de la création manuelle du profil:', insertError);
                  } else {
                    console.log('✅ Profil créé manuellement avec succès');
                  }
                } else {
                  console.log('✅ Profil créé via ensure_profile_exists');
                }
              } else {
                console.log('✅ Le profil existe déjà');
              }
            } catch (error) {
              console.error('❌ Erreur lors de la vérification/création du profil:', error);
            }
          }
        }
        isNewUser = true;
      }

      if (!authUser) {
        return { error: { message: 'Impossible de créer ou récupérer l\'utilisateur' }, user: null };
      }

      // Obtenir la position actuelle si non fournie
      let userLat = lat;
      let userLng = lng;

      if (!userLat || !userLng) {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            const location = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            userLat = location.coords.latitude;
            userLng = location.coords.longitude;
          } else {
            // Position par défaut (Kinshasa) si permission refusée
            userLat = -4.3276;
            userLng = 15.3136;
          }
        } catch (error: any) {
          if (!isNetworkError(error)) {
            console.error('Error getting location:', error);
          }
          userLat = -4.3276;
          userLng = 15.3136;
        }
      }

      // Créer ou mettre à jour le profil
      const profileData: any = {
        id: authUser.id,
        phone: formattedPhone,
        pseudo: pseudo || authUser.user_metadata?.pseudo || 'Utilisateur',
        age: 25,
        photo: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
        description: '',
        rating: 0,
        review_count: 0,
        is_subscribed: false,
        subscription_status: 'pending',
        gender: 'female',
        lat: userLat,
        lng: userLng,
        is_available: true,
        updated_at: new Date().toISOString(),
      };

      if (isNewUser) {
        profileData.created_at = new Date().toISOString();
      }

      // Utiliser la fonction RPC upsert_profile qui bypass RLS
      // Cette fonction est nécessaire car juste après signUp, la session
      // peut ne pas être complètement établie pour que auth.uid() fonctionne
      const { error: profileError } = await supabase.rpc('upsert_profile', {
        p_id: authUser.id,
        p_phone: formattedPhone,
        p_pseudo: pseudo || authUser.user_metadata?.pseudo || 'Utilisateur',
        p_age: 25,
        p_photo: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
        p_description: '',
        p_rating: 0,
        p_review_count: 0,
        p_is_subscribed: false,
        p_subscription_status: 'pending',
        p_gender: 'female',
        p_lat: userLat,
        p_lng: userLng,
        p_is_available: true,
        p_specialty: specialty || null,
      });

      if (profileError) {
        if (!isNetworkError(profileError)) {
          console.error('Error creating/updating profile:', profileError);
        }
        return { error: profileError, user: null };
      }

      // Charger le profil créé
      await loadUserProfile(authUser.id);
      return { error: null, user: user };
    } catch (error: any) {
      // Gérer spécifiquement les erreurs réseau Supabase
      const isNetworkErr = isNetworkError(error) || 
                          error?.name === 'AuthRetryableFetchError' ||
                          error?.name === 'AuthPKCEGrantCodeExchangeError';
      
      if (isNetworkErr) {
        console.log('⚠️ Erreur réseau lors de la vérification OTP. Vérifiez votre connexion internet.');
        return { error: { message: 'Erreur de connexion. Vérifiez votre connexion internet et réessayez.' }, user: null };
      } else if (!isNetworkError(error)) {
        console.error('Error in verifyOTP:', error);
      }
      return { error, user: null };
    }
  };

  // Inscription avec mot de passe
  const signUpWithPassword = async (
    phone: string,
    password: string,
    pseudo: string,
    age?: number,
    gender?: 'male' | 'female',
    lat?: number,
    lng?: number,
    specialty?: string
  ): Promise<{ error: any; user: User | null }> => {
    try {
      const formattedPhone = phone.startsWith('+') ? phone : `+${phone}`;

      // Obtenir la position actuelle si non fournie
      let userLat = lat;
      let userLng = lng;

      if (!userLat || !userLng) {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            const location = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            userLat = location.coords.latitude;
            userLng = location.coords.longitude;
          } else {
            userLat = -4.3276;
            userLng = 15.3136;
          }
        } catch (error: any) {
          if (!isNetworkError(error)) {
            console.error('Error getting location:', error);
          }
          userLat = -4.3276;
          userLng = 15.3136;
        }
      }

      // Créer un email temporaire basé sur le téléphone pour Supabase Auth
      // (car les inscriptions par téléphone peuvent être désactivées)
      const tempEmail = generateTempEmail(formattedPhone);

      // Créer l'utilisateur via Supabase Auth avec email
      // Important: Passer le pseudo dans les metadata pour que le trigger puisse l'utiliser
      const trimmedPseudo = pseudo.trim();
      console.log('📝 Création du compte avec pseudo:', trimmedPseudo);
      
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: tempEmail,
        password: password,
        options: {
          data: {
            pseudo: trimmedPseudo,
            phone: formattedPhone,
          },
          emailRedirectTo: undefined,
        },
      });

      // Marquer l'email comme vérifié automatiquement après la création
      if (authData?.user?.id) {
        try {
          const { error: verifyError } = await supabase.rpc('verify_user_email', {
            p_user_id: authData.user.id,
          });
          if (verifyError) {
            console.warn('⚠️ Impossible de marquer l\'email comme vérifié:', verifyError);
          } else {
            console.log('✅ Email marqué comme vérifié automatiquement');
          }
        } catch (error) {
          console.warn('⚠️ Erreur lors de la vérification de l\'email:', error);
        }

        // S'assurer que le profil existe (au cas où le trigger n'a pas fonctionné)
        try {
          const { data: existingProfile } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', authData.user.id)
            .single();

          if (!existingProfile) {
            console.log('⚠️ Le profil n\'existe pas, création manuelle...');
            // Essayer d'utiliser la fonction ensure_profile_exists si elle existe
            const { error: ensureError } = await supabase.rpc('ensure_profile_exists', {
              p_user_id: authData.user.id,
            });

            if (ensureError) {
              // Si la fonction n'existe pas ou échoue, créer le profil manuellement
              console.log('⚠️ Fonction ensure_profile_exists non disponible, création directe...');
              const { error: insertError } = await supabase
                .from('profiles')
                .insert({
                  id: authData.user.id,
                  phone: formattedPhone,
                  pseudo: trimmedPseudo,
                });

              if (insertError) {
                console.error('❌ Erreur lors de la création manuelle du profil:', insertError);
              } else {
                console.log('✅ Profil créé manuellement avec succès');
              }
            } else {
              console.log('✅ Profil créé via ensure_profile_exists');
            }
          } else {
            console.log('✅ Le profil existe déjà');
          }
        } catch (error) {
          console.error('❌ Erreur lors de la vérification/création du profil:', error);
        }
      }

      if (authError) {
        // Si l'erreur est juste un avertissement de rate limiting mais que l'utilisateur a été créé
        // (cela peut arriver si Supabase affiche un avertissement mais permet quand même l'opération)
        if (authError.message.includes('For security purposes') && authData?.user) {
          console.warn('⚠️ Avertissement de rate limiting, mais l\'utilisateur a été créé:', authError.message);
          // Continuer avec la création du profil
        } else if (authError.message.includes('already registered') || authError.message.includes('User already registered')) {
          // Si l'utilisateur existe déjà, attendre un peu pour éviter le rate limiting puis essayer de se connecter
          // Attendre 2 secondes pour éviter le rate limiting
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email: tempEmail,
            password: password,
          });

          if (signInError) {
            return { error: { message: 'Numéro de téléphone déjà enregistré ou mot de passe incorrect' }, user: null };
          }

          if (!signInData?.user) {
            return { error: { message: 'Failed to authenticate user' }, user: null };
          }

          // Utiliser la fonction RPC upsert_profile pour mettre à jour le profil
          const { error: profileError } = await supabase.rpc('upsert_profile', {
            p_id: signInData.user.id,
            p_phone: formattedPhone,
            p_pseudo: pseudo.trim(),
            p_age: age || 25,
            p_photo: null, // Pas de photo par défaut
            p_description: '',
            p_rating: 0,
            p_review_count: 0,
            p_is_subscribed: false,
            p_subscription_status: 'pending',
            p_gender: gender || 'female',
            p_lat: userLat,
            p_lng: userLng,
            p_is_available: true,
            p_specialty: null, // Le specialty sera mis à jour plus tard si nécessaire
          });

          if (profileError) {
            if (!isNetworkError(profileError)) {
              console.error('Error updating profile:', profileError);
            }
          }

          await loadUserProfile(signInData.user.id);
          return { error: null, user: user };
        }

        // Si ce n'est pas un avertissement de rate limiting avec utilisateur créé, retourner l'erreur
        if (!authError.message.includes('For security purposes') || !authData?.user) {
          return { error: authError, user: null };
        }
        // Sinon, continuer avec authData.user même si il y a un avertissement
      }

      if (!authData?.user) {
        return { error: { message: 'Failed to create user' }, user: null };
      }

      // Attendre 2 secondes pour respecter le rate limiting de Supabase
      // Le trigger crée un profil basique, on va le mettre à jour ensuite
      // Supabase limite les requêtes d'authentification à 1 par seconde par IP
      // Note: Le message d'erreur peut apparaître mais l'opération réussit généralement
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Toujours mettre à jour le profil avec le bon pseudo
      // Le trigger peut avoir créé un profil avec "Utilisateur" si les metadata n'étaient pas encore disponibles
      // On force la mise à jour pour s'assurer que le pseudo saisi par l'utilisateur est bien enregistré
      console.log('💾 Mise à jour du profil avec pseudo:', trimmedPseudo);
      
      const { error: profileError } = await supabase.rpc('upsert_profile', {
        p_id: authData.user.id,
        p_phone: formattedPhone,
        p_pseudo: trimmedPseudo, // Utiliser le pseudo saisi par l'utilisateur (toujours mettre à jour)
        p_age: age || 25,
        p_photo: null, // Pas de photo par défaut - l'utilisateur pourra l'ajouter plus tard
        p_description: '',
        p_rating: 0,
        p_review_count: 0,
        p_is_subscribed: false,
        p_subscription_status: 'pending',
        p_gender: gender || 'female',
        p_lat: userLat,
        p_lng: userLng,
        p_is_available: true,
        p_specialty: specialty || null,
      });

      if (profileError) {
        if (!isNetworkError(profileError)) {
          console.error('Error creating/updating profile:', profileError);
        }
        // Ne pas retourner d'erreur ici, le profil peut avoir été créé par le trigger
        // On va quand même charger le profil pour voir ce qui existe
      } else {
        console.log('✅ Profil créé/mis à jour avec le pseudo:', pseudo.trim());
      }

      // Charger le profil créé
      await loadUserProfile(authData.user.id);
      return { error: null, user: user };
    } catch (error: any) {
      if (!isNetworkError(error)) {
        console.error('Error in signUpWithPassword:', error);
      }
      return { error, user: null };
    }
  };

  // Connexion avec mot de passe
  const loginWithPassword = async (phone: string, password: string): Promise<{ error: any; user: User | null }> => {
    try {
      const formattedPhone = phone.startsWith('+') ? phone : `+${phone}`;

      console.log('\n🔐 ========== DÉBUT CONNEXION ==========');
      console.log('📱 Téléphone saisi (formaté):', formattedPhone);
      console.log('📱 Téléphone saisi (original):', phone);
      console.log('🔑 Mot de passe fourni:', password ? '***' : 'VIDE');
      console.log('🔑 Longueur du mot de passe:', password.length);

      // D'abord, vérifier si l'utilisateur existe dans profiles
      console.log('\n🔍 1. Vérification dans la table profiles...');
      console.log('   Recherche avec téléphone:', formattedPhone);
      console.log('   Recherche sans +:', formattedPhone.replace('+', ''));
      
      // Chercher le profil avec plusieurs formats de téléphone
      const phoneWithoutPlus = formattedPhone.replace('+', '');
      const phoneWithPlus = formattedPhone.startsWith('+') ? formattedPhone : `+${formattedPhone}`;
      
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, phone, pseudo')
        .or(`phone.eq.${formattedPhone},phone.eq.${phoneWithoutPlus},phone.eq.${phoneWithPlus}`)
        .maybeSingle();

      console.log('📊 Résultat recherche dans profiles:', { 
        profileData, 
        profileError,
        found: !!profileData 
      });

      if (profileData) {
        console.log('✅ Utilisateur trouvé dans profiles:', {
          id: profileData.id,
          phone: profileData.phone,
          pseudo: profileData.pseudo
        });
      } else {
        console.log('❌ Utilisateur NON trouvé dans profiles');
        if (profileError) {
          if (!isNetworkError(profileError)) {
            console.error('❌ Erreur lors de la recherche dans profiles:', profileError);
          }
        }
      }

      // D'abord, essayer de trouver l'email réel de l'utilisateur via la fonction RPC
      console.log('\n🔍 2. Recherche de l\'email via RPC get_user_email_by_phone...');
      console.log('   Paramètre p_phone:', formattedPhone);
      
      const { data: emailData, error: emailError } = await supabase.rpc('get_user_email_by_phone', {
        p_phone: formattedPhone,
      });
      
      console.log('📧 Résultat RPC get_user_email_by_phone:', { 
        emailData, 
        emailError,
        hasData: !!emailData,
        dataLength: emailData?.length || 0
      });

      let userEmail: string | null = null;
      let userIdFromRPC: string | null = null;

      if (!emailError && emailData && emailData.length > 0 && emailData[0]?.email) {
        userEmail = emailData[0].email;
        userIdFromRPC = emailData[0].user_id;
        console.log('✅ Email trouvé via RPC:', userEmail);
        console.log('🆔 User ID depuis RPC:', userIdFromRPC);
      } else {
        // Si la fonction RPC n'a pas fonctionné, essayer avec l'email généré
        userEmail = generateTempEmail(formattedPhone);
        console.log('⚠️ Utilisation de l\'email généré:', userEmail);
        if (emailError) {
          if (!isNetworkError(emailError)) {
            console.error('❌ Erreur RPC get_user_email_by_phone:', emailError);
          }
        }
      }

      // Si l'utilisateur existe dans profiles, essayer aussi de récupérer l'email directement
      if (profileData?.id && userEmail) {
        console.log('   Tentative de récupération directe depuis auth.users avec ID:', profileData.id);
        
        // Essayer de récupérer les informations de l'utilisateur via une fonction RPC (si elle existe)
        try {
          const { data: userInfo, error: userInfoError } = await supabase.rpc('verify_user_info', {
            p_user_id: profileData.id,
          });
          
          if (!userInfoError && userInfo && userInfo.length > 0) {
            console.log('   📋 Informations utilisateur depuis auth.users:', {
              email: userInfo[0].email,
              phone: userInfo[0].phone,
              phone_in_metadata: userInfo[0].phone_in_metadata,
              has_password: userInfo[0].has_password,
              confirmed_at: userInfo[0].confirmed_at,
            });
            
            // Si l'email trouvé est différent de celui de la RPC, utiliser celui-ci
            if (userInfo[0].email && userInfo[0].email !== userEmail) {
              console.log('   ⚠️ Email différent trouvé! RPC:', userEmail, 'vs Direct:', userInfo[0].email);
              console.log('   🔄 Utilisation de l\'email direct depuis auth.users');
              userEmail = userInfo[0].email; // Utiliser l'email direct
            }
            
            // Vérifier si le mot de passe existe
            if (!userInfo[0].has_password) {
              console.log('   ⚠️ ATTENTION: L\'utilisateur n\'a PAS de mot de passe enregistré dans auth.users!');
              console.log('   💡 Cela peut arriver si le compte a été créé sans mot de passe.');
              console.log('   💡 Solution: Utiliser "Mot de passe oublié" pour définir un mot de passe.');
              // Ne pas bloquer la connexion ici, laisser Supabase Auth gérer l'erreur
              // Le message d'erreur sera géré plus bas dans le code
            } else {
              console.log('   ✅ L\'utilisateur a un mot de passe enregistré');
            }
          } else if (userInfoError) {
            console.log('   ⚠️ Fonction verify_user_info non disponible ou erreur:', userInfoError.message);
          }
        } catch (error) {
          console.log('   ⚠️ Impossible d\'appeler verify_user_info (fonction peut-être non créée)');
        }
      }

      // S'assurer qu'on a un email valide
      if (!userEmail) {
        userEmail = generateTempEmail(formattedPhone);
        console.log('⚠️ Email final utilisé:', userEmail);
      }

      // Vérifier si l'utilisateur existe dans auth.users avec cet email
      console.log('\n🔍 3. Vérification de l\'existence dans auth.users...');
      console.log('📧 Email utilisé pour la connexion:', userEmail);
      console.log('📧 Email généré pour ce téléphone:', generateTempEmail(formattedPhone, false));
      
      // Afficher tous les emails possibles pour ce téléphone
      const phoneDigits = formattedPhone.replace(/[^0-9]/g, '');
      const phoneHash = phoneDigits.slice(-8);
      console.log('📧 Emails possibles:');
      console.log('   - jonathantshombe+' + phoneHash + '@gmail.com');
      if (phoneDigits.length >= 8) {
        console.log('   - jonathantshombe+' + phoneDigits.slice(-9) + '@gmail.com');
      }

      // Essayer de se connecter avec l'email trouvé
      console.log('\n🔐 4. Tentative de connexion avec Supabase Auth...');
      console.log('   Email utilisé:', userEmail);
      console.log('   Mot de passe fourni:', password ? '*** (longueur: ' + password.length + ')' : 'VIDE');
      
      // IMPORTANT: Vérifier si l'utilisateur existe vraiment avec cet email
      // On ne peut pas vérifier directement, mais on peut essayer de se connecter
      // Si ça échoue, c'est soit le mauvais email, soit le mauvais mot de passe
      
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: password,
      });

      console.log('📊 Résultat connexion Supabase:', {
        hasUser: !!authData?.user,
        userId: authData?.user?.id,
        userEmail: authData?.user?.email,
        error: authError ? {
          message: authError.message,
          status: authError.status,
          name: authError.name
        } : null
      });

      if (authError) {
        console.log('\n❌ 5. Échec de la connexion, analyse de l\'erreur...');
        console.log('🔍 Détails de l\'erreur:', {
          message: authError.message,
          status: authError.status,
          name: authError.name
        });

        // Si l'erreur est "email not confirmed", essayer de confirmer l'email automatiquement
        if (authError.message?.toLowerCase().includes('email not confirmed') || 
            authError.message?.toLowerCase().includes('email not verified') ||
            authError.message?.toLowerCase().includes('email_not_confirmed')) {
          console.log('📧 Email non confirmé détecté, tentative de confirmation automatique...');
          
          // Essayer de trouver l'utilisateur par téléphone pour obtenir son ID
          if (profileData?.id) {
            try {
              const { error: verifyError } = await supabase.rpc('verify_user_email', {
                p_user_id: profileData.id,
              });
              if (!verifyError) {
                console.log('✅ Email confirmé automatiquement, nouvelle tentative de connexion...');
                // Réessayer la connexion après confirmation
                const { data: retryAuthData, error: retryAuthError } = await supabase.auth.signInWithPassword({
                  email: userEmail,
                  password: password,
                });
                
                if (!retryAuthError && retryAuthData?.user) {
                  console.log('✅ Connexion réussie après confirmation de l\'email');
                  await loadUserProfile(retryAuthData.user.id);
                  console.log('========== FIN CONNEXION (SUCCÈS) ==========\n');
                  return { error: null, user: user };
                }
              } else {
                console.warn('⚠️ Impossible de confirmer l\'email:', verifyError);
              }
            } catch (error) {
              console.warn('⚠️ Erreur lors de la confirmation de l\'email:', error);
            }
          }
        }

        // Essayer plusieurs variantes d'emails possibles
        console.log('\n🔄 6. Essai avec différentes variantes d\'emails...');
        const phoneDigits = formattedPhone.replace(/[^0-9]/g, '');
        const emailVariants = [
          generateTempEmail(formattedPhone, false), // Email généré standard
          `jonathantshombe+${phoneDigits.slice(-8)}@gmail.com`, // 8 derniers chiffres
          `jonathantshombe+${phoneDigits.slice(-9)}@gmail.com`, // 9 derniers chiffres
          `jonathantshombe+${phoneDigits.slice(-10)}@gmail.com`, // 10 derniers chiffres
          `jonathantshombe+${phoneDigits}@gmail.com`, // Tous les chiffres
        ].filter((email, index, self) => self.indexOf(email) === index); // Supprimer les doublons

        console.log('📧 Variantes d\'emails à essayer:', emailVariants);

        for (const emailVariant of emailVariants) {
          if (emailVariant === userEmail) {
            console.log(`⏭️  Saut de ${emailVariant} (déjà essayé)`);
            continue;
          }

          console.log(`🔄 Essai avec: ${emailVariant}`);
          
          const { data: retryAuthData, error: retryAuthError } = await supabase.auth.signInWithPassword({
            email: emailVariant,
            password: password,
          });

          console.log('📊 Résultat:', {
            hasUser: !!retryAuthData?.user,
            error: retryAuthError ? {
              message: retryAuthError.message,
              status: retryAuthError.status
            } : null
          });

          if (!retryAuthError && retryAuthData?.user) {
            console.log('✅ Connexion réussie avec:', emailVariant);
            
            // Marquer l'email comme vérifié si ce n'est pas déjà fait
            try {
              const { error: verifyError } = await supabase.rpc('verify_user_email', {
                p_user_id: retryAuthData.user.id,
              });
              if (verifyError) {
                console.warn('⚠️ Impossible de marquer l\'email comme vérifié:', verifyError);
              } else {
                console.log('✅ Email marqué comme vérifié');
              }
            } catch (error) {
              console.warn('⚠️ Erreur lors de la vérification de l\'email:', error);
            }
            
            await loadUserProfile(retryAuthData.user.id);
            console.log('========== FIN CONNEXION (SUCCÈS) ==========\n');
            return { error: null, user: user };
          }
        }

        // Si toutes les tentatives ont échoué
        console.log('❌ 7. Toutes les tentatives ont échoué');
        console.log('========== FIN CONNEXION (ÉCHEC) ==========');
        
        // Message d'erreur plus détaillé
        let errorMessage = 'Numéro de téléphone ou mot de passe incorrect';
        
        // Si l'utilisateur existe mais que la connexion échoue, c'est probablement le mot de passe
        // Mais ne pas suggérer "mot de passe oublié" si l'utilisateur s'est inscrit avec un mot de passe
        if (profileData) {
          // Vérifier si l'utilisateur a un mot de passe en vérifiant dans auth.users
          // (on ne peut pas le faire directement, mais on peut améliorer le message)
          errorMessage = 'Mot de passe incorrect. Veuillez vérifier votre mot de passe.';
        }
        
        if (authError.message.includes('Invalid login credentials')) {
          return { error: { message: errorMessage }, user: null };
        }

        return { error: authError, user: null };
      }

      if (!authData?.user) {
        console.log('❌ Aucun utilisateur retourné par Supabase Auth');
        console.log('========== FIN CONNEXION (ÉCHEC) ==========');
        return { error: { message: 'User not found' }, user: null };
      }

      // Vérifier que le téléphone correspond
      const userPhone = authData.user.user_metadata?.phone || authData.user.phone;
      console.log('📱 8. Vérification du téléphone:', {
        phoneInMetadata: authData.user.user_metadata?.phone,
        phoneInUser: authData.user.phone,
        phoneSaisi: formattedPhone,
        match: userPhone === formattedPhone
      });
      
      if (userPhone && userPhone !== formattedPhone) {
        console.warn('⚠️ Phone mismatch:', userPhone, 'vs', formattedPhone);
      }

      console.log('✅ 9. Connexion réussie pour l\'utilisateur:', authData.user.id);
      console.log('📧 Email utilisé:', authData.user.email);

      // Marquer l'email comme vérifié si ce n'est pas déjà fait
      try {
        const { error: verifyError } = await supabase.rpc('verify_user_email', {
          p_user_id: authData.user.id,
        });
        if (verifyError) {
          console.warn('⚠️ Impossible de marquer l\'email comme vérifié:', verifyError);
        } else {
          console.log('✅ Email marqué comme vérifié');
        }
      } catch (error) {
        console.warn('⚠️ Erreur lors de la vérification de l\'email:', error);
      }

      // S'assurer que le profil existe (au cas où il n'a pas été créé par le trigger)
      if (authData.user.id) {
        try {
          const { data: existingProfile } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', authData.user.id)
            .single();

          if (!existingProfile) {
            console.log('⚠️ Le profil n\'existe pas pour cet utilisateur, création...');
            // Essayer d'utiliser la fonction ensure_profile_exists si elle existe
            const { error: ensureError } = await supabase.rpc('ensure_profile_exists', {
              p_user_id: authData.user.id,
            });

            if (ensureError) {
              // Si la fonction n'existe pas ou échoue, créer le profil manuellement
              console.log('⚠️ Fonction ensure_profile_exists non disponible, création directe...');
              const userPhone = authData.user.user_metadata?.phone || authData.user.phone || formattedPhone;
              const userPseudo = authData.user.user_metadata?.pseudo || 'Utilisateur';
              
              const { error: insertError } = await supabase
                .from('profiles')
                .insert({
                  id: authData.user.id,
                  phone: userPhone,
                  pseudo: userPseudo,
                });

              if (insertError) {
                console.error('❌ Erreur lors de la création manuelle du profil:', insertError);
              } else {
                console.log('✅ Profil créé manuellement avec succès');
              }
            } else {
              console.log('✅ Profil créé via ensure_profile_exists');
            }
          }
        } catch (error) {
          console.error('❌ Erreur lors de la vérification/création du profil:', error);
        }
      }

      // Charger le profil utilisateur
      console.log('🔄 10. Chargement du profil utilisateur...');
      await loadUserProfile(authData.user.id);
      console.log('========== FIN CONNEXION (SUCCÈS) ==========');
      return { error: null, user: user };
    } catch (error: any) {
      // Gérer spécifiquement les erreurs réseau Supabase
      const isNetworkErr = isNetworkError(error) || 
                          error?.name === 'AuthRetryableFetchError' ||
                          error?.name === 'AuthPKCEGrantCodeExchangeError';
      
      if (isNetworkErr) {
        console.log('⚠️ Erreur réseau lors de la connexion. Vérifiez votre connexion internet.');
        return { error: { message: 'Erreur de connexion. Vérifiez votre connexion internet et réessayez.' }, user: null };
      } else if (!isNetworkError(error)) {
        console.error('❌ Error in loginWithPassword:', error);
      }
      return { error, user: null };
    }
  };

  // Mettre à jour le profil utilisateur dans Supabase
  const updateUserProfile = async (userData: Partial<User>) => {
    try {
      // Obtenir l'ID de l'utilisateur depuis la session ou l'état local
      let userId: string | null = null;
      
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        userId = session.user.id;
      } else if (user?.id) {
        // Utiliser l'ID de l'état local si la session n'est pas encore disponible
        userId = user.id;
      }

      if (!userId) {
        console.warn('❌ No user ID available for profile update');
        throw new Error('No user ID available for profile update');
      }

      // Préparer les paramètres pour la fonction RPC
      const rpcParams = {
        p_id: userId,
        p_phone: userData.phone !== undefined ? userData.phone : (user?.phone || ''),
        p_pseudo: userData.pseudo !== undefined ? userData.pseudo : (user?.pseudo || 'Utilisateur'),
        p_age: userData.age !== undefined ? userData.age : (user?.age || 25),
        p_photo: userData.photo !== undefined ? userData.photo : (user?.photo || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400'),
        p_description: userData.description !== undefined ? userData.description : (user?.description || ''),
        p_rating: userData.rating !== undefined ? userData.rating : (user?.rating || 0),
        p_review_count: userData.reviewCount !== undefined ? userData.reviewCount : (user?.reviewCount || 0),
        p_is_subscribed: userData.isSubscribed !== undefined ? userData.isSubscribed : (user?.isSubscribed || false),
        p_subscription_status: userData.subscriptionStatus !== undefined ? userData.subscriptionStatus : (user?.subscriptionStatus || 'pending'),
        p_gender: userData.gender !== undefined ? userData.gender : (user?.gender || 'female'),
        p_lat: userData.lat !== undefined ? userData.lat : (user?.lat || null),
        p_lng: userData.lng !== undefined ? userData.lng : (user?.lng || null),
        p_is_available: userData.isAvailable !== undefined ? userData.isAvailable : (user?.isAvailable !== false),
        p_specialty: userData.specialty !== undefined ? userData.specialty : (user?.specialty || null),
      };

      console.log('💾 updateUserProfile - Paramètres envoyés:', {
        userId,
        description: rpcParams.p_description,
        pseudo: rpcParams.p_pseudo,
        age: rpcParams.p_age,
        hasDescription: userData.description !== undefined,
        descriptionValue: userData.description,
        currentUserDescription: user?.description,
        rpcParams: JSON.stringify(rpcParams, null, 2),
      });

      // Utiliser la fonction RPC upsert_profile qui bypass RLS
      const { data, error } = await supabase.rpc('upsert_profile', rpcParams);

      if (error) {
        console.error('❌ Error updating profile via RPC:', error);
        if (!isNetworkError(error)) {
          console.error('Error details:', JSON.stringify(error, null, 2));
        }
        
        // Fallback: Essayer une mise à jour directe si la RPC échoue
        console.log('🔄 Tentative de mise à jour directe en fallback...');
        const updateData: any = {};
        if (userData.pseudo !== undefined) updateData.pseudo = userData.pseudo;
        if (userData.age !== undefined) updateData.age = userData.age;
        if (userData.description !== undefined) updateData.description = userData.description;
        if (userData.photo !== undefined) updateData.photo = userData.photo;
        if (userData.gender !== undefined) updateData.gender = userData.gender;
        
        const { error: updateError } = await supabase
          .from('profiles')
          .update(updateData)
          .eq('id', userId);
        
        if (updateError) {
          console.error('❌ Error updating profile directly:', updateError);
          throw updateError;
        }
        
        console.log('✅ updateUserProfile - Direct update successful (fallback)');
        return;
      }

      console.log('✅ updateUserProfile - RPC call successful');
      
      // Vérifier que la mise à jour a bien été effectuée
      const { data: verifyData, error: verifyError } = await supabase
        .from('profiles')
        .select('description, pseudo, age')
        .eq('id', userId)
        .single();
      
      if (!verifyError && verifyData) {
        console.log('✅ updateUserProfile - Vérification après mise à jour:', {
          description: verifyData.description,
          pseudo: verifyData.pseudo,
          age: verifyData.age,
        });
      }
    } catch (error: any) {
      console.error('❌ Error in updateUserProfile:', error);
      if (!isNetworkError(error)) {
        console.error('Error details:', JSON.stringify(error, null, 2));
      }
      throw error;
    }
  };

  // Flag pour éviter les mises à jour en boucle
  const isUpdatingRef = React.useRef(false);

  // Mettre à jour l'utilisateur
  const updateUser = async (userData: Partial<User>) => {
    // Vérifier qu'on est toujours authentifié
    if (!isAuthenticated) {
      console.log('⚠️ Tentative de mise à jour du profil sans être authentifié, ignorée');
      return;
    }

    // Éviter les mises à jour en boucle
    if (isUpdatingRef.current) {
      console.log('⚠️ Mise à jour déjà en cours, ignorée');
      return;
    }

    try {
      isUpdatingRef.current = true;

      // Obtenir l'ID de l'utilisateur
      let userId: string | null = null;
      
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        userId = session.user.id;
      } else if (user?.id) {
        userId = user.id;
      }

      if (!userId) {
        throw new Error('No user ID available for profile update');
      }

      // Mettre à jour dans Supabase (updateUserProfile gère maintenant le cas où la session n'est pas disponible)
      console.log('🔄 updateUser - Appel de updateUserProfile avec:', userData);
      await updateUserProfile(userData);
      console.log('✅ updateUser - updateUserProfile terminé');
      
      // Attendre un peu pour s'assurer que la mise à jour est bien propagée
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Recharger le profil depuis Supabase pour s'assurer que les données sont synchronisées
      // Mais seulement si on est toujours authentifié
      if (isAuthenticated) {
        console.log('🔄 updateUser - Rechargement du profil depuis Supabase...');
        await loadUserProfile(userId);
        
        // Vérifier que les données ont bien été mises à jour
        const { data: { session: newSession } } = await supabase.auth.getSession();
        if (newSession?.user) {
          const { data: updatedProfile } = await supabase
            .from('profiles')
            .select('description, pseudo, age')
            .eq('id', userId)
            .single();
          
          console.log('✅ updateUser - Profil rechargé depuis Supabase:', {
            description: updatedProfile?.description,
            pseudo: updatedProfile?.pseudo,
            age: updatedProfile?.age,
          });
        }
      }
    } catch (error: any) {
      if (!isNetworkError(error)) {
        console.error('Error updating user:', error);
      }
      throw error; // Lancer l'erreur pour que l'UI puisse la gérer
    } finally {
      isUpdatingRef.current = false;
    }
  };

  // Mettre à jour la position de l'utilisateur
  const updateLocation = async (lat: number, lng: number) => {
    try {
      await updateUser({ lat, lng });
    } catch (error: any) {
      if (!isNetworkError(error)) {
        console.error('Error updating location:', error);
      }
    }
  };

  // Réinitialiser le mot de passe
  const resetPassword = async (phone: string): Promise<{ error: any }> => {
    try {
      const formattedPhone = phone.startsWith('+') ? phone : `+${phone}`;

      // Trouver l'email associé au téléphone
      const { data: emailData, error: emailError } = await supabase.rpc('get_user_email_by_phone', {
        p_phone: formattedPhone,
      });

      if (emailError || !emailData || emailData.length === 0 || !emailData[0]?.email) {
        return { error: { message: 'Aucun compte trouvé avec ce numéro de téléphone' } };
      }

      const userEmail = emailData[0].email;

      // Envoyer l'email de réinitialisation de mot de passe
      const { error } = await supabase.auth.resetPasswordForEmail(userEmail, {
        redirectTo: undefined, // Pas de redirection web
      });

      if (error) {
        if (!isNetworkError(error)) {
          console.error('Error resetting password:', error);
        }
        return { error };
      }

      // Afficher une notification interne (en développement)
      Alert.alert(
        'Email envoyé',
        `Un email de réinitialisation de mot de passe a été envoyé à ${userEmail}.\n\n⚠️ En production, cet email sera envoyé automatiquement.`,
        [{ text: 'OK' }]
      );

      return { error: null };
    } catch (error: any) {
      if (!isNetworkError(error)) {
        console.error('Error in resetPassword:', error);
      }
      return { error };
    }
  };

  // Logout
  const logout = async () => {
    try {
      console.log('🚪 Déconnexion en cours...');
      
      // Marquer qu'on est en train de se déconnecter (AVANT toute autre opération)
      isLoggingOutRef.current = true;
      
      // Arrêter les mises à jour en cours
      isUpdatingRef.current = true;
      
      // D'abord, mettre à jour l'état local pour déclencher les redirections
      setUser(null);
      setIsAuthenticated(false);
      
      // Vérifier que la session est bien supprimée
      const { data: { session: sessionBefore } } = await supabase.auth.getSession();
      console.log('📋 Session avant déconnexion:', sessionBefore?.user?.id || 'Aucune');
      
      // Ensuite, signer out de Supabase
      const { error } = await supabase.auth.signOut();
      if (error) {
        if (!isNetworkError(error)) {
          console.error('Error signing out:', error);
        }
        // Même en cas d'erreur, on garde l'état local à false
        // pour forcer la redirection vers la page d'authentification
        throw error;
      }
      
      // Vérifier que la session est bien supprimée après signOut
      const { data: { session: sessionAfter } } = await supabase.auth.getSession();
      console.log('📋 Session après déconnexion:', sessionAfter?.user?.id || 'Aucune');
      
      if (sessionAfter?.user) {
        console.warn('⚠️ La session existe encore après signOut, forcer la suppression');
        // Forcer la suppression de l'état
        setUser(null);
        setIsAuthenticated(false);
      }
      
      // Réinitialiser les flags après un délai plus long pour s'assurer que tout est nettoyé
      setTimeout(() => {
        isUpdatingRef.current = false;
        // Garder isLoggingOutRef à true plus longtemps pour éviter les rechargements
        setTimeout(() => {
          isLoggingOutRef.current = false;
          console.log('✅ Flags de déconnexion réinitialisés');
        }, 3000);
      }, 1000);
      
      console.log('✅ Déconnexion réussie');
    } catch (error: any) {
      if (!isNetworkError(error)) {
        console.error('Error logging out:', error);
      }
      // S'assurer que l'état est bien à false même en cas d'erreur
      setUser(null);
      setIsAuthenticated(false);
      // Réinitialiser les flags après un délai
      setTimeout(() => {
        isUpdatingRef.current = false;
        isLoggingOutRef.current = false;
      }, 3000);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        user,
        sendOTP,
        verifyOTP,
        signUpWithPassword,
        loginWithPassword,
        resetPassword,
        logout,
        checkAuth,
        updateUser,
        updateLocation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
