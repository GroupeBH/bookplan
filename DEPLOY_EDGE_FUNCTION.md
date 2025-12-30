# 🚀 Guide : Déployer la Fonction Edge send-push-notification

## Étape 1 : Se connecter à Supabase

```bash
cd D:\labs\bookplan
npx supabase login
```

Cela ouvrira votre navigateur pour vous connecter à votre compte Supabase.

## Étape 2 : Trouver votre Project Reference ID

1. Allez sur https://supabase.com/dashboard
2. Sélectionnez votre projet **bookplan**
3. Allez dans **Settings** (⚙️) > **General**
4. Copiez le **Reference ID** (ex: `abcdefghijklmnopqrst`)

## Étape 3 : Lier votre projet local à Supabase

```bash
npx supabase link --project-ref VOTRE_PROJECT_REF_ICI
```

Remplacez `VOTRE_PROJECT_REF_ICI` par le Reference ID que vous avez copié.

**Exemple :**
```bash
npx supabase link --project-ref abcdefghijklmnopqrst
```

## Étape 4 : Déployer la fonction

```bash
npx supabase functions deploy send-push-notification
```

Cette commande va :
- Compiler la fonction TypeScript/Deno
- La déployer sur votre projet Supabase
- La rendre accessible via l'URL : `https://VOTRE_PROJECT_REF.supabase.co/functions/v1/send-push-notification`

## ✅ Vérification

### Vérifier que la fonction est déployée

```bash
npx supabase functions list
```

Vous devriez voir `send-push-notification` dans la liste.

### Voir les logs

```bash
npx supabase functions logs send-push-notification
```

## 🧪 Tester la fonction

Une fois déployée, la fonction sera automatiquement utilisée par votre application React Native. Les notifications push fonctionneront automatiquement !

## 📝 Alternative : Déploiement via Dashboard Supabase

Si vous préférez utiliser l'interface web :

1. Allez sur https://supabase.com/dashboard
2. Sélectionnez votre projet
3. Allez dans **Edge Functions** (dans le menu de gauche)
4. Cliquez sur **Create a new function**
5. Nommez-la `send-push-notification`
6. Copiez tout le contenu du fichier `supabase/functions/send-push-notification/index.ts`
7. Collez-le dans l'éditeur de code
8. Cliquez sur **Deploy**

## 🔧 Configuration automatique

La fonction utilise automatiquement :
- `SUPABASE_URL` - Configuré automatiquement
- `SUPABASE_SERVICE_ROLE_KEY` - Configuré automatiquement

**Vous n'avez rien à configurer manuellement !** Supabase gère tout automatiquement.

## ❓ Dépannage

### Erreur : "Project not linked"
→ Exécutez `npx supabase link --project-ref VOTRE_PROJECT_REF`

### Erreur : "Not authenticated"
→ Exécutez `npx supabase login`

### Erreur : "Function not found"
→ Vérifiez que le dossier `supabase/functions/send-push-notification/index.ts` existe

### La fonction retourne 404
→ Vérifiez que vous avez bien déployé avec `npx supabase functions deploy send-push-notification`


















