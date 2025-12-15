# Guide d'installation des migrations de messagerie

## 📋 Migrations à exécuter

Pour activer la messagerie dans votre application, vous devez exécuter les migrations suivantes **dans l'ordre** :

1. `018_create_conversations.sql` - Crée la table des conversations
2. `019_create_messages.sql` - Crée la table des messages
3. `020_add_conversation_last_message_fk.sql` - Ajoute la contrainte de clé étrangère

## 🚀 Instructions d'exécution

### Option 1 : Via l'interface Supabase (Recommandé)

1. Allez sur [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Sélectionnez votre projet BookPlan
3. Allez dans **SQL Editor** (dans le menu de gauche)
4. Cliquez sur **New Query**
5. Exécutez les migrations **une par une** dans l'ordre suivant :

#### Étape 1 : Créer la table conversations
- Ouvrez le fichier `supabase/migrations/018_create_conversations.sql`
- Copiez tout le contenu
- Collez-le dans l'éditeur SQL de Supabase
- Cliquez sur **Run** (ou appuyez sur `Ctrl+Enter` / `Cmd+Enter`)

#### Étape 2 : Créer la table messages
- Ouvrez le fichier `supabase/migrations/019_create_messages.sql`
- Copiez tout le contenu
- Collez-le dans l'éditeur SQL de Supabase
- Cliquez sur **Run**

#### Étape 3 : Ajouter la contrainte de clé étrangère
- Ouvrez le fichier `supabase/migrations/020_add_conversation_last_message_fk.sql`
- Copiez tout le contenu
- Collez-le dans l'éditeur SQL de Supabase
- Cliquez sur **Run**

### Option 2 : Via Supabase CLI (si installé)

Si vous avez Supabase CLI installé localement :

```bash
# Depuis le répertoire du projet
supabase db push
```

## ✅ Vérification

Après avoir exécuté les migrations, vérifiez que les tables existent :

```sql
-- Vérifier que les tables existent
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('conversations', 'messages')
ORDER BY table_name;
```

Vous devriez voir :
- `conversations`
- `messages`

Vérifiez également que les fonctions RPC existent :

```sql
-- Vérifier les fonctions
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN ('get_or_create_conversation', 'create_message', 'mark_messages_as_read')
ORDER BY routine_name;
```

Vous devriez voir :
- `get_or_create_conversation`
- `create_message`
- `mark_messages_as_read`

## 🔐 Vérification des politiques RLS

Vérifiez que les politiques RLS sont actives :

```sql
-- Vérifier les politiques pour conversations
SELECT * FROM pg_policies WHERE tablename = 'conversations';

-- Vérifier les politiques pour messages
SELECT * FROM pg_policies WHERE tablename = 'messages';
```

## 🐛 Dépannage

### Erreur "relation does not exist"
- Assurez-vous d'avoir exécuté les migrations dans l'ordre (018, puis 019, puis 020)
- Vérifiez que vous êtes dans le bon schéma (`public`)

### Erreur "permission denied"
- Vérifiez que RLS est activé sur les tables
- Vérifiez que les politiques sont créées correctement
- Assurez-vous d'être authentifié avec un utilisateur valide

### Erreur "duplicate key"
- Si vous réexécutez les migrations, utilisez `CREATE TABLE IF NOT EXISTS` (déjà inclus)
- Pour les fonctions, utilisez `CREATE OR REPLACE FUNCTION` (déjà inclus)

### Erreur "constraint violation"
- Si vous obtenez une erreur lors de l'exécution de la migration 020, c'est peut-être parce que la table `messages` n'existe pas encore
- Assurez-vous d'exécuter les migrations dans l'ordre

## 📝 Notes importantes

- Les migrations sont idempotentes (vous pouvez les réexécuter sans problème)
- Les tables utilisent RLS (Row Level Security) pour la sécurité
- Les fonctions RPC sont créées avec `SECURITY DEFINER` pour bypass RLS quand nécessaire
- Les contraintes garantissent l'intégrité des données (pas de conversation avec soi-même, etc.)

## ✨ Après l'installation

Une fois les migrations exécutées, la messagerie sera fonctionnelle dans l'application :
- Les utilisateurs pourront créer des conversations
- Les messages seront stockés en base de données
- Les messages en temps réel fonctionneront via Supabase Realtime
- Les compteurs de messages non lus seront mis à jour automatiquement









