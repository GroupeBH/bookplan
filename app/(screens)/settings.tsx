import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Modal, Switch, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { FloatingAlert } from '../../components/ui/FloatingAlert';
import { Input } from '../../components/ui/Input';
import { ImageWithFallback } from '../../components/ImageWithFallback';
import { useBlock } from '../../context/BlockContext';
import { useUser } from '../../context/UserContext';
import { useAuth } from '../../context/AuthContext';
import { isValidPhoneNumber, normalizePhoneNumber } from '../../lib/phone';
import { supabase } from '../../lib/supabase';
import Animated, { FadeIn } from 'react-native-reanimated';

type FeedbackType = 'success' | 'error' | 'info';

export default function SettingsScreen() {
  const router = useRouter();
  const { blockedUsers, isLoading, unblockUser, refreshBlockedUsers } = useBlock();
  const { setSelectedUser, currentUser } = useUser();
  const { user, sendOTP, verifyOTPSimple, logout } = useAuth();
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
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isUnblocking, setIsUnblocking] = useState(false);
  const [pendingUnblock, setPendingUnblock] = useState<{ id: string; pseudo: string } | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showReconnectConfirm, setShowReconnectConfirm] = useState(false);
  const [feedback, setFeedback] = useState<{
    visible: boolean;
    type: FeedbackType;
    title: string;
    message: string;
  }>({
    visible: false,
    type: 'info',
    title: '',
    message: '',
  });

  const resetPhoneModalState = useCallback(() => {
    setShowPhoneModal(false);
    setNewPhone('');
    setOtpCode('');
    setOtpSent(false);
  }, []);

  const showFeedback = useCallback((type: FeedbackType, title: string, message: string) => {
    setFeedback({ visible: true, type, title, message });
  }, []);

  const hideFeedback = useCallback(() => {
    setFeedback((prev) => ({ ...prev, visible: false }));
  }, []);

  const performLogout = useCallback(async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    try {
      await logout();
      router.replace('/(screens)/auth');
    } catch (error: any) {
      showFeedback('error', 'Erreur', error?.message || 'Impossible de vous déconnecter pour le moment');
    } finally {
      setIsLoggingOut(false);
      setShowLogoutConfirm(false);
      setShowReconnectConfirm(false);
    }
  }, [isLoggingOut, logout, router, showFeedback]);

  const handleLogoutPress = useCallback(() => {
    if (isLoggingOut) return;
    setShowLogoutConfirm(true);
  }, [isLoggingOut]);

  const handleConfirmUnblock = useCallback(async () => {
    if (!pendingUnblock || isUnblocking) return;

    setIsUnblocking(true);
    try {
      const success = await unblockUser(pendingUnblock.id);
      if (success) {
        showFeedback('success', 'Succès', 'Utilisateur débloqué');
        await refreshBlockedUsers();
      } else {
        showFeedback('error', 'Erreur', 'Impossible de débloquer l\'utilisateur');
      }
    } finally {
      setPendingUnblock(null);
      setIsUnblocking(false);
    }
  }, [pendingUnblock, isUnblocking, unblockUser, refreshBlockedUsers, showFeedback]);

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

  const handleUnblock = (blockedId: string, blockedPseudo: string) => {
    setPendingUnblock({ id: blockedId, pseudo: blockedPseudo });
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
      showFeedback('error', 'Erreur', 'Impossible de charger le profil');
    }
  };

  // Modifier le mot de passe
  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      showFeedback('error', 'Erreur', 'Veuillez remplir tous les champs');
      return;
    }

    if (newPassword !== confirmPassword) {
      showFeedback('error', 'Erreur', 'Les mots de passe ne correspondent pas');
      return;
    }

    if (newPassword.length < 6) {
      showFeedback('error', 'Erreur', 'Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

    setIsChangingPassword(true);
    try {
      // Récupérer l'email de l'utilisateur depuis auth.users
      const { data: authUser } = await supabase.auth.getUser();
      if (!authUser?.user?.email) {
        showFeedback('error', 'Erreur', 'Impossible de récupérer les informations de votre compte');
        return;
      }

      // Vérifier le mot de passe actuel en essayant de se connecter
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: authUser.user.email,
        password: currentPassword,
      });

      if (signInError) {
        showFeedback('error', 'Erreur', 'Mot de passe actuel incorrect');
        return;
      }

      // Mettre à jour le mot de passe
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        showFeedback('error', 'Erreur', updateError.message || 'Impossible de modifier le mot de passe');
      } else {
        showFeedback('success', 'Succès', 'Mot de passe modifié avec succès');
        setShowPasswordModal(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (error: any) {
      showFeedback('error', 'Erreur', error.message || 'Une erreur est survenue');
    } finally {
      setIsChangingPassword(false);
    }
  };

  // Envoyer l'OTP pour le nouveau numéro
  const handleSendOTPForPhone = async () => {
    const normalizedPhone = normalizePhoneNumber(newPhone);
    if (!isValidPhoneNumber(normalizedPhone)) {
      showFeedback('error', 'Erreur', 'Veuillez entrer un numéro de téléphone');
      return;
    }

    setIsChangingPhone(true);
    try {
      setNewPhone(normalizedPhone);
      const { error } = await sendOTP(normalizedPhone);
      if (error) {
        showFeedback('error', 'Erreur', error.message || 'Impossible d\'envoyer le code OTP');
      } else {
        setOtpSent(true);
        showFeedback('success', 'Code envoyé', 'Vérifiez votre téléphone pour le code OTP');
      }
    } catch (error: any) {
      showFeedback('error', 'Erreur', error.message || 'Une erreur est survenue');
    } finally {
      setIsChangingPhone(false);
    }
  };

  // Vérifier l'OTP et mettre à jour le numéro de téléphone
  const handleVerifyOTPAndUpdatePhone = async () => {
    if (!otpCode.trim() || otpCode.length !== 6) {
      showFeedback('error', 'Erreur', 'Veuillez entrer un code OTP valide (6 chiffres)');
      return;
    }

    setIsChangingPhone(true);
    try {
      const normalizedPhone = normalizePhoneNumber(newPhone);
      if (!isValidPhoneNumber(normalizedPhone)) {
        showFeedback('error', 'Erreur', 'Veuillez entrer un numéro de téléphone valide');
        return;
      }

      // Vérifier l'OTP avec la fonction simple
      const { error: verifyError } = await verifyOTPSimple(normalizedPhone, otpCode);
      if (verifyError) {
        showFeedback('error', 'Erreur', verifyError.message || 'Code OTP incorrect');
        return;
      }

      const formattedNewPhone = normalizedPhone;

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
        showFeedback('error', 'Erreur', 'Impossible de mettre à jour le numéro de téléphone dans le profil');
        return;
      }

      // Mettre à jour l'email dans auth.users pour que la connexion fonctionne avec le nouveau numéro
      const { error: updateAuthError } = await supabase.auth.updateUser({
        email: newEmail,
      });

      if (updateAuthError) {
        showFeedback('error', 'Erreur', 'Impossible de mettre à jour l\'email de connexion');
        return;
      }

      resetPhoneModalState();
      setShowReconnectConfirm(true);
    } catch (error: any) {
      console.error('Error in handleVerifyOTPAndUpdatePhone:', error);
      showFeedback('error', 'Erreur', error.message || 'Une erreur est survenue');
    } finally {
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
        showFeedback('error', 'Erreur', 'Impossible de mettre à jour les préférences de notifications');
      } else {
        setPushNotificationsEnabled(enabled);
        if (enabled) {
          showFeedback('success', 'Succès', 'Notifications push activées');
        } else {
          showFeedback('success', 'Succès', 'Notifications push désactivées');
        }
      }
    } catch (error: any) {
      showFeedback('error', 'Erreur', error.message || 'Une erreur est survenue');
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
      <FloatingAlert
        visible={feedback.visible}
        type={feedback.type}
        title={feedback.title}
        message={feedback.message}
        onHide={hideFeedback}
      />

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
              resetPhoneModalState();
              setShowPhoneModal(true);
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

        {/* Section Session */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="log-out-outline" size={24} color={colors.red500} />
            <Text style={styles.sectionTitle}>Session</Text>
          </View>
          <Text style={styles.sectionSubtitle}>
            Vous pouvez vous déconnecter de cet appareil en toute sécurité.
          </Text>
          <Button
            title="Se déconnecter"
            variant="outline"
            onPress={handleLogoutPress}
            loading={isLoggingOut}
            disabled={isLoggingOut}
            icon={!isLoggingOut ? <Ionicons name="log-out-outline" size={18} color={colors.red500} /> : undefined}
            style={[styles.settingItem, styles.logoutSettingButton]}
            textStyle={styles.logoutSettingButtonText}
          />
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
                Vous n&apos;avez bloqué aucun utilisateur pour le moment.
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

      <ConfirmDialog
        visible={showLogoutConfirm}
        title="Déconnexion"
        message="Voulez-vous vraiment vous déconnecter ?"
        confirmLabel="Se déconnecter"
        confirmTone="danger"
        iconName="log-out-outline"
        loading={isLoggingOut}
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={() => {
          void performLogout();
        }}
      />

      <ConfirmDialog
        visible={!!pendingUnblock}
        title="Débloquer"
        message={
          pendingUnblock
            ? `Confirmez le déblocage de ${pendingUnblock.pseudo}.`
            : 'Confirmez cette action.'
        }
        confirmLabel="Débloquer"
        confirmTone="danger"
        iconName="lock-open-outline"
        loading={isUnblocking}
        onCancel={() => setPendingUnblock(null)}
        onConfirm={() => {
          void handleConfirmUnblock();
        }}
      />

      <ConfirmDialog
        visible={showReconnectConfirm}
        title="Numéro mis à jour"
        message="Votre numéro a été modifié. Reconnectez-vous maintenant pour finaliser la mise à jour."
        confirmLabel="Se reconnecter"
        cancelLabel="Plus tard"
        iconName="checkmark-circle-outline"
        loading={isLoggingOut}
        onCancel={() => setShowReconnectConfirm(false)}
        onConfirm={() => {
          void performLogout();
        }}
      />

      {/* Modal Modifier le mot de passe */}
      <Modal
        visible={showPasswordModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowPasswordModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 16}
        >
          <ScrollView
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Modifier le mot de passe</Text>
              <TouchableOpacity onPress={() => setShowPasswordModal(false)} style={styles.modalCloseButton}>
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
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal Modifier le numéro de téléphone */}
      <Modal
        visible={showPhoneModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={resetPhoneModalState}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 16}
        >
          <ScrollView
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Modifier le numéro de téléphone</Text>
              <TouchableOpacity onPress={resetPhoneModalState} style={styles.modalCloseButton}>
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
                    onPress={resetPhoneModalState}
                    style={styles.modalButton}
                  />
                  <Button
                    title="Envoyer le code OTP"
                    onPress={handleSendOTPForPhone}
                    loading={isChangingPhone}
                    disabled={isChangingPhone || !isValidPhoneNumber(newPhone)}
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
                    onPress={resetPhoneModalState}
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
          </ScrollView>
        </KeyboardAvoidingView>
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
  logoutSettingButton: {
    borderColor: colors.red500,
    marginBottom: 0,
  },
  logoutSettingButtonText: {
    color: colors.red500,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  modalContent: {
    backgroundColor: '#111111',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
    padding: 24,
    maxHeight: '92%',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  modalHandle: {
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.backgroundTertiary,
    alignItems: 'center',
    justifyContent: 'center',
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
