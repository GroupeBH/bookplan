# 🔑 Récupération de la Clé de Signature Android Perdue

## ⚠️ Situation Critique

Vous avez perdu l'ancienne clé de signature, mais votre app est déjà sur le Play Store. C'est un problème grave car **Google Play exige que toutes les mises à jour utilisent la même clé**.

## 🎯 Options de Récupération

### Option 1 : Vérifier si EAS a sauvegardé l'ancienne clé (MEILLEURE CHANCE)

EAS Build stocke automatiquement les credentials. Il est possible que l'ancienne clé soit encore dans leur système.

#### Étapes :

1. **Vérifier l'historique des builds EAS**

   ```bash
   eas build:list --platform android --limit 50
   ```

   Cela vous montrera tous les builds Android précédents. Notez les IDs des anciens builds (avant que la nouvelle clé soit générée).

2. **Vérifier les credentials pour chaque build**

   Pour chaque ancien build, essayez de voir les credentials utilisés :

   ```bash
   eas credentials --platform android
   ```

   Sélectionnez :
   - **Build profile**: `production`
   - **What do you want to do?**: `View credentials`
   
   Regardez l'empreinte SHA-1. Si elle correspond à `5B:8D:46:41:12:2F:87:A4:5A:BE:E9:A9:7A:80:A6:A4:BE:22:52:88`, c'est la bonne clé !

3. **Télécharger l'ancienne clé depuis EAS**

   Si EAS a l'ancienne clé, vous pouvez la télécharger :

   ```bash
   eas credentials --platform android
   ```

   Sélectionnez :
   - **Build profile**: `production`
   - **What do you want to do?**: `Keystore: Manage everything needed to build your project`
   - **What would you like to do?**: `Download credentials` (si disponible)

   ⚠️ **Note** : EAS ne permet généralement pas de télécharger les keystores pour des raisons de sécurité, mais vous pouvez vérifier.

---

### Option 2 : Utiliser Google Play App Signing (SI ACTIVÉ)

Si vous avez activé **Google Play App Signing** lors de la première publication, Google gère la clé de signature pour vous. Dans ce cas :

1. **Vérifier dans Google Play Console**

   - Allez dans **Google Play Console** > Votre app
   - **Configuration de l'application** > **Intégrité de l'application**
   - Regardez si **"Google Play App Signing"** est activé

2. **Si c'est activé**

   - Google peut re-signer votre app avec la clé de production
   - Vous pouvez uploader un bundle signé avec n'importe quelle clé (upload key)
   - Google le re-signe automatiquement avec la clé de production

3. **Configurer une nouvelle upload key**

   Si Google Play App Signing est activé, vous pouvez :
   - Créer une nouvelle upload key
   - L'ajouter dans Google Play Console
   - Utiliser cette nouvelle clé pour les futurs uploads

   **Étapes dans Google Play Console** :
   - **Configuration de l'application** > **Intégrité de l'application**
   - **Gérer la clé de téléchargement** > **Créer une nouvelle clé de téléchargement**
   - Suivez les instructions pour générer et télécharger la nouvelle clé

---

### Option 3 : Vérifier les Backups Locaux

Cherchez dans ces emplacements :

1. **Dossier du projet**
   ```bash
   # Chercher tous les fichiers keystore
   find . -name "*.keystore" -o -name "*.jks" -o -name "*.p12"
   ```

2. **Backups personnels**
   - Google Drive
   - Dropbox
   - OneDrive
   - Disque dur externe
   - Email (si vous vous êtes envoyé la clé)

3. **Anciens ordinateurs**
   - Si vous avez développé sur un autre ordinateur, vérifiez là-bas

4. **Dossier Android Studio**
   - `~/.android/` (Linux/Mac)
   - `C:\Users\VotreNom\.android\` (Windows)

---

### Option 4 : Vérifier l'Historique Git (si la clé était commitée - NON RECOMMANDÉ)

⚠️ **ATTENTION** : Les keystores ne devraient JAMAIS être commités dans Git pour des raisons de sécurité. Mais si c'était le cas :

```bash
# Chercher dans l'historique Git
git log --all --full-history -- "*.keystore" "*.jks" "*.p12"
```

---

## 🚨 Si Aucune Clé n'est Récupérable

Si vous ne pouvez pas récupérer l'ancienne clé ET que Google Play App Signing n'est pas activé, vous avez **deux options** :

### Option A : Créer une Nouvelle Application (RECOMMANDÉ)

1. **Créer une nouvelle app dans Google Play Console**
   - Nouveau package name (ex: `com.kutana.app.v2`)
   - Nouvelle clé de signature
   - Publier comme une nouvelle application

2. **Migrer les utilisateurs**
   - Ajouter un message dans l'ancienne app pour diriger vers la nouvelle
   - Utiliser des deep links pour rediriger les utilisateurs

### Option B : Contacter le Support Google Play

Dans certains cas exceptionnels, Google peut aider, mais c'est très rare et généralement refusé.

---

## 📋 Checklist de Vérification

- [ ] Vérifier l'historique des builds EAS
- [ ] Vérifier les credentials EAS pour l'ancienne clé
- [ ] Vérifier si Google Play App Signing est activé
- [ ] Chercher dans les backups locaux
- [ ] Chercher dans les anciens ordinateurs
- [ ] Vérifier les services cloud (Drive, Dropbox, etc.)
- [ ] Vérifier l'historique Git (si applicable)

---

## 🔍 Commandes Utiles

```bash
# Voir tous les builds Android
eas build:list --platform android --limit 50

# Voir les credentials actuels
eas credentials --platform android

# Voir les détails d'un build spécifique
eas build:view [BUILD_ID]

# Chercher des fichiers keystore dans le projet
find . -name "*.keystore" -o -name "*.jks" -o -name "*.p12"

# Vérifier l'empreinte d'un keystore (si vous en trouvez un)
keytool -list -v -keystore chemin/vers/keystore.jks -alias votre-alias
```

---

## 💡 Prévention pour l'Avenir

1. **Toujours sauvegarder les keystores**
   - Dans un gestionnaire de mots de passe sécurisé
   - Dans un coffre-fort cloud chiffré
   - Sur un disque dur externe sécurisé

2. **Activer Google Play App Signing**
   - Protège contre la perte de clé
   - Google gère la clé de production
   - Vous pouvez changer l'upload key si nécessaire

3. **Documenter les credentials**
   - Notez l'emplacement du keystore
   - Notez l'alias et le mot de passe (dans un gestionnaire de mots de passe)
   - Notez l'empreinte SHA-1

---

## 🆘 Support

Si vous avez besoin d'aide supplémentaire :
- [Documentation EAS Credentials](https://docs.expo.dev/app-signing/managed-credentials/)
- [Google Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756)
- [Support Expo](https://expo.dev/support)











