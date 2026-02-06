import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { colors } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';

// Import pour la récupération automatique de l'OTP (Android uniquement)
let OtpVerify: any = null;
if (Platform.OS === 'android') {
  try {
    OtpVerify = require('react-native-otp-verify');
  } catch (e) {
    console.log('react-native-otp-verify non disponible');
  }
}

type AuthMode = 'signup' | 'login';
type AuthStep = 'phone' | 'otp' | 'pseudo' | 'age' | 'gender' | 'specialty' | 'password';

export default function AuthScreen() {
  const router = useRouter();
  const { sendOTP, verifyOTP, markOTPAsVerified, updateUser, signUpWithPassword, loginWithPassword, resetPassword, user, isAuthenticated } = useAuth();
  const [mode, setMode] = useState<AuthMode>('signup'); // 'signup' ou 'login'
  const [step, setStep] = useState<AuthStep>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [pseudo, setPseudo] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | ''>('');
  const [specialty, setSpecialty] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const otpAutoVerifyRef = useRef<boolean>(false); // Pour éviter les vérifications multiples
  const scrollViewRef = useRef<ScrollView>(null);

  // Rediriger si déjà authentifié (mais pas immédiatement après déconnexion)
  React.useEffect(() => {
    // Ne rediriger que si on est vraiment authentifié et qu'on a un utilisateur
    // Attendre un peu pour éviter les redirections immédiates après déconnexion
    const timer = setTimeout(() => {
      // Vérifier à nouveau l'état avant de rediriger
      if (isAuthenticated && user && user.id) {
        console.log('🔄 Redirection vers dashboard (authentifié)');
        if (user.pseudo && user.pseudo !== 'Utilisateur') {
          router.replace('/(screens)/dashboard');
        } else {
          setStep('pseudo');
        }
      } else {
        console.log('🚫 Pas de redirection (non authentifié ou pas d\'utilisateur)');
      }
    }, 1000); // Délai plus long pour s'assurer que la déconnexion est terminée

    return () => clearTimeout(timer);
  }, [isAuthenticated, user, router]);

  const handlePhoneSubmit = async () => {
    console.log("📱 handlePhoneSubmit appelé, phone:", phone, "mode:", mode);
    
    if (phone.length < 9) {
      Alert.alert('Erreur', 'Veuillez entrer un numéro de téléphone valide');
      return;
    }

    if (mode === 'login') {
      // En mode login, passer directement à l'étape mot de passe
      console.log("🔐 Mode login, passage à l'étape password");
      setStep('password');
      return;
    }

    // En mode signup, envoyer l'OTP via l'API Keccel
    setIsLoading(true);
    try {
      const API_TOKEN = "F42KARA4ES95FWH";
      const FROM_NAME = "BISOTECH";
      const PHONE_NUMBER = phone.startsWith("+243") ? phone : `+243${phone}`;

      console.log("📤 Envoi de l'OTP à:", PHONE_NUMBER);

      // Ajouter un timeout pour éviter les blocages
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 secondes max

      const res = await fetch(
        "https://api.keccel.com/otp/generate.asp",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token: API_TOKEN,
            from: FROM_NAME,
            to: PHONE_NUMBER,
            message: "Votre code est : %OTP%",
            length: 6,
            lifetime: 300,
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);
  
      console.log("📥 Réponse reçue, status:", res.status, "ok:", res.ok);
      
      // Lire la réponse comme texte d'abord pour pouvoir la parser ensuite
      const responseText = await res.text();
      console.log("📄 Réponse brute:", responseText);
      console.log("📄 Longueur de la réponse:", responseText.length);
  
      if (!res.ok) {
        console.error("Keccel OTP API error - HTTP status:", res.status, "Response:", responseText);
        Alert.alert('Erreur', `Impossible de contacter le serveur (${res.status}). Vérifiez votre connexion.`);
        setIsLoading(false);
        return;
      }

      // Si le status HTTP est 200, on considère généralement comme succès
      console.log("✅ Status HTTP 200, traitement de la réponse...");

      // Essayer de parser la réponse comme JSON
      let data: any;
      try {
        data = JSON.parse(responseText);
        console.log("✅ Réponse parsée comme JSON:", JSON.stringify(data, null, 2));
      } catch (jsonError) {
        console.log("⚠️ Réponse n'est pas du JSON, traitement comme texte");
        // Si ce n'est pas du JSON, considérer comme succès si le texte contient certains mots-clés
        const lowerText = responseText.toLowerCase();
        if (lowerText.includes('sent') || lowerText.includes('success') || lowerText.includes('ok')) {
          console.log("✅ Réponse texte considérée comme succès");
          data = { status: 'SENT' };
        } else {
          console.error("❌ Réponse texte non reconnue:", responseText);
          Alert.alert('Erreur', 'Réponse inattendue du serveur. Veuillez réessayer.');
          setIsLoading(false);
          return;
        }
      }
      
      // Vérifier différentes variantes possibles de la réponse
      const isSuccess = 
        data.status === 'True' || 
        data.status === 'SENT' || // Keccel retourne "SENT" quand le message est soumis
        data.status === true || 
        data.status === 'true' ||
        data.success === true ||
        data.success === 'True' ||
        (data.statusOTP && data.statusOTP === 'SENT') ||
        (data.code && data.code === 200) ||
        (data.result && (data.result === 'success' || data.result === 'ok')) ||
        (data.message && (data.message.toLowerCase().includes('sent') || data.message.toLowerCase().includes('success')));

      console.log("🔍 Vérification isSuccess:", isSuccess, "data:", JSON.stringify(data, null, 2));

      // Si la réponse n'est pas reconnue comme succès, mais qu'il n'y a pas d'erreur explicite, 
      // on considère quand même comme succès si le status HTTP est 200
      if (!isSuccess) {
        // Vérifier s'il y a une erreur explicite
        const hasError = data.error || data.errors || (data.description && data.description.toLowerCase().includes('error'));
        
        if (hasError) {
          const errorMessage = data.description || data.message || data.error || 'Impossible d\'envoyer le code. Vérifiez votre numéro.';
          console.error("❌ Keccel OTP error:", errorMessage, "data complète:", data);
          Alert.alert('Erreur', errorMessage);
          setIsLoading(false);
          return;
        } else {
          // Pas d'erreur explicite, considérer comme succès si status HTTP est 200
          console.log("⚠️ Réponse non standard mais pas d'erreur, considération comme succès");
        }
      }

      console.log("✅ OTP envoyé avec succès, passage à l'étape OTP");
      
      // Mettre à jour les états de manière synchrone
      setIsLoading(false);
      console.log("🔄 Changement d'étape vers 'otp', step actuel:", step);
      setStep('otp');
      console.log("✅ setStep('otp') appelé");
      
      // Démarrer la récupération automatique de l'OTP (Android uniquement)
      if (Platform.OS === 'android' && OtpVerify) {
        setTimeout(() => {
          startOTPListener();
        }, 500); // Petit délai pour s'assurer que l'étape OTP est montée
      }
      // Ne pas afficher d'alerte pour une meilleure UX - le message est déjà clair dans l'interface
    } catch (error: any) {
      console.error('Send OTP error:', error);
      
      let errorMessage = 'Une erreur est survenue lors de l\'envoi du code';
      if (error.name === 'AbortError') {
        errorMessage = 'La requête a pris trop de temps. Vérifiez votre connexion internet.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      Alert.alert('Erreur', errorMessage);
      setIsLoading(false);
    }
  };

  // Fonction pour démarrer l'écoute automatique des SMS (Android)
  const startOTPListener = () => {
    if (Platform.OS !== 'android' || !OtpVerify) return;

    try {
      // Demander les permissions SMS
      OtpVerify.getHash()
        .then((hash: string[]) => {
          console.log('Hash OTP:', hash);
        })
        .catch((error: any) => {
          console.log('Erreur lors de la récupération du hash:', error);
        });

      // Écouter les SMS entrants
      // Note: getOtp() retourne directement le code OTP extrait (6 chiffres), pas le message complet
      OtpVerify.getOtp()
        .then((otpCode: any) => {
          console.log('OTP reçu (getOtp):', otpCode, 'Type:', typeof otpCode);
          
          // getOtp() retourne directement le code OTP extrait
          let extractedOtp: string | null = null;
          
          if (typeof otpCode === 'string' && /^\d{6}$/.test(otpCode)) {
            // C'est déjà le code OTP
            extractedOtp = otpCode;
          } else if (typeof otpCode === 'string') {
            // C'est peut-être le message complet, extraire le code
            const otpMatch = otpCode.match(/\b\d{6}\b/);
            if (otpMatch) {
              extractedOtp = otpMatch[0];
            }
          } else if (otpCode && typeof otpCode === 'object') {
            // C'est peut-être un objet avec le code
            const codeStr = otpCode.code || otpCode.otp || otpCode.message || String(otpCode);
            const otpMatch = codeStr.match(/\b\d{6}\b/);
            if (otpMatch) {
              extractedOtp = otpMatch[0];
            }
          }
          
          if (extractedOtp && /^\d{6}$/.test(extractedOtp)) {
            console.log('✅ OTP extrait (getOtp):', extractedOtp);
            setOtp(extractedOtp);
            
            // Lancer automatiquement la vérification après un court délai
            if (!otpAutoVerifyRef.current) {
              otpAutoVerifyRef.current = true;
              setTimeout(() => {
                handleOtpSubmitAuto(extractedOtp);
              }, 500);
            }
          } else {
            console.log('⚠️ Aucun code OTP valide trouvé dans getOtp():', otpCode);
          }
        })
        .catch((error: any) => {
          console.log('Erreur lors de la récupération de l\'OTP (getOtp):', error);
        });

      // Démarrer l'écoute
      // Note: startListener reçoit le message complet du SMS
      OtpVerify.startListener((message: any) => {
        console.log('📨 SMS intercepté (startListener):', message, 'Type:', typeof message);
        
        // Convertir en chaîne si nécessaire
        let messageStr: string = '';
        
        if (typeof message === 'string') {
          messageStr = message;
        } else if (message && typeof message === 'object') {
          // Essayer différentes propriétés possibles
          messageStr = message.message || message.body || message.text || message.content || String(message);
        } else if (message !== null && message !== undefined) {
          messageStr = String(message);
        }
        
        if (!messageStr || typeof messageStr !== 'string' || messageStr.trim().length === 0) {
          console.log('⚠️ Message invalide ou vide dans startListener:', message);
          return;
        }
        
        console.log('📝 Message traité (startListener):', messageStr);
        
        // Extraire le code OTP (6 chiffres) - chercher différents patterns
        // Pattern 1: 6 chiffres consécutifs
        let otpMatch = messageStr.match(/\b\d{6}\b/);
        
        // Pattern 2: Si pas trouvé, chercher n'importe où dans le message
        if (!otpMatch) {
          otpMatch = messageStr.match(/\d{6}/);
        }
        
        // Pattern 3: Chercher après "code", "OTP", "est :", etc.
        if (!otpMatch) {
          otpMatch = messageStr.match(/(?:code|otp|est\s*:)\s*(\d{6})/i);
          if (otpMatch && otpMatch[1]) {
            otpMatch = [otpMatch[1], otpMatch[1]]; // Utiliser le groupe capturé
          }
        }
        
        // Pattern 4: Chercher dans le format "Votre code est : 123456"
        if (!otpMatch) {
          otpMatch = messageStr.match(/:\s*(\d{6})/);
        }
        
        if (otpMatch && otpMatch[0]) {
          const extractedOtp = otpMatch[0].replace(/\D/g, ''); // Nettoyer pour garder seulement les chiffres
          
          if (extractedOtp.length === 6 && /^\d{6}$/.test(extractedOtp)) {
            console.log('✅ OTP extrait automatiquement:', extractedOtp);
            setOtp(extractedOtp);
            
            // Lancer automatiquement la vérification après un court délai
            if (!otpAutoVerifyRef.current) {
              otpAutoVerifyRef.current = true;
              setTimeout(() => {
                handleOtpSubmitAuto(extractedOtp);
              }, 500);
            }
          } else {
            console.log('⚠️ Code OTP extrait invalide (longueur != 6):', extractedOtp);
          }
        } else {
          console.log('⚠️ Aucun code OTP trouvé dans le message (startListener):', messageStr);
        }
      });
    } catch (error) {
      console.log('Erreur lors du démarrage de l\'écoute OTP:', error);
    }
  };

  // Arrêter l'écoute des SMS
  const stopOTPListener = () => {
    if (Platform.OS === 'android' && OtpVerify) {
      try {
        OtpVerify.removeListener();
      } catch (error) {
        console.log('Erreur lors de l\'arrêt de l\'écoute OTP:', error);
      }
    }
  };

  // Fonction pour vérifier automatiquement l'OTP (appelée quand l'OTP est détecté)
  const handleOtpSubmitAuto = async (otpCode: string) => {
    if (otpCode.length !== 6) {
      return;
    }

    setIsLoading(true);
    otpAutoVerifyRef.current = true; // Empêcher les vérifications multiples
    
    try {
      const API_TOKEN = "F42KARA4ES95FWH";
      const FROM_NAME = "BISOTECH";
      const PHONE_NUMBER = phone.startsWith("+243") ? phone : `+243${phone}`;

      const res = await fetch(
        "https://api.keccel.com/otp/validate.asp",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token: API_TOKEN,
            from: FROM_NAME,
            to: PHONE_NUMBER,
            otp: otpCode,
          }),
        }
      );

      const data = await res.json();
      console.log("Keccel OTP validation response (auto):", data);

      // Vérifier différentes variantes possibles de la réponse de validation
      const isValid = 
        data.statusOTP === 'VALID' ||
        data.status === 'VALID' ||
        data.status === 'True' ||
        data.status === true ||
        (data.code && data.code === 200);

      if (!isValid) {
        const errorMessage = data.description || data.message || data.error || 'Code OTP invalide ou expiré';
        Alert.alert('Erreur', errorMessage);
        setIsLoading(false);
        otpAutoVerifyRef.current = false;
        return;
      }

      // OTP valide → marquer comme vérifié et passer à pseudo
      markOTPAsVerified(phone);
      stopOTPListener(); // Arrêter l'écoute
      console.log("✅ OTP vérifié automatiquement avec succès, passage à l'étape pseudo");
      setStep('pseudo');
    } catch (error: any) {
      console.error('Verify OTP error (auto):', error);
      Alert.alert('Erreur', 'Une erreur est survenue lors de la vérification du code');
      otpAutoVerifyRef.current = false;
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async () => {
    if (otp.length !== 6) {
      Alert.alert('Erreur', 'Veuillez entrer un code à 6 chiffres');
      return;
    }

    // Arrêter l'écoute si elle est active
    stopOTPListener();
    otpAutoVerifyRef.current = true; // Empêcher les vérifications multiples

    setIsLoading(true);
    try {
      // const API_TOKEN = "F42KARA4ES95FWH";
      // const FROM_NAME = "BISOTECH";
      // const PHONE_NUMBER = phone.startsWith("+243") 
      //   ? phone.replace("+", "") 
      //   : phone.startsWith("243") 
      //   ? phone 
      //   : `243${phone}`;

      // const url =
      //   "https://api.keccel.com/otp/validate.asp" +
      //   `?token=${encodeURIComponent(API_TOKEN)}` +
      //   `&from=${encodeURIComponent(FROM_NAME)}` +
      //   `&to=${encodeURIComponent(PHONE_NUMBER)}` +
      //   `&otp=${encodeURIComponent(otp)}`;

      const API_TOKEN = "F42KARA4ES95FWH";
      const FROM_NAME = "BISOTECH";
      const PHONE_NUMBER = phone.startsWith("+243") ? phone : `+243${phone}`;

      const res = await fetch(
        "https://api.keccel.com/otp/validate.asp",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token: API_TOKEN,
            from: FROM_NAME,
            to: PHONE_NUMBER,
            otp: otp,
          }),
        }
      );

      // const res = await fetch(url, { method: "GET" });
      const data = await res.json();
      console.log("Keccel OTP validation response:", data);

      // Vérifier différentes variantes possibles de la réponse de validation
      const isValid = 
        data.statusOTP === 'VALID' ||
        data.status === 'VALID' ||
        data.status === 'True' ||
        data.status === true ||
        (data.code && data.code === 200);

      if (!isValid) {
        const errorMessage = data.description || data.message || data.error || 'Code OTP invalide ou expiré';
        Alert.alert('Erreur', errorMessage);
        setIsLoading(false);
        return;
      }

      // OTP valide → marquer comme vérifié et passer à pseudo
      markOTPAsVerified(phone);
      console.log("✅ OTP vérifié avec succès, passage à l'étape pseudo");
      setStep('pseudo');
    } catch (error: any) {
      Alert.alert('Erreur', 'Une erreur est survenue lors de la vérification du code');
      console.error('Verify OTP error:', error);
      otpAutoVerifyRef.current = false;
    } finally {
      setIsLoading(false);
    }
  };

  // Nettoyer l'écoute quand on quitte l'étape OTP
  useEffect(() => {
    if (step !== 'otp') {
      stopOTPListener();
      otpAutoVerifyRef.current = false;
    }
    
    return () => {
      stopOTPListener();
    };
  }, [step]);

  const handlePseudoSubmit = async () => {
    if (!pseudo.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer un pseudonyme');
      return;
    }

    // Passer à l'étape âge
    setStep('age');
  };

  const handleAgeSubmit = async () => {
    if (!age || isNaN(Number(age)) || Number(age) < 18 || Number(age) > 100) {
      Alert.alert('Erreur', 'Veuillez entrer un âge valide (18-100 ans)');
      return;
    }

    // Passer à l'étape genre
    setStep('gender');
  };

  const handleGenderSubmit = async () => {
    if (!gender) {
      Alert.alert('Erreur', 'Veuillez sélectionner votre genre');
      return;
    }

    // Passer à l'étape savoir-faire
    setStep('specialty');
  };

  const handleSpecialtySubmit = async () => {
    // Le savoir-faire est optionnel, on peut passer directement à l'étape mot de passe
    setStep('password');
  };

  // Fonction pour valider le mot de passe
  const validatePassword = (pwd: string): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    if (pwd.length < 8) {
      errors.push('au moins 8 caractères');
    }
    if (!/[A-Z]/.test(pwd)) {
      errors.push('une majuscule');
    }
    if (!/[a-z]/.test(pwd)) {
      errors.push('une minuscule');
    }
    if (!/[0-9]/.test(pwd)) {
      errors.push('un chiffre');
    }
    if (!/[^A-Za-z0-9]/.test(pwd)) {
      errors.push('un caractère spécial');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  };

  const handlePasswordSubmit = async () => {
    // Valider le mot de passe selon les critères
    if (mode === 'signup') {
      const validation = validatePassword(password);
      if (!validation.isValid) {
        Alert.alert(
          'Mot de passe invalide',
          `Le mot de passe doit contenir :\n${validation.errors.map(e => `• ${e}`).join('\n')}`
        );
        return;
      }
    } else {
      // Pour le login, juste vérifier qu'il n'est pas vide
      if (password.length < 1) {
        Alert.alert('Erreur', 'Veuillez entrer votre mot de passe');
        return;
      }
    }

    if (mode === 'signup' && password !== confirmPassword) {
      Alert.alert('Erreur', 'Les mots de passe ne correspondent pas');
      return;
    }

    setIsLoading(true);
    try {
      if (mode === 'signup') {
        // Créer le compte avec le mot de passe saisi par l'utilisateur
        // La position GPS sera récupérée automatiquement dans verifyOTP (non bloquant, timeout de 2s)
        const { error, user: newUser } = await verifyOTP(
          phone,
          '', // Pas besoin de token car l'OTP a déjà été vérifié
          pseudo.trim(),
          undefined, // lat - sera récupéré automatiquement
          undefined, // lng - sera récupéré automatiquement
          password, // Passer le mot de passe saisi par l'utilisateur
          specialty.trim() || undefined, // Passer le savoir-faire
          gender as 'male' | 'female', // Passer le genre choisi par l'utilisateur
          Number(age) // Passer l'âge
        );
        
        if (error) {
          // Si l'OTP a expiré, proposer de recommencer l'inscription
          if (error.message?.includes('OTP expiré') || error.message?.includes('non vérifié')) {
            Alert.alert(
              'Code OTP expiré',
              'Le code de vérification a expiré. Veuillez recommencer l\'inscription depuis le début.',
              [
                {
                  text: 'Recommencer',
                  onPress: () => {
                    // Réinitialiser tout le processus d'inscription
                    setStep('phone');
                    setOtp('');
                    setPseudo('');
                    setAge('');
                    setGender('');
                    setPassword('');
                    setConfirmPassword('');
                  },
                },
              ]
            );
          } else {
            Alert.alert('Erreur', error.message || 'Une erreur est survenue lors de la création du compte');
          }
          setIsLoading(false);
          return;
        }

        if (newUser) {
          // Le compte est créé, rediriger vers la page d'abonnement
          router.replace('/(screens)/subscription');
        } else {
          // Si newUser est null, essayer avec signUpWithPassword comme fallback
          const { error: signUpError, user: signUpUser } = await signUpWithPassword(
            phone, 
            password, 
            pseudo.trim(),
            Number(age),
            gender as 'male' | 'female',
            undefined, // lat
            undefined, // lng
            specialty.trim() || undefined // specialty
          );
          
          if (signUpError) {
            Alert.alert('Erreur', signUpError.message || 'Une erreur est survenue lors de la création du compte');
            setIsLoading(false);
            return;
          }

          if (signUpUser) {
            router.replace('/(screens)/subscription');
          }
        }
      } else {
        // Connexion avec mot de passe
        const { error, user: loggedUser } = await loginWithPassword(phone, password);
        
        if (error) {
          Alert.alert('Erreur', error.message || 'Numéro de téléphone ou mot de passe incorrect');
          setIsLoading(false);
          return;
        }

        if (loggedUser) {
          router.replace('/(screens)/dashboard');
        }
      }
    } catch (error: any) {
      Alert.alert('Erreur', 'Une erreur est survenue');
      console.error('Auth error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOTP = async () => {
    setIsLoading(true);
    try {
      const API_TOKEN = "F42KARA4ES95FWH";
      const FROM_NAME = "BISOTECH";
      const PHONE_NUMBER = phone.startsWith("+243") ? phone : `+243${phone}`;

      const res = await fetch(
        "https://api.keccel.com/otp/generate.asp",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token: API_TOKEN,
            from: FROM_NAME,
            to: PHONE_NUMBER,
            message: "Votre code est : %OTP%",
            length: 6,
            lifetime: 300,
          }),
        }
      );
      
      const data = await res.json();
      if (data.status !== 'True') {
        Alert.alert('Erreur', data.description || 'Impossible de renvoyer le code');
      } else {
        Alert.alert('Code renvoyé', 'Un nouveau code a été envoyé');
      }
    } catch (error) {
      Alert.alert('Erreur', 'Une erreur est survenue');
      console.error('Resend OTP error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={['#be185d', '#171717', '#000000']}
      style={styles.container}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Image
              source={require('../../assets/images/kutana.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.logoText}>Kutana</Text>
          </View>
        </View>

        {/* Content */}
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={[
            styles.scrollContent,
            step === 'password' && styles.scrollContentPassword
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
          nestedScrollEnabled={true}
          onContentSizeChange={() => {
            // Défiler vers le bas quand le contenu change (notamment pour l'étape password)
            if (step === 'password') {
              setTimeout(() => {
                scrollViewRef.current?.scrollToEnd({ animated: true });
              }, 100);
            }
          }}
        >
          <View style={styles.content}>
            {/* Toggle Signup/Login */}
            {step === 'phone' && (
              <View style={styles.modeToggle}>
                <TouchableOpacity
                  style={[styles.modeButton, mode === 'signup' && styles.modeButtonActive]}
                  onPress={() => {
                    setMode('signup');
                    setStep('phone');
                    setPhone('');
                    setOtp('');
                    setPseudo('');
                    setAge('');
                    setGender('');
                    setPassword('');
                    setConfirmPassword('');
                  }}
                >
                  <Text style={[styles.modeButtonText, mode === 'signup' && styles.modeButtonTextActive]}>
                    Créer un compte
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modeButton, mode === 'login' && styles.modeButtonActive]}
                  onPress={() => {
                    setMode('login');
                    setStep('phone');
                    setPhone('');
                    setOtp('');
                    setPseudo('');
                    setAge('');
                    setGender('');
                    setPassword('');
                    setConfirmPassword('');
                  }}
                >
                  <Text style={[styles.modeButtonText, mode === 'login' && styles.modeButtonTextActive]}>
                    Se connecter
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {step === 'phone' && (
              <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.stepContainer}>
                <View style={styles.stepHeader}>
                  <Text style={styles.title}>Entrez votre numéro</Text>
                  <Text style={styles.subtitle}>
                    {mode === 'signup'
                      ? 'Nous vous enverrons un code de vérification'
                      : 'Entrez votre numéro de téléphone'}
                  </Text>
                </View>

                <View style={styles.form}>
                  <Input
                    placeholder="+243 XXX XXX XXX"
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    leftIcon={<Ionicons name="call-outline" size={20} color={colors.textTertiary} />}
                    containerStyle={styles.inputContainer}
                  />

                  <Button
                    title="Continuer"
                    onPress={handlePhoneSubmit}
                    disabled={phone.length < 9 || isLoading}
                    loading={isLoading}
                    style={styles.button}
                  />
                </View>
              </Animated.View>
            )}

            {step === 'otp' && (
              <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.stepContainer}>
                <View style={styles.stepHeader}>
                  <Text style={styles.title}>Code de vérification</Text>
                  <Text style={styles.subtitle}>
                    {Platform.OS === 'android' && OtpVerify 
                      ? 'Le code sera détecté automatiquement depuis votre SMS'
                      : `Entrez le code à 6 chiffres envoyé au ${phone}`}
                  </Text>
                </View>

                <View style={styles.form}>
                  <Input
                    placeholder="000000"
                    value={otp}
                    onChangeText={(text) => setOtp(text.replace(/\D/g, '').slice(0, 6))}
                    keyboardType="number-pad"
                    maxLength={6}
                    style={[styles.inputContainer, styles.otpInput]}
                    containerStyle={styles.inputContainer}
                  />

                  <Button
                    title="Vérifier"
                    onPress={handleOtpSubmit}
                    disabled={otp.length !== 6 || isLoading}
                    loading={isLoading}
                    style={styles.button}
                  />

                  <Button
                    title="Renvoyer le code"
                    onPress={handleResendOTP}
                    variant="ghost"
                    style={styles.resendButton}
                    textStyle={{ color: colors.pink400 }}
                    disabled={isLoading}
                  />
                </View>
              </Animated.View>
            )}

            {step === 'pseudo' && (
              <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.stepContainer}>
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={() => setStep('otp')}
                >
                  <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
                <View style={styles.stepHeader}>
                  <Text style={styles.title}>Créez votre pseudonyme</Text>
                  <Text style={styles.subtitle}>Ce nom sera visible par les autres utilisateurs</Text>
                </View>

                <View style={styles.form}>
                  <Input
                    placeholder="Votre pseudonyme"
                    value={pseudo}
                    onChangeText={setPseudo}
                    containerStyle={styles.inputContainer}
                  />

                  <Button
                    title="Continuer"
                    onPress={handlePseudoSubmit}
                    disabled={!pseudo.trim() || isLoading}
                    loading={isLoading}
                    style={styles.button}
                  />
                </View>
              </Animated.View>
            )}

            {step === 'age' && (
              <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.stepContainer}>
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={() => setStep('pseudo')}
                >
                  <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
                <View style={styles.stepHeader}>
                  <Text style={styles.title}>Quel est votre âge ?</Text>
                  <Text style={styles.subtitle}>Vous devez avoir au moins 18 ans</Text>
                </View>

                <View style={styles.form}>
                  <Input
                    placeholder="Votre âge"
                    value={age}
                    onChangeText={(text) => setAge(text.replace(/\D/g, '').slice(0, 3))}
                    keyboardType="number-pad"
                    containerStyle={styles.inputContainer}
                    leftIcon={<Ionicons name="calendar-outline" size={20} color={colors.textTertiary} />}
                  />

                  <Button
                    title="Continuer"
                    onPress={handleAgeSubmit}
                    disabled={!age || isNaN(Number(age)) || Number(age) < 18 || Number(age) > 100 || isLoading}
                    loading={isLoading}
                    style={styles.button}
                  />
                </View>
              </Animated.View>
            )}

            {step === 'gender' && (
              <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.stepContainer}>
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={() => setStep('age')}
                >
                  <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
                <View style={styles.stepHeader}>
                  <Text style={styles.title}>Quel est votre genre ?</Text>
                  <Text style={styles.subtitle}>Cette information sera visible sur votre profil</Text>
                </View>

                <View style={styles.form}>
                  <View style={styles.genderOptions}>
                    <TouchableOpacity
                      style={[
                        styles.genderOption,
                        gender === 'male' && styles.genderOptionActive,
                      ]}
                      onPress={() => setGender('male')}
                    >
                      <Ionicons
                        name="male"
                        size={32}
                        color={gender === 'male' ? '#ffffff' : colors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.genderOptionText,
                          gender === 'male' && styles.genderOptionTextActive,
                        ]}
                      >
                        Homme
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.genderOption,
                        gender === 'female' && styles.genderOptionActive,
                      ]}
                      onPress={() => setGender('female')}
                    >
                      <Ionicons
                        name="female"
                        size={32}
                        color={gender === 'female' ? '#ffffff' : colors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.genderOptionText,
                          gender === 'female' && styles.genderOptionTextActive,
                        ]}
                      >
                        Femme
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <Button
                    title="Continuer"
                    onPress={handleGenderSubmit}
                    disabled={!gender || isLoading}
                    loading={isLoading}
                    style={styles.button}
                  />
                </View>
              </Animated.View>
            )}

            {step === 'specialty' && (
              <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.stepContainer}>
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={() => setStep('gender')}
                >
                  <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
                <View style={styles.stepHeader}>
                  <Text style={styles.title}>Votre savoir-faire particulier</Text>
                  <Text style={styles.subtitle}>Ex: Avocat, Médecin, Ingénieur, etc. (optionnel)</Text>
                </View>

                <View style={styles.form}>
                  <Input
                    placeholder="Ex: Avocat, Médecin, Ingénieur..."
                    value={specialty}
                    onChangeText={setSpecialty}
                    containerStyle={styles.inputContainer}
                    leftIcon={<Ionicons name="briefcase-outline" size={20} color={colors.textTertiary} />}
                  />

                  <Button
                    title="Continuer"
                    onPress={handleSpecialtySubmit}
                    loading={isLoading}
                    style={styles.button}
                  />
                </View>
              </Animated.View>
            )}

            {step === 'password' && (
              <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.stepContainer}>
                {/* Bouton retour pour le mode signup et login */}
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={() => {
                    if (mode === 'signup') {
                      // Retour à l'étape précédente (specialty)
                      setStep('specialty');
                    } else {
                      // Retour au téléphone pour le login
                      setStep('phone');
                    }
                  }}
                >
                  <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
                <View style={styles.stepHeader}>
                  <Text style={styles.title}>
                    {mode === 'signup' ? 'Créez votre mot de passe' : 'Entrez votre mot de passe'}
                  </Text>
                  <Text style={styles.subtitle}>
                    {mode === 'signup'
                      ? 'Vous utiliserez ce mot de passe pour vous connecter'
                      : 'Entrez votre mot de passe pour accéder à votre compte'}
                  </Text>
                </View>

                <View style={styles.form}>
                  {mode === 'signup' && (
                    <View style={styles.passwordRequirements}>
                      <Text style={styles.passwordRequirementsTitle}>Le mot de passe doit contenir :</Text>
                      <View style={styles.passwordRequirementItem}>
                        <Ionicons 
                          name={password.length >= 8 ? "checkmark-circle" : "ellipse-outline"} 
                          size={16} 
                          color={password.length >= 8 ? colors.success : colors.textTertiary} 
                        />
                        <Text style={[styles.passwordRequirementText, password.length >= 8 && styles.passwordRequirementMet]}>
                          Au moins 8 caractères
                        </Text>
                      </View>
                      <View style={styles.passwordRequirementItem}>
                        <Ionicons 
                          name={/[A-Z]/.test(password) ? "checkmark-circle" : "ellipse-outline"} 
                          size={16} 
                          color={/[A-Z]/.test(password) ? colors.success : colors.textTertiary} 
                        />
                        <Text style={[styles.passwordRequirementText, /[A-Z]/.test(password) && styles.passwordRequirementMet]}>
                          Une majuscule
                        </Text>
                      </View>
                      <View style={styles.passwordRequirementItem}>
                        <Ionicons 
                          name={/[a-z]/.test(password) ? "checkmark-circle" : "ellipse-outline"} 
                          size={16} 
                          color={/[a-z]/.test(password) ? colors.success : colors.textTertiary} 
                        />
                        <Text style={[styles.passwordRequirementText, /[a-z]/.test(password) && styles.passwordRequirementMet]}>
                          Une minuscule
                        </Text>
                      </View>
                      <View style={styles.passwordRequirementItem}>
                        <Ionicons 
                          name={/[0-9]/.test(password) ? "checkmark-circle" : "ellipse-outline"} 
                          size={16} 
                          color={/[0-9]/.test(password) ? colors.success : colors.textTertiary} 
                        />
                        <Text style={[styles.passwordRequirementText, /[0-9]/.test(password) && styles.passwordRequirementMet]}>
                          Un chiffre
                        </Text>
                      </View>
                      <View style={styles.passwordRequirementItem}>
                        <Ionicons 
                          name={/[^A-Za-z0-9]/.test(password) ? "checkmark-circle" : "ellipse-outline"} 
                          size={16} 
                          color={/[^A-Za-z0-9]/.test(password) ? colors.success : colors.textTertiary} 
                        />
                        <Text style={[styles.passwordRequirementText, /[^A-Za-z0-9]/.test(password) && styles.passwordRequirementMet]}>
                          Un caractère spécial (!@#$%^&*...)
                        </Text>
                      </View>
                    </View>
                  )}
                  
                  <Input
                    placeholder="Mot de passe"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    containerStyle={styles.inputContainer}
                    leftIcon={<Ionicons name="lock-closed-outline" size={20} color={colors.textTertiary} />}
                  />

                  {mode === 'signup' && (
                    <Input
                      placeholder="Confirmer le mot de passe"
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry
                      containerStyle={styles.inputContainer}
                      leftIcon={<Ionicons name="lock-closed-outline" size={20} color={colors.textTertiary} />}
                    />
                  )}

                  <Button
                    title={mode === 'signup' ? 'Créer mon compte' : 'Se connecter'}
                    onPress={handlePasswordSubmit}
                    disabled={
                      (mode === 'signup' 
                        ? (!validatePassword(password).isValid || password !== confirmPassword)
                        : password.length < 1) || isLoading
                    }
                    loading={isLoading}
                    style={styles.button}
                    icon={<Ionicons name={mode === 'signup' ? 'checkmark' : 'log-in'} size={20} color="#ffffff" />}
                  />

                  {/* Bouton "Mot de passe oublié" pour le mode login */}
                  {mode === 'login' && (
                    <TouchableOpacity
                      style={styles.forgotPasswordButton}
                      onPress={async () => {
                        if (!phone || phone.length < 9) {
                          Alert.alert('Erreur', 'Veuillez d\'abord entrer votre numéro de téléphone');
                          setStep('phone');
                          return;
                        }

                        Alert.alert(
                          'Mot de passe oublié',
                          `Un email de réinitialisation sera envoyé à l'adresse associée à ${phone}.`,
                          [
                            { text: 'Annuler', style: 'cancel' },
                            {
                              text: 'Envoyer',
                              onPress: async () => {
                                setIsLoading(true);
                                try {
                                  const { error } = await resetPassword(phone);
                                  if (error) {
                                    Alert.alert('Erreur', error.message || 'Impossible d\'envoyer l\'email de réinitialisation');
                                  } else {
                                    Alert.alert('Succès', 'Un email de réinitialisation a été envoyé. Vérifiez votre boîte de réception.');
                                  }
                                } catch (error: any) {
                                  Alert.alert('Erreur', 'Une erreur est survenue');
                                  console.error('Reset password error:', error);
                                } finally {
                                  setIsLoading(false);
                                }
                              },
                            },
                          ]
                        );
                      }}
                      disabled={isLoading}
                    >
                      <Text style={styles.forgotPasswordText}>Mot de passe oublié ?</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </Animated.View>
            )}
          </View>
        </ScrollView>

        {/* Progress indicator */}
        {mode === 'signup' && (
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, step === 'phone' && styles.progressBarActive]} />
            <View style={[styles.progressBar, step === 'otp' && styles.progressBarActive]} />
            <View style={[styles.progressBar, step === 'pseudo' && styles.progressBarActive]} />
            <View style={[styles.progressBar, step === 'age' && styles.progressBarActive]} />
            <View style={[styles.progressBar, step === 'gender' && styles.progressBarActive]} />
            <View style={[styles.progressBar, step === 'specialty' && styles.progressBarActive]} />
            <View style={[styles.progressBar, step === 'password' && styles.progressBarActive]} />
          </View>
        )}
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    paddingTop: 48,
    paddingBottom: 32,
    alignItems: 'center',
  },
  logoContainer: {
    marginBottom: 8,
    alignItems: 'center',
  },
  logo: {
    width: 80,
    height: 80,
    marginBottom: 12,
  },
  logoText: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 2,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  scrollContentPassword: {
    paddingBottom: 100, // Plus d'espace en bas pour l'étape mot de passe
  },
  content: {
    flex: 1,
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: `${colors.backgroundSecondary}40`,
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: colors.pink500,
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  modeButtonTextActive: {
    color: '#ffffff',
  },
  stepContainer: {
    gap: 24,
  },
  stepHeader: {
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  form: {
    gap: 16,
  },
  inputContainer: {
    marginBottom: 8,
  },
  otpInput: {
    textAlign: 'center',
    letterSpacing: 8,
    fontSize: 24,
  },
  passwordRequirements: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  passwordRequirementsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  passwordRequirementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  passwordRequirementText: {
    fontSize: 13,
    color: colors.textTertiary,
    marginLeft: 8,
  },
  passwordRequirementMet: {
    color: colors.success,
  },
  button: {
    marginTop: 8,
  },
  resendButton: {
    marginTop: 8,
  },
  progressContainer: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingBottom: 32,
    paddingHorizontal: 24,
  },
  progressBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.backgroundTertiary,
  },
  progressBarActive: {
    backgroundColor: colors.pink500,
  },
  genderOptions: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 8,
  },
  genderOption: {
    flex: 1,
    padding: 24,
    borderRadius: 16,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 2,
    borderColor: colors.borderSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 120,
  },
  genderOptionActive: {
    backgroundColor: colors.pink500,
    borderColor: colors.pink500,
  },
  genderOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  genderOptionTextActive: {
    color: '#ffffff',
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 16,
    padding: 8,
  },
  forgotPasswordButton: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 12,
  },
  forgotPasswordText: {
    fontSize: 14,
    color: colors.pink400,
    fontWeight: '500',
  },
});

