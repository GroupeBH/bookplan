# Configuration Supabase pour BookPlan

## 📋 Étapes de configuration

### 1. Récupérer vos clés Supabase

1. Allez sur [https://supabase.com](https://supabase.com) et connectez-vous
2. Sélectionnez votre projet BookPlan
3. Allez dans **Settings** > **API**
4. Copiez :
   - **Project URL** (ex: `https://xxxxx.supabase.co`)
   - **anon public** key (clé publique)

### 2. Configurer les variables d'environnement

Créez un fichier `.env` à la racine du projet avec :

```env
EXPO_PUBLIC_SUPABASE_URL=https://votre-projet.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=votre-clé-anon-publique
```

⚠️ **Important** : Ne commitez jamais le fichier `.env` dans Git ! Il est déjà dans `.gitignore`.

### 3. Configurer l'authentification par téléphone dans Supabase

1. Dans votre projet Supabase, allez dans **Authentication** > **Providers**
2. Activez **Phone** provider
3. Configurez les paramètres :
   - **Enable phone provider** : ON
   - **Confirm phone** : ON (pour vérifier le numéro)
   - **Phone OTP Expiry** : 60 (secondes)

### 4. Configurer Twilio (ou autre fournisseur SMS)

Supabase utilise Twilio par défaut pour envoyer les SMS OTP.

1. Allez dans **Authentication** > **Settings** > **SMS Auth**
2. Configurez Twilio :
   - **Twilio Account SID**
   - **Twilio Auth Token**
   - **Twilio Phone Number**

Ou utilisez un autre fournisseur SMS compatible.

### 5. Créer la table `profiles` dans Supabase

Exécutez cette requête SQL dans l'éditeur SQL de Supabase (**SQL Editor** > **New Query**) :

```sql
-- Créer la table profiles
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  pseudo TEXT,
  age INTEGER,
  phone TEXT,
  photo TEXT,
  description TEXT,
  rating DECIMAL(3,2) DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  is_subscribed BOOLEAN DEFAULT false,
  subscription_status TEXT DEFAULT 'pending' CHECK (subscription_status IN ('active', 'expired', 'pending')),
  last_seen TEXT,
  gender TEXT CHECK (gender IN ('male', 'female')),
  lat DECIMAL(10, 8),
  lng DECIMAL(11, 8),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Activer Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Politique : Les utilisateurs peuvent lire tous les profils
CREATE POLICY "Profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (true);

-- Politique : Les utilisateurs peuvent mettre à jour leur propre profil
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Politique : Les utilisateurs peuvent insérer leur propre profil
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Fonction pour créer automatiquement un profil lors de l'inscription
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, phone, pseudo)
  VALUES (
    NEW.id,
    NEW.phone,
    COALESCE(NEW.raw_user_meta_data->>'pseudo', 'Utilisateur')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger pour créer le profil automatiquement
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### 6. Tester la configuration

1. Redémarrez votre serveur Expo :
   ```bash
   npm start -- --clear
   ```

2. Testez l'authentification :
   - Ouvrez l'application
   - Essayez de vous connecter avec un numéro de téléphone
   - Vérifiez que vous recevez le code OTP

## 🔒 Sécurité

- ✅ Les clés publiques (anon key) sont sécurisées pour être utilisées côté client
- ✅ Row Level Security (RLS) est activé sur la table `profiles`
- ✅ Les utilisateurs ne peuvent modifier que leur propre profil
- ⚠️ Ne partagez jamais votre **service_role key** (clé secrète)

## 📚 Ressources

- [Documentation Supabase Auth](https://supabase.com/docs/guides/auth)
- [Documentation Phone Auth](https://supabase.com/docs/guides/auth/phone-login)
- [Documentation RLS](https://supabase.com/docs/guides/auth/row-level-security)

## 🐛 Dépannage

### Le code OTP n'arrive pas
- Vérifiez que Twilio est correctement configuré
- Vérifiez que le numéro de téléphone est au bon format (avec indicatif pays)
- Consultez les logs dans Supabase > Logs > Auth Logs

### Erreur "relation profiles does not exist"
- Exécutez le script SQL ci-dessus dans l'éditeur SQL de Supabase

### Erreur "permission denied"
- Vérifiez que RLS est correctement configuré
- Vérifiez que les politiques sont créées

