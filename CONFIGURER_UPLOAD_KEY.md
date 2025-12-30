# 🔑 Configurer une Nouvelle Upload Key avec Google Play App Signing

## ✅ Situation

Google Play App Signing est **déjà activé**, ce qui signifie :
- ✅ Google gère la clé de production (celle qui signe l'app pour les utilisateurs)
- ✅ Vous pouvez utiliser n'importe quelle clé pour uploader (upload key)
- ✅ Vous devez juste ajouter votre nouvelle clé dans Google Play Console

## 🎯 Étapes à Suivre

### Étape 1 : Obtenir l'Empreinte de votre Clé Actuelle

D'abord, vérifions quelle clé EAS utilise actuellement :

```bash
eas credentials --platform android
```

Sélectionnez :
- **Build profile**: `production`
- **What do you want to do?**: `View credentials`

Notez l'empreinte SHA-1 affichée. C'est probablement : `A0:70:F4:A1:79:5A:7E:8F:A9:77:62:39:EC:65:23:F0:4B:9B:6B:E8`

### Étape 2 : Télécharger la Clé depuis EAS (si possible)

EAS peut vous permettre de télécharger la clé. Essayez :

```bash
eas credentials --platform android
```

Sélectionnez :
- **Build profile**: `production`
- **What do you want to do?**: `Keystore: Manage everything needed to build your project`
- **What would you like to do?**: `Download credentials` (si cette option existe)

⚠️ **Note** : EAS ne permet généralement pas de télécharger les keystores pour des raisons de sécurité. Si cette option n'existe pas, passez à l'étape 3.

### Étape 3 : Ajouter l'Empreinte dans Google Play Console

Puisque vous ne pouvez probablement pas télécharger la clé depuis EAS, vous devez ajouter l'empreinte SHA-1 dans Google Play Console :

1. **Allez dans Google Play Console**
   - Ouvrez votre application
   - **Configuration de l'application** > **Intégrité de l'application**

2. **Trouvez la section "Signature d'application Play"**
   - Vous devriez voir "Signature par Google Play" activé

3. **Ajouter une nouvelle empreinte de certificat**
   - Cherchez la section **"Certificats de téléchargement"** ou **"Upload certificates"**
   - Cliquez sur **"Ajouter une nouvelle empreinte"** ou **"Add new certificate"**
   - Entrez l'empreinte SHA-1 de votre clé actuelle : `A0:70:F4:A1:79:5A:7E:8F:A9:77:62:39:EC:65:23:F0:4B:9B:6B:E8`
   - Sauvegardez

### Étape 4 : Vérifier que la Clé est Ajoutée

Après avoir ajouté l'empreinte, Google Play Console devrait :
- ✅ Accepter votre nouveau bundle signé avec cette clé
- ✅ Re-signer automatiquement avec la clé de production gérée par Google

### Étape 5 : Créer un Nouveau Build et Soumettre

Une fois l'empreinte ajoutée dans Google Play Console :

```bash
# Créer un nouveau build
eas build --profile production --platform android

# Une fois le build terminé, soumettre à Google Play
eas submit --platform android
```

---

## 🔍 Alternative : Si vous devez Créer une Nouvelle Clé

Si pour une raison quelconque vous devez créer une nouvelle clé (par exemple, si EAS ne peut pas vous donner la clé actuelle) :

### Option A : Générer une Nouvelle Clé avec EAS

```bash
eas credentials --platform android
```

Sélectionnez :
- **Build profile**: `production`
- **What do you want to do?**: `Keystore: Manage everything needed to build your project`
- **What would you like to do?**: `Generate a new Keystore`

⚠️ **ATTENTION** : Cela créera une nouvelle clé. Vous devrez ensuite :
1. Télécharger cette nouvelle clé (si EAS le permet)
2. Extraire l'empreinte SHA-1
3. L'ajouter dans Google Play Console

### Option B : Générer une Clé Localement

Si vous préférez générer la clé localement :

```bash
# Générer un nouveau keystore
keytool -genkeypair -v -storetype PKCS12 -keystore upload-keystore.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000

# Extraire l'empreinte SHA-1
keytool -list -v -keystore upload-keystore.jks -alias upload
```

Ensuite :
1. Notez l'empreinte SHA-1
2. Ajoutez-la dans Google Play Console
3. Configurez EAS pour utiliser ce keystore :

```bash
eas credentials --platform android
```

Sélectionnez :
- **Build profile**: `production`
- **What do you want to do?**: `Keystore: Manage everything needed to build your project`
- **What would you like to do?**: `Use existing keystore`
- Uploadez le fichier `upload-keystore.jks`

---

## ✅ Vérification

Après avoir ajouté l'empreinte dans Google Play Console :

1. **Vérifiez dans Google Play Console** que l'empreinte est bien listée
2. **Créez un nouveau build** avec EAS
3. **Soumettez le bundle** - il devrait être accepté cette fois

---

## 📝 Notes Importantes

1. **Google Play App Signing** : Une fois activé, Google gère la clé de production. Vous n'avez besoin que d'une upload key.

2. **Empreinte SHA-1** : C'est l'empreinte SHA-1 de votre upload key que vous devez ajouter, pas celle de la clé de production (celle-ci est gérée par Google).

3. **Sécurité** : Même si vous perdez votre upload key, vous pouvez en créer une nouvelle et l'ajouter dans Google Play Console. Google continuera à signer avec la clé de production.

4. **EAS et Google Play App Signing** : EAS fonctionne parfaitement avec Google Play App Signing. Vous n'avez qu'à ajouter l'empreinte de votre clé EAS dans Google Play Console.

---

## 🚀 Commandes Rapides

```bash
# Voir les credentials actuels
eas credentials --platform android

# Créer un nouveau build
eas build --profile production --platform android

# Soumettre à Google Play
eas submit --platform android

# Voir l'historique des builds
eas build:list --platform android
```

---

## ❓ Questions Fréquentes

**Q : Dois-je télécharger la clé depuis EAS ?**
R : Non, vous n'avez besoin que de l'empreinte SHA-1. Ajoutez-la dans Google Play Console.

**Q : Que se passe-t-il si je perds cette clé plus tard ?**
R : Avec Google Play App Signing, vous pouvez créer une nouvelle upload key et l'ajouter dans Google Play Console. Google continuera à utiliser la clé de production.

**Q : Puis-je utiliser plusieurs upload keys ?**
R : Oui, vous pouvez ajouter plusieurs empreintes dans Google Play Console.










