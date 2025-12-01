import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
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

  // Synchroniser avec l'utilisateur authentifié
  useEffect(() => {
    if (authUser) {
      setCurrentUser(authUser);
    } else {
      setCurrentUser(null);
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

