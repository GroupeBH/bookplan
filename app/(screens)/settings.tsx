import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, RefreshControl, Modal, TextInput, Switch, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ImageWithFallback } from '../../components/ImageWithFallback';
import { useBlock } from '../../context/BlockContext';
import { useUser } from '../../context/UserContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import Animated, { FadeIn } from 'react-native-reanimated';

export default function SettingsScreen() {
  const router = useRouter();
  const { blockedUsers, isLoading, unblockUser, refreshBlockedUsers } = useBlock();
  const { setSelectedUser, currentUser } = useUser();
  const { user, sendOTP, verifyOTPSimple } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  
  // États pour modifier le mot de passe
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  
  // États pour modifier le numéro de téléphone
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [isChangingPhone, setIsChangingPhone] = useState(false);
  
  // États pour les notifications push
  const [pushNotificationsEnabled, setPushNotificationsEnabled] = useState(true);
  const [isLoadingPushSettings, setIsLoadingPushSettings] = useState(true);

  // Charger les préférences de notifications push
  const loadPushNotificationSettings = useCallback(async () => {
    if (!user?.id) return;
    
    setIsLoadingPushSettings(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('push_notifications_enabled')
        .eq('id', user.id)
        .single();

      if (!error && data) {
        setPushNotificationsEnabled(data.push_notifications_enabled ?? true);
      }
    } catch (error) {
      console.error('Error loading push notification settings:', error);
    } finally {
      setIsLoadingPushSettings(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadPushNotificationSettings();
  }, [loadPushNotificationSettings]);

  // Recharger la liste au focus
  useFocusEffect(
    useCallback(() => {
      refreshBlockedUsers();
      loadPushNotificationSettings();
    }, [refreshBlockedUsers, loadPushNotificationSettings])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshBlockedUsers();
    setRefreshing(false);
  };

  const handleUnblock = async (blockedId: string, blockedPseudo: string) => {
    Alert.alert(
      'Débloquer',
      `Êtes-vous sûr de vouloir débloquer ${blockedPseudo} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Débloquer',
          style: 'destructive',
          onPress: async () => {
            const success = await unblockUser(blockedId);
            if (success) {
              Alert.alert('Succès', 'Utilisateur débloqué');
              await refreshBlockedUsers();
            } else {
              Alert.alert('Erreur', 'Impossible de débloquer l\'utilisateur');
            }
          },
        },
      ]
    );
  };

  const handleViewProfile = async (blockedId: string) => {
    // Charger le profil complet depuis Supabase
    try {
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', blockedId)
        .single();

      if (userProfile) {
        const fullUser = {
          id: userProfile.id,
          pseudo: userProfile.pseudo || 'Utilisateur',
          age: userProfile.age || 25,
          phone: userProfile.phone || '',
          photo: userProfile.photo || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
          description: userProfile.description || '',
          distance: undefined,
          rating: parseFloat(userProfile.rating) || 0,
          reviewCount: userProfile.review_count || 0,
          isSubscribed: userProfile.is_subscribed || false,
          subscriptionStatus: userProfile.subscription_status || 'pending',
          lastSeen: userProfile.last_seen || 'En ligne',
          gender: userProfile.gender || 'female',
          lat: userProfile.lat ? parseFloat(userProfile.lat) : undefined,
          lng: userProfile.lng ? parseFloat(userProfile.lng) : undefined,
          isAvailable: userProfile.is_available ?? true,
          currentBookingId: userProfile.current_booking_id,
        };
        setSelectedUser(fullUser);
        router.push('/(screens)/user-profile');
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
      Alert.alert('Erreur', 'Impossible de charger le profil');
    }
  };

  // Modifier le mot de passe
  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Erreur', 'Les mots de passe ne correspondent pas');
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert('Erreur', 'Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

    setIsChangingPassword(true);
    try {
      // Récupérer l'email de l'utilisateur depuis auth.users
      const { data: authUser } = await supabase.auth.getUser();
      if (!authUser?.user?.email) {
        Alert.alert('Erreur', 'Impossible de récupérer les informations de votre compte');
        setIsChangingPassword(false);
        return;
      }

      // Vérifier le mot de passe actuel en essayant de se connecter
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: authUser.user.email,
        password: currentPassword,
      });

      if (signInError) {
        Alert.alert('Erreur', 'Mot de passe actuel incorrect');
        setIsChangingPassword(false);
        return;
      }

      // Mettre à jour le mot de passe
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        Alert.alert('Erreur', updateError.message || 'Impossible de modifier le mot de passe');
      } else {
        Alert.alert('Succès', 'Mot de passe modifié avec succès');
        setShowPasswordModal(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Une erreur est survenue');
    } finally {
      setIsChangingPassword(false);
    }
  };

  // Envoyer l'OTP pour le nouveau numéro
  const handleSendOTPForPhone = async () => {
    if (!newPhone.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer un numéro de téléphone');
      return;
    }

    setIsChangingPhone(true);
    try {
      const { error, otpCode } = await sendOTP(newPhone);
      if (error) {
        Alert.alert('Erreur', error.message || 'Impossible d\'envoyer le code OTP');
      } else {
        setOtpSent(true);
        Alert.alert('Code envoyé', 'Vérifiez votre téléphone pour le code OTP');
      }
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Une erreur est survenue');
    } finally {
      setIsChangingPhone(false);
    }
  };

  // Vérifier l'OTP et mettre à jour le numéro de téléphone
  const handleVerifyOTPAndUpdatePhone = async () => {
    if (!otpCode.trim() || otpCode.length !== 6) {
      Alert.alert('Erreur', 'Veuillez entrer un code OTP valide (6 chiffres)');
      return;
    }

    setIsChangingPhone(true);
    try {
      // Vérifier l'OTP avec la fonction simple
      const { error: verifyError } = await verifyOTPSimple(newPhone, otpCode);
      if (verifyError) {
        Alert.alert('Erreur', verifyError.message || 'Code OTP incorrect');
        setIsChangingPhone(false);
        return;
      }

      const formattedNewPhone = newPhone.startsWith('+') ? newPhone : `+${newPhone}`;
      
      // Générer le nouvel email basé sur le nouveau numéro (même logique que dans AuthContext)
      const phoneDigits = formattedNewPhone.replace(/[^0-9]/g, '');
      const phoneHash = phoneDigits.slice(-8);
      const newEmail = `jonathantshombe+${phoneHash}@gmail.com`;

      // Mettre à jour le numéro de téléphone dans le profil
      const { error: updateProfileError } = await supabase
        .from('profiles')
        .update({ phone: formattedNewPhone })
        .eq('id', user?.id);

      if (updateProfileError) {
        Alert.alert('Erreur', 'Impossible de mettre à jour le numéro de téléphone dans le profil');
        setIsChangingPhone(false);
        return;
      }

      // Mettre à jour l'email dans auth.users pour que la connexion fonctionne avec le nouveau numéro
      const { error: updateAuthError } = await supabase.auth.updateUser({
        email: newEmail,
      });

      if (updateAuthError) {
        Alert.alert('Erreur', 'Impossible de mettre à jour l\'email de connexion');
        setIsChangingPhone(false);
        return;
      }

      Alert.alert('Succès', 'Numéro de téléphone modifié avec succès. Vous devrez vous reconnecter avec votre nouveau numéro.');
      setShowPhoneModal(false);
      setNewPhone('');
      setOtpCode('');
      setOtpSent(false);
      // Déconnexion pour forcer la reconnexion avec le nouveau numéro
      setTimeout(() => {
        router.replace('/(screens)/auth');
      }, 2000);
    } catch (error: any) {
      console.error('Error in handleVerifyOTPAndUpdatePhone:', error);
      Alert.alert('Erreur', error.message || 'Une erreur est survenue');
      setIsChangingPhone(false);
    }
  };

  // Toggle les notifications push
  const handleTogglePushNotifications = async (enabled: boolean) => {
    if (!user?.id) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ push_notifications_enabled: enabled })
        .eq('id', user.id);

      if (error) {
        Alert.alert('Erreur', 'Impossible de mettre à jour les préférences de notifications');
      } else {
        setPushNotificationsEnabled(enabled);
        if (enabled) {
          Alert.alert('Succès', 'Notifications push activées');
        } else {
          Alert.alert('Succès', 'Notifications push désactivées');
        }
      }
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Une erreur est survenue');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Paramètres</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.purple500}
          />
        }
      >
        {/* Section Compte */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="person-circle-outline" size={24} color={colors.text} />
            <Text style={styles.sectionTitle}>Compte</Text>
          </View>
          
          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => setShowPasswordModal(true)}
          >
            <View style={styles.settingItemLeft}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.text} />
              <Text style={styles.settingItemText}>Modifier le mot de passe</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => {
              setShowPhoneModal(true);
              setOtpSent(false);
              setNewPhone('');
              setOtpCode('');
            }}
          >
            <View style={styles.settingItemLeft}>
              <Ionicons name="call-outline" size={20} color={colors.text} />
              <View style={styles.settingItemInfo}>
                <Text style={styles.settingItemText}>Modifier le numéro de téléphone</Text>
                <Text style={styles.settingItemSubtext}>{currentUser?.phone || user?.phone || 'Non défini'}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* Section Notifications */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="notifications-outline" size={24} color={colors.text} />
            <Text style={styles.sectionTitle}>Notifications</Text>
          </View>
          
          <View style={styles.settingItem}>
            <View style={styles.settingItemLeft}>
              <Ionicons name="notifications" size={20} color={colors.text} />
              <View style={styles.settingItemInfo}>
                <Text style={styles.settingItemText}>Notifications push</Text>
                <Text style={styles.settingItemSubtext}>
                  {pushNotificationsEnabled ? 'Activées' : 'Désactivées'}
                </Text>
              </View>
            </View>
            {isLoadingPushSettings ? (
              <ActivityIndicator size="small" color={colors.purple500} />
            ) : (
              <Switch
                value={pushNotificationsEnabled}
                onValueChange={handleTogglePushNotifications}
                trackColor={{ false: colors.borderSecondary, true: colors.purple500 }}
                thumbColor={pushNotificationsEnabled ? '#ffffff' : colors.textTertiary}
              />
            )}
          </View>
        </View>

        {/* Section Profils bloqués */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="lock-closed" size={24} color={colors.text} />
            <Text style={styles.sectionTitle}>Profils bloqués</Text>
          </View>
          <Text style={styles.sectionSubtitle}>
            Les utilisateurs que vous avez bloqués ne peuvent plus vous voir, vous envoyer de messages ou de demandes.
          </Text>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Chargement...</Text>
            </View>
          ) : blockedUsers.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="lock-open-outline" size={48} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>Aucun profil bloqué</Text>
              <Text style={styles.emptySubtitle}>
                Vous n'avez bloqué aucun utilisateur pour le moment.
              </Text>
            </View>
          ) : (
            <View style={styles.blockedList}>
              {blockedUsers.map((blockedUser, index) => (
                <Animated.View
                  key={blockedUser.blockedId}
                  entering={FadeIn.delay(index * 50)}
                  style={styles.blockedItem}
                >
                  <TouchableOpacity
                    style={styles.blockedItemContent}
                    onPress={() => handleViewProfile(blockedUser.blockedId)}
                  >
                    <ImageWithFallback
                      source={{ uri: blockedUser.blockedPhoto }}
                      style={styles.blockedAvatar}
                    />
                    <View style={styles.blockedInfo}>
                      <Text style={styles.blockedName}>{blockedUser.blockedPseudo}</Text>
                      <Text style={styles.blockedDate}>
                        Bloqué le {new Date(blockedUser.blockedAt).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <Button
                    title="Débloquer"
                    variant="outline"
                    onPress={() => handleUnblock(blockedUser.blockedId, blockedUser.blockedPseudo)}
                    icon={<Ionicons name="lock-open-outline" size={18} color={colors.text} />}
                    style={styles.unblockButton}
                  />
                </Animated.View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Modal Modifier le mot de passe */}
      <Modal
        visible={showPasswordModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPasswordModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Modifier le mot de passe</Text>
              <TouchableOpacity onPress={() => setShowPasswordModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Input
              label="Mot de passe actuel"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
              placeholder="Entrez votre mot de passe actuel"
              containerStyle={styles.modalInput}
            />

            <Input
              label="Nouveau mot de passe"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              placeholder="Entrez votre nouveau mot de passe"
              containerStyle={styles.modalInput}
            />

            <Input
              label="Confirmer le nouveau mot de passe"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              placeholder="Confirmez votre nouveau mot de passe"
              containerStyle={styles.modalInput}
            />

            <View style={styles.modalActions}>
              <Button
                title="Annuler"
                variant="outline"
                onPress={() => {
                  setShowPasswordModal(false);
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                }}
                style={styles.modalButton}
              />
              <Button
                title="Modifier"
                onPress={handleChangePassword}
                loading={isChangingPassword}
                disabled={isChangingPassword}
                style={styles.modalButton}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Modifier le numéro de téléphone */}
      <Modal
        visible={showPhoneModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPhoneModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Modifier le numéro de téléphone</Text>
              <TouchableOpacity onPress={() => {
                setShowPhoneModal(false);
                setNewPhone('');
                setOtpCode('');
                setOtpSent(false);
              }}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDescription}>
              {otpSent 
                ? 'Entrez le code OTP reçu sur votre nouveau numéro de téléphone'
                : 'Entrez votre nouveau numéro de téléphone. Un code OTP sera envoyé pour vérification.'}
            </Text>

            {!otpSent ? (
              <>
                <Input
                  label="Nouveau numéro de téléphone"
                  value={newPhone}
                  onChangeText={setNewPhone}
                  placeholder="+243XXXXXXXXX"
                  keyboardType="phone-pad"
                  containerStyle={styles.modalInput}
                />

                <View style={styles.modalActions}>
                  <Button
                    title="Annuler"
                    variant="outline"
                    onPress={() => {
                      setShowPhoneModal(false);
                      setNewPhone('');
                      setOtpCode('');
                      setOtpSent(false);
                    }}
                    style={styles.modalButton}
                  />
                  <Button
                    title="Envoyer le code OTP"
                    onPress={handleSendOTPForPhone}
                    loading={isChangingPhone}
                    disabled={isChangingPhone || !newPhone.trim()}
                    style={styles.modalButton}
                  />
                </View>
              </>
            ) : (
              <>
                <Input
                  label="Code OTP"
                  value={otpCode}
                  onChangeText={setOtpCode}
                  placeholder="000000"
                  keyboardType="number-pad"
                  maxLength={6}
                  containerStyle={styles.modalInput}
                />

                <TouchableOpacity
                  onPress={handleSendOTPForPhone}
                  style={styles.resendOtpButton}
                >
                  <Text style={styles.resendOtpText}>Renvoyer le code</Text>
                </TouchableOpacity>

                <View style={styles.modalActions}>
                  <Button
                    title="Annuler"
                    variant="outline"
                    onPress={() => {
                      setShowPhoneModal(false);
                      setNewPhone('');
                      setOtpCode('');
                      setOtpSent(false);
                    }}
                    style={styles.modalButton}
                  />
                  <Button
                    title="Vérifier et modifier"
                    onPress={handleVerifyOTPAndUpdatePhone}
                    loading={isChangingPhone}
                    disabled={isChangingPhone || otpCode.length !== 6}
                    style={styles.modalButton}
                  />
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: `${colors.backgroundSecondary}80`,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSecondary,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    gap: 24,
  },
  section: {
    gap: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  loadingContainer: {
    padding: 24,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  emptyContainer: {
    padding: 48,
    alignItems: 'center',
    gap: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  blockedList: {
    gap: 12,
  },
  blockedItem: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  blockedItemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  blockedAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  blockedInfo: {
    flex: 1,
    gap: 4,
  },
  blockedName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  blockedDate: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  unblockButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  settingItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  settingItemInfo: {
    flex: 1,
    gap: 4,
  },
  settingItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  settingItemSubtext: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  modalDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 24,
    lineHeight: 20,
  },
  modalInput: {
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    marginTop: 0,
  },
  resendOtpButton: {
    alignSelf: 'flex-end',
    marginBottom: 16,
  },
  resendOtpText: {
    fontSize: 14,
    color: colors.purple500,
    fontWeight: '500',
  },
});

