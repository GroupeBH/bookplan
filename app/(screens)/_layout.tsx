import { Stack } from 'expo-router';

export default function ScreensLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0a0a0a' },
      }}
    >
      <Stack.Screen name="splash" />
      <Stack.Screen name="auth" />
      <Stack.Screen name="subscription" />
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="edit-profile" />
      <Stack.Screen name="user-profile" />
      <Stack.Screen name="search" />
      <Stack.Screen name="booking" />
      <Stack.Screen name="requests" />
      <Stack.Screen name="my-requests" />
      <Stack.Screen name="booking-details" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="kyc" />
      <Stack.Screen name="chat" />
      <Stack.Screen name="admin" />
      <Stack.Screen name="offers" />
      <Stack.Screen name="create-offer" />
      <Stack.Screen name="offer-details" />
      <Stack.Screen name="my-offers" />
    </Stack>
  );
}

