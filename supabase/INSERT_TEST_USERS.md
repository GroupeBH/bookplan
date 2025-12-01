# Guide pour insérer les utilisateurs de test

Ce guide vous explique comment insérer deux utilisateurs de test dans votre base de données Supabase.

## Méthode 1 : Via l'interface Supabase (Recommandé)

1. Connectez-vous à votre projet Supabase : https://supabase.com/dashboard
2. Allez dans **SQL Editor** (dans le menu de gauche)
3. Cliquez sur **New Query**
4. Copiez et collez le contenu du fichier `supabase/migrations/007_insert_test_users.sql`
5. Cliquez sur **Run** (ou appuyez sur `Ctrl+Enter` / `Cmd+Enter`)

## Méthode 2 : Via la ligne de commande (si vous avez Supabase CLI installé)

```bash
# Assurez-vous d'être connecté à votre projet
supabase db push

# Ou exécutez directement la migration
supabase migration up
```

## Vérification

Après avoir exécuté le script, vous pouvez vérifier que les utilisateurs ont été créés :

```sql
SELECT 
  id,
  pseudo,
  age,
  phone,
  is_available,
  lat,
  lng,
  created_at
FROM profiles
WHERE pseudo IN ('Amina', 'Joël')
ORDER BY created_at DESC;
```

## Utilisateurs créés

### Amina
- **Pseudo** : Amina
- **Âge** : 24 ans
- **Téléphone** : +243900000001
- **Position** : Kinshasa (lat: -4.3276, lng: 15.3136)
- **Statut** : Disponible, Abonné
- **Note** : 4.8/5 (23 avis)

### Joël
- **Pseudo** : Joël
- **Âge** : 28 ans
- **Téléphone** : +243900000002
- **Position** : Kinshasa (lat: -4.3376, lng: 15.3236)
- **Statut** : Disponible, Abonné
- **Note** : 4.5/5 (18 avis)

## Notes importantes

- Les utilisateurs sont créés dans `auth.users` ET dans `profiles` pour respecter la contrainte de clé étrangère
- Les IDs sont fixes (UUIDs prédéfinis) pour faciliter les tests et éviter les conflits
- Les utilisateurs sont marqués comme `is_available = true` pour qu'ils apparaissent dans la liste
- Les positions sont définies à Kinshasa (RDC) pour les tests
- Si vous exécutez le script plusieurs fois, les utilisateurs seront mis à jour (pas de duplication)
- **Mot de passe par défaut** : `test123456` (pour les deux utilisateurs)
- Les utilisateurs ont des emails de test : `amina.test@bookplan.com` et `joel.test@bookplan.com`

## Prochaines étapes

Une fois les utilisateurs créés :
1. Rechargez votre application
2. Les utilisateurs devraient apparaître sur la carte et dans la liste
3. Vous pouvez cliquer sur leurs profils pour voir les détails

