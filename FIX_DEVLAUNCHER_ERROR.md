# 🔧 Résolution de l'erreur "App react context shouldn't be created before"

## ❌ Erreur
```
java.lang.IllegalArgumentException: App react context shouldn't be created before.
```

Cette erreur se produit avec le DevLauncher d'Expo lors du démarrage de l'application Android.

## ✅ Solutions (essayer dans l'ordre)

### Solution 1 : Désinstaller complètement l'app

1. **Sur votre appareil Android** :
   - Allez dans **Paramètres** > **Applications**
   - Trouvez l'application **"kutana"** ou **"Expo Go"**
   - Cliquez sur **Désinstaller**
   - Confirmez la désinstallation

2. **Redémarrer l'appareil** (optionnel mais recommandé)

3. **Relancer l'app** depuis Expo

### Solution 2 : Nettoyer le cache et redémarrer

```bash
# Arrêter tous les processus Node
taskkill /F /IM node.exe

# Nettoyer le cache Metro
npx expo start --clear

# OU nettoyer complètement
rm -rf node_modules/.cache
rm -rf .expo
npx expo start --clear
```

### Solution 3 : Vérifier la cohérence du package name

Il y a une incohérence entre `app.json` et `app.config.js` :

- **`app.json`** : `"package": "com.kutana.app"`
- **`app.config.js`** : `package: "com.kutana"`

**Expo utilise `app.config.js` s'il existe**, donc actuellement c'est `com.kutana` qui est utilisé.

**Pour corriger** :

1. Choisissez un seul package name (recommandé : `com.kutana.app` pour correspondre à Google Play)
2. Mettez à jour `app.config.js` :

```javascript
android: {
  package: "com.kutana.app",  // Au lieu de "com.kutana"
  // ...
}
```

3. Mettez à jour `google-services.json` si nécessaire
4. **Important** : Après changement de package name, vous devez **rebuilder l'app** :

```bash
eas build --profile development --platform android
```

### Solution 4 : Rebuilder l'app development

Si les solutions précédentes ne fonctionnent pas, créez un nouveau build :

```bash
# Nettoyer d'abord
npx expo prebuild --clean

# Rebuilder
eas build --profile development --platform android
```

Puis installez le nouveau build sur votre appareil.

### Solution 5 : Utiliser Expo Go au lieu du DevLauncher

Si vous n'avez pas besoin des fonctionnalités natives spécifiques, vous pouvez utiliser Expo Go :

```bash
# Désinstaller expo-dev-client si installé
npm uninstall expo-dev-client

# Modifier eas.json pour désactiver developmentClient
# Dans eas.json, changez :
"development": {
  "developmentClient": false,  // Au lieu de true
  // ...
}
```

Puis utilisez Expo Go depuis le Play Store.

## 🔍 Diagnostic

Pour vérifier quel package name est utilisé :

```bash
npx expo config --type public | grep -i package
```

## ⚠️ Important

- **Ne changez PAS le package name** si l'app est déjà publiée sur Google Play
- Si vous changez le package name, vous devez créer un nouveau build et le soumettre comme une nouvelle application
- Le package name dans `app.config.js` doit correspondre à celui dans `google-services.json`

## 📝 Note

L'erreur "App react context shouldn't be created before" est souvent causée par :
- Un conflit de package name
- Un cache corrompu
- Une ancienne version de l'app installée avec un package name différent
- Un problème avec le DevLauncher

La solution la plus efficace est généralement de **désinstaller complètement l'app** et de **rebuilder** si nécessaire.

