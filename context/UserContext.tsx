import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { User } from '../types';
import { useAuth } from './AuthContext';

interface UserContextType {
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  selectedUser: User | null;
  setSelectedUser: (user: User | null) => void;
  hasAccessToUser: Set<string>;
  setHasAccessToUser: (set: Set<string>) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const { user: authUser } = useAuth();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [hasAccessToUser, setHasAccessToUser] = useState<Set<string>>(new Set());
  const lastAuthUserRef = useRef<string>(''); // Pour forcer la mise à jour

  // Synchroniser avec l'utilisateur authentifié
  // Utiliser une comparaison profonde pour détecter les changements même si la référence ne change pas
  useEffect(() => {
    if (authUser) {
      // Créer une clé unique basée sur les propriétés importantes pour détecter les changements
      const authUserKey = `${authUser.id}-${authUser.pseudo}-${authUser.age}-${authUser.description}-${authUser.photo}-${authUser.gender}-${authUser.specialty}`;
      
      // Toujours mettre à jour pour s'assurer que les changements sont propagés
      // Créer un nouvel objet pour forcer la mise à jour et garantir la réactivité
      setCurrentUser((prevUser) => {
        // Vérifier si les données ont vraiment changé pour éviter les re-renders inutiles
        const hasChanged = !prevUser || 
            prevUser.id !== authUser.id ||
            prevUser.pseudo !== authUser.pseudo ||
            prevUser.age !== authUser.age ||
            prevUser.description !== authUser.description ||
            prevUser.photo !== authUser.photo ||
            prevUser.gender !== authUser.gender ||
            prevUser.specialty !== authUser.specialty;
        
        if (!hasChanged && lastAuthUserRef.current === authUserKey) {
          // Si rien n'a changé et que la clé est la même, retourner l'objet précédent
          return prevUser;
        }
        
        // Sinon, créer un nouvel objet pour forcer la mise à jour
        console.log('🔄 UserContext: Mise à jour de currentUser avec les nouvelles données:', {
          pseudo: authUser.pseudo,
          age: authUser.age,
          description: authUser.description?.substring(0, 20),
          specialty: authUser.specialty,
          photo: authUser.photo?.substring(0, 30),
          gender: authUser.gender,
          prevPseudo: prevUser?.pseudo,
          prevAge: prevUser?.age,
          hasChanged,
        });
        
        // Mettre à jour la clé de référence
        lastAuthUserRef.current = authUserKey;
        
        // Créer un nouvel objet avec toutes les propriétés pour forcer la mise à jour
        return { ...authUser };
      });
    } else {
      setCurrentUser(null);
      lastAuthUserRef.current = '';
    }
  }, [authUser]);

  return (
    <UserContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        selectedUser,
        setSelectedUser,
        hasAccessToUser,
        setHasAccessToUser,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}

