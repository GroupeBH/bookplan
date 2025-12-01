import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { colors } from '../../constants/colors';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../context/AuthContext';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

type AuthMode = 'signup' | 'login';
type AuthStep = 'phone' | 'otp' | 'pseudo' | 'age' | 'gender' | 'password';

export default function AuthScreen() {
  const router = useRouter();
  const { sendOTP, verifyOTP, updateUser, signUpWithPassword, loginWithPassword, resetPassword, user, isAuthenticated } = useAuth();
  const [mode, setMode] = useState<AuthMode>('signup'); // 'signup' ou 'login'
  const [step, setStep] = useState<AuthStep>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [pseudo, setPseudo] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | ''>('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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
    if (phone.length < 9) {
      Alert.alert('Erreur', 'Veuillez entrer un numéro de téléphone valide');
      return;
    }

    if (mode === 'login') {
      // En mode login, passer directement à l'étape mot de passe
      setStep('password');
      return;
    }

    // En mode signup, envoyer l'OTP
    setIsLoading(true);
    try {
      const { error } = await sendOTP(phone);
      
      if (error) {
        Alert.alert(
          'Erreur',
          error.message || 'Impossible d\'envoyer le code. Vérifiez votre numéro de téléphone.'
        );
        setIsLoading(false);
        return;
      }

      setStep('otp');
      Alert.alert('Code envoyé', `Un code a été envoyé au ${phone}`);
    } catch (error: any) {
      Alert.alert('Erreur', 'Une erreur est survenue lors de l\'envoi du code');
      console.error('Send OTP error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async () => {
    if (otp.length !== 6) {
      Alert.alert('Erreur', 'Veuillez entrer un code à 6 chiffres');
      return;
    }

    setIsLoading(true);
    try {
      // Obtenir la position actuelle
      let lat: number | undefined;
      let lng: number | undefined;

      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          lat = location.coords.latitude;
          lng = location.coords.longitude;
        }
      } catch (error) {
        console.error('Error getting location:', error);
      }

      // Vérifier l'OTP sans créer le compte (le compte sera créé avec le mot de passe)
      const { error, user: verifiedUser } = await verifyOTP(phone, otp, undefined, lat, lng);
      
      if (error) {
        // Si l'utilisateur existe déjà, proposer de se connecter
        if (error.message?.includes('déjà enregistré') || error.message?.includes('déjà connecté')) {
          Alert.alert(
            'Compte existant',
            error.message || 'Ce numéro est déjà enregistré. Veuillez vous connecter avec votre mot de passe.',
            [
              {
                text: 'Se connecter',
                onPress: () => {
                  setMode('login');
                  setStep('phone');
                  setOtp('');
                },
              },
              {
                text: 'Annuler',
                style: 'cancel',
              },
            ]
          );
        } else {
          Alert.alert(
            'Erreur',
            error.message || 'Code invalide. Veuillez réessayer.'
          );
        }
        setIsLoading(false);
        return;
      }

      // Si verifiedUser est null, cela signifie que l'OTP est vérifié mais le compte n'est pas encore créé
      // On passe à l'étape pseudo pour continuer le processus d'inscription
      if (!verifiedUser) {
        // OTP vérifié, continuer avec les étapes d'inscription
        setStep('pseudo');
      } else if (verifiedUser && (!verifiedUser.pseudo || verifiedUser.pseudo === 'Utilisateur')) {
        // Cas où l'utilisateur existe déjà mais n'a pas de pseudo
        setStep('pseudo');
      } else if (verifiedUser) {
        // L'utilisateur a déjà un profil complet, rediriger vers le dashboard
        router.replace('/(screens)/dashboard');
      }
    } catch (error: any) {
      Alert.alert('Erreur', 'Une erreur est survenue lors de la vérification du code');
      console.error('Verify OTP error:', error);
    } finally {
      setIsLoading(false);
    }
  };

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

    // Passer à l'étape mot de passe
    setStep('password');
  };

  const handlePasswordSubmit = async () => {
    if (password.length < 6) {
      Alert.alert('Erreur', 'Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

    if (mode === 'signup' && password !== confirmPassword) {
      Alert.alert('Erreur', 'Les mots de passe ne correspondent pas');
      return;
    }

    setIsLoading(true);
    try {
      if (mode === 'signup') {
        // Obtenir la position actuelle
        let lat: number | undefined;
        let lng: number | undefined;

        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            const location = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            lat = location.coords.latitude;
            lng = location.coords.longitude;
          }
        } catch (error) {
          console.error('Error getting location:', error);
        }

        // Vérifier l'OTP et créer le compte avec le mot de passe saisi par l'utilisateur
        // Note: verifyOTP vérifie que l'OTP a été vérifié précédemment et crée le compte avec le mot de passe
        const { error, user: newUser } = await verifyOTP(
          phone,
          '', // Pas besoin de token car l'OTP a déjà été vérifié
          pseudo.trim(),
          lat,
          lng,
          password // Passer le mot de passe saisi par l'utilisateur
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
            gender as 'male' | 'female'
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
      const { error } = await sendOTP(phone);
      if (error) {
        Alert.alert('Erreur', 'Impossible de renvoyer le code');
      } else {
        Alert.alert('Code renvoyé', 'Un nouveau code a été envoyé');
      }
    } catch (error) {
      Alert.alert('Erreur', 'Une erreur est survenue');
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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <LinearGradient
              colors={[colors.pink500, colors.pink700]}
              style={styles.logo}
            >
              <Ionicons name="sparkles" size={32} color="#ffffff" />
            </LinearGradient>
          </View>
        </View>

        {/* Content */}
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
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
                  <Text style={styles.subtitle}>Entrez le code envoyé au {phone}</Text>
                  <Text style={styles.devHint}>
                    💡 Mode développement : Utilisez le code <Text style={styles.devCode}>123456</Text>
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

            {step === 'password' && (
              <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.stepContainer}>
                {/* Bouton retour pour le mode signup et login */}
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={() => {
                    if (mode === 'signup') {
                      // Retour à l'étape précédente (genre)
                      setStep('gender');
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
                      password.length < 6 || (mode === 'signup' && password !== confirmPassword) || isLoading
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
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
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
  devHint: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 8,
    textAlign: 'center',
  },
  devCode: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.pink400,
    fontFamily: 'monospace',
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

