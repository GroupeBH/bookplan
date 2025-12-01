-- Migration pour insérer deux utilisateurs de test dans la base de données
-- Ces utilisateurs seront disponibles pour tester l'application

-- IMPORTANT: Ce script crée d'abord les utilisateurs dans auth.users, puis les profils
-- Les IDs sont générés de manière déterministe pour faciliter les tests

-- Définir les IDs des utilisateurs de test (UUIDs fixes pour faciliter les tests)
DO $$
DECLARE
  amina_id UUID := 'a1b2c3d4-e5f6-4789-a012-b3c4d5e6f789';
  joel_id UUID := 'b2c3d4e5-f6a7-4890-b123-c4d5e6f7a890';
BEGIN
  -- Créer l'utilisateur Amina dans auth.users
  -- Note: confirmed_at est une colonne générée, on ne peut pas l'insérer directement
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    phone,
    phone_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    role
  ) VALUES (
    amina_id,
    '00000000-0000-0000-0000-000000000000',
    'amina.test@bookplan.com',
    crypt('test123456', gen_salt('bf')), -- Mot de passe: test123456
    NOW(),
    '+243900000001',
    NOW(),
    NOW(),
    NOW(),
    '{"provider": "phone", "providers": ["phone"]}',
    '{"pseudo": "Amina"}',
    false,
    'authenticated'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Créer l'utilisateur Joël dans auth.users
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    phone,
    phone_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    role
  ) VALUES (
    joel_id,
    '00000000-0000-0000-0000-000000000000',
    'joel.test@bookplan.com',
    crypt('test123456', gen_salt('bf')), -- Mot de passe: test123456
    NOW(),
    '+243900000002',
    NOW(),
    NOW(),
    NOW(),
    '{"provider": "phone", "providers": ["phone"]}',
    '{"pseudo": "Joël"}',
    false,
    'authenticated'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Créer le profil pour Amina
  INSERT INTO profiles (
    id,
    pseudo,
    age,
    phone,
    photo,
    description,
    rating,
    review_count,
    is_subscribed,
    subscription_status,
    gender,
    lat,
    lng,
    is_available,
    created_at,
    updated_at
  ) VALUES (
    amina_id,
    'Amina',
    24,
    '+243900000001',
    'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400',
    'Passionnée de danse et de sorties entre amis. J''aime découvrir de nouveaux endroits et rencontrer des personnes intéressantes.',
    4.8,
    23,
    true,
    'active',
    'female',
    -4.3276,  -- Kinshasa, légèrement au nord
    15.3136,
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    pseudo = EXCLUDED.pseudo,
    age = EXCLUDED.age,
    phone = EXCLUDED.phone,
    photo = EXCLUDED.photo,
    description = EXCLUDED.description,
    rating = EXCLUDED.rating,
    review_count = EXCLUDED.review_count,
    is_subscribed = EXCLUDED.is_subscribed,
    subscription_status = EXCLUDED.subscription_status,
    gender = EXCLUDED.gender,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    is_available = EXCLUDED.is_available,
    updated_at = NOW();

  -- Créer le profil pour Joël
  INSERT INTO profiles (
    id,
    pseudo,
    age,
    phone,
    photo,
    description,
    rating,
    review_count,
    is_subscribed,
    subscription_status,
    gender,
    lat,
    lng,
    is_available,
    created_at,
    updated_at
  ) VALUES (
    joel_id,
    'Joël',
    28,
    '+243900000002',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
    'Entrepreneur passionné, j''aime les discussions profondes et les échanges culturels. Toujours partant pour de nouvelles aventures.',
    4.5,
    18,
    true,
    'active',
    'male',
    -4.3376,  -- Kinshasa, légèrement au sud
    15.3236,
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    pseudo = EXCLUDED.pseudo,
    age = EXCLUDED.age,
    phone = EXCLUDED.phone,
    photo = EXCLUDED.photo,
    description = EXCLUDED.description,
    rating = EXCLUDED.rating,
    review_count = EXCLUDED.review_count,
    is_subscribed = EXCLUDED.is_subscribed,
    subscription_status = EXCLUDED.subscription_status,
    gender = EXCLUDED.gender,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    is_available = EXCLUDED.is_available,
    updated_at = NOW();
END $$;

-- Vérifier que les utilisateurs ont été insérés
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

