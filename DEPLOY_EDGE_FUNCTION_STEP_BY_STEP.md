# 🚀 Guide Complet : Déployer send-push-notification

## 📋 Prérequis

- Un compte Supabase (gratuit)
- Votre projet Supabase créé
- Le fichier `supabase/functions/send-push-notification/index.ts` existe déjà ✅

## 🎯 Méthode 1 : Via la ligne de commande (Recommandé)

### Étape 1 : Se connecter à Supabase

Ouvrez un terminal PowerShell dans `D:\labs\bookplan` et exécutez :

```powershell
npx supabase login
```

Cela ouvrira votre navigateur pour vous connecter. **Connectez-vous avec votre compte Supabase**.

### Étape 2 : Trouver votre Project Reference ID

1. Allez sur **https://supabase.com/dashboard**
2. Cliquez sur votre projet **bookplan**
3. Allez dans **Settings** (⚙️ en bas à gauche) > **General**
4. Trouvez **Reference ID** et **copiez-le** (ex: `abcdefghijklmnopqrst`)

### Étape 3 : Lier votre projet

Dans le terminal, exécutez :

```powershell
npx supabase link --project-ref VOTRE_REFERENCE_ID_ICI
```

**Remplacez `VOTRE_REFERENCE_ID_ICI` par le Reference ID que vous avez copié.**

Exemple :
```powershell
npx supabase link --project-ref abcdefghijklmnopqrst
```

### Étape 4 : Déployer la fonction

```powershell
npx supabase functions deploy send-push-notification
```

Vous devriez voir un message de succès comme :
```
Deployed Function send-push-notification
```

### ✅ Vérifier le déploiement

```powershell
npx supabase functions list
```

Vous devriez voir `send-push-notification` dans la liste.

---

## 🎯 Méthode 2 : Via le Dashboard Supabase (Plus simple)

Si vous préférez utiliser l'interface web :

### Étape 1 : Accéder aux Edge Functions

1. Allez sur **https://supabase.com/dashboard**
2. Sélectionnez votre projet **bookplan**
3. Dans le menu de gauche, cliquez sur **Edge Functions**

### Étape 2 : Créer la fonction

1. Cliquez sur **Create a new function**
2. Dans le champ **Function name**, entrez : `send-push-notification`
3. Cliquez sur **Create function**

### Étape 3 : Copier le code

1. Ouvrez le fichier `supabase/functions/send-push-notification/index.ts` dans votre éditeur
2. **Sélectionnez tout le contenu** (Ctrl+A) et **copiez** (Ctrl+C)

### Étape 4 : Coller et déployer

1. Dans l'éditeur du Dashboard Supabase, **collez** le code (Ctrl+V)
2. Cliquez sur le bouton **Deploy** (en haut à droite)

### ✅ Vérifier

Vous devriez voir un message de succès. La fonction est maintenant déployée !

---

## 🧪 Tester la fonction

Une fois déployée, votre application React Native utilisera automatiquement cette fonction pour envoyer des notifications push.

Pour tester manuellement, vous pouvez utiliser cette commande (remplacez les valeurs) :

```powershell
curl -X POST "https://VOTRE_PROJECT_REF.supabase.co/functions/v1/send-push-notification" `
  -H "Authorization: Bearer VOTRE_ACCESS_TOKEN" `
  -H "Content-Type: application/json" `
  -d '{"userId":"user-id","title":"Test","body":"Message de test"}'
```

---

## 🔍 Voir les logs

Pour voir les logs de la fonction (erreurs, etc.) :

**Via CLI :**
```powershell
npx supabase functions logs send-push-notification
```

**Via Dashboard :**
1. Allez dans **Edge Functions**
2. Cliquez sur `send-push-notification`
3. Onglet **Logs**

---

## ❓ Problèmes courants

### ❌ "Project not linked"
**Solution :** Exécutez `npx supabase link --project-ref VOTRE_REF_ID`

### ❌ "Not authenticated"  
**Solution :** Exécutez `npx supabase login`

### ❌ "Function not found"
**Solution :** Vérifiez que le fichier `supabase/functions/send-push-notification/index.ts` existe

### ❌ Erreur 404 dans l'app
**Solution :** Vérifiez que vous avez bien déployé la fonction avec `npx supabase functions deploy send-push-notification`

### ❌ "Cannot use automatic login flow"
**Solution :** Cette erreur apparaît dans certains environnements. Utilisez plutôt la **Méthode 2 (Dashboard)** qui est plus simple.

---

## ✅ Une fois déployé

Votre application React Native utilisera automatiquement cette fonction pour :
- ✅ Envoyer des notifications lors de la création d'offres
- ✅ Notifier les candidats sélectionnés
- ✅ Envoyer des notifications de refus
- ✅ Et toutes les autres notifications push de l'application

**Les erreurs 404 disparaîtront automatiquement !** 🎉






