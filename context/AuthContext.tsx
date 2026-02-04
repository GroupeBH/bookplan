import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { getDefaultProfileImage } from '../lib/defaultImages';
import { isNetworkError } from '../lib/errorUtils';
import { supabase } from '../lib/supabase';
import { User } from '../types';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  // Authentification par téléphone avec OTP interne
  sendOTP: (phone: string) => Promise<{ error: any; otpCode?: string }>;
  verifyOTP: (phone: string, token: string, pseudo?: string, lat?: number, lng?: number, password?: string, specialty?: string, gender?: 'male' | 'female', age?: number) => Promise<{ error: any; user: User | null }>;
  verifyOTPSimple: (phone: string, token: string) => Promise<{ error: any }>;
  markOTPAsVerified: (phone: string) => void; // Marquer l'OTP comme vérifié (pour API externe)
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
  updateUserProfile: (userData: Partial<User>) => Promise<void>;
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
        // Vérifier que l'utilisateur existe toujours
        const { data: authUser, error: getUserError } = await supabase.auth.getUser();
        
        if (getUserError || !authUser?.user) {
          console.log('🚪 L\'utilisateur n\'existe plus dans auth.users, déconnexion automatique...');
          // Arrêter le suivi de localisation
          const { LocationService } = await import('../lib/locationService');
          LocationService.stopBackgroundTracking();
          // Nettoyer le cache
          try {
            await AsyncStorage.removeItem('auth_session');
            await AsyncStorage.removeItem(`user_profile_${session.user.id}`);
          } catch (cacheError) {
            console.log('⚠️ Erreur lors du nettoyage du cache:', cacheError);
          }
          // Déconnecter l'utilisateur
          setUser(null);
          setIsAuthenticated(false);
          await supabase.auth.signOut();
        } else {
          await loadUserProfile(session.user.id);
          // Ne pas démarrer automatiquement le LocationService ici
          // Il sera démarré uniquement sur le dashboard via useFocusEffect
          // Cela évite que les icônes de direction s'actualisent en boucle sur tous les onglets
        }
      } else {
        // Arrêter le suivi de localisation lors de la déconnexion
        const { LocationService } = await import('../lib/locationService');
        LocationService.stopBackgroundTracking();
        setUser(null);
        setIsAuthenticated(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Charger le profil utilisateur depuis le cache ou Supabase
  const loadUserProfile = async (userId: string, useCache: boolean = true) => {
    // Ne pas charger le profil si on est en train de se déconnecter
    if (isLoggingOutRef.current) {
      console.log('🚪 Déconnexion en cours, skip loadUserProfile');
      return;
    }

    // Charger depuis le cache d'abord pour un affichage immédiat
    if (useCache) {
      try {
        const cachedUser = await AsyncStorage.getItem(`user_profile_${userId}`);
        if (cachedUser) {
          const userProfile: User = JSON.parse(cachedUser);
          console.log('📦 Profil chargé depuis le cache');
          setUser(userProfile);
          setIsAuthenticated(true);
          // Continuer pour mettre à jour en arrière-plan
        }
      } catch (cacheError) {
        console.log('⚠️ Erreur lors du chargement du cache:', cacheError);
      }
    }

    try {
      // Timeout de 3 secondes pour les requêtes réseau au démarrage (réduit pour connexions lentes)
      const profilePromise = supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 3000)
      );

      let profileResult: any;
      try {
        profileResult = await Promise.race([profilePromise, timeoutPromise]);
      } catch (timeoutError: any) {
        // En cas de timeout, si on a déjà le cache, on continue avec le cache
        if (useCache && user) {
          console.log('⏱️ Timeout lors du chargement du profil, utilisation du cache existant');
          return; // Le cache est déjà chargé, on continue
        }
        console.log('⏱️ Timeout lors du chargement du profil et pas de cache disponible');
        // Ne pas changer l'état si on a déjà un utilisateur en cache
        if (!user) {
          setIsAuthenticated(false);
          setUser(null);
        }
        return;
      }

      const { data, error } = profileResult;

      if (error) {
        // Gérer spécifiquement l'erreur "profil n'existe pas" (PGRST116)
        if (error?.code === 'PGRST116' || error?.message?.includes('result contains 0 rows')) {
          console.log('⚠️ Le profil n\'existe pas, vérification de l\'utilisateur...');
          
          try {
            // Récupérer les informations de l'utilisateur depuis auth.users
            const { data: authUser, error: getUserError } = await supabase.auth.getUser();
            
            // Si l'utilisateur n'existe plus dans auth.users, déconnecter
            if (getUserError || !authUser?.user) {
              console.log('🚪 L\'utilisateur n\'existe plus dans auth.users, déconnexion automatique...');
              // Nettoyer le cache
              try {
                await AsyncStorage.removeItem('auth_session');
                await AsyncStorage.removeItem(`user_profile_${userId}`);
              } catch (cacheError) {
                console.log('⚠️ Erreur lors du nettoyage du cache:', cacheError);
              }
              // Déconnecter l'utilisateur
              setUser(null);
              setIsAuthenticated(false);
              // Signaler à Supabase que la session est invalide
              await supabase.auth.signOut();
              return;
            }
            
            // Si l'utilisateur existe mais pas le profil, créer le profil
            if (authUser?.user) {
              console.log('⚠️ L\'utilisateur existe mais pas le profil, création automatique...');
              // Essayer d'utiliser la fonction ensure_profile_exists
              const { error: ensureError } = await supabase.rpc('ensure_profile_exists', {
                p_user_id: userId,
              });

              if (ensureError) {
                // Si la fonction n'existe pas ou échoue, créer le profil manuellement
                console.log('⚠️ Fonction ensure_profile_exists non disponible, création directe...');
                const userPhone = authUser.user.phone || authUser.user.user_metadata?.phone || '';
                const userPseudo = authUser.user.user_metadata?.pseudo || 
                                 authUser.user.user_metadata?.username || 
                                 authUser.user.user_metadata?.name || 
                                 'Utilisateur';
                
                const { error: insertError } = await supabase
                  .from('profiles')
                  .insert({
                    id: userId,
                    phone: userPhone,
                    pseudo: userPseudo,
                  });

                if (insertError) {
                  console.error('❌ Erreur lors de la création manuelle du profil:', insertError);
                  // Si on ne peut pas créer le profil, déconnecter
                  console.log('🚪 Impossible de créer le profil, déconnexion...');
                  try {
                    await AsyncStorage.removeItem('auth_session');
                    await AsyncStorage.removeItem(`user_profile_${userId}`);
                  } catch (cacheError) {
                    console.log('⚠️ Erreur lors du nettoyage du cache:', cacheError);
                  }
                  setUser(null);
                  setIsAuthenticated(false);
                  await supabase.auth.signOut();
                  return;
                } else {
                  console.log('✅ Profil créé manuellement avec succès, rechargement...');
                  // Recharger le profil après création
                  await loadUserProfile(userId, false);
                  return;
                }
              } else {
                console.log('✅ Profil créé via ensure_profile_exists, rechargement...');
                // Recharger le profil après création
                await loadUserProfile(userId, false);
                return;
              }
            }
          } catch (createError: any) {
            console.error('❌ Erreur lors de la vérification/création du profil:', createError);
            // En cas d'erreur, déconnecter pour éviter un état incohérent
            console.log('🚪 Erreur lors de la vérification, déconnexion...');
            try {
              await AsyncStorage.removeItem('auth_session');
              await AsyncStorage.removeItem(`user_profile_${userId}`);
            } catch (cacheError) {
              console.log('⚠️ Erreur lors du nettoyage du cache:', cacheError);
            }
            setUser(null);
            setIsAuthenticated(false);
            await supabase.auth.signOut();
            return;
          }
        }
        
        // Gérer spécifiquement les erreurs réseau
        const isNetworkErr = isNetworkError(error) || 
                            error?.message?.includes('Network request failed') || 
                            error?.message?.includes('Failed to fetch');
        
        if (isNetworkErr) {
          console.log('⚠️ Erreur réseau lors du chargement du profil. Vérifiez votre connexion internet.');
        } else if (!isNetworkError(error)) {
          console.error('Error loading user profile:', error);
        }
        // Ne pas changer l'état si on a déjà un utilisateur en cache
        if (!user) {
          setIsAuthenticated(false);
          setUser(null);
        }
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
          photo: data.photo || getDefaultProfileImage(data.gender),
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
          photo: userProfile.photo,
          photoFromDB: data.photo,
          specialty: userProfile.specialty,
          specialtyFromDB: data.specialty,
        });
        
        // Sauvegarder dans le cache
        try {
          await AsyncStorage.setItem(`user_profile_${userId}`, JSON.stringify(userProfile));
        } catch (cacheError) {
          console.log('⚠️ Erreur lors de la sauvegarde du cache:', cacheError);
        }
        
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
      
      // Vérifier d'abord le cache pour une réponse immédiate
      try {
        const cachedSession = await AsyncStorage.getItem('auth_session');
        if (cachedSession) {
          const sessionData = JSON.parse(cachedSession);
          if (sessionData?.user?.id) {
            // Charger le profil depuis le cache immédiatement
            await loadUserProfile(sessionData.user.id, true);
            // Continuer pour vérifier la session réelle en arrière-plan
          }
        }
      } catch (cacheError) {
        console.log('⚠️ Erreur lors du chargement du cache de session:', cacheError);
      }

      // Timeout de 3 secondes pour les requêtes réseau au démarrage (réduit pour connexions lentes)
      const sessionPromise = supabase.auth.getSession();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 3000)
      );

      let sessionResult: any;
      try {
        sessionResult = await Promise.race([sessionPromise, timeoutPromise]);
      } catch (timeoutError: any) {
        // En cas de timeout, utiliser le cache si disponible
        console.log('⏱️ Timeout lors de la vérification de session, utilisation du cache');
        const cachedSession = await AsyncStorage.getItem('auth_session');
        if (cachedSession) {
          const sessionData = JSON.parse(cachedSession);
          if (sessionData?.user?.id) {
            // Utiliser le cache pour permettre la navigation
            setIsLoading(false);
            return;
          }
        }
        setIsAuthenticated(false);
        setUser(null);
        setIsLoading(false);
        return;
      }

      const { data: { session }, error } = sessionResult;

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
        // Vérifier que l'utilisateur existe toujours dans auth.users
        const { data: authUser, error: getUserError } = await supabase.auth.getUser();
        
        if (getUserError || !authUser?.user) {
          console.log('🚪 L\'utilisateur n\'existe plus, déconnexion automatique...');
          // Nettoyer le cache
          try {
            await AsyncStorage.removeItem('auth_session');
            await AsyncStorage.removeItem(`user_profile_${session.user.id}`);
          } catch (cacheError) {
            console.log('⚠️ Erreur lors du nettoyage du cache:', cacheError);
          }
          // Déconnecter l'utilisateur
          setUser(null);
          setIsAuthenticated(false);
          await supabase.auth.signOut();
        } else {
          // Sauvegarder la session dans le cache
          try {
            await AsyncStorage.setItem('auth_session', JSON.stringify({ user: { id: session.user.id } }));
          } catch (cacheError) {
            console.log('⚠️ Erreur lors de la sauvegarde du cache de session:', cacheError);
          }
          
          // Charger le profil (utilise le cache si disponible, puis met à jour)
          await loadUserProfile(session.user.id, true);
        }
      } else {
        // Nettoyer le cache si pas de session
        try {
          await AsyncStorage.removeItem('auth_session');
          await AsyncStorage.removeItem(`user_profile_${user?.id || ''}`);
        } catch (cacheError) {
          console.log('⚠️ Erreur lors du nettoyage du cache:', cacheError);
        }
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

  // Marquer l'OTP comme vérifié (pour API externe comme Keccel)
  const markOTPAsVerified = (phone: string) => {
    const formattedPhone = phone.startsWith('+') ? phone : `+${phone}`;
    verifiedOTPStorage.set(formattedPhone, {
      verifiedAt: Date.now(),
      expiresAt: Date.now() + 30 * 60 * 1000, // 30 minutes
    });
    console.log('✅ OTP marqué comme vérifié pour:', formattedPhone);
  };

  // Vérifier le code OTP (sans créer le compte - le compte sera créé avec le mot de passe)
  const verifyOTP = async (
    phone: string,
    token: string,
    pseudo?: string,
    lat?: number,
    lng?: number,
    password?: string, // Nouveau paramètre : mot de passe optionnel
    specialty?: string, // Savoir-faire particulier
    gender?: 'male' | 'female', // Genre de l'utilisateur
    age?: number // Âge de l'utilisateur
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
        // Si pas de mot de passe fourni, vérifier l'OTP (vérification rapide en mémoire)
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

      // Vérifier si l'utilisateur existe déjà (opération rapide)
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('phone', formattedPhone)
        .maybeSingle();

      // Obtenir la position de manière optimisée (timeout rapide pour éviter les attentes)
      let location = { lat: -4.3276, lng: 15.3136 }; // Valeurs par défaut (Kinshasa)
      if (lat && lng) {
        location = { lat, lng };
      } else {
        // Essayer d'obtenir la position avec un timeout court (non bloquant)
        try {
          const { status } = await Location.getForegroundPermissionsAsync();
          if (status === 'granted') {
            const locationPromise = Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Lowest,
              maximumAge: 60000, // Accepter une position jusqu'à 1 minute
            });
            
            // Timeout après 2 secondes maximum pour ne pas bloquer
            const timeoutPromise = new Promise<{ lat: number; lng: number }>((resolve) => {
              setTimeout(() => resolve({ lat: -4.3276, lng: 15.3136 }), 2000);
            });

            location = await Promise.race([
              locationPromise.then(loc => ({
                lat: loc.coords.latitude,
                lng: loc.coords.longitude
              })),
              timeoutPromise
            ]);
          }
        } catch (error) {
          // Utiliser les valeurs par défaut en cas d'erreur
          console.log('⚠️ Localisation non disponible, utilisation des valeurs par défaut');
        }
      }

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
        }
        isNewUser = true;
      }

      if (!authUser) {
        return { error: { message: 'Impossible de créer ou récupérer l\'utilisateur' }, user: null };
      }

      // Créer ou mettre à jour le profil (opération principale - optimisée)
      const userGender: 'male' | 'female' = gender || 'female';
      const userAge = age || 25;
      
      // Utiliser la fonction RPC upsert_profile qui bypass RLS
      // Cette fonction est nécessaire car juste après signUp, la session
      // peut ne pas être complètement établie pour que auth.uid() fonctionne
      const { error: profileError } = await supabase.rpc('upsert_profile', {
        p_id: authUser.id,
        p_phone: formattedPhone,
        p_pseudo: pseudo || authUser.user_metadata?.pseudo || 'Utilisateur',
        p_age: userAge,
        p_photo: getDefaultProfileImage(userGender),
        p_description: '',
        p_rating: 0,
        p_review_count: 0,
        p_is_subscribed: false,
        p_subscription_status: 'pending',
        p_gender: userGender,
        p_lat: location.lat,
        p_lng: location.lng,
        p_is_available: true,
        p_specialty: specialty || null,
      });

      if (profileError) {
        if (!isNetworkError(profileError)) {
          console.error('Error creating/updating profile:', profileError);
        }
        return { error: profileError, user: null };
      }

      // Opérations en arrière-plan (non bloquantes)
      Promise.all([
        // Marquer l'email comme vérifié
        authUser.id ? (async () => {
          try {
            const { error } = await supabase.rpc('verify_user_email', { p_user_id: authUser.id });
            if (error) {
              console.warn('⚠️ Erreur lors de la vérification de l\'email:', error);
            }
          } catch (error) {
            console.warn('⚠️ Erreur lors de la vérification de l\'email:', error);
          }
        })() : Promise.resolve(),
        // Charger le profil créé
        loadUserProfile(authUser.id).catch(() => {}),
      ]).catch(() => {
        // Ignorer les erreurs, ces opérations ne sont pas critiques
      });
      
      // Retourner immédiatement avec l'utilisateur (le profil sera chargé en arrière-plan)
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

  // Vérifier l'OTP simplement (sans toute la logique de création de compte)
  const verifyOTPSimple = async (phone: string, token: string): Promise<{ error: any }> => {
    try {
      const formattedPhone = phone.startsWith('+') ? phone : `+${phone}`;
      
      // Vérifier l'OTP directement dans le stockage
      const storedOTP = otpStorage.get(formattedPhone);
      
      if (!storedOTP) {
        return { error: { message: 'Code OTP expiré ou invalide. Veuillez demander un nouveau code.' } };
      }

      if (storedOTP.expiresAt < Date.now()) {
        otpStorage.delete(formattedPhone);
        return { error: { message: 'Code OTP expiré. Veuillez demander un nouveau code.' } };
      }

      if (storedOTP.code !== token) {
        return { error: { message: 'Code OTP incorrect.' } };
      }

      // OTP valide, supprimer du stockage
      otpStorage.delete(formattedPhone);
      
      return { error: null };
    } catch (error: any) {
      console.error('Error in verifyOTPSimple:', error);
      return { error: { message: error.message || 'Erreur lors de la vérification OTP' } };
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

      // Obtenir la position actuelle si non fournie (non bloquant, utilise les valeurs par défaut si échoue)
      let userLat = lat;
      let userLng = lng;

      if (!userLat || !userLng) {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            const location = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Lowest, // Plus rapide
            });
            userLat = location.coords.latitude;
            userLng = location.coords.longitude;
          } else {
            userLat = -4.3276;
            userLng = 15.3136;
          }
        } catch (error: any) {
          // Ignorer les erreurs de localisation, utiliser les valeurs par défaut
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
          const userGender: 'male' | 'female' = gender || 'female';
          const { error: profileError } = await supabase.rpc('upsert_profile', {
            p_id: signInData.user.id,
            p_phone: formattedPhone,
            p_pseudo: pseudo.trim(),
            p_age: age || 25,
            p_photo: getDefaultProfileImage(userGender), // Photo par défaut selon le genre
            p_description: '',
            p_rating: 0,
            p_review_count: 0,
            p_is_subscribed: false,
            p_subscription_status: 'pending',
            p_gender: userGender,
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

      // Mettre à jour le profil immédiatement (sans attendre le rate limiting)
      // Le trigger crée un profil basique, on va le mettre à jour ensuite
      console.log('💾 Mise à jour du profil avec pseudo:', trimmedPseudo);
      
      const userGender: 'male' | 'female' = gender || 'female';
      const { error: profileError } = await supabase.rpc('upsert_profile', {
        p_id: authData.user.id,
        p_phone: formattedPhone,
        p_pseudo: trimmedPseudo, // Utiliser le pseudo saisi par l'utilisateur (toujours mettre à jour)
        p_age: age || 25,
        p_photo: getDefaultProfileImage(userGender), // Photo par défaut selon le genre
        p_description: '',
        p_rating: 0,
        p_review_count: 0,
        p_is_subscribed: false,
        p_subscription_status: 'pending',
        p_gender: userGender,
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
      } else {
        console.log('✅ Profil créé/mis à jour avec le pseudo:', pseudo.trim());
      }

      // Charger le profil créé en arrière-plan (non bloquant)
      loadUserProfile(authData.user.id).catch(() => {
        // Ignorer les erreurs, le profil sera chargé au prochain checkAuth
      });
      
      return { error: null, user: user };
    } catch (error: any) {
      if (!isNetworkError(error)) {
        console.error('Error in signUpWithPassword:', error);
      }
      return { error, user: null };
    }
  };

  // Connexion avec mot de passe (optimisée pour la vitesse - connexion instantanée)
  const loginWithPassword = async (phone: string, password: string): Promise<{ error: any; user: User | null }> => {
    try {
      const formattedPhone = phone.startsWith('+') ? phone : `+${phone}`;
      
      // Générer l'email principal (le plus courant - 99% des cas)
      const primaryEmail = generateTempEmail(formattedPhone);
      
      // Essayer directement la connexion avec l'email principal (cas le plus fréquent)
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: primaryEmail,
        password: password,
      });

      // Si succès, charger le profil en arrière-plan et retourner immédiatement
      if (!authError && authData?.user) {
        // Marquer l'email comme vérifié en arrière-plan (non bloquant)
        (async () => {
          try {
            await supabase.rpc('verify_user_email', { p_user_id: authData.user.id });
          } catch {}
        })();
        
        // Charger le profil en arrière-plan (non bloquant pour la réponse)
        loadUserProfile(authData.user.id).catch(() => {});
        
        return { error: null, user: user };
      }

      // Si échec avec "email not confirmed", essayer de confirmer automatiquement
      if (authError?.message?.toLowerCase().includes('email not confirmed')) {
        // Essayer de trouver l'utilisateur via RPC pour obtenir son ID
        const { data: emailData } = await supabase.rpc('get_user_email_by_phone', {
          p_phone: formattedPhone,
        });

        if (emailData && emailData.length > 0 && emailData[0]?.user_id) {
          // Confirmer l'email et réessayer la connexion
          try {
            await supabase.rpc('verify_user_email', { p_user_id: emailData[0].user_id });
          } catch {}
          
          const { data: retryAuthData, error: retryAuthError } = await supabase.auth.signInWithPassword({
            email: primaryEmail,
            password: password,
          });

          if (!retryAuthError && retryAuthData?.user) {
            loadUserProfile(retryAuthData.user.id).catch(() => {});
            return { error: null, user: user };
          }
        }
      }

      // Si échec avec "Invalid login credentials", essayer une seule variante d'email (cas rare)
      if (authError?.message?.includes('Invalid login credentials')) {
        const phoneDigits = formattedPhone.replace(/[^0-9]/g, '');
        const alternativeEmail = `jonathantshombe+${phoneDigits.slice(-8)}@gmail.com`;
        
        // Si l'email alternatif est différent, l'essayer
        if (alternativeEmail !== primaryEmail) {
          const { data: retryAuthData, error: retryAuthError } = await supabase.auth.signInWithPassword({
            email: alternativeEmail,
            password: password,
          });

          if (!retryAuthError && retryAuthData?.user) {
            // Marquer l'email comme vérifié en arrière-plan (non bloquant)
            (async () => {
              try {
                await supabase.rpc('verify_user_email', { p_user_id: retryAuthData.user.id });
              } catch {}
            })();
            
            // Charger le profil en arrière-plan (non bloquant)
            loadUserProfile(retryAuthData.user.id).catch(() => {});
            
            return { error: null, user: user };
          }
        }
      }

      // Toutes les tentatives ont échoué
      return { 
        error: { 
          message: authError?.message?.includes('Invalid login credentials') 
            ? 'Numéro de téléphone ou mot de passe incorrect' 
            : authError?.message || 'Erreur de connexion'
        }, 
        user: null 
      };
    } catch (error: any) {
      // Gérer spécifiquement les erreurs réseau Supabase
      const isNetworkErr = isNetworkError(error) || 
                          error?.name === 'AuthRetryableFetchError' ||
                          error?.name === 'AuthPKCEGrantCodeExchangeError';
      
      if (isNetworkErr) {
        return { error: { message: 'Erreur de connexion. Vérifiez votre connexion internet et réessayez.' }, user: null };
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
        p_photo: userData.photo !== undefined ? userData.photo : (user?.photo || getDefaultProfileImage(user?.gender)),
        p_description: userData.description !== undefined ? userData.description : (user?.description || ''),
        p_rating: userData.rating !== undefined ? userData.rating : (user?.rating || 0),
        p_review_count: userData.reviewCount !== undefined ? userData.reviewCount : (user?.reviewCount || 0),
        p_is_subscribed: userData.isSubscribed !== undefined ? userData.isSubscribed : (user?.isSubscribed || false),
        p_subscription_status: userData.subscriptionStatus !== undefined ? userData.subscriptionStatus : (user?.subscriptionStatus || 'pending'),
        p_gender: userData.gender !== undefined ? userData.gender : (user?.gender || 'female'),
        p_lat: userData.lat !== undefined ? userData.lat : (user?.lat || null),
        p_lng: userData.lng !== undefined ? userData.lng : (user?.lng || null),
        p_is_available: userData.isAvailable !== undefined ? userData.isAvailable : (user?.isAvailable !== false),
        p_specialty: userData.specialty !== undefined ? (userData.specialty || null) : (user?.specialty || null),
      };

      // Logs réduits pour améliorer les performances

      // Utiliser la fonction RPC upsert_profile qui bypass RLS
      console.log('💾 Appel RPC upsert_profile avec:', {
        p_id: userId,
        p_pseudo: rpcParams.p_pseudo,
        p_age: rpcParams.p_age,
        p_description: rpcParams.p_description?.substring(0, 30),
        p_specialty: rpcParams.p_specialty,
        p_gender: rpcParams.p_gender,
      });
      
      const { data, error } = await supabase.rpc('upsert_profile', rpcParams);

      if (error) {
        console.error('❌ Error updating profile via RPC:', error);
        if (!isNetworkError(error)) {
          console.error('Error details:', JSON.stringify(error, null, 2));
        }
        
        // Fallback: Essayer une mise à jour directe si la RPC échoue
        const updateData: any = {};
        if (userData.pseudo !== undefined) updateData.pseudo = userData.pseudo;
        if (userData.age !== undefined) updateData.age = userData.age;
        if (userData.description !== undefined) updateData.description = userData.description;
        if (userData.photo !== undefined) updateData.photo = userData.photo;
        if (userData.gender !== undefined) updateData.gender = userData.gender;
        if (userData.specialty !== undefined) updateData.specialty = userData.specialty || null;
        
        const { error: updateError } = await supabase
          .from('profiles')
          .update(updateData)
          .eq('id', userId);
        
        if (updateError) {
          if (!isNetworkError(updateError)) {
            console.error('Error updating profile directly:', updateError);
          }
          throw updateError;
        }
        
        // Invalider le cache AsyncStorage en arrière-plan (non-bloquant)
        AsyncStorage.removeItem(`user_profile_${userId}`).catch(() => {
          // Ignorer les erreurs silencieusement
        });
        
        // Le rechargement du profil se fera en arrière-plan via updateUser
        console.log('✅ Profil mis à jour via fallback (update direct)');
        return;
      }

      // Invalider le cache AsyncStorage en arrière-plan (non-bloquant)
      AsyncStorage.removeItem(`user_profile_${userId}`).catch(() => {
        // Ignorer les erreurs silencieusement
      });
      
      console.log('✅ Profil mis à jour dans Supabase via RPC upsert_profile');
      
      // Le rechargement du profil se fera en arrière-plan via updateUser
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

  // Mettre à jour l'utilisateur avec mise à jour optimiste pour une meilleure réactivité
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

      // MISE À JOUR OPTIMISTE : Mettre à jour l'état local IMMÉDIATEMENT pour une réactivité instantanée
      // Utiliser une fonction de mise à jour pour garantir que l'état est bien mis à jour
      setUser((prevUser) => {
        if (!prevUser) {
          console.warn('⚠️ Tentative de mise à jour optimiste sans utilisateur précédent');
          return prevUser;
        }
        
        // Créer un nouvel objet pour forcer la mise à jour de React
        const updatedUser: User = {
          ...prevUser,
          ...userData,
        };
        
        // Sauvegarder aussi dans le cache pour une cohérence immédiate (non-bloquant)
        AsyncStorage.setItem(`user_profile_${userId}`, JSON.stringify(updatedUser)).catch(() => {
          // Ignorer les erreurs de cache silencieusement
        });
        
        console.log('✅ Mise à jour optimiste du profil:', {
          pseudo: updatedUser.pseudo,
          age: updatedUser.age,
          description: updatedUser.description?.substring(0, 20),
          specialty: updatedUser.specialty,
          photo: updatedUser.photo?.substring(0, 30),
          gender: updatedUser.gender,
          prevPseudo: prevUser.pseudo,
          prevAge: prevUser.age,
        });
        
        // Forcer un nouveau rendu en créant un nouvel objet avec toutes les propriétés
        return { ...updatedUser };
      });

      // Mettre à jour dans Supabase (attendre la confirmation pour garantir la cohérence)
      // Mais ne pas bloquer trop longtemps pour l'UI
      try {
        await updateUserProfile(userData);
        console.log('✅ Profil mis à jour dans Supabase');
        
        // Invalider le cache
        AsyncStorage.removeItem(`user_profile_${userId}`).catch(() => {});
        
        // Recharger le profil depuis la DB après un court délai pour synchroniser
        // Cela garantit que les données affichées correspondent à la DB
        // Le délai permet à la DB de se mettre à jour
        setTimeout(async () => {
          if (isAuthenticated && userId) {
            try {
              console.log('🔄 Rechargement du profil depuis la DB après mise à jour');
              await loadUserProfile(userId, false); // false = ne pas utiliser le cache
              console.log('✅ Profil rechargé depuis la DB');
            } catch (reloadError) {
              if (!isNetworkError(reloadError)) {
                console.error('Error reloading profile after update:', reloadError);
              }
              // En cas d'erreur, on garde la mise à jour optimiste
            }
          }
        }, 1000); // Délai de 1 seconde pour laisser le temps à la DB
      } catch (error: any) {
        // En cas d'erreur, on garde la mise à jour optimiste mais on log l'erreur
        if (!isNetworkError(error)) {
          console.error('Error updating user profile:', error);
        }
        // Relancer l'erreur pour que l'UI puisse la gérer
        throw error;
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

  // Mettre à jour la position de l'utilisateur (avec last_seen)
  // Les erreurs réseau sont gérées silencieusement
  const updateLocation = async (lat: number, lng: number) => {
    try {
      const userId = user?.id;
      if (!userId) return;

      // Mettre à jour avec last_seen
      const now = new Date().toISOString();

      const { error } = await supabase
        .from('profiles')
        .update({
          lat: lat.toString(),
          lng: lng.toString(),
          last_seen: now,
          updated_at: now,
        })
        .eq('id', userId);

      if (error) {
        // Ne logger que les erreurs non-réseau
        if (!isNetworkError(error)) {
          console.error('Error updating location:', error);
        }
        // Si c'est une erreur réseau, on ignore silencieusement (l'utilisateur n'est pas connecté)
      } else {
        // Mettre à jour l'état local seulement si la mise à jour a réussi
        if (user) {
          setUser({ ...user, lat, lng, lastSeen: now });
        }
      }
    } catch (error: any) {
      // Ne logger que les erreurs non-réseau
      if (!isNetworkError(error)) {
        console.error('Error updating location:', error);
      }
      // Si c'est une erreur réseau, on ignore silencieusement
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
      
      // Arrêter le suivi de localisation en arrière-plan
      const { LocationService } = await import('../lib/locationService');
      LocationService.stopBackgroundTracking();
      
      // D'abord, mettre à jour l'état local pour déclencher les redirections
      setUser(null);
      setIsAuthenticated(false);
      
      // Nettoyer le cache
      try {
        await AsyncStorage.removeItem('auth_session');
        if (user?.id) {
          await AsyncStorage.removeItem(`user_profile_${user.id}`);
        }
      } catch (cacheError) {
        console.log('⚠️ Erreur lors du nettoyage du cache:', cacheError);
      }
      
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
        verifyOTPSimple,
        markOTPAsVerified,
        signUpWithPassword,
        loginWithPassword,
        resetPassword,
        logout,
        checkAuth,
        updateUser,
        updateUserProfile,
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
