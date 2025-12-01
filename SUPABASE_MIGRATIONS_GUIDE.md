# Guide des Migrations Supabase - BookPlan

## 📋 Vue d'ensemble

Ce document décrit toutes les tables et migrations nécessaires pour l'application BookPlan.

## 🗄️ Tables créées

### 1. `profiles` (Migration 001)
Table principale pour les profils utilisateurs.

**Colonnes principales :**
- `id` (UUID) - Référence à `auth.users(id)`
- `pseudo`, `age`, `phone`, `photo`, `description`
- `rating`, `review_count`
- `is_subscribed`, `subscription_status`
- `gender`, `lat`, `lng`
- `is_available` - Disponibilité de l'utilisateur
- `current_booking_id` - Booking actuel si réservé
- `password_hash` - Hash du mot de passe

### 2. `subscriptions` (Migration 002)
Gère les abonnements des utilisateurs.

**Colonnes :**
- `id` (UUID)
- `user_id` (UUID) - Référence à `auth.users`
- `plan_type` - 'basic', 'premium', 'vip'
- `status` - 'active', 'expired', 'pending', 'cancelled'
- `start_date`, `end_date`
- `price`

### 3. `bookings` (Migration 003)
Gère les demandes de compagnie.

**Colonnes :**
- `id` (UUID)
- `requester_id` - Celui qui demande
- `provider_id` - Celui qui fournit la compagnie
- `status` - 'pending', 'accepted', 'rejected', 'completed', 'cancelled'
- `booking_date` - Date et heure du rendez-vous
- `duration_hours` - Durée en heures
- `location`, `lat`, `lng`
- `notes`

**Fonctionnalités :**
- Fonction `is_user_available()` pour vérifier la disponibilité
- Trigger automatique pour mettre à jour `is_available` dans `profiles`

### 4. `info_access_requests` (Migration 004)
Gère les demandes d'accès aux informations complètes d'un profil.

**Colonnes :**
- `id` (UUID)
- `requester_id` - Celui qui demande l'accès
- `target_id` - Celui dont on demande les infos
- `status` - 'pending', 'accepted', 'rejected'
- `requester_info_revealed` - Si true, le target voit les infos du requester

**Logique :**
- Par défaut, on voit seulement photo et pseudo
- Quand on demande l'accès, le target voit automatiquement les infos du requester
- Le target peut accepter ou refuser
- Si accepté, le requester peut voir les infos complètes du target

### 5. `ratings` (Migration 005)
Gère les notes et avis sur les profils.

**Colonnes :**
- `id` (UUID)
- `rater_id` - Celui qui note
- `rated_id` - Celui qui est noté
- `rating` - Note de 1 à 5
- `comment` - Commentaire optionnel
- `booking_id` - Référence au booking (optionnel)

**Fonctionnalités :**
- Fonction `calculate_user_rating()` pour calculer la moyenne

## 🚀 Installation des migrations

### Étape 1 : Exécuter les migrations dans l'ordre

1. Allez sur [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Sélectionnez votre projet BookPlan
3. Allez dans **SQL Editor** > **New Query**
4. Exécutez les migrations dans cet ordre :

```sql
-- 1. Créer la table profiles
-- Copiez le contenu de supabase/migrations/001_create_profiles.sql

-- 2. Créer la table subscriptions
-- Copiez le contenu de supabase/migrations/002_create_subscriptions.sql

-- 3. Créer la table bookings
-- Copiez le contenu de supabase/migrations/003_create_bookings.sql

-- 4. Créer la table info_access_requests
-- Copiez le contenu de supabase/migrations/004_create_info_access_requests.sql

-- 5. Créer la table ratings
-- Copiez le contenu de supabase/migrations/005_create_ratings.sql

-- 6. Mettre à jour profiles avec disponibilité
-- Copiez le contenu de supabase/migrations/006_update_profiles_with_availability.sql

-- 7. Ajouter la fonction upsert_profile (bypass RLS)
-- Copiez le contenu de supabase/migrations/010_add_profile_upsert_function.sql

-- 8. Améliorer le trigger pour le pseudo
-- Copiez le contenu de supabase/migrations/011_fix_profile_trigger_pseudo.sql

-- 9. Ajouter la fonction pour récupérer l'email par téléphone
-- Copiez le contenu de supabase/migrations/012_get_user_email_by_phone.sql
```

### Étape 2 : Vérifier les tables

Après avoir exécuté toutes les migrations, vérifiez que toutes les tables existent :

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

Vous devriez voir :
- `bookings`
- `info_access_requests`
- `profiles`
- `ratings`
- `subscriptions`

## 🔒 Sécurité (RLS)

Toutes les tables ont Row Level Security (RLS) activé avec des politiques appropriées :

- **profiles** : Lecture publique, modification par le propriétaire
- **subscriptions** : Accès uniquement au propriétaire
- **bookings** : Visible par requester et provider
- **info_access_requests** : Visible par requester et target
- **ratings** : Lecture publique, création/modification par le propriétaire

### Fonction `upsert_profile` (Migration 010)

Une fonction `SECURITY DEFINER` a été créée pour permettre la création/mise à jour de profils sans être bloqué par RLS. Cette fonction est nécessaire car juste après `signUp`, la session peut ne pas être complètement établie pour que `auth.uid()` fonctionne correctement.

**Utilisation :**
```sql
SELECT upsert_profile(
  p_id := 'uuid-here',
  p_phone := '+243...',
  p_pseudo := 'Username',
  -- autres paramètres optionnels
);
```

### Fonction `get_user_email_by_phone` (Migration 012)

Une fonction `SECURITY DEFINER` qui permet de récupérer l'email d'un utilisateur basé sur son numéro de téléphone. Cette fonction est nécessaire pour la connexion car on utilise des emails temporaires générés à partir du téléphone.

**Utilisation :**
```sql
SELECT * FROM get_user_email_by_phone('+243900000001');
-- Retourne: email, user_id
```

## 📱 Fonctionnalités implémentées

### Disponibilité
- Un utilisateur est marqué comme `is_available = false` quand un booking est accepté
- Automatiquement remis à `true` quand le booking est complété/annulé
- Les utilisateurs non disponibles n'apparaissent pas dans la liste/map

### Demandes d'accès aux informations
- Par défaut : photo + pseudo seulement
- Demande d'accès → le target voit les infos du requester
- Le target peut accepter/refuser
- Si accepté → le requester voit les infos complètes

### Notes et avis
- Système de notation de 1 à 5 étoiles
- Calcul automatique de la moyenne
- Lié optionnellement à un booking

## 🔐 Authentification

### Méthodes supportées :
1. **OTP par téléphone** (pour la première inscription)
2. **Téléphone + Mot de passe** (pour les connexions suivantes)

Le hash du mot de passe est stocké dans `profiles.password_hash`.

## 📝 Notes importantes

- Toutes les dates utilisent `TIMESTAMP WITH TIME ZONE`
- Les UUID sont générés automatiquement
- Les triggers mettent à jour automatiquement `updated_at`
- Les fonctions SQL sont créées pour les calculs complexes

## 🐛 Dépannage

### Erreur "relation does not exist"
- Vérifiez que vous avez exécuté toutes les migrations dans l'ordre
- Vérifiez que vous êtes dans le bon schéma (`public`)

### Erreur "permission denied"
- Vérifiez que RLS est activé
- Vérifiez que les politiques sont créées
- Vérifiez que vous êtes authentifié avec le bon utilisateur

### Erreur "duplicate key"
- Vérifiez les contraintes UNIQUE
- Un utilisateur ne peut avoir qu'un seul abonnement actif
- Un utilisateur ne peut demander l'accès qu'une fois à un autre utilisateur

