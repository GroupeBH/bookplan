# Résolution du Problème de Signature Android

## 🔴 Problème

Votre Android App Bundle a été signé avec une clé différente de celle enregistrée dans Google Play Console.

**Empreinte attendue (dans Google Play Console) :**
```
SHA1: 5B:8D:46:41:12:2F:87:A4:5A:BE:E9:A9:7A:80:A6:A4:BE:22:52:88
```

**Empreinte actuelle (du bundle que vous avez créé) :**
```
SHA1: A0:70:F4:A1:79:5A:7E:8F:A9:77:62:39:EC:65:23:F0:4B:9B:6B:E8
```

## ✅ Solutions

Vous avez **deux options** pour résoudre ce problème :

---

## Option 1 : Utiliser la clé existante (Recommandé si vous avez déjà publié l'app)

Si vous avez déjà publié une version de votre application sur Google Play, vous **devez** utiliser la même clé de signature.

### Étapes :

1. **Vérifier si vous avez sauvegardé la clé de signature originale**

   Si vous avez créé l'app précédemment avec EAS, la clé devrait être stockée dans EAS. Sinon, vous devez :
   - Vérifier si vous avez sauvegardé le keystore quelque part
   - Vérifier dans Google Play Console > Configuration de l'application > Intégrité de l'application

2. **Configurer EAS pour utiliser la clé existante**

   ```bash
   eas credentials --platform android
   ```

   Sélectionnez :
   - **Build profile**: `production`
   - **What do you want to do?**: `Keystore: Manage everything needed to build your project`
   - **What would you like to do?**: `Use existing keystore`
   - Entrez le chemin vers votre keystore existant (si vous l'avez)

3. **Si vous n'avez pas la clé originale**

   ⚠️ **ATTENTION** : Si vous avez déjà publié l'app et que vous n'avez pas la clé originale, vous ne pourrez **PAS** mettre à jour l'application existante. Vous devrez créer une nouvelle application avec un nouveau package name.

---

## Option 2 : Mettre à jour Google Play Console avec la nouvelle empreinte (Recommandé si c'est une nouvelle app)

Si c'est la première fois que vous publiez l'application, vous pouvez mettre à jour Google Play Console avec la nouvelle empreinte.

### Étapes :

1. **Obtenir l'empreinte SHA-1 de votre keystore actuel**

   ```bash
   # Si vous avez le keystore localement
   keytool -list -v -keystore votre-keystore.jks -alias votre-alias
   ```

   Ou via EAS :
   ```bash
   eas credentials --platform android
   ```
   Sélectionnez `production` et `View credentials` pour voir l'empreinte.

2. **Mettre à jour dans Google Play Console**

   - Allez dans **Google Play Console** > Votre application
   - **Configuration de l'application** > **Intégrité de l'application**
   - Cliquez sur **Ajouter une nouvelle empreinte de certificat**
   - Ajoutez l'empreinte : `A0:70:F4:A1:79:5A:7E:8F:A9:77:62:39:EC:65:23:F0:4B:9B:6B:E8`
   - Sauvegardez

3. **Re-soumettre votre bundle**

   Une fois l'empreinte ajoutée, vous pouvez re-soumettre votre bundle.

---

## Option 3 : Créer un nouveau keystore et mettre à jour Google Play Console

Si vous voulez créer un nouveau keystore (par exemple, si vous avez perdu l'ancien) :

### Étapes :

1. **Supprimer l'ancien keystore dans EAS**

   ```bash
   eas credentials --platform android
   ```
   Sélectionnez `production` > `Remove credentials` > `Keystore`

2. **Créer un nouveau keystore**

   ```bash
   eas credentials --platform android
   ```
   Sélectionnez `production` > `Keystore: Manage everything needed to build your project` > `Generate a new Keystore`

3. **Obtenir la nouvelle empreinte SHA-1**

   ```bash
   eas credentials --platform android
   ```
   Sélectionnez `production` > `View credentials` pour voir la nouvelle empreinte SHA-1.

4. **Mettre à jour Google Play Console**

   - Allez dans **Google Play Console** > Votre application
   - **Configuration de l'application** > **Intégrité de l'application**
   - Cliquez sur **Ajouter une nouvelle empreinte de certificat**
   - Ajoutez la nouvelle empreinte SHA-1
   - Sauvegardez

5. **Créer un nouveau build**

   ```bash
   eas build --profile production --platform android
   ```

6. **Soumettre le nouveau bundle**

   ```bash
   eas submit --platform android
   ```

---

## 🔍 Vérification des credentials EAS

Pour voir les credentials actuellement configurés :

```bash
eas credentials --platform android
```

Sélectionnez :
- **Build profile**: `production`
- **What do you want to do?**: `View credentials`

Cela vous montrera :
- L'empreinte SHA-1 actuelle
- L'alias du keystore
- D'autres informations sur la clé

---

## 📝 Notes importantes

1. **Sauvegardez toujours votre keystore** : Si vous perdez votre keystore, vous ne pourrez plus mettre à jour votre application sur Google Play. Vous devrez créer une nouvelle application.

2. **Une clé par application** : Chaque application Android doit utiliser la même clé de signature pour toutes les mises à jour.

3. **EAS gère automatiquement** : Si vous utilisez EAS Build, les keystores sont généralement gérés automatiquement et stockés de manière sécurisée.

4. **Première publication** : Si c'est la première fois que vous publiez l'app, vous pouvez utiliser n'importe quelle clé et l'enregistrer dans Google Play Console.

---

## 🚀 Commandes utiles

```bash
# Voir les credentials
eas credentials --platform android

# Créer un nouveau build de production
eas build --profile production --platform android

# Soumettre à Google Play
eas submit --platform android

# Voir l'historique des builds
eas build:list --platform android
```

---

## ❓ Quelle option choisir ?

- **Option 1** : Si vous avez déjà publié l'app et que vous avez la clé originale
- **Option 2** : Si c'est la première publication et que vous voulez garder la clé actuelle
- **Option 3** : Si vous avez perdu la clé originale et que c'est une nouvelle app (ou si vous acceptez de créer une nouvelle app)

---

## 🔗 Ressources

- [Documentation EAS Credentials](https://docs.expo.dev/app-signing/managed-credentials/)
- [Google Play Console - Intégrité de l'application](https://support.google.com/googleplay/android-developer/answer/7384423)
- [Gestion des clés de signature Android](https://developer.android.com/studio/publish/app-signing)










