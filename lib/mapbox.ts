// Token d'accès Mapbox
const MAPBOX_ACCESS_TOKEN = 'pk.eyJ1IjoiZ2Joc2FybCIsImEiOiJjbWlvbWdvOTUwM2lqM2VxbzhlMnk3YmRnIn0.nroScN5w8bLu6OXHZgO_kw';

let Mapbox: any = null;
let isMapboxAvailable = false;

try {
  Mapbox = require('@rnmapbox/maps').default;
  const { MapView, PointAnnotation, Camera } = require('@rnmapbox/maps');
  
  // Vérifier si le module natif est disponible
  if (Mapbox && typeof Mapbox.setAccessToken === 'function') {
    Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN);
    isMapboxAvailable = true;
  }
} catch (error) {
  console.warn('⚠️ @rnmapbox/maps native module not available. A development build is required.');
  console.warn('📱 To use Mapbox, create a development build with: eas build --profile development');
  isMapboxAvailable = false;
}

export { isMapboxAvailable };
export default Mapbox;



