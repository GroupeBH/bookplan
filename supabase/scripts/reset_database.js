/**
 * Script pour réinitialiser complètement la base de données
 * Supprime TOUS les enregistrements de toutes les tables
 * 
 * Utilisation:
 * 1. Installez les dépendances: npm install @supabase/supabase-js dotenv
 * 2. Créez un fichier .env avec:
 *    SUPABASE_URL=votre_url_supabase
 *    SUPABASE_SERVICE_ROLE_KEY=votre_service_role_key
 * 3. Exécutez: node supabase/scripts/reset_database.js
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

// Liste des tables à vider (dans l'ordre pour respecter les contraintes)
const tablesToClear = [
  'messages',
  'conversations',
  'offer_applications',
  'offers',
  'user_album_photos',
  'push_tokens',
  'user_likes',
  'blocked_users',
  'ratings',
  'info_access_requests',
  'bookings',
  'subscriptions',
  'profiles'
];

async function getTableCount(tableName) {
  const { count, error } = await supabase
    .from(tableName)
    .select('*', { count: 'exact', head: true });
  
  if (error) {
    console.error(`Erreur lors du comptage de ${tableName}:`, error.message);
    return 0;
  }
  
  return count || 0;
}

async function clearTable(tableName) {
  try {
    const { error } = await supabase
      .from(tableName)
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Condition toujours vraie pour tout supprimer
    
    if (error) {
      console.error(`❌ Erreur lors de la suppression de ${tableName}:`, error.message);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error(`❌ Erreur lors de la suppression de ${tableName}:`, error.message);
    return false;
  }
}

async function deleteAllUsers() {
  try {
    const { data: users, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      console.error('❌ Erreur lors de la récupération des utilisateurs:', listError.message);
      return { success: 0, failed: 0 };
    }
    
    if (!users || !users.users || users.users.length === 0) {
      console.log('✓ Aucun utilisateur à supprimer');
      return { success: 0, failed: 0 };
    }
    
    console.log(`\n🗑️  Suppression de ${users.users.length} utilisateur(s)...`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (const user of users.users) {
      try {
        const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
        
        if (deleteError) {
          console.error(`❌ Erreur lors de la suppression de ${user.id} (${user.email || user.phone}):`, deleteError.message);
          failCount++;
        } else {
          successCount++;
          if (successCount % 10 === 0) {
            process.stdout.write(`\r   Supprimés: ${successCount}/${users.users.length}`);
          }
        }
      } catch (error) {
        console.error(`❌ Erreur lors de la suppression de ${user.id}:`, error.message);
        failCount++;
      }
    }
    
    console.log(`\n✅ ${successCount} utilisateur(s) supprimé(s), ${failCount} échec(s)`);
    return { success: successCount, failed: failCount };
  } catch (error) {
    console.error('❌ Erreur lors de la suppression des utilisateurs:', error.message);
    return { success: 0, failed: 0 };
  }
}

async function verifyReset() {
  console.log('\n🔍 Vérification de la réinitialisation...\n');
  
  let totalRemaining = 0;
  
  // Vérifier les tables publiques
  for (const table of tablesToClear) {
    const count = await getTableCount(table);
    totalRemaining += count;
    if (count > 0) {
      console.log(`⚠️  Table ${table}: ${count} enregistrement(s) restant(s)`);
    } else {
      console.log(`✓ Table ${table}: vide`);
    }
  }
  
  // Vérifier auth.users
  const { data: users } = await supabase.auth.admin.listUsers();
  const userCount = users?.users?.length || 0;
  totalRemaining += userCount;
  
  if (userCount > 0) {
    console.log(`⚠️  Table auth.users: ${userCount} utilisateur(s) restant(s)`);
  } else {
    console.log(`✓ Table auth.users: vide`);
  }
  
  console.log(`\n📊 Total d'enregistrements restants: ${totalRemaining}`);
  
  if (totalRemaining === 0) {
    console.log('\n✅ Toutes les tables sont vides! La réinitialisation est complète.');
  } else {
    console.log('\n⚠️  Il reste des enregistrements. Vérifiez les erreurs ci-dessus.');
  }
  
  return totalRemaining === 0;
}

async function main() {
  console.log('🚀 Début de la réinitialisation complète de la base de données...\n');
  console.log('⚠️  ATTENTION: Cette opération supprimera TOUTES les données!');
  console.log('⚠️  La structure des tables sera préservée, mais toutes les données seront perdues.\n');
  
  // Demander confirmation
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const answer = await new Promise(resolve => {
    readline.question('⚠️  Êtes-vous ABSOLUMENT SÛR de vouloir supprimer TOUTES les données? (tapez "SUPPRIMER TOUT" pour confirmer): ', resolve);
  });
  readline.close();
  
  if (answer !== 'SUPPRIMER TOUT') {
    console.log('\n❌ Réinitialisation annulée');
    return;
  }
  
  console.log('\n🗑️  Suppression des données...\n');
  
  // Vider les tables dans l'ordre
  let successCount = 0;
  let failCount = 0;
  
  for (const table of tablesToClear) {
    process.stdout.write(`   Suppression de ${table}... `);
    const success = await clearTable(table);
    if (success) {
      console.log('✓');
      successCount++;
    } else {
      console.log('❌');
      failCount++;
    }
  }
  
  console.log(`\n📊 Résumé des tables:`);
  console.log(`   ✅ Supprimées avec succès: ${successCount}`);
  console.log(`   ❌ Échecs: ${failCount}`);
  
  // Supprimer tous les utilisateurs
  console.log('\n🗑️  Suppression de tous les utilisateurs...');
  const userResult = await deleteAllUsers();
  
  // Vérifier la réinitialisation
  const isComplete = await verifyReset();
  
  if (isComplete) {
    console.log('\n🎉 Réinitialisation complète réussie!');
    console.log('✅ Vous pouvez maintenant recommencer à zéro.');
  } else {
    console.log('\n⚠️  Réinitialisation partielle. Vérifiez les erreurs ci-dessus.');
  }
}

main().catch(console.error);

