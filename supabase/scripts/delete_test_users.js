/**
 * Script pour supprimer les utilisateurs fictifs de test
 * 
 * Utilisation:
 * 1. Installez les dépendances: npm install @supabase/supabase-js dotenv
 * 2. Créez un fichier .env avec:
 *    SUPABASE_URL=votre_url_supabase
 *    SUPABASE_SERVICE_ROLE_KEY=votre_service_role_key
 * 3. Exécutez: node supabase/scripts/delete_test_users.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Erreur: SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être définis dans .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Identifiants des utilisateurs fictifs à supprimer
const testUserIdentifiers = {
  emails: [
    'amina.test@kutana.com',
    'joel.test@kutana.com',
    'amina.test@bookplan.com',
    'joel.test@bookplan.com'
  ],
  phones: [
    '+243900000001',
    '+243900000002'
  ],
  pseudos: [
    'Amina',
    'Joël'
  ],
  specificIds: [
    'a1b2c3d4-e5f6-4789-a012-b3c4d5e6f789', // Amina
    'b2c3d4e5-f6a7-4890-b123-c4d5e6f7a890'  // Joël
  ]
};

async function findTestUsers() {
  const userIds = new Set();
  
  // Trouver par emails
  for (const email of testUserIdentifiers.emails) {
    const { data: users } = await supabase.auth.admin.listUsers();
    const user = users?.users?.find(u => u.email === email);
    if (user) {
      userIds.add(user.id);
      console.log(`✓ Trouvé par email ${email}: ${user.id}`);
    }
  }
  
  // Trouver par téléphones
  for (const phone of testUserIdentifiers.phones) {
    const { data: users } = await supabase.auth.admin.listUsers();
    const user = users?.users?.find(u => u.phone === phone);
    if (user) {
      userIds.add(user.id);
      console.log(`✓ Trouvé par téléphone ${phone}: ${user.id}`);
    }
  }
  
  // Trouver par pseudos (via profiles)
  for (const pseudo of testUserIdentifiers.pseudos) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id')
      .eq('pseudo', pseudo);
    
    if (profiles) {
      profiles.forEach(profile => {
        userIds.add(profile.id);
        console.log(`✓ Trouvé par pseudo ${pseudo}: ${profile.id}`);
      });
    }
  }
  
  // Ajouter les IDs spécifiques
  testUserIdentifiers.specificIds.forEach(id => {
    userIds.add(id);
    console.log(`✓ ID spécifique ajouté: ${id}`);
  });
  
  return Array.from(userIds);
}

async function deleteUser(userId) {
  try {
    console.log(`\n🗑️  Suppression de l'utilisateur ${userId}...`);
    
    // Vérifier que l'utilisateur existe
    const { data: user, error: getUserError } = await supabase.auth.admin.getUserById(userId);
    
    if (getUserError || !user) {
      console.log(`⚠️  Utilisateur ${userId} non trouvé, ignoré`);
      return false;
    }
    
    console.log(`   Email: ${user.user?.email || 'N/A'}`);
    console.log(`   Téléphone: ${user.user?.phone || 'N/A'}`);
    
    // Supprimer l'utilisateur (cela supprimera automatiquement toutes les données associées)
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
    
    if (deleteError) {
      console.error(`❌ Erreur lors de la suppression de ${userId}:`, deleteError.message);
      return false;
    }
    
    console.log(`✅ Utilisateur ${userId} supprimé avec succès`);
    return true;
  } catch (error) {
    console.error(`❌ Erreur lors de la suppression de ${userId}:`, error.message);
    return false;
  }
}

async function verifyDeletion() {
  console.log('\n🔍 Vérification de la suppression...\n');
  
  // Vérifier les emails
  const { data: usersByEmail } = await supabase.auth.admin.listUsers();
  const remainingEmails = usersByEmail?.users?.filter(u => 
    testUserIdentifiers.emails.includes(u.email) ||
    u.email?.includes('test@') ||
    u.email?.includes('@kutana.com') ||
    u.email?.includes('@bookplan.com')
  ) || [];
  
  // Vérifier les téléphones
  const remainingPhones = usersByEmail?.users?.filter(u => 
    testUserIdentifiers.phones.includes(u.phone)
  ) || [];
  
  // Vérifier les pseudos
  const { data: remainingProfiles } = await supabase
    .from('profiles')
    .select('id, pseudo')
    .in('pseudo', testUserIdentifiers.pseudos);
  
  console.log(`📊 Résultats de la vérification:`);
  console.log(`   - Utilisateurs avec emails de test restants: ${remainingEmails.length}`);
  console.log(`   - Utilisateurs avec téléphones de test restants: ${remainingPhones.length}`);
  console.log(`   - Profils avec pseudos de test restants: ${remainingProfiles?.length || 0}`);
  
  if (remainingEmails.length > 0 || remainingPhones.length > 0 || (remainingProfiles?.length || 0) > 0) {
    console.log('\n⚠️  Il reste des utilisateurs fictifs!');
    if (remainingEmails.length > 0) {
      console.log('   Emails restants:', remainingEmails.map(u => u.email));
    }
    if (remainingPhones.length > 0) {
      console.log('   Téléphones restants:', remainingPhones.map(u => u.phone));
    }
    if (remainingProfiles && remainingProfiles.length > 0) {
      console.log('   Pseudos restants:', remainingProfiles.map(p => p.pseudo));
    }
  } else {
    console.log('\n✅ Tous les utilisateurs fictifs ont été supprimés!');
  }
}

async function main() {
  console.log('🚀 Début de la suppression des utilisateurs fictifs...\n');
  
  // Trouver tous les utilisateurs fictifs
  const testUserIds = await findTestUsers();
  
  if (testUserIds.length === 0) {
    console.log('\n✅ Aucun utilisateur fictif trouvé à supprimer');
    return;
  }
  
  console.log(`\n📋 ${testUserIds.length} utilisateur(s) fictif(s) trouvé(s) à supprimer\n`);
  
  // Demander confirmation
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const answer = await new Promise(resolve => {
    readline.question('⚠️  Êtes-vous sûr de vouloir supprimer ces utilisateurs? (oui/non): ', resolve);
  });
  readline.close();
  
  if (answer.toLowerCase() !== 'oui' && answer.toLowerCase() !== 'o') {
    console.log('\n❌ Suppression annulée');
    return;
  }
  
  // Supprimer chaque utilisateur
  let successCount = 0;
  let failCount = 0;
  
  for (const userId of testUserIds) {
    const success = await deleteUser(userId);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
  }
  
  console.log(`\n📊 Résumé:`);
  console.log(`   ✅ Supprimés avec succès: ${successCount}`);
  console.log(`   ❌ Échecs: ${failCount}`);
  
  // Vérifier la suppression
  await verifyDeletion();
}

main().catch(console.error);

