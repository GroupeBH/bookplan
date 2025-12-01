import { Redirect } from 'expo-router';

export default function Index() {
  // Redirect to splash screen on app start
  return <Redirect href="/(screens)/splash" />;
}
