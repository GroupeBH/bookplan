import { Slot } from 'expo-router';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider } from '../context/AuthContext';
import { UserProvider } from '../context/UserContext';
import { BookingProvider } from '../context/BookingContext';
import { AccessRequestProvider } from '../context/AccessRequestContext';
import { RatingProvider } from '../context/RatingContext';
import { NotificationProvider } from '../context/NotificationContext';
import { MessageProvider } from '../context/MessageContext';
import { BlockProvider } from '../context/BlockContext';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    // Hide splash screen after app is ready
    const hideSplash = async () => {
      try {
        // Wait a bit to ensure React components are mounted
        await new Promise(resolve => setTimeout(resolve, 300));
        await SplashScreen.hideAsync();
      } catch (error) {
        console.error('Error hiding splash:', error);
      }
    };

    hideSplash();
  }, []);

  return (
    <AuthProvider>
      <NotificationProvider>
        <UserProvider>
          <BookingProvider>
            <AccessRequestProvider>
              <RatingProvider>
                <MessageProvider>
                  <BlockProvider>
                    <Slot />
                  </BlockProvider>
                </MessageProvider>
              </RatingProvider>
            </AccessRequestProvider>
          </BookingProvider>
        </UserProvider>
      </NotificationProvider>
    </AuthProvider>
  );
}
