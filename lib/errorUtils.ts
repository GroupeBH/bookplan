// Fonction utilitaire pour détecter les erreurs réseau
export const isNetworkError = (error: any): boolean => {
  if (!error) return false;
  
  // Vérifier les erreurs spécifiques de Supabase Auth
  if (error.name === 'AuthRetryableFetchError' || 
      error.name === 'AuthPKCEGrantCodeExchangeError' ||
      error.name === 'AuthSessionMissingError') {
    return true;
  }
  
  // Vérifier le type d'erreur (TypeError pour "Network request failed" de whatwg-fetch)
  // Les TypeError avec "Network request failed" sont toujours des erreurs réseau
  if (error.name === 'TypeError') {
    const message = error.message || error.toString() || '';
    if (message.includes('Network request failed') || 
        message.includes('Failed to fetch') ||
        message.includes('network') ||
        message.toLowerCase().includes('network')) {
      return true;
    }
  }
  
  // Vérifier dans le message d'erreur
  const message = error.message || error.toString() || '';
  const errorString = JSON.stringify(error).toLowerCase();
  
  return message.includes('Network request failed') || 
         message.includes('Failed to fetch') ||
         message.includes('NetworkError') ||
         message.includes('ERR_NETWORK') ||
         message.includes('fetch failed') ||
         message.includes('NetworkError') ||
         message.includes('network request failed') ||
         message.toLowerCase().includes('network request failed') ||
         errorString.includes('authretryablefetcherror') ||
         errorString.includes('network request failed') ||
         errorString.includes('whatwg-fetch') ||
         (error.name === 'TypeError' && message.includes('network'));
};

// Fonction pour logger les erreurs de manière silencieuse pour les erreurs réseau
export const logError = (error: any, context: string) => {
  if (isNetworkError(error)) {
    // Erreur réseau silencieuse - ne pas polluer la console
    console.log(`⚠️ Erreur réseau dans ${context}`);
  } else {
    console.error(`Error in ${context}:`, error);
  }
};

