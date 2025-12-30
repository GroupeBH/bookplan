# Activer la localisation sur l'émulateur Android

## Problème
Erreur : "LocationService: Erreur du démarrage du suivi: Error current location is unavailable. Make sure that location services are enabled"

## Solution : Activer la localisation sur l'émulateur

### Méthode 1 : Via les paramètres de l'émulateur (Recommandé)

1. **Ouvrir les paramètres de l'émulateur** :
   - Dans l'émulateur, allez dans **Paramètres** (Settings)
   - Ou utilisez le menu latéral de l'émulateur (trois points `...`)

2. **Activer la localisation** :
   - Allez dans **Location** (Localisation)
   - Activez le toggle **"Location services"** ou **"Use mock location"**
   - Définissez une position GPS (ex: Kinshasa: -4.3276, 15.3136)

### Méthode 2 : Via ADB (ligne de commande)

Si vous avez ADB installé et configuré :

```bash
# Définir une position GPS (exemple: Kinshasa)
adb emu geo fix -4.3276 15.3136

# Ou via telnet (si disponible)
telnet localhost 5554
geo fix -4.3276 15.3136
```

### Méthode 3 : Via l'interface de l'émulateur

1. **Ouvrir le panneau de contrôle de l'émulateur** :
   - Cliquez sur les trois points (`...`) sur la barre latérale de l'émulateur
   - Ou utilisez le raccourci clavier

2. **Aller dans "Location"** :
   - Dans le panneau, trouvez la section **"Location"**
   - Entrez des coordonnées GPS (ex: Latitude: -4.3276, Longitude: 15.3136)
   - Cliquez sur **"Set Location"**

3. **Vérifier que la localisation est activée** :
   - Dans les paramètres Android de l'émulateur
   - Allez dans **Paramètres > Localisation**
   - Assurez-vous que **"Localisation"** est activée

## Vérification

Après avoir activé la localisation :

1. **Rechargez l'application** dans l'émulateur
2. **Accordez les permissions** de localisation si demandées
3. **Vérifiez les logs** - vous devriez voir :
   ```
   ✅ LocationService: Suivi de localisation démarré
   ✅ LocationService: Position mise à jour: { lat, lng, last_seen }
   ```

## Notes

- **Sur un émulateur**, la localisation peut prendre quelques secondes pour être disponible
- **Sur un appareil réel**, la localisation GPS fonctionne normalement
- Si la localisation n'est toujours pas disponible, vérifiez que :
  - Les services de localisation sont activés dans les paramètres Android
  - L'émulateur a les permissions nécessaires
  - L'application a les permissions de localisation accordées

## Coordonnées de test (Kinshasa, RDC)

- **Latitude** : -4.3276
- **Longitude** : 15.3136

Ces coordonnées peuvent être utilisées pour tester l'application.

