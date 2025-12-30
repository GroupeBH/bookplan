# 🚀 Build Android Uniquement

## ⚠️ Problème Résolu

L'erreur **"Authentication with Apple Developer Portal failed!"** se produit parce que EAS essaie de builder iOS alors que vous n'avez pas de compte Apple Developer payant.

## ✅ Solution : Builder Uniquement Android

### Option 1 : Utiliser le Profil Spécialisé (Recommandé)

J'ai créé un profil `production-android` dans `eas.json` qui ne build que Android :

```bash
eas build --profile production-android --platform android
```

### Option 2 : Spécifier la Plateforme Explicitement

Si vous utilisez le profil `production`, **toujours** spécifier `--platform android` :

```bash
eas build --profile production --platform android
```

⚠️ **IMPORTANT** : Ne jamais utiliser `--platform all` ou omettre `--platform` si vous n'avez pas de compte Apple Developer.

---

## 📋 Étapes Complètes pour Mettre à Jour sur Google Play

### 1. Ajouter l'Empreinte SHA-1 dans Google Play Console

Avant de builder, assurez-vous d'avoir ajouté l'empreinte SHA-1 dans Google Play Console :

1. Allez dans **Google Play Console** > Votre app > **Configuration de l'application** > **Intégrité de l'application**
2. Dans **"Certificats de téléchargement"**, ajoutez : `A0:70:F4:A1:79:5A:7E:8F:A9:77:62:39:EC:65:23:F0:4B:9B:6B:E8`

### 2. Créer le Build Android

```bash
# Utilisez le profil spécialisé Android
eas build --profile production-android --platform android

# OU utilisez le profil production avec --platform android
eas build --profile production --platform android
```

### 3. Soumettre à Google Play

Une fois le build terminé :

```bash
eas submit --platform android
```

---

## 🔍 Vérifier les Credentials Android

Si vous voulez vérifier quelle clé est utilisée :

```bash
eas credentials --platform android
```

Sélectionnez :
- **Build profile**: `production` ou `production-android`
- **What do you want to do?**: `View credentials`

Notez l'empreinte SHA-1 et assurez-vous qu'elle est ajoutée dans Google Play Console.

---

## ❓ Questions Fréquentes

**Q : Pourquoi l'erreur Apple Developer apparaît-elle ?**
R : Parce que EAS essaie de builder iOS. Spécifiez toujours `--platform android` pour éviter cela.

**Q : Puis-je builder iOS plus tard ?**
R : Oui, mais vous aurez besoin d'un compte Apple Developer payant (99$/an).

**Q : Le profil `production-android` est-il nécessaire ?**
R : Non, mais il évite les erreurs si vous oubliez `--platform android`. Vous pouvez toujours utiliser `production --platform android`.

---

## ✅ Commandes Rapides

```bash
# Voir les credentials Android
eas credentials --platform android

# Builder Android uniquement (profil spécialisé)
eas build --profile production-android --platform android

# Builder Android uniquement (profil production)
eas build --profile production --platform android

# Soumettre à Google Play
eas submit --platform android

# Voir l'historique des builds
eas build:list --platform android
```









