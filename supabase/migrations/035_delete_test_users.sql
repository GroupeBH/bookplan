-- Migration pour supprimer les utilisateurs fictifs de test et toutes leurs données associées
-- Cette migration supprime les utilisateurs créés pour les tests

-- IMPORTANT: Cette migration supprime définitivement les données
-- Assurez-vous de faire une sauvegarde avant d'exécuter cette migration
-- 
-- NOTE: Pour supprimer des utilisateurs de auth.users, vous devez utiliser l'API Supabase Admin
-- ou exécuter cette migration avec les privilèges appropriés.
-- Cette migration supprime d'abord toutes les données associées, puis les profils,
-- et enfin tente de supprimer les utilisateurs de auth.users.

-- Fonction pour supprimer un utilisateur fictif et toutes ses données
CREATE OR REPLACE FUNCTION delete_test_user(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Supprimer toutes les données associées (les CASCADE s'occuperont de la plupart)
  -- Mais on supprime explicitement pour être sûr
  
  -- Supprimer les photos d'album
  DELETE FROM user_album_photos WHERE user_id = p_user_id;
  
  -- Supprimer les tokens push
  DELETE FROM push_tokens WHERE user_id = p_user_id;
  
  -- Supprimer les messages (via conversation)
  DELETE FROM messages WHERE sender_id = p_user_id OR recipient_id = p_user_id;
  
  -- Supprimer les conversations
  DELETE FROM conversations WHERE user1_id = p_user_id OR user2_id = p_user_id;
  
  -- Supprimer les utilisateurs bloqués
  DELETE FROM blocked_users WHERE blocker_id = p_user_id OR blocked_id = p_user_id;
  
  -- Supprimer les likes
  DELETE FROM user_likes WHERE liker_id = p_user_id OR liked_id = p_user_id;
  
  -- Supprimer les candidatures aux offres
  DELETE FROM offer_applications WHERE applicant_id = p_user_id;
  
  -- Supprimer les offres (et leurs candidatures seront supprimées en cascade)
  DELETE FROM offers WHERE author_id = p_user_id;
  
  -- Supprimer les abonnements
  DELETE FROM subscriptions WHERE user_id = p_user_id;
  
  -- Supprimer les notes/avis
  DELETE FROM ratings WHERE rater_id = p_user_id OR rated_id = p_user_id;
  
  -- Supprimer les demandes d'accès
  DELETE FROM info_access_requests WHERE requester_id = p_user_id OR target_id = p_user_id;
  
  -- Supprimer les bookings
  DELETE FROM bookings WHERE requester_id = p_user_id OR provider_id = p_user_id;
  
  -- Supprimer le profil
  DELETE FROM profiles WHERE id = p_user_id;
  
  -- Supprimer l'utilisateur de auth.users
  -- NOTE: Cela nécessite des privilèges élevés
  DELETE FROM auth.users WHERE id = p_user_id;
  
  RAISE NOTICE 'Utilisateur % et toutes ses données supprimés', p_user_id;
END;
$$;

-- Identifier et supprimer les utilisateurs fictifs
DO $$
DECLARE
  test_user_ids UUID[];
  test_emails TEXT[] := ARRAY[
    'amina.test@kutana.com',
    'joel.test@kutana.com',
    'amina.test@bookplan.com',
    'joel.test@bookplan.com'
  ];
  test_phones TEXT[] := ARRAY[
    '+243900000001',
    '+243900000002'
  ];
  test_pseudos TEXT[] := ARRAY[
    'Amina',
    'Joël'
  ];
  user_id UUID;
  temp_ids UUID[];
BEGIN
  -- Collecter tous les IDs des utilisateurs fictifs
  -- Par emails de test
  SELECT ARRAY_AGG(id) INTO temp_ids
  FROM auth.users
  WHERE email = ANY(test_emails);
  
  test_user_ids := COALESCE(temp_ids, ARRAY[]::UUID[]);
  
  -- Ajouter les IDs par téléphones de test
  SELECT ARRAY_AGG(id) INTO temp_ids
  FROM auth.users
  WHERE phone = ANY(test_phones)
  AND (test_user_ids IS NULL OR id != ALL(test_user_ids));
  
  IF temp_ids IS NOT NULL THEN
    test_user_ids := test_user_ids || temp_ids;
  END IF;
  
  -- Ajouter les IDs par pseudos de test (via profiles)
  SELECT ARRAY_AGG(p.id) INTO temp_ids
  FROM profiles p
  WHERE p.pseudo = ANY(test_pseudos)
  AND (test_user_ids IS NULL OR p.id != ALL(test_user_ids));
  
  IF temp_ids IS NOT NULL THEN
    test_user_ids := test_user_ids || temp_ids;
  END IF;
  
  -- Ajouter les IDs spécifiques des utilisateurs de test (de la migration 007)
  test_user_ids := test_user_ids || ARRAY[
    'a1b2c3d4-e5f6-4789-a012-b3c4d5e6f789'::UUID, -- Amina
    'b2c3d4e5-f6a7-4890-b123-c4d5e6f7a890'::UUID  -- Joël
  ];
  
  -- Supprimer les doublons
  SELECT ARRAY(SELECT DISTINCT unnest(test_user_ids)) INTO test_user_ids;
  
  -- Afficher les utilisateurs qui seront supprimés (pour vérification)
  RAISE NOTICE 'Utilisateurs fictifs à supprimer: %', test_user_ids;
  
  -- Supprimer chaque utilisateur fictif
  FOR user_id IN SELECT unnest(test_user_ids)
  LOOP
    -- Vérifier que l'utilisateur existe
    IF EXISTS (SELECT 1 FROM auth.users WHERE id = user_id) THEN
      BEGIN
        PERFORM delete_test_user(user_id);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Erreur lors de la suppression de l''utilisateur %: %', user_id, SQLERRM;
      END;
    ELSE
      RAISE NOTICE 'Utilisateur % n''existe pas, ignoré', user_id;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Suppression des utilisateurs fictifs terminée';
END $$;

-- Nettoyer la fonction (optionnel, on peut la garder pour usage futur)
-- DROP FUNCTION IF EXISTS delete_test_user(UUID);

-- Vérifier qu'il ne reste plus d'utilisateurs fictifs
SELECT 
  'Utilisateurs restants avec emails de test:' as check_type,
  COUNT(*) as count
FROM auth.users
WHERE email LIKE '%test%@%' OR email LIKE '%@kutana.com' OR email LIKE '%@bookplan.com'
UNION ALL
SELECT 
  'Utilisateurs restants avec téléphones de test:' as check_type,
  COUNT(*) as count
FROM auth.users
WHERE phone IN ('+243900000001', '+243900000002')
UNION ALL
SELECT 
  'Profils restants avec pseudos de test:' as check_type,
  COUNT(*) as count
FROM profiles
WHERE pseudo IN ('Amina', 'Joël');

