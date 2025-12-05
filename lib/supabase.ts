import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import 'react-native-url-polyfill/auto';

// Récupérer les variables d'environnement
const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ ERREUR CRITIQUE: Supabase URL ou Anon Key manquants!');
  console.error('📝 Vérifiez votre configuration dans app.json ou .env');
  console.error('📝 Ajoutez EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY');
  console.error('🔗 URL Supabase actuelle:', supabaseUrl || 'VIDE');
  console.error('🔑 Anon Key actuelle:', supabaseAnonKey ? 'PRÉSENTE' : 'VIDE');
} else {
  console.log('✅ Configuration Supabase chargée');
  console.log('🔗 URL:', supabaseUrl);
}

// Créer le client Supabase
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

