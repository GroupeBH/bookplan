# Alternative : Créer les utilisateurs via l'API Supabase

Si l'insertion directe dans `auth.users` ne fonctionne pas, voici une méthode alternative :

## Méthode 1 : Via l'interface Supabase Auth

1. Allez dans **Authentication** → **Users** dans votre dashboard Supabase
2. Cliquez sur **Add User** → **Create new user**
3. Créez les deux utilisateurs :
   - **Amina** : Email `amina.test@bookplan.com`, Phone `+243900000001`
   - **Joël** : Email `joel.test@bookplan.com`, Phone `+243900000002`
4. Notez les IDs générés pour chaque utilisateur
5. Exécutez ensuite ce script SQL (remplacez les IDs par ceux notés) :

```sql
-- Remplacer ces IDs par ceux de vos utilisateurs créés
DO $$
DECLARE
  amina_id UUID := 'VOTRE_ID_AMINA_ICI';
  joel_id UUID := 'VOTRE_ID_JOEL_ICI';
BEGIN
  -- Créer le profil pour Amina
  INSERT INTO profiles (
    id, pseudo, age, phone, photo, description,
    rating, review_count, is_subscribed, subscription_status,
    gender, lat, lng, is_available, created_at, updated_at
  ) VALUES (
    amina_id, 'Amina', 24, '+243900000001',
    'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400',
    'Passionnée de danse et de sorties entre amis.',
    4.8, 23, true, 'active', 'female',
    -4.3276, 15.3136, true, NOW(), NOW()
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
    id, pseudo, age, phone, photo, description,
    rating, review_count, is_subscribed, subscription_status,
    gender, lat, lng, is_available, created_at, updated_at
  ) VALUES (
    joel_id, 'Joël', 28, '+243900000002',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
    'Entrepreneur passionné, j''aime les discussions profondes.',
    4.5, 18, true, 'active', 'male',
    -4.3376, 15.3236, true, NOW(), NOW()
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
```

## Méthode 2 : Via l'API Supabase (Node.js/JavaScript)

```javascript
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'YOUR_SUPABASE_URL',
  'YOUR_SERVICE_ROLE_KEY' // Utilisez la service role key, pas l'anon key
);

// Créer Amina
const { data: amina, error: aminaError } = await supabase.auth.admin.createUser({
  email: 'amina.test@bookplan.com',
  phone: '+243900000001',
  password: 'test123456',
  email_confirm: true,
  phone_confirm: true,
  user_metadata: { pseudo: 'Amina' }
});

if (aminaError) {
  console.error('Error creating Amina:', aminaError);
} else {
  // Créer le profil
  await supabase.from('profiles').upsert({
    id: amina.user.id,
    pseudo: 'Amina',
    age: 24,
    phone: '+243900000001',
    photo: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400',
    description: 'Passionnée de danse et de sorties entre amis.',
    rating: 4.8,
    review_count: 23,
    is_subscribed: true,
    subscription_status: 'active',
    gender: 'female',
    lat: -4.3276,
    lng: 15.3136,
    is_available: true
  });
}

// Créer Joël
const { data: joel, error: joelError } = await supabase.auth.admin.createUser({
  email: 'joel.test@bookplan.com',
  phone: '+243900000002',
  password: 'test123456',
  email_confirm: true,
  phone_confirm: true,
  user_metadata: { pseudo: 'Joël' }
});

if (joelError) {
  console.error('Error creating Joël:', joelError);
} else {
  // Créer le profil
  await supabase.from('profiles').upsert({
    id: joel.user.id,
    pseudo: 'Joël',
    age: 28,
    phone: '+243900000002',
    photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
    description: 'Entrepreneur passionné, j''aime les discussions profondes.',
    rating: 4.5,
    review_count: 18,
    is_subscribed: true,
    subscription_status: 'active',
    gender: 'male',
    lat: -4.3376,
    lng: 15.3236,
    is_available: true
  });
}
```



