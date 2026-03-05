import { Slot } from 'expo-router';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { Alert } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppAlertHost } from '../components/ui/AppAlertHost';
import { AuthProvider } from '../context/AuthContext';
import { UserProvider } from '../context/UserContext';
import { BookingProvider } from '../context/BookingContext';
import { AccessRequestProvider } from '../context/AccessRequestContext';
import { RatingProvider } from '../context/RatingContext';
import { NotificationProvider } from '../context/NotificationContext';
import { MessageProvider } from '../context/MessageContext';
import { BlockProvider } from '../context/BlockContext';
import { OfferProvider } from '../context/OfferContext';
import { AlbumProvider } from '../context/AlbumContext';
import { LikeProvider } from '../context/LikeContext';
import { appAlert, setNativeAlertImpl } from '../lib/appAlert';
import { isNetworkError } from '../lib/errorUtils';

// Déclaration pour ErrorUtils (disponible globalement dans React Native)
declare const ErrorUtils: {
  getGlobalHandler: () => ((error: Error, isFatal?: boolean) => void) | null;
  setGlobalHandler: (handler: (error: Error, isFatal?: boolean) => void) => void;
} | undefined;

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    // Intercepter les Alert.alert natifs pour afficher la version harmonisee
    const nativeAlert = Alert.alert.bind(Alert);
    setNativeAlertImpl(nativeAlert);
    Alert.alert = ((title, message, buttons, options) => {
      appAlert(title, message, buttons, options);
    }) as typeof Alert.alert;

    // Handler global pour les erreurs non capturées (notamment les erreurs réseau)
    const errorHandler = (error: Error, isFatal?: boolean) => {
      // Filtrer les erreurs réseau pour ne pas polluer les logs
      if (isNetworkError(error)) {
        console.log('⚠️ Erreur réseau non capturée (ignorée):', error.message);
        return;
      }
      
      // Logger les autres erreurs
      console.error('❌ Erreur non capturée:', error);
    };

    // S'abonner aux erreurs globales (si disponible)
    if (ErrorUtils?.setGlobalHandler) {
      const originalHandler = ErrorUtils.getGlobalHandler();
      ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
        errorHandler(error, isFatal);
        // Appeler le handler original pour les erreurs non-réseau
        if (!isNetworkError(error) && originalHandler) {
          originalHandler(error, isFatal);
        }
      });
    }

    // Hide splash screen after app is ready (minimal delay)
    const hideSplash = async () => {
      try {
        // Minimal delay to ensure React components are mounted
        await new Promise(resolve => setTimeout(resolve, 100));
        await SplashScreen.hideAsync();
      } catch (error) {
        console.error('Error hiding splash:', error);
      }
    };

    hideSplash();

    return () => {
      Alert.alert = nativeAlert as typeof Alert.alert;
      setNativeAlertImpl(null);
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <NotificationProvider>
          <UserProvider>
            <BookingProvider>
              <AccessRequestProvider>
                <RatingProvider>
                  <MessageProvider>
                    <BlockProvider>
                      <OfferProvider>
                        <AlbumProvider>
                          <LikeProvider>
                            <Slot />
                            <AppAlertHost />
                          </LikeProvider>
                        </AlbumProvider>
                      </OfferProvider>
                    </BlockProvider>
                  </MessageProvider>
                </RatingProvider>
              </AccessRequestProvider>
            </BookingProvider>
          </UserProvider>
        </NotificationProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
