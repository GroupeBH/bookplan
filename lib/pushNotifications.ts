// Utilitaire pour envoyer des push notifications via Supabase Edge Function
import { supabase } from './supabase';
import Constants from 'expo-constants';

interface SendPushNotificationParams {
  userId: string;
  title: string;
  body: string;
  data?: any;
  sound?: string;
}

interface PushNotificationResponse {
  success: boolean;
  message?: string;
  sent?: number;
  failed?: number;
  totalTokens?: number;
  error?: string;
}

/**
 * Envoie une push notification à un utilisateur via Supabase Edge Function
 * 
 * @param params - Paramètres de la notification
 * @returns Réponse de l'Edge Function
 */
export async function sendPushNotification(
  params: SendPushNotificationParams
): Promise<PushNotificationResponse> {
  try {
    const { userId, title, body, data, sound = 'default' } = params;

    if (!userId || !title || !body) {
      throw new Error('userId, title, and body are required');
    }

    // Récupérer l'URL Supabase et le token de session
    const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
    const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
    
    // Vérifier que l'URL Supabase est valide
    if (!supabaseUrl || supabaseUrl.trim() === '') {
      console.log('⚠️ Supabase URL not configured. Skipping push notification.');
      return {
        success: false,
        error: 'Supabase URL not configured',
      };
    }

    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      console.log('⚠️ No active session. Skipping push notification.');
      return {
        success: false,
        error: 'No active session',
      };
    }

    // Construire l'URL de la fonction Edge
    const functionUrl = `${supabaseUrl}/functions/v1/send-push-notification`;
    
    // Appeler la Edge Function avec timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 secondes timeout

    try {
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify({
          userId,
          title,
          body,
          data,
          sound,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Si la fonction Edge n'est pas déployée (404), ne pas bloquer l'application
        if (response.status === 404) {
          console.log('⚠️ Push notification function not deployed. Skipping notification.');
          return {
            success: false,
            error: 'Push notification function not deployed',
          };
        }
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      // Gérer spécifiquement les erreurs réseau
      if (fetchError.name === 'AbortError' || fetchError.message?.includes('aborted')) {
        console.log('⚠️ Push notification request timeout. Skipping notification.');
        return {
          success: false,
          error: 'Request timeout',
        };
      }
      
      if (fetchError.message?.includes('Network request failed') || 
          fetchError.message?.includes('Failed to fetch') ||
          fetchError.message?.includes('network')) {
        console.log('⚠️ Network error. Push notification function may not be deployed or network unavailable.');
        return {
          success: false,
          error: 'Network error - function may not be deployed',
        };
      }
      
      throw fetchError;
    }
  } catch (error: any) {
    // Ne pas logger les erreurs réseau ou 404 (fonction non déployée)
    const isNetworkError = error.message?.includes('Network request failed') || 
                          error.message?.includes('Failed to fetch') ||
                          error.message?.includes('network') ||
                          error.message?.includes('404') ||
                          error.message?.includes('timeout');
    
    if (!isNetworkError) {
      console.error('Error sending push notification:', error);
    }
    
    return {
      success: false,
      error: error.message || 'Failed to send push notification',
    };
  }
}

/**
 * Envoie une notification de booking
 */
export async function sendBookingNotification(
  userId: string,
  bookingId: string,
  type: 'request' | 'accepted' | 'rejected' | 'cancelled' | 'completed',
  title: string,
  body: string
): Promise<PushNotificationResponse> {
  return sendPushNotification({
    userId,
    title,
    body,
    data: {
      type: 'booking',
      bookingType: type,
      bookingId,
    },
  });
}

/**
 * Envoie une notification de message
 */
export async function sendMessageNotification(
  userId: string,
  conversationId: string,
  senderName: string,
  messagePreview: string
): Promise<PushNotificationResponse> {
  return sendPushNotification({
    userId,
    title: 'Nouveau message',
    body: `${senderName}: ${messagePreview}`,
    data: {
      type: 'message',
      conversationId,
    },
  });
}

/**
 * Envoie une notification d'accès au profil
 */
export async function sendAccessRequestNotification(
  userId: string,
  requesterName: string
): Promise<PushNotificationResponse> {
  return sendPushNotification({
    userId,
    title: 'Nouvelle demande d\'accès',
    body: `${requesterName} demande à voir votre profil complet`,
    data: {
      type: 'access_request',
    },
  });
}

/**
 * Envoie une notification d'avis
 */
export async function sendRatingNotification(
  userId: string,
  raterName: string,
  rating: number
): Promise<PushNotificationResponse> {
  return sendPushNotification({
    userId,
    title: 'Nouvel avis',
    body: `${raterName} vous a donné ${rating} étoile(s)`,
    data: {
      type: 'rating',
      rating,
    },
  });
}

