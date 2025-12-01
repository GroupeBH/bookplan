import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import { useNotification } from '../../context/NotificationContext';
import { useBooking } from '../../context/BookingContext';
import { useAccessRequest } from '../../context/AccessRequestContext';
import Animated, { FadeIn } from 'react-native-reanimated';

export default function NotificationsScreen() {
  const router = useRouter();
  const { notifications, clearNotification, clearAllNotifications } = useNotification();
  const { bookings } = useBooking();
  const { accessRequests } = useAccessRequest();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    // Les notifications sont déjà chargées dans le contexte
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'booking_request':
        return 'heart-outline';
      case 'booking_accepted':
        return 'checkmark-circle-outline';
      case 'booking_rejected':
        return 'close-circle-outline';
      case 'booking_completed':
        return 'time-outline';
      case 'booking_extension':
      case 'booking_extension_confirmed':
      case 'booking_extension_rejected':
        return 'time-outline';
      case 'booking_cancelled':
        return 'close-circle-outline';
      case 'access':
        return 'lock-open-outline';
      case 'rating':
        return 'star-outline';
      case 'otp':
        return 'key-outline';
      default:
        return 'notifications-outline';
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'booking_request':
        return colors.purple500;
      case 'booking_accepted':
        return colors.green500;
      case 'booking_rejected':
      case 'booking_cancelled':
        return colors.red500;
      case 'booking_completed':
        return colors.blue500;
      case 'booking_extension':
      case 'booking_extension_confirmed':
        return colors.yellow500;
      case 'booking_extension_rejected':
        return colors.red500;
      case 'access':
        return colors.purple400;
      case 'rating':
        return colors.yellow500;
      case 'otp':
        return colors.blue500;
      default:
        return colors.textSecondary;
    }
  };

  const handleNotificationPress = (notification: any) => {
    const { type, data } = notification;

    // Marquer comme lue (optionnel)
    // clearNotification(notification.id);

    // Naviguer selon le type
    switch (type) {
      case 'booking_request':
      case 'booking_accepted':
      case 'booking_rejected':
      case 'booking_completed':
      case 'booking_extension':
      case 'booking_extension_confirmed':
      case 'booking_extension_rejected':
      case 'booking_cancelled':
        if (data?.bookingId) {
          router.push(`/(screens)/booking-details?bookingId=${data.bookingId}`);
        }
        break;
      case 'access':
        if (data?.targetId) {
          // TODO: Navigate to user profile
          // router.push(`/(screens)/user-profile?userId=${data.targetId}`);
        }
        break;
      default:
        // Pas de navigation pour les autres types
        break;
    }
  };

  const formatTimestamp = (timestamp: Date) => {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'À l\'instant';
    if (minutes < 60) return `Il y a ${minutes} min`;
    if (hours < 24) return `Il y a ${hours}h`;
    if (days < 7) return `Il y a ${days}j`;
    return timestamp.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
    });
  };

  const sortedNotifications = [...notifications].sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        {notifications.length > 0 && (
          <TouchableOpacity onPress={clearAllNotifications}>
            <Ionicons name="trash-outline" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
        {notifications.length === 0 && <View style={{ width: 24 }} />}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.purple500} />
        }
      >
        {sortedNotifications.length === 0 ? (
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
                style={styles.notificationCard}
                onPress={() => handleNotificationPress(notification)}
                activeOpacity={0.7}
              >
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
                  <Text style={styles.notificationTitle}>{notification.title}</Text>
                  <Text style={styles.notificationMessage} numberOfLines={2}>
                    {notification.message}
                  </Text>
                  <Text style={styles.notificationTime}>
                    {formatTimestamp(notification.timestamp)}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    clearNotification(notification.id);
                  }}
                  style={styles.deleteButton}
                >
                  <Ionicons name="close" size={20} color={colors.textTertiary} />
                </TouchableOpacity>
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
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
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





