-- Migration pour supprimer TOUS les enregistrements de la base de données
-- Cette migration vide toutes les tables pour recommencer à zéro
--
-- ⚠️ ATTENTION: Cette opération est IRRÉVERSIBLE!
-- Toutes les données seront définitivement supprimées.
-- La structure des tables sera préservée, mais toutes les données seront perdues.
--
-- Assurez-vous de faire une sauvegarde complète avant d'exécuter cette migration.

-- Méthode 1: Utiliser TRUNCATE CASCADE (plus rapide et efficace)
-- Désactiver temporairement les triggers pour éviter les erreurs
SET session_replication_role = 'replica';

-- Vider toutes les tables avec TRUNCATE CASCADE
-- CASCADE supprime automatiquement les données des tables dépendantes
TRUNCATE TABLE 
  messages,
  conversations,
  offer_applications,
  offers,
  user_album_photos,
  push_tokens,
  user_likes,
  blocked_users,
  ratings,
  info_access_requests,
  bookings,
  subscriptions,
  profiles
CASCADE;

-- Réactiver les triggers
SET session_replication_role = 'origin';

-- Méthode 2: Supprimer TOUS les utilisateurs de auth.users
-- Cela supprimera automatiquement tous les profils restants grâce à ON DELETE CASCADE
DO $$
DECLARE
  user_record RECORD;
  deleted_count INTEGER := 0;
  total_users INTEGER;
BEGIN
  -- Compter le nombre d'utilisateurs
  SELECT COUNT(*) INTO total_users FROM auth.users;
  
  IF total_users = 0 THEN
    RAISE NOTICE 'Aucun utilisateur à supprimer';
    RETURN;
  END IF;
  
  RAISE NOTICE 'Suppression de % utilisateur(s)...', total_users;
  
  -- Supprimer tous les utilisateurs de auth.users
  FOR user_record IN SELECT id FROM auth.users
  LOOP
    BEGIN
      DELETE FROM auth.users WHERE id = user_record.id;
      deleted_count := deleted_count + 1;
      
      -- Afficher la progression tous les 10 utilisateurs
      IF deleted_count % 10 = 0 THEN
        RAISE NOTICE '   % utilisateur(s) supprimé(s)...', deleted_count;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Erreur lors de la suppression de l''utilisateur %: %', user_record.id, SQLERRM;
    END;
  END LOOP;
  
  RAISE NOTICE '✅ % utilisateur(s) supprimé(s) sur %', deleted_count, total_users;
END $$;

-- Vérifier que toutes les tables sont vides
DO $$
DECLARE
  table_name TEXT;
  row_count BIGINT;
  total_rows BIGINT := 0;
BEGIN
  RAISE NOTICE '=== Vérification des tables vides ===';
  
  -- Vérifier les tables principales
  FOR table_name IN 
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename IN (
      'profiles', 'bookings', 'info_access_requests', 'ratings', 
      'subscriptions', 'offers', 'offer_applications', 'user_likes',
      'blocked_users', 'conversations', 'messages', 'user_album_photos',
      'push_tokens', 'companionship_topics'
    )
    ORDER BY tablename
  LOOP
    EXECUTE format('SELECT COUNT(*) FROM %I', table_name) INTO row_count;
    total_rows := total_rows + row_count;
    IF row_count > 0 THEN
      RAISE WARNING 'Table % contient encore % enregistrements', table_name, row_count;
    ELSE
      RAISE NOTICE '✓ Table % est vide', table_name;
    END IF;
  END LOOP;
  
  -- Vérifier auth.users
  SELECT COUNT(*) INTO row_count FROM auth.users;
  total_rows := total_rows + row_count;
  IF row_count > 0 THEN
    RAISE WARNING 'Table auth.users contient encore % utilisateurs', row_count;
  ELSE
    RAISE NOTICE '✓ Table auth.users est vide';
  END IF;
  
  IF total_rows = 0 THEN
    RAISE NOTICE '=== ✅ Toutes les tables sont vides! ===';
  ELSE
    RAISE WARNING '=== ⚠️ Il reste % enregistrements au total ===', total_rows;
  END IF;
END $$;

-- Afficher un résumé final
SELECT 
  'Résumé de la réinitialisation' as info,
  (SELECT COUNT(*) FROM auth.users) as users_restants,
  (SELECT COUNT(*) FROM profiles) as profiles_restants,
  (SELECT COUNT(*) FROM bookings) as bookings_restants,
  (SELECT COUNT(*) FROM offers) as offers_restants,
  (SELECT COUNT(*) FROM ratings) as ratings_restants,
  (SELECT COUNT(*) FROM messages) as messages_restants;

