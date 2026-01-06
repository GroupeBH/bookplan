import * as Location from 'expo-location';
import { isNetworkError } from './errorUtils';
import { supabase } from './supabase';

/**
 * Service de localisation en arrière-plan
 * Met à jour la position au backend (gère automatiquement les erreurs réseau)
 */
export class LocationService {
  private static subscription: Location.LocationSubscription | null = null;
  private static isTracking = false;
  private static lastUpdateTime = 0;
  private static readonly UPDATE_INTERVAL = 30000; // 30 secondes entre les mises à jour

  /**
   * Démarrer le suivi de localisation en arrière-plan
   */
  static async startBackgroundTracking(userId: string): Promise<void> {
    if (this.isTracking) {
      console.log('📍 LocationService: Le suivi est déjà actif');
      return;
    }

    try {
      // Demander les permissions de localisation en arrière-plan
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      if (foregroundStatus !== 'granted') {
        console.warn('📍 LocationService: Permission de localisation refusée');
        return;
      }

      // Demander la permission en arrière-plan (optionnelle, ne bloque pas si refusée)
      try {
        const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
        if (backgroundStatus !== 'granted') {
          console.warn('📍 LocationService: Permission de localisation en arrière-plan refusée, utilisation du mode premier plan uniquement');
          // Continuer quand même avec la localisation en premier plan
        }
      } catch (backgroundError: any) {
        // Si la permission en arrière-plan n'est pas disponible (Android < 10 ou non configuré), continuer quand même
        console.warn('📍 LocationService: Impossible de demander la permission en arrière-plan:', backgroundError.message);
        // Continuer avec la localisation en premier plan
      }

      // Vérifier si les services de localisation sont activés
      const isLocationEnabled = await Location.hasServicesEnabledAsync();
      if (!isLocationEnabled) {
        console.warn('📍 LocationService: Les services de localisation ne sont pas activés. Veuillez les activer dans les paramètres.');
        // Ne pas bloquer, on essaiera de démarrer le suivi plus tard
        return;
      }

      // Obtenir la position initiale avec gestion d'erreur
      let initialLocation;
      try {
        initialLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        // Mettre à jour immédiatement (les erreurs réseau seront gérées silencieusement)
        await this.updateLocationInDatabase(
          userId,
          initialLocation.coords.latitude,
          initialLocation.coords.longitude
        );
      } catch (locationError: any) {
        // Si la localisation n'est pas disponible, on continue quand même
        // Le watchPositionAsync pourra peut-être obtenir une position plus tard
        if (locationError.message?.includes('location is unavailable') || 
            locationError.message?.includes('Current location is unavailable')) {
          console.warn('📍 LocationService: Localisation non disponible actuellement. Le suivi sera tenté en arrière-plan.');
        } else {
          console.warn('📍 LocationService: Erreur lors de l\'obtention de la position initiale:', locationError.message);
        }
        // Continuer pour démarrer le watchPositionAsync qui pourra obtenir une position plus tard
      }

      // Démarrer le suivi des changements de position (même si la position initiale a échoué)
      try {
        this.subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 60000, // Vérifier toutes les 60 secondes (1 minute) pour réduire la charge
            distanceInterval: 200, // Ou tous les 200 mètres pour réduire les mises à jour
          },
          async (location) => {
            const now = Date.now();
            // Limiter les mises à jour à toutes les 30 secondes maximum
            if (now - this.lastUpdateTime < this.UPDATE_INTERVAL) {
              return;
            }

            // Mettre à jour la position (les erreurs réseau seront gérées silencieusement)
            await this.updateLocationInDatabase(
              userId,
              location.coords.latitude,
              location.coords.longitude
            );
            this.lastUpdateTime = now;
          }
        );

        this.isTracking = true;
        console.log('✅ LocationService: Suivi de localisation démarré');
      } catch (watchError: any) {
        console.error('❌ LocationService: Erreur lors du démarrage du watchPositionAsync:', watchError.message);
        // Ne pas marquer comme tracking si le watch a échoué
        this.isTracking = false;
      }
    } catch (error: any) {
      console.error('❌ LocationService: Erreur lors du démarrage du suivi:', error);
    }
  }

  /**
   * Arrêter le suivi de localisation
   */
  static stopBackgroundTracking(): void {
    if (this.subscription) {
      this.subscription.remove();
      this.subscription = null;
    }
    this.isTracking = false;
    this.lastUpdateTime = 0;
    console.log('🛑 LocationService: Suivi de localisation arrêté');
  }

  /**
   * Mettre à jour la position dans la base de données avec last_seen
   * Gère automatiquement les erreurs réseau (ne les log pas)
   */
  private static async updateLocationInDatabase(
    userId: string,
    lat: number,
    lng: number
  ): Promise<void> {
    try {
      const now = new Date().toISOString();
      
      const { error } = await supabase
        .from('profiles')
        .update({
          lat: lat.toString(),
          lng: lng.toString(),
          last_seen: now,
          updated_at: now,
        })
        .eq('id', userId);

      if (error) {
        // Ne logger que les erreurs non-réseau
        if (!isNetworkError(error)) {
          console.error('❌ LocationService: Erreur lors de la mise à jour de la position:', error);
        }
        // Si c'est une erreur réseau, on ignore silencieusement (l'utilisateur n'est pas connecté)
      } else {
        console.log('✅ LocationService: Position mise à jour:', { lat, lng, last_seen: now });
      }
    } catch (error: any) {
      // Ne logger que les erreurs non-réseau
      if (!isNetworkError(error)) {
        console.error('❌ LocationService: Erreur lors de la mise à jour de la position:', error);
      }
      // Si c'est une erreur réseau, on ignore silencieusement
    }
  }

  /**
   * Vérifier si l'utilisateur est connecté à Internet
   * Utilise une requête Supabase légère pour vérifier la connectivité
   */
  static async isConnected(): Promise<boolean> {
    try {
      // Faire une requête légère pour vérifier la connectivité
      const { error } = await supabase
        .from('profiles')
        .select('id')
        .limit(1);
      
      // Si pas d'erreur ou si l'erreur n'est pas une erreur réseau, on est connecté
      return !error || !isNetworkError(error);
    } catch (error: any) {
      // Si c'est une erreur réseau, on n'est pas connecté
      return !isNetworkError(error);
    }
  }
}

