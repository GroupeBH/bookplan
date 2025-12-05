import Mapbox from '@rnmapbox/maps';

// Token d'accès Mapbox
const MAPBOX_ACCESS_TOKEN = 'pk.eyJ1IjoiZ2Joc2FybCIsImEiOiJjbWlvbWdvOTUwM2lqM2VxbzhlMnk3YmRnIn0.nroScN5w8bLu6OXHZgO_kw';

// Initialiser Mapbox avec le token
Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN);

export default Mapbox;

