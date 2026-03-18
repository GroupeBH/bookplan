import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';

/**
 * Upload une image vers Supabase Storage
 * @param localUri - URI locale de l'image (file://)
 * @param userId - ID de l'utilisateur
 * @param folder - Dossier dans le bucket (par défaut: 'profiles')
 * @param bucketName - Nom du bucket (par défaut: 'avatars')
 * @returns URL publique de l'image uploadée
 */
export async function uploadImageToStorage(
  localUri: string,
  userId: string,
  folder: string = 'profiles',
  bucketName: string = 'avatars'
): Promise<{ url: string | null; error: any }> {
  try {
    // Vérifier/rafraîchir la session avant upload pour éviter un upload en rôle anon (bloqué par RLS).
    let { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !refreshed?.session?.user) {
        return {
          url: null,
          error: {
            message: 'Session invalide. Veuillez vous reconnecter avant de modifier la photo.',
            code: 'SESSION_INVALID',
          },
        };
      }
      session = refreshed.session;
    }

    // S'assurer que l'utilisateur connecté correspond au dossier/fichier uploadé.
    if (session.user.id !== userId) {
      return {
        url: null,
        error: {
          message: 'Session utilisateur incohérente. Veuillez vous reconnecter.',
          code: 'SESSION_USER_MISMATCH',
        },
      };
    }

    // Déterminer le type MIME à partir de l'extension
    const fileExtension = localUri.split('.').pop()?.toLowerCase() || 'jpg';
    const mimeType = fileExtension === 'png' ? 'image/png' : 'image/jpeg';

    // Créer un nom de fichier unique
    const fileName = `${userId}-${Date.now()}.${fileExtension}`;
    const filePath = `${folder}/${fileName}`;

    // Lire le fichier en base64 avec expo-file-system (compatible React Native)
    // Utiliser directement 'base64' comme chaîne (compatible avec toutes les versions)
    const base64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: 'base64' as any,
    });

    // Convertir base64 en Uint8Array (méthode compatible React Native - décodage manuel)
    const base64ToUint8Array = (base64String: string): Uint8Array => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
      let result = '';
      let i = 0;
      
      // Nettoyer la chaîne base64
      const cleanBase64 = base64String.replace(/[^A-Za-z0-9+/=]/g, '');
      
      while (i < cleanBase64.length) {
        const encoded1 = chars.indexOf(cleanBase64.charAt(i++));
        const encoded2 = chars.indexOf(cleanBase64.charAt(i++));
        const encoded3 = chars.indexOf(cleanBase64.charAt(i++));
        const encoded4 = chars.indexOf(cleanBase64.charAt(i++));
        
        const bitmap = (encoded1 << 18) | (encoded2 << 12) | (encoded3 << 6) | encoded4;
        
        result += String.fromCharCode((bitmap >> 16) & 255);
        if (encoded3 !== 64) result += String.fromCharCode((bitmap >> 8) & 255);
        if (encoded4 !== 64) result += String.fromCharCode(bitmap & 255);
      }
      
      const bytes = new Uint8Array(result.length);
      for (let j = 0; j < result.length; j++) {
        bytes[j] = result.charCodeAt(j);
      }
      return bytes;
    };

    const bytes = base64ToUint8Array(base64);

    // Upload vers Supabase Storage
    const { error } = await supabase.storage
      .from(bucketName) // Nom du bucket (avatars ou albums)
      .upload(filePath, bytes, {
        contentType: mimeType,
        upsert: true, // Remplacer si le fichier existe déjà
      });

    if (error) {
      console.error('❌ Error uploading image to storage:', error);
      // Ne jamais retourner l'URI locale - toujours retourner une erreur
      if (error.message?.includes('Bucket not found') || error.message?.includes('The resource was not found')) {
        console.error(`❌ Bucket "${bucketName}" non trouvé dans Supabase Storage. Veuillez créer le bucket "${bucketName}" dans votre projet Supabase.`);
        return { url: null, error: { message: `Bucket "${bucketName}" non trouvé. Veuillez créer le bucket dans Supabase Storage.` } };
      }
      if (error.message?.toLowerCase().includes('row-level security policy')) {
        return {
          url: null,
          error: {
            message: 'Permissions insuffisantes pour uploader la photo (RLS Storage). Applique la migration SQL 051.',
            code: 'STORAGE_RLS_DENIED',
            original: error,
          },
        };
      }
      return { url: null, error };
    }

    // Obtenir l'URL publique
    const { data: publicUrlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    const publicUrl = publicUrlData.publicUrl;
    console.log('✅ Image uploadée avec succès:', publicUrl);

    return { url: publicUrl, error: null };
  } catch (error: any) {
    console.error('Error in uploadImageToStorage:', error);
    return { url: null, error };
  }
}
