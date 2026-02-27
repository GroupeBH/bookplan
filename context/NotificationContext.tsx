import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { Notification, NotificationType } from '../types';
import { useAuth } from './AuthContext';

type PushRegistrationResult = 'success' | 'noop' | 'retry';

const sleep = (ms: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, ms);
});

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutLabel: string): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`${timeoutLabel}_timeout`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

function isRetryablePushError(error: unknown): boolean {
  const message = String(error ?? '').toLowerCase();
  return [
    'timeout',
    'timed out',
    'network',
    'fetch',
    'connection',
    'socket',
    'econnreset',
    '503',
    '502',
    '504',
    'google play',
    'play services',
    'service unavailable',
    'temporarily unavailable',
  ].some((pattern) => message.includes(pattern));
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  createNotification: (
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    data?: any
  ) => Promise<{ error: any; notification: Notification | null }>;
  markAsRead: (notificationId: string) => Promise<{ error: any }>;
  markAllAsRead: () => Promise<{ error: any }>;
  deleteNotification: (notificationId: string) => Promise<{ error: any }>;
  deleteAllNotifications: () => Promise<{ error: any }>;
  refreshNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const subscriptionRef = useRef<any>(null);
  const lastRegisteredUserIdRef = useRef<string | null>(null);
  const lastRegisteredTokenRef = useRef<string | null>(null);
  const pushRegistrationInFlightRef = useRef(false);

  // Charger les notifications depuis la base de données
  const refreshNotifications = useCallback(async () => {
    if (!user?.id) {
      setNotifications([]);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading notifications:', error);
        setIsLoading(false);
        return;
      }

      const mappedNotifications: Notification[] = (data || []).map((n) => ({
        id: n.id,
        userId: n.user_id,
        type: n.type as NotificationType,
        title: n.title,
        message: n.message,
        data: n.data || {},
        isRead: n.is_read || false,
        createdAt: n.created_at,
        readAt: n.read_at || undefined,
      }));

      setNotifications(mappedNotifications);
    } catch (error) {
      console.error('Error refreshing notifications:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Écouter les nouvelles notifications en temps réel
  useEffect(() => {
    if (!user?.id) {
      setNotifications([]);
      return;
    }

    // Charger les notifications initiales
    refreshNotifications();

    // S'abonner aux nouvelles notifications
    subscriptionRef.current = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('🔔 Notification change:', payload);
          
          if (payload.eventType === 'INSERT') {
            const newNotification: Notification = {
              id: payload.new.id,
              userId: payload.new.user_id,
              type: payload.new.type as NotificationType,
              title: payload.new.title,
              message: payload.new.message,
              data: payload.new.data || {},
              isRead: payload.new.is_read || false,
              createdAt: payload.new.created_at,
              readAt: payload.new.read_at || undefined,
            };
            setNotifications((prev) => [newNotification, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setNotifications((prev) =>
              prev.map((n) =>
                n.id === payload.new.id
                  ? {
                      ...n,
                      isRead: payload.new.is_read || false,
                      readAt: payload.new.read_at || undefined,
                    }
                  : n
              )
            );
          } else if (payload.eventType === 'DELETE') {
            setNotifications((prev) => prev.filter((n) => n.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
      }
    };
  }, [user?.id, refreshNotifications]);

  // Enregistrer le token push Expo de l'appareil dans Supabase (1 tentative)
  const registerPushTokenOnce = useCallback(async (): Promise<PushRegistrationResult> => {
    if (!user?.id) return 'noop';
    if (!Device.isDevice) return 'noop';

    try {
      if (Platform.OS === 'android') {
        await withTimeout(
          Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF5A8A',
          }),
          5000,
          'set_notification_channel'
        );
      }

      const { status: existingStatus } = await withTimeout(
        Notifications.getPermissionsAsync(),
        6000,
        'get_notification_permissions'
      );
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const permissionResult = await withTimeout(
          Notifications.requestPermissionsAsync(),
          8000,
          'request_notification_permissions'
        );
        finalStatus = permissionResult.status;
      }

      if (finalStatus !== 'granted') {
        return 'noop';
      }

      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ||
        Constants.easConfig?.projectId;

      const tokenResult = await withTimeout(
        Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined),
        10000,
        'get_expo_push_token'
      );
      const expoPushToken = tokenResult?.data;
      if (!expoPushToken) return 'retry';

      if (
        lastRegisteredUserIdRef.current === user.id &&
        lastRegisteredTokenRef.current === expoPushToken
      ) {
        return 'success';
      }

      const pushPlatform: 'ios' | 'android' | 'web' =
        Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web';

      const upsertResult = await withTimeout(
        Promise.resolve(
          supabase.rpc('upsert_push_token', {
            p_token: expoPushToken,
            p_platform: pushPlatform,
            p_device_id: null,
          })
        ),
        10000,
        'upsert_push_token'
      );
      const { error } = upsertResult as { error: any };

      if (error) {
        console.error('Error registering push token:', error);
        return isRetryablePushError(error) ? 'retry' : 'noop';
      }

      lastRegisteredUserIdRef.current = user.id;
      lastRegisteredTokenRef.current = expoPushToken;
      return 'success';
    } catch (error) {
      if (isRetryablePushError(error)) {
        console.warn('Push token registration temporary failure:', error);
        return 'retry';
      }
      console.error('Error while registering push token:', error);
      return 'noop';
    }
  }, [user?.id]);

  // Planifier l'enregistrement push sans bloquer l'UX (retry différé Android)
  useEffect(() => {
    if (!user?.id) {
      lastRegisteredUserIdRef.current = null;
      lastRegisteredTokenRef.current = null;
      pushRegistrationInFlightRef.current = false;
      return;
    }

    let cancelled = false;

    const runRegistrationFlow = async () => {
      const initialDelayMs = Platform.OS === 'android' ? 3000 : 1200;
      const maxAttempts = Platform.OS === 'android' ? 4 : 2;
      const baseRetryMs = Platform.OS === 'android' ? 2500 : 1800;

      await sleep(initialDelayMs);
      if (cancelled || !user?.id) return;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        if (cancelled || !user?.id) return;
        if (pushRegistrationInFlightRef.current) return;

        pushRegistrationInFlightRef.current = true;
        try {
          const result = await registerPushTokenOnce();
          if (result === 'success' || result === 'noop') {
            return;
          }
        } finally {
          pushRegistrationInFlightRef.current = false;
        }

        if (attempt < maxAttempts) {
          const backoffMs = Math.min(baseRetryMs * Math.pow(2, attempt - 1), 60000);
          await sleep(backoffMs);
        }
      }
    };

    void runRegistrationFlow();

    return () => {
      cancelled = true;
    };
  }, [registerPushTokenOnce, user?.id]);

  // Créer une notification
  const createNotification = async (
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    data?: any
  ): Promise<{ error: any; notification: Notification | null }> => {
    try {
      const { data: result, error } = await supabase.rpc('create_notification', {
        p_user_id: userId,
        p_type: type,
        p_title: title,
        p_message: message,
        p_data: data || null,
      });

      if (error) {
        console.error('Error creating notification:', error);
        return { error, notification: null };
      }

      // La notification sera ajoutée automatiquement via la subscription temps réel
      // Mais on peut aussi la récupérer directement
      const { data: notificationData, error: fetchError } = await supabase
        .from('notifications')
        .select('*')
        .eq('id', result)
        .single();

      if (fetchError || !notificationData) {
        return { error: fetchError, notification: null };
      }

      const notification: Notification = {
        id: notificationData.id,
        userId: notificationData.user_id,
        type: notificationData.type as NotificationType,
        title: notificationData.title,
        message: notificationData.message,
        data: notificationData.data || {},
        isRead: notificationData.is_read || false,
        createdAt: notificationData.created_at,
        readAt: notificationData.read_at || undefined,
      };

      return { error: null, notification };
    } catch (error: any) {
      console.error('Error creating notification:', error);
      return { error, notification: null };
    }
  };

  // Marquer une notification comme lue
  const markAsRead = async (notificationId: string): Promise<{ error: any }> => {
    try {
      const { error } = await supabase.rpc('mark_notification_as_read', {
        p_notification_id: notificationId,
      });

      if (error) {
        console.error('Error marking notification as read:', error);
        return { error };
      }

      // La mise à jour sera reflétée automatiquement via la subscription
      return { error: null };
    } catch (error: any) {
      console.error('Error marking notification as read:', error);
      return { error };
    }
  };

  // Marquer toutes les notifications comme lues
  const markAllAsRead = async (): Promise<{ error: any }> => {
    try {
      const { error } = await supabase.rpc('mark_all_notifications_as_read');

      if (error) {
        console.error('Error marking all notifications as read:', error);
        return { error };
      }

      return { error: null };
    } catch (error: any) {
      console.error('Error marking all notifications as read:', error);
      return { error };
    }
  };

  // Supprimer une notification
  const deleteNotification = async (notificationId: string): Promise<{ error: any }> => {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId)
        .eq('user_id', user?.id);

      if (error) {
        console.error('Error deleting notification:', error);
        return { error };
      }

      // La suppression sera reflétée automatiquement via la subscription
      return { error: null };
    } catch (error: any) {
      console.error('Error deleting notification:', error);
      return { error };
    }
  };

  // Supprimer toutes les notifications
  const deleteAllNotifications = async (): Promise<{ error: any }> => {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('user_id', user?.id);

      if (error) {
        console.error('Error deleting all notifications:', error);
        return { error };
      }

      return { error: null };
    } catch (error: any) {
      console.error('Error deleting all notifications:', error);
      return { error };
    }
  };

  // Calculer le nombre de notifications non lues
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        isLoading,
        createNotification,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        deleteAllNotifications,
        refreshNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
}
