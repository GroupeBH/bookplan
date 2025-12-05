# Étapes pour Finaliser la Configuration des Push Notifications

## ✅ Ce qui a été fait

1. ✅ EAS CLI installé
2. ✅ Connecté à Expo (compte: joscript01)
3. ✅ Projet EAS initialisé
4. ✅ Project ID ajouté dans `app.json`: `4f1f2d3b-815d-48ff-9d5a-0e61d16ae278`
5. ✅ `expo-dev-client` installé
6. ✅ Package name Android ajouté: `com.bookplan.app`

## 📋 Prochaines étapes à faire manuellement

### Étape 1 : Configurer les credentials Android

Exécutez cette commande dans votre terminal :

```bash
cd D:\labs\bookplan
eas credentials --platform android
```

Sélectionnez les options suivantes :
- **Select platform**: `Android` (déjà fait)
- **Which build profile?**: `development` (déjà fait)
- **What do you want to do?**: Sélectionnez **"Keystore: Manage everything needed to build your project"**
- Ensuite, choisissez **"Generate a new Keystore"** ou **"Set up a new Keystore"**
- EAS générera automatiquement un keystore pour vous
- **Note**: Ne sélectionnez PAS "Push Notifications (Legacy)" - ce n'est pas nécessaire avec Expo Push Notification Service

### Étape 2 : Créer le development build

Une fois les credentials configurés, créez le build :

```bash
eas build --profile development --platform android
```

**Note**: Cette étape peut prendre 10-20 minutes. Le build sera créé sur les serveurs d'Expo.

### Étape 3 : Télécharger et installer le build

Une fois le build terminé :

1. EAS vous donnera un lien de téléchargement (QR code ou URL)
2. Scannez le QR code avec votre téléphone Android OU
3. Ouvrez le lien sur votre téléphone Android
4. Téléchargez et installez le fichier `.apk`

### Étape 4 : Tester les push notifications

1. Ouvrez l'application installée sur votre téléphone
2. Connectez-vous à votre compte
3. Les push notifications devraient maintenant fonctionner !
4. Le token push sera automatiquement enregistré dans Supabase

## 🔍 Vérification

Pour vérifier que tout fonctionne :

1. Vérifiez les logs dans votre terminal/console
2. Vous devriez voir : `📱 Push notification token: ExponentPushToken[...]`
3. Vérifiez dans Supabase que le token est bien enregistré dans la table `push_tokens`

## 📝 Notes importantes

- ⚠️ Les push notifications **ne fonctionnent PAS dans Expo Go** avec SDK 53+
- ✅ Vous devez utiliser un **development build** ou un **production build**
- 📱 Les push notifications fonctionnent uniquement sur des **appareils physiques** (pas sur les émulateurs)
- 🔄 Les development builds gratuits expirent après 30 jours
- 💰 Pour des builds illimités, passez à un plan payant Expo

## 🚀 Alternative : Build local (plus rapide)

Si vous avez Android Studio installé, vous pouvez créer un build local :

```bash
eas build --profile development --platform android --local
```

Cela créera le build sur votre machine locale (plus rapide mais nécessite Android Studio).

## 📚 Ressources

- [Documentation EAS Build](https://docs.expo.dev/build/introduction/)
- [Documentation Push Notifications](https://docs.expo.dev/push-notifications/overview/)
- [Votre projet Expo](https://expo.dev/accounts/joscript01/projects/bookplan)

