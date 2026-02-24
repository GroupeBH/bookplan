// Token d'accès Mapbox
import Constants from 'expo-constants';

export const MAPBOX_ACCESS_TOKEN =
  Constants.expoConfig?.extra?.mapboxAccessToken ||
  process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  '';

let Mapbox: any = null;
let isMapboxAvailable = false;

try {
  Mapbox = require('@rnmapbox/maps').default;
  const { MapView, PointAnnotation, Camera } = require('@rnmapbox/maps');
  
  // Vérifier si le module natif est disponible
  if (Mapbox && typeof Mapbox.setAccessToken === 'function' && MAPBOX_ACCESS_TOKEN) {
    Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN);
    isMapboxAvailable = true;
  } else if (!MAPBOX_ACCESS_TOKEN) {
    console.warn('Mapbox access token is missing. Set EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN.');
  }
} catch (error) {
  console.warn('⚠️ @rnmapbox/maps native module not available. A development build is required.');
  console.warn('📱 To use Mapbox, create a development build with: eas build --profile development');
  isMapboxAvailable = false;
}

export { isMapboxAvailable };
export default Mapbox;


