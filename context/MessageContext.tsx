import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { isNetworkError } from '../lib/errorUtils';
import { supabase } from '../lib/supabase';
import { Conversation, Message, User } from '../types';
import { useAuth } from './AuthContext';

interface MessageContextType {
  conversations: Conversation[];
  messages: { [conversationId: string]: Message[] };
  isLoading: boolean;
  isLoadingMessages: boolean;
  // Fonctions
  getConversations: () => Promise<void>;
  getMessages: (conversationId: string) => Promise<Message[]>;
  sendMessage: (conversationId: string, recipientId: string, content: string) => Promise<Message | null>;
  markAsRead: (conversationId: string) => Promise<void>;
  getOrCreateConversation: (otherUserId: string) => Promise<Conversation | null>;
  deleteConversation: (conversationId: string) => Promise<boolean>;
  deleteMessage: (messageId: string) => Promise<boolean>;
  // Écoute en temps réel
  subscribeToConversation: (conversationId: string, callback: (message: Message) => void) => () => void;
}

const MessageContext = createContext<MessageContextType | undefined>(undefined);

export function MessageProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<{ [conversationId: string]: Message[] }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  
  const subscriptionsRef = useRef<{ [key: string]: any }>({});
  const isLoadingRef = useRef(false);
  const lastLoadTimeRef = useRef(0);

  // Charger toutes les conversations de l'utilisateur
  const getConversations = useCallback(async () => {
    if (!user?.id) return;

    // Éviter les appels multiples
    if (isLoadingRef.current) return;
    const now = Date.now();
    if (now - lastLoadTimeRef.current < 1000) return;

    isLoadingRef.current = true;
    setIsLoading(true);
    lastLoadTimeRef.current = now;

    try {
      // Récupérer les conversations où l'utilisateur est user1 ou user2
      const { data: conversationsData, error } = await supabase
        .from('conversations')
        .select('*')
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (error) {
        if (!isNetworkError(error)) {
          console.error('Error fetching conversations:', error);
        }
        return;
      }

      if (!conversationsData) return;

      // Enrichir les conversations avec les données de l'autre utilisateur
      const enrichedConversations = await Promise.all(
        conversationsData.map(async (conv: any) => {
          // Déterminer qui est l'autre utilisateur
          const otherUserId = conv.user1_id === user.id ? conv.user2_id : conv.user1_id;
          const unreadCount = conv.user1_id === user.id ? conv.user1_unread_count : conv.user2_unread_count;

          // Récupérer le profil de l'autre utilisateur
          let otherUser: User | undefined;
          try {
            const { data: profileData } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', otherUserId)
              .single();

            if (profileData) {
              otherUser = {
                id: profileData.id,
                pseudo: profileData.pseudo || 'Utilisateur',
                age: profileData.age || 25,
                phone: profileData.phone,
                photo: profileData.photo || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
                description: profileData.description || '',
                rating: parseFloat(profileData.rating) || 0,
                reviewCount: profileData.review_count || 0,
                isSubscribed: profileData.is_subscribed || false,
                subscriptionStatus: profileData.subscription_status || 'pending',
                lastSeen: profileData.last_seen || null,
                gender: profileData.gender || 'female',
                lat: profileData.lat ? parseFloat(profileData.lat) : undefined,
                lng: profileData.lng ? parseFloat(profileData.lng) : undefined,
                isAvailable: profileData.is_available ?? true,
              };
            }
          } catch (err) {
            if (!isNetworkError(err)) {
              console.error('Error fetching other user profile:', err);
            }
          }

          // Récupérer le dernier message si disponible
          let lastMessage: Message | undefined;
          if (conv.last_message_id) {
            try {
              const { data: messageData } = await supabase
                .from('messages')
                .select('*')
                .eq('id', conv.last_message_id)
                .single();

              if (messageData) {
                lastMessage = {
                  id: messageData.id,
                  conversationId: messageData.conversation_id,
                  senderId: messageData.sender_id,
                  recipientId: messageData.recipient_id,
                  content: messageData.content,
                  isRead: messageData.is_read,
                  readAt: messageData.read_at,
                  createdAt: messageData.created_at,
                  updatedAt: messageData.updated_at,
                };
              }
            } catch (err) {
              if (!isNetworkError(err)) {
                console.error('Error fetching last message:', err);
              }
            }
          }

          return {
            id: conv.id,
            user1Id: conv.user1_id,
            user2Id: conv.user2_id,
            lastMessageId: conv.last_message_id,
            lastMessageAt: conv.last_message_at,
            user1UnreadCount: conv.user1_unread_count,
            user2UnreadCount: conv.user2_unread_count,
            createdAt: conv.created_at,
            updatedAt: conv.updated_at,
            otherUser,
            lastMessage,
            unreadCount,
          } as Conversation;
        })
      );

      setConversations(enrichedConversations);
    } catch (error: any) {
      if (!isNetworkError(error)) {
        console.error('Error in getConversations:', error);
      }
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  }, [user?.id]);

  // Charger les messages d'une conversation
  const getMessages = useCallback(async (conversationId: string): Promise<Message[]> => {
    if (!user?.id || !conversationId) return [];

    setIsLoadingMessages(true);
    try {
      const { data: messagesData, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) {
        if (!isNetworkError(error)) {
          console.error('Error fetching messages:', error);
        }
        return [];
      }

      if (!messagesData) return [];

      const formattedMessages: Message[] = messagesData.map((msg: any) => ({
        id: msg.id,
        conversationId: msg.conversation_id,
        senderId: msg.sender_id,
        recipientId: msg.recipient_id,
        content: msg.content,
        isRead: msg.is_read,
        readAt: msg.read_at,
        createdAt: msg.created_at,
        updatedAt: msg.updated_at,
      }));

      // Mettre à jour le cache des messages
      setMessages((prev) => ({
        ...prev,
        [conversationId]: formattedMessages,
      }));

      return formattedMessages;
    } catch (error: any) {
      if (!isNetworkError(error)) {
        console.error('Error in getMessages:', error);
      }
      return [];
    } finally {
      setIsLoadingMessages(false);
    }
  }, [user?.id]);

  // Envoyer un message
  const sendMessage = useCallback(async (
    conversationId: string,
    recipientId: string,
    content: string
  ): Promise<Message | null> => {
    if (!user?.id || !content.trim()) return null;

    try {
      // Utiliser la fonction RPC pour créer le message
      const { data, error } = await supabase.rpc('create_message', {
        p_conversation_id: conversationId,
        p_sender_id: user.id,
        p_recipient_id: recipientId,
        p_content: content.trim(),
      });

      if (error) {
        if (!isNetworkError(error)) {
          console.error('Error sending message:', error);
        }
        return null;
      }

      // Récupérer le message créé
      const { data: messageData, error: fetchError } = await supabase
        .from('messages')
        .select('*')
        .eq('id', data)
        .single();

      if (fetchError || !messageData) {
        if (!isNetworkError(fetchError)) {
          console.error('Error fetching created message:', fetchError);
        }
        return null;
      }

      const newMessage: Message = {
        id: messageData.id,
        conversationId: messageData.conversation_id,
        senderId: messageData.sender_id,
        recipientId: messageData.recipient_id,
        content: messageData.content,
        isRead: messageData.is_read,
        readAt: messageData.read_at,
        createdAt: messageData.created_at,
        updatedAt: messageData.updated_at,
      };

      // Ajouter le message au cache immédiatement
      setMessages((prev) => {
        const existingMessages = prev[conversationId] || [];
        // Vérifier si le message n'est pas déjà présent (éviter les doublons)
        const exists = existingMessages.some(msg => msg.id === newMessage.id);
        if (exists) {
          return prev;
        }
        const updated = [...existingMessages, newMessage];
        // Trier par date pour maintenir l'ordre
        updated.sort((a, b) => {
          const dateA = new Date(a.createdAt).getTime();
          const dateB = new Date(b.createdAt).getTime();
          return dateA - dateB;
        });
        return {
          ...prev,
          [conversationId]: updated,
        };
      });

      // Envoyer une notification push au destinataire en arrière-plan (non-bloquant)
      (async () => {
        try {
          // Récupérer le pseudo de l'expéditeur pour la notification
          const { data: senderProfile } = await supabase
            .from('profiles')
            .select('pseudo')
            .eq('id', user.id)
            .single();

          const senderName = senderProfile?.pseudo || 'Quelqu\'un';
          const messagePreview = content.trim().length > 50 
            ? content.trim().substring(0, 50) + '...' 
            : content.trim();

          // Importer et utiliser la fonction d'envoi de notification
          const { sendMessageNotification } = await import('../lib/pushNotifications');
          await sendMessageNotification(
            recipientId,
            conversationId,
            senderName,
            messagePreview
          );
        } catch (notifError) {
          // Ignorer les erreurs de notification (ne pas bloquer l'envoi du message)
          console.log('Error sending push notification:', notifError);
        }
      })();

      // Rafraîchir les conversations en arrière-plan (non-bloquant)
      getConversations().catch((error) => {
        if (!isNetworkError(error)) {
          console.error('Error refreshing conversations:', error);
        }
      });

      return newMessage;
    } catch (error: any) {
      if (!isNetworkError(error)) {
        console.error('Error in sendMessage:', error);
      }
      return null;
    }
  }, [user?.id, getConversations]);

  // Marquer les messages comme lus
  const markAsRead = useCallback(async (conversationId: string) => {
    if (!user?.id) return;

    try {
      const { error } = await supabase.rpc('mark_messages_as_read', {
        p_conversation_id: conversationId,
        p_user_id: user.id,
      });

      if (error) {
        if (!isNetworkError(error)) {
          console.error('Error marking messages as read:', error);
        }
        return;
      }

      // Mettre à jour le cache local
      setMessages((prev) => {
        const conversationMessages = prev[conversationId] || [];
        return {
          ...prev,
          [conversationId]: conversationMessages.map((msg) =>
            msg.recipientId === user.id ? { ...msg, isRead: true, readAt: new Date().toISOString() } : msg
          ),
        };
      });

      // Rafraîchir les conversations
      await getConversations();
    } catch (error: any) {
      if (!isNetworkError(error)) {
        console.error('Error in markAsRead:', error);
      }
    }
  }, [user?.id, getConversations]);

  // Obtenir ou créer une conversation
  const getOrCreateConversation = useCallback(async (otherUserId: string): Promise<Conversation | null> => {
    if (!user?.id || !otherUserId || user.id === otherUserId) return null;

    try {
      // Utiliser la fonction RPC pour obtenir ou créer la conversation
      const { data: conversationId, error } = await supabase.rpc('get_or_create_conversation', {
        p_user1_id: user.id,
        p_user2_id: otherUserId,
      });

      if (error) {
        if (!isNetworkError(error)) {
          console.error('Error getting or creating conversation:', error);
        }
        return null;
      }

      // Récupérer la conversation créée/obtenue
      const { data: conversationData, error: fetchError } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .single();

      if (fetchError || !conversationData) {
        if (!isNetworkError(fetchError)) {
          console.error('Error fetching conversation:', fetchError);
        }
        return null;
      }

      // Enrichir avec les données de l'autre utilisateur
      const otherUserId_final = conversationData.user1_id === user.id 
        ? conversationData.user2_id 
        : conversationData.user1_id;
      const unreadCount = conversationData.user1_id === user.id 
        ? conversationData.user1_unread_count 
        : conversationData.user2_unread_count;

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', otherUserId_final)
        .single();

      let otherUser: User | undefined;
      if (profileData) {
        otherUser = {
          id: profileData.id,
          pseudo: profileData.pseudo || 'Utilisateur',
          age: profileData.age || 25,
          phone: profileData.phone,
          photo: profileData.photo || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
          description: profileData.description || '',
          rating: parseFloat(profileData.rating) || 0,
          reviewCount: profileData.review_count || 0,
          isSubscribed: profileData.is_subscribed || false,
          subscriptionStatus: profileData.subscription_status || 'pending',
          lastSeen: profileData.last_seen || null,
          gender: profileData.gender || 'female',
          lat: profileData.lat ? parseFloat(profileData.lat) : undefined,
          lng: profileData.lng ? parseFloat(profileData.lng) : undefined,
          isAvailable: profileData.is_available ?? true,
        };
      }

      const conversation: Conversation = {
        id: conversationData.id,
        user1Id: conversationData.user1_id,
        user2Id: conversationData.user2_id,
        lastMessageId: conversationData.last_message_id,
        lastMessageAt: conversationData.last_message_at,
        user1UnreadCount: conversationData.user1_unread_count,
        user2UnreadCount: conversationData.user2_unread_count,
        createdAt: conversationData.created_at,
        updatedAt: conversationData.updated_at,
        otherUser,
        unreadCount,
      };

      // Ajouter à la liste des conversations si elle n'y est pas déjà
      setConversations((prev) => {
        const exists = prev.some((c) => c.id === conversation.id);
        if (exists) {
          return prev.map((c) => (c.id === conversation.id ? conversation : c));
        }
        return [conversation, ...prev];
      });

      return conversation;
    } catch (error: any) {
      if (!isNetworkError(error)) {
        console.error('Error in getOrCreateConversation:', error);
      }
      return null;
    }
  }, [user?.id]);

  // S'abonner aux nouveaux messages d'une conversation en temps réel
  const subscribeToConversation = useCallback((
    conversationId: string,
    callback: (message: Message) => void
  ) => {
    // Se désabonner de l'ancien abonnement si il existe
    if (subscriptionsRef.current[conversationId]) {
      subscriptionsRef.current[conversationId].unsubscribe();
    }

    // Créer un nouvel abonnement
    const subscription = supabase
      .channel(`conversation:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const newMessage = payload.new as any;
          const message: Message = {
            id: newMessage.id,
            conversationId: newMessage.conversation_id,
            senderId: newMessage.sender_id,
            recipientId: newMessage.recipient_id,
            content: newMessage.content,
            isRead: newMessage.is_read,
            readAt: newMessage.read_at,
            createdAt: newMessage.created_at,
            updatedAt: newMessage.updated_at,
          };

          // Ajouter au cache immédiatement
          setMessages((prev) => {
            const existingMessages = prev[conversationId] || [];
            // Vérifier si le message n'est pas déjà présent (éviter les doublons)
            const exists = existingMessages.some(msg => msg.id === message.id);
            if (exists) {
              return prev;
            }
            const updated = [...existingMessages, message];
            // Trier par date pour maintenir l'ordre
            updated.sort((a, b) => {
              const dateA = new Date(a.createdAt).getTime();
              const dateB = new Date(b.createdAt).getTime();
              return dateA - dateB;
            });
            return {
              ...prev,
              [conversationId]: updated,
            };
          });

          // Appeler le callback immédiatement pour affichage en temps réel
          callback(message);

          // Rafraîchir les conversations en arrière-plan (non-bloquant)
          getConversations().catch((error) => {
            if (!isNetworkError(error)) {
              console.error('Error refreshing conversations:', error);
            }
          });
        }
      )
      // Ajouter un listener pour les mises à jour (changements de statut de lecture)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const updatedMessage = payload.new as any;
          
          // Mettre à jour le message dans le cache local
          setMessages((prev) => {
            const existingMessages = prev[conversationId] || [];
            const updated = existingMessages.map((msg) => {
              if (msg.id === updatedMessage.id) {
                return {
                  ...msg,
                  isRead: updatedMessage.is_read,
                  readAt: updatedMessage.read_at,
                  updatedAt: updatedMessage.updated_at,
                };
              }
              return msg;
            });
            return {
              ...prev,
              [conversationId]: updated,
            };
          });

          // Rafraîchir les conversations en arrière-plan pour mettre à jour les compteurs
          getConversations().catch((error) => {
            if (!isNetworkError(error)) {
              console.error('Error refreshing conversations:', error);
            }
          });
        }
      )
      .subscribe();

    subscriptionsRef.current[conversationId] = subscription;

    // Retourner une fonction de nettoyage
    return () => {
      if (subscriptionsRef.current[conversationId]) {
        subscriptionsRef.current[conversationId].unsubscribe();
        delete subscriptionsRef.current[conversationId];
      }
    };
  }, [getConversations]);

  // S'abonner aux mises à jour de conversations en temps réel (pour les badges)
  useEffect(() => {
    if (!user?.id) return;

    // S'abonner aux mises à jour de conversations où l'utilisateur est impliqué
    const conversationSubscription = supabase
      .channel('user_conversations')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
          filter: `user1_id=eq.${user.id},user2_id=eq.${user.id}`,
        },
        (payload) => {
          const updatedConv = payload.new as any;
          
          // Mettre à jour la conversation dans la liste
          setConversations((prev) => {
            const existingIndex = prev.findIndex(c => c.id === updatedConv.id);
            if (existingIndex === -1) {
              // Si la conversation n'existe pas encore, la charger
              getConversations();
              return prev;
            }
            
            // Mettre à jour la conversation existante
            const updated = [...prev];
            const existingConv = updated[existingIndex];
            
            // Calculer le nouveau unreadCount
            const unreadCount = updatedConv.user1_id === user.id 
              ? updatedConv.user1_unread_count 
              : updatedConv.user2_unread_count;
            
            updated[existingIndex] = {
              ...existingConv,
              lastMessageId: updatedConv.last_message_id,
              lastMessageAt: updatedConv.last_message_at,
              user1UnreadCount: updatedConv.user1_unread_count,
              user2UnreadCount: updatedConv.user2_unread_count,
              unreadCount,
              updatedAt: updatedConv.updated_at,
            };
            
            // Réorganiser par date de dernier message (le plus récent en premier)
            updated.sort((a, b) => {
              const dateA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
              const dateB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
              return dateB - dateA;
            });
            
            return updated;
          });
        }
      )
      // Écouter aussi les nouvelles conversations
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversations',
          filter: `user1_id=eq.${user.id},user2_id=eq.${user.id}`,
        },
        () => {
          // Recharger les conversations si une nouvelle est créée
          getConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(conversationSubscription);
    };
  }, [user?.id, getConversations]);

  // Charger les conversations au montage et quand l'utilisateur change
  useEffect(() => {
    if (user?.id) {
      getConversations();
    } else {
      setConversations([]);
      setMessages({});
    }
  }, [user?.id, getConversations]);

  // Supprimer une conversation
  const deleteConversation = useCallback(async (conversationId: string): Promise<boolean> => {
    if (!user?.id) return false;

    try {
      const { data, error } = await supabase.rpc('delete_conversation', {
        p_conversation_id: conversationId,
      });

      if (error) {
        if (!isNetworkError(error)) {
          console.error('Error deleting conversation:', error);
        }
        return false;
      }

      if (data && data.length > 0 && !data[0].success) {
        return false;
      }

      // Retirer de la liste des conversations
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      
      // Retirer les messages du cache
      setMessages((prev) => {
        const newMessages = { ...prev };
        delete newMessages[conversationId];
        return newMessages;
      });

      return true;
    } catch (error: any) {
      if (!isNetworkError(error)) {
        console.error('Error in deleteConversation:', error);
      }
      return false;
    }
  }, [user?.id]);

  // Supprimer un message
  const deleteMessage = useCallback(async (messageId: string): Promise<boolean> => {
    if (!user?.id) return false;

    try {
      const { data, error } = await supabase.rpc('delete_message', {
        p_message_id: messageId,
      });

      if (error) {
        if (!isNetworkError(error)) {
          console.error('Error deleting message:', error);
        }
        return false;
      }

      if (data && data.length > 0 && !data[0].success) {
        return false;
      }

      // Retirer le message du cache
      setMessages((prev) => {
        const newMessages = { ...prev };
        Object.keys(newMessages).forEach((convId) => {
          newMessages[convId] = newMessages[convId].filter((msg) => msg.id !== messageId);
        });
        return newMessages;
      });

      // Rafraîchir les conversations
      await getConversations();

      return true;
    } catch (error: any) {
      if (!isNetworkError(error)) {
        console.error('Error in deleteMessage:', error);
      }
      return false;
    }
  }, [user?.id, getConversations]);

  // Nettoyer les abonnements au démontage
  useEffect(() => {
    return () => {
      Object.values(subscriptionsRef.current).forEach((sub) => {
        if (sub) sub.unsubscribe();
      });
      subscriptionsRef.current = {};
    };
  }, []);

  return (
    <MessageContext.Provider
      value={{
        conversations,
        messages,
        isLoading,
        isLoadingMessages,
        getConversations,
        getMessages,
        sendMessage,
        markAsRead,
        getOrCreateConversation,
        deleteConversation,
        deleteMessage,
        subscribeToConversation,
      }}
    >
      {children}
    </MessageContext.Provider>
  );
}

export function useMessage() {
  const context = useContext(MessageContext);
  if (context === undefined) {
    throw new Error('useMessage must be used within a MessageProvider');
  }
  return context;
}

