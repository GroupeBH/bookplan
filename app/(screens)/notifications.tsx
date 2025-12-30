import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../constants/colors';
import { useNotification } from '../../context/NotificationContext';
import { Notification, NotificationType } from '../../types';

export default function NotificationsScreen() {
  const router = useRouter();
  const {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteAllNotifications,
    refreshNotifications,
  } = useNotification();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedNotifications, setSelectedNotifications] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  // Rafraîchir les notifications quand la page est mise au focus
  useFocusEffect(
    React.useCallback(() => {
      refreshNotifications();
    }, [refreshNotifications])
  );

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await refreshNotifications();
    setRefreshing(false);
  }, [refreshNotifications]);

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case 'access_request_received':
      case 'access_request_accepted':
      case 'access_request_rejected':
        return 'lock-open-outline';
      case 'booking_request_received':
      case 'booking_request_accepted':
      case 'booking_request_rejected':
      case 'booking_reminder':
        return 'heart-outline';
      case 'offer_application_received':
      case 'offer_application_accepted':
      case 'offer_application_rejected':
        return 'gift-outline';
      default:
        return 'notifications-outline';
    }
  };

  const getNotificationColor = (type: NotificationType) => {
    switch (type) {
      case 'access_request_received':
      case 'booking_request_received':
      case 'offer_application_received':
        return colors.purple500;
      case 'access_request_accepted':
      case 'booking_request_accepted':
      case 'offer_application_accepted':
        return colors.green500;
      case 'access_request_rejected':
      case 'booking_request_rejected':
      case 'offer_application_rejected':
        return colors.red500;
      case 'booking_reminder':
        return colors.yellow500;
      default:
        return colors.textSecondary;
    }
  };

  const handleNotificationPress = async (notification: Notification) => {
    // Marquer comme lue si ce n'est pas déjà fait
    if (!notification.isRead) {
      await markAsRead(notification.id);
    }

    // Naviguer selon le type
    const { type, data } = notification;

    switch (type) {
      case 'access_request_received':
        // Rediriger vers la page des demandes d'accès
        router.push('/(screens)/requests');
        break;
      case 'access_request_accepted':
      case 'access_request_rejected':
        if (data?.userId) {
          router.push(`/(screens)/user-profile?userId=${data.userId}`);
        }
        break;
      case 'booking_request_received':
        // Rediriger vers la page des demandes de compagnie
        router.push('/(screens)/requests');
        break;
      case 'booking_request_accepted':
      case 'booking_request_rejected':
      case 'booking_reminder':
        if (data?.bookingId) {
          // TODO: Créer une page booking-details si elle n'existe pas
          // router.push(`/(screens)/booking-details?bookingId=${data.bookingId}`);
          router.push('/(screens)/requests');
        }
        break;
      case 'offer_application_received':
        if (data?.offerId) {
          router.push(`/(screens)/offer-details?offerId=${data.offerId}`);
        }
        break;
      case 'offer_application_accepted':
      case 'offer_application_rejected':
        if (data?.offerId) {
          router.push(`/(screens)/offer-details?offerId=${data.offerId}`);
        }
        break;
      default:
        break;
    }
  };

  const handleToggleSelection = (notificationId: string) => {
    setSelectedNotifications((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(notificationId)) {
        newSet.delete(notificationId);
      } else {
        newSet.add(notificationId);
      }
      return newSet;
    });
  };

  const handleDeleteSelected = async () => {
    if (selectedNotifications.size === 0) return;

    Alert.alert(
      'Supprimer les notifications',
      `Êtes-vous sûr de vouloir supprimer ${selectedNotifications.size} notification${selectedNotifications.size > 1 ? 's' : ''} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            const promises = Array.from(selectedNotifications).map((id) => deleteNotification(id));
            await Promise.all(promises);
            setSelectedNotifications(new Set());
            setIsSelectionMode(false);
          },
        },
      ]
    );
  };

  const handleDeleteAll = () => {
    if (notifications.length === 0) return;

    Alert.alert(
      'Supprimer toutes les notifications',
      'Êtes-vous sûr de vouloir supprimer toutes les notifications ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            await deleteAllNotifications();
          },
        },
      ]
    );
  };

  const handleMarkAllAsRead = async () => {
    if (unreadCount === 0) return;
    await markAllAsRead();
  };

  const formatTimestamp = (timestamp: string) => {
    const now = new Date();
    const date = new Date(timestamp);
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'À l\'instant';
    if (minutes < 60) return `Il y a ${minutes} min`;
    if (hours < 24) return `Il y a ${hours}h`;
    if (days < 7) return `Il y a ${days}j`;
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
    });
  };

  const sortedNotifications = [...notifications].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={styles.headerActions}>
          {isSelectionMode ? (
            <>
              <TouchableOpacity
                onPress={handleDeleteSelected}
                disabled={selectedNotifications.size === 0}
                style={selectedNotifications.size === 0 && styles.disabledButton}
              >
                <Ionicons
                  name="trash-outline"
                  size={24}
                  color={selectedNotifications.size === 0 ? colors.textTertiary : colors.red500}
                />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => {
                setIsSelectionMode(false);
                setSelectedNotifications(new Set());
              }} style={{ marginLeft: 16 }}>
                <Text style={styles.cancelSelectionText}>Annuler</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {notifications.length > 0 && (
                <TouchableOpacity onPress={() => setIsSelectionMode(true)}>
                  <Ionicons name="checkmark-circle-outline" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
              {notifications.length === 0 && <View style={{ width: 24 }} />}
            </>
          )}
        </View>
      </View>

      {!isSelectionMode && notifications.length > 0 && (
        <View style={styles.actionsBar}>
          {unreadCount > 0 && (
            <TouchableOpacity style={styles.actionButton} onPress={handleMarkAllAsRead}>
              <Ionicons name="checkmark-done-outline" size={20} color={colors.pink500} />
              <Text style={styles.actionButtonText}>Tout marquer comme lu</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.actionButton} onPress={handleDeleteAll}>
            <Ionicons name="trash-outline" size={20} color={colors.red500} />
            <Text style={styles.actionButtonText}>Tout supprimer</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.pink500} />
        }
      >
        {isLoading && notifications.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Chargement...</Text>
          </View>
        ) : sortedNotifications.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="notifications-off-outline" size={64} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>Aucune notification</Text>
            <Text style={styles.emptyText}>
              Vous serez notifié lorsque vous recevrez de nouvelles demandes ou messages.
            </Text>
          </View>
        ) : (
          sortedNotifications.map((notification, index) => (
            <Animated.View
              key={notification.id}
              entering={FadeIn.delay(index * 50)}
            >
              <TouchableOpacity
                style={[
                  styles.notificationCard,
                  !notification.isRead && styles.unreadCard,
                  isSelectionMode && selectedNotifications.has(notification.id) && styles.selectedCard,
                ]}
                onPress={() => {
                  if (isSelectionMode) {
                    handleToggleSelection(notification.id);
                  } else {
                    handleNotificationPress(notification);
                  }
                }}
                onLongPress={() => {
                  if (!isSelectionMode) {
                    setIsSelectionMode(true);
                    handleToggleSelection(notification.id);
                  }
                }}
                activeOpacity={0.7}
              >
                {isSelectionMode && (
                  <TouchableOpacity
                    onPress={() => handleToggleSelection(notification.id)}
                    style={styles.checkbox}
                  >
                    <Ionicons
                      name={selectedNotifications.has(notification.id) ? 'checkbox' : 'checkbox-outline'}
                      size={24}
                      color={selectedNotifications.has(notification.id) ? colors.pink500 : colors.textTertiary}
                    />
                  </TouchableOpacity>
                )}
                <View
                  style={[
                    styles.iconContainer,
                    { backgroundColor: `${getNotificationColor(notification.type)}33` },
                  ]}
                >
                  <Ionicons
                    name={getNotificationIcon(notification.type) as any}
                    size={24}
                    color={getNotificationColor(notification.type)}
                  />
                </View>
                <View style={styles.notificationContent}>
                  <View style={styles.notificationHeader}>
                    <Text style={styles.notificationTitle}>{notification.title}</Text>
                    {!notification.isRead && <View style={styles.unreadDot} />}
                  </View>
                  <Text style={styles.notificationMessage} numberOfLines={2}>
                    {notification.message}
                  </Text>
                  <Text style={styles.notificationTime}>
                    {formatTimestamp(notification.createdAt)}
                  </Text>
                </View>
                {!isSelectionMode && (
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      Alert.alert(
                        'Supprimer la notification',
                        'Êtes-vous sûr de vouloir supprimer cette notification ?',
                        [
                          { text: 'Annuler', style: 'cancel' },
                          {
                            text: 'Supprimer',
                            style: 'destructive',
                            onPress: () => deleteNotification(notification.id),
                          },
                        ]
                      );
                    }}
                    style={styles.deleteButton}
                  >
                    <Ionicons name="close" size={20} color={colors.textTertiary} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            </Animated.View>
          ))
        )}
      </ScrollView>
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cancelSelectionText: {
    fontSize: 16,
    color: colors.pink500,
    fontWeight: '500',
  },
  disabledButton: {
    opacity: 0.5,
  },
  actionsBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.backgroundSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSecondary,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.backgroundTertiary,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    gap: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 64,
    gap: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  unreadCard: {
    backgroundColor: `${colors.pink500}15`,
    borderLeftWidth: 4,
    borderLeftColor: colors.pink500,
  },
  selectedCard: {
    backgroundColor: `${colors.pink500}25`,
  },
  checkbox: {
    padding: 4,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationContent: {
    flex: 1,
    gap: 4,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.pink500,
  },
  notificationMessage: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  notificationTime: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 4,
  },
  deleteButton: {
    padding: 4,
  },
});
