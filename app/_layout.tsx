import { Slot } from 'expo-router';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
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
