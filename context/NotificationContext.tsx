import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { Alert, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

// Configuration des notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

interface Notification {
  id: string;
  type: 'otp' | 'booking' | 'access' | 'rating' | 'booking_request' | 'booking_accepted' | 'booking_rejected' | 'booking_completed' | 'booking_extension' | 'booking_extension_confirmed' | 'booking_extension_rejected' | 'booking_cancelled';
  title: string;
  message: string;
  data?: any;
  timestamp: Date;
}

interface NotificationContextType {
  notifications: Notification[];
  expoPushToken: string | null;
  showOTPNotification: (otpCode: string, phone: string) => void;
  showNotification: (type: Notification['type'], title: string, message: string, data?: any) => Promise<void>;
  sendPushNotification: (title: string, body: string, data?: any) => Promise<void>;
  clearNotification: (id: string) => void;
  clearAllNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();
  const { user } = useAuth();

  // Enregistrer le token push dans Supabase
  const savePushTokenToSupabase = async (token: string) => {
    if (!user?.id || !token) return;

    try {
      const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
      
      const { data, error } = await supabase.rpc('upsert_push_token', {
        p_token: token,
        p_platform: platform,
        p_device_id: null, // Vous pouvez ajouter un device ID si nécessaire
      });

      if (error) {
        console.error('Error saving push token to Supabase:', error);
      } else if (data && data.length > 0 && data[0].success) {
        console.log('✅ Push token enregistré dans Supabase');
      }
    } catch (error) {
      console.error('Error in savePushTokenToSupabase:', error);
    }
  };

  // Demander les permissions et obtenir le token push
  useEffect(() => {
    registerForPushNotificationsAsync().then(token => {
      if (token) {
        setExpoPushToken(token);
        console.log('📱 Push notification token:', token);
        // Enregistrer le token dans Supabase si l'utilisateur est connecté
        if (user?.id) {
          savePushTokenToSupabase(token);
        }
      }
    });

    // Écouter les notifications reçues quand l'app est au premier plan
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      const notificationData: Notification = {
        id: notification.request.identifier,
        type: notification.request.content.data?.type || 'booking',
        title: notification.request.content.title || '',
        message: notification.request.content.body || '',
        data: notification.request.content.data,
        timestamp: new Date(),
      };
      setNotifications((prev) => [notificationData, ...prev]);
    });

    // Écouter les interactions avec les notifications
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      console.log('📬 Notification tapped:', data);
      // Ici, vous pouvez naviguer vers une page spécifique selon le type de notification
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [user?.id]);

  // Enregistrer le token quand l'utilisateur se connecte et activer les notifications par défaut
  useEffect(() => {
    if (user?.id && expoPushToken) {
      savePushTokenToSupabase(expoPushToken);
      
      // Activer les notifications push par défaut au premier lancement
      const activatePushNotificationsByDefault = async () => {
        try {
          // Vérifier si la préférence existe déjà
          const { data: profile } = await supabase
            .from('profiles')
            .select('push_notifications_enabled')
            .eq('id', user.id)
            .single();

          // Si push_notifications_enabled est null (premier lancement), l'activer
          if (profile && profile.push_notifications_enabled === null) {
            await supabase
              .from('profiles')
              .update({ push_notifications_enabled: true })
              .eq('id', user.id);
            console.log('✅ Notifications push activées par défaut au premier lancement');
          }
        } catch (error) {
          console.error('Error activating push notifications by default:', error);
        }
      };

      activatePushNotificationsByDefault();
    }
  }, [user?.id, expoPushToken]);

  // Fonction pour enregistrer les permissions push
  async function registerForPushNotificationsAsync(): Promise<string | null> {
    let token: string | null = null;

    // Détecter si on est dans Expo Go (les push notifications ne sont pas supportées dans Expo Go SDK 53+)
    // Constants.executionEnvironment est undefined dans Expo Go, et défini dans un development build
    const isExpoGo = Constants.executionEnvironment === undefined || 
                     Constants.executionEnvironment === 'storeClient';
    
    if (isExpoGo) {
      console.log('ℹ️ Expo Go détecté. Les push notifications ne sont pas disponibles. Utilisation des notifications locales uniquement.');
      return null;
    }

    if (Platform.OS === 'android') {
      try {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      } catch (error) {
        console.warn('⚠️ Erreur lors de la configuration du canal de notification:', error);
      }
    }

    if (Device.isDevice) {
      try {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== 'granted') {
          console.warn('⚠️ Permissions de notification refusées');
          return null;
        }
        
        // Récupérer le project ID depuis les constantes Expo ou utiliser une valeur par défaut
        const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.expoConfig?.extra?.projectId;
        
        if (projectId) {
          try {
            token = (await Notifications.getExpoPushTokenAsync({
              projectId: projectId,
            })).data;
          } catch (error: any) {
            // Dans un development build, les push notifications peuvent échouer
            // On continue avec les notifications locales uniquement
            console.log('ℹ️ Push notifications non disponibles. Utilisation des notifications locales uniquement.');
          }
        } else {
          // Si pas de project ID, essayer sans
          try {
            token = (await Notifications.getExpoPushTokenAsync()).data;
          } catch (error: any) {
            // Les push notifications ne sont pas disponibles
            console.log('ℹ️ Push notifications non disponibles. Utilisation des notifications locales uniquement.');
          }
        }
      } catch (error) {
        console.warn('⚠️ Erreur lors de l\'enregistrement des notifications:', error);
      }
    } else {
      console.log('ℹ️ Les push notifications ne fonctionnent que sur un appareil physique. Utilisation des notifications locales uniquement.');
    }

    return token;
  }

  // Notification OTP (uniquement interne, pas de push)
  const showOTPNotification = (otpCode: string, phone: string) => {
    const notification: Notification = {
      id: `otp-${Date.now()}`,
      type: 'otp',
      title: 'Code de vérification',
      message: `Votre code OTP est : ${otpCode}\n\nNuméro : ${phone}`,
      data: { otpCode, phone },
      timestamp: new Date(),
    };

    setNotifications((prev) => [notification, ...prev]);

    // Afficher une alerte pour l'OTP (uniquement notification interne)
    Alert.alert(
      'Code de vérification',
      `Votre code OTP est : ${otpCode}\n\nNuméro : ${phone}\n\n⚠️ En production, ce code sera envoyé par SMS`,
      [{ text: 'OK' }]
    );
  };

  // Notification générale (push + interne)
  const showNotification = async (
    type: Notification['type'],
    title: string,
    message: string,
    data?: any
  ) => {
    const notification: Notification = {
      id: `${type}-${Date.now()}`,
      type,
      title,
      message,
      data,
      timestamp: new Date(),
    };

    setNotifications((prev) => [notification, ...prev]);

    // Envoyer une push notification
    await sendPushNotification(title, message, { type, ...data });

    // Afficher une alerte interne pour les notifications importantes
    if (type === 'booking_request' || type === 'booking_accepted' || type === 'booking_rejected' || type === 'booking_completed' || type === 'booking_extension' || type === 'booking_extension_confirmed' || type === 'booking_extension_rejected' || type === 'booking_cancelled') {
      Alert.alert(title, message, [{ text: 'OK' }]);
    }
  };

  // Envoyer une push notification
  const sendPushNotification = async (title: string, body: string, data?: any) => {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: data || {},
          sound: true,
        },
        trigger: null, // Envoyer immédiatement
      });
    } catch (error) {
      console.error('Error sending push notification:', error);
    }
  };

  const clearNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const clearAllNotifications = () => {
    setNotifications([]);
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        expoPushToken,
        showOTPNotification,
        showNotification,
        sendPushNotification,
        clearNotification,
        clearAllNotifications,
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


