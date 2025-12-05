import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ImageWithFallback } from '../../components/ImageWithFallback';
import { colors } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';
import { useBlock } from '../../context/BlockContext';
import { useMessage } from '../../context/MessageContext';
import { useUser } from '../../context/UserContext';
import { supabase } from '../../lib/supabase';
import { Conversation, Message } from '../../types';

// Fonction utilitaire pour formater la date
const formatMessageTime = (dateString: string | null | undefined): string => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'À l\'instant';
    if (minutes < 60) return `Il y a ${minutes} min`;
    if (hours < 24) return `Il y a ${hours}h`;
    if (days < 7) return `Il y a ${days}j`;
    
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) || '';
  } catch (error) {
    return '';
  }
};

const formatConversationTime = (dateString?: string | null): string => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'À l\'instant';
    if (minutes < 60) return `Il y a ${minutes} min`;
    if (hours < 24) return `Il y a ${hours}h`;
    if (days === 1) return 'Hier';
    if (days < 7) return `Il y a ${days}j`;
    
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) || '';
  } catch (error) {
    return '';
  }
};

export default function ChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ userId?: string }>();
  const { user: currentUser } = useAuth();
  const { setSelectedUser } = useUser();
  const { blockUser, unblockUser, isUserBlocked } = useBlock();
  const {
    conversations,
    messages,
    isLoading,
    isLoadingMessages,
    getConversations,
    getMessages,
    sendMessage,
    markAsRead,
    getOrCreateConversation,
    subscribeToConversation,
    deleteConversation,
    deleteMessage,
  } = useMessage();

  const [activeView, setActiveView] = useState<'list' | 'chat'>('list');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [conversationMessages, setConversationMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  
  const scrollViewRef = useRef<ScrollView>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Charger les conversations au focus
  useFocusEffect(
    useCallback(() => {
      getConversations();
    }, [getConversations])
  );

  // Si un userId est passé en paramètre, ouvrir directement la conversation
  useEffect(() => {
    if (params.userId && currentUser?.id && params.userId !== currentUser.id) {
      handleOpenConversationWithUser(params.userId);
    }
  }, [params.userId, currentUser?.id]);

  // Charger les messages quand une conversation est sélectionnée
  useEffect(() => {
    if (selectedConversation) {
      loadConversationMessages(selectedConversation.id);
      markAsRead(selectedConversation.id);
    } else {
      // Réinitialiser les messages si aucune conversation n'est sélectionnée
      setConversationMessages([]);
    }
  }, [selectedConversation?.id]);

  // S'abonner aux nouveaux messages en temps réel
  useEffect(() => {
    if (selectedConversation) {
      const unsubscribe = subscribeToConversation(selectedConversation.id, (message) => {
        setConversationMessages((prev) => {
          // Vérifier si le message n'est pas déjà présent (éviter les doublons)
          const exists = prev.some(msg => msg.id === message.id);
          if (exists) {
            return prev;
          }
          // Ajouter le message et trier par date
          const updated = [...prev, message];
          return updated.sort((a, b) => {
            const dateA = new Date(a.createdAt).getTime();
            const dateB = new Date(b.createdAt).getTime();
            return dateA - dateB;
          });
        });
        // Faire défiler vers le bas
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
        // Marquer comme lu si c'est pour l'utilisateur actuel
        if (message.recipientId === currentUser?.id) {
          markAsRead(selectedConversation.id);
        }
      });
      unsubscribeRef.current = unsubscribe;

      return () => {
        if (unsubscribeRef.current) {
          unsubscribeRef.current();
        }
      };
    }
  }, [selectedConversation?.id, subscribeToConversation, markAsRead, currentUser?.id]);

  const loadConversationMessages = async (conversationId: string) => {
    try {
      const loadedMessages = await getMessages(conversationId);
      // S'assurer que les messages sont bien triés par date
      const sortedMessages = loadedMessages.sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateA - dateB;
      });
      setConversationMessages(sortedMessages);
      // Faire défiler vers le bas après le chargement
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: false });
      }, 100);
    } catch (error) {
      console.error('Error loading conversation messages:', error);
      setConversationMessages([]);
    }
  };

  const handleOpenConversationWithUser = async (userId: string) => {
    const conversation = await getOrCreateConversation(userId);
    if (conversation) {
      setSelectedConversation(conversation);
      setActiveView('chat');
    }
  };

  const handleSelectConversation = async (conversation: Conversation) => {
    setSelectedConversation(conversation);
    setActiveView('chat');
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation || !currentUser?.id || isSending) return;

    setIsSending(true);
    const content = newMessage.trim();
    setNewMessage('');

    const recipientId = selectedConversation.user1Id === currentUser.id 
      ? selectedConversation.user2Id 
      : selectedConversation.user1Id;

    const sentMessage = await sendMessage(selectedConversation.id, recipientId, content);
    
    if (sentMessage) {
      // Ajouter le message immédiatement au state local pour un affichage instantané
      setConversationMessages((prev) => {
        // Vérifier si le message n'est pas déjà présent (éviter les doublons)
        const exists = prev.some(msg => msg.id === sentMessage.id);
        if (exists) {
          return prev;
        }
        return [...prev, sentMessage];
      });
      
      // Faire défiler vers le bas
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } else {
      // En cas d'erreur, remettre le message dans l'input
      setNewMessage(content);
    }
    
    setIsSending(false);
  };

  // Vérifier si l'utilisateur est bloqué
  useEffect(() => {
    const checkBlocked = async () => {
      if (selectedConversation?.otherUser?.id && currentUser?.id) {
        const blocked = await isUserBlocked(currentUser.id, selectedConversation.otherUser.id);
        setIsBlocked(blocked);
      } else {
        setIsBlocked(false);
      }
    };
    if (selectedConversation) {
      checkBlocked();
    }
  }, [selectedConversation?.otherUser?.id, currentUser?.id, isUserBlocked]);

  const handleViewProfile = async () => {
    if (!selectedConversation?.otherUser?.id) return;
    
    setShowMenu(false);
    
    try {
      // Charger le profil complet depuis Supabase
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', selectedConversation.otherUser.id)
        .single();

      if (userProfile) {
        const fullUser = {
          id: userProfile.id,
          pseudo: userProfile.pseudo || 'Utilisateur',
          age: userProfile.age || 25,
          phone: userProfile.phone || '',
          photo: userProfile.photo || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
          description: userProfile.description || '',
          distance: undefined,
          rating: parseFloat(userProfile.rating) || 0,
          reviewCount: userProfile.review_count || 0,
          isSubscribed: userProfile.is_subscribed || false,
          subscriptionStatus: userProfile.subscription_status || 'pending',
          lastSeen: userProfile.last_seen || 'En ligne',
          gender: userProfile.gender || 'female',
          lat: userProfile.lat ? parseFloat(userProfile.lat) : undefined,
          lng: userProfile.lng ? parseFloat(userProfile.lng) : undefined,
          isAvailable: userProfile.is_available ?? true,
          currentBookingId: userProfile.current_booking_id,
        };
        setSelectedUser(fullUser);
        router.push('/(screens)/user-profile');
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
      Alert.alert('Erreur', 'Impossible de charger le profil');
    }
  };

  const handleBlockUser = async () => {
    if (!selectedConversation?.otherUser?.id) return;
    
    setShowDetails(false);
    setShowMenu(false);

    Alert.alert(
      'Bloquer',
      `Êtes-vous sûr de vouloir bloquer ${selectedConversation.otherUser.pseudo} ? Vous ne pourrez plus voir son profil, lui envoyer de messages ou de demandes.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Bloquer',
          style: 'destructive',
          onPress: async () => {
            const success = await blockUser(selectedConversation.otherUser!.id);
            if (success) {
              setIsBlocked(true);
              Alert.alert('Succès', 'Utilisateur bloqué');
            } else {
              Alert.alert('Erreur', 'Impossible de bloquer l\'utilisateur');
            }
          },
        },
      ]
    );
  };

  const handleUnblockUser = async () => {
    if (!selectedConversation?.otherUser?.id) return;
    
    setShowDetails(false);
    setShowMenu(false);

    Alert.alert(
      'Débloquer',
      `Êtes-vous sûr de vouloir débloquer ${selectedConversation.otherUser.pseudo} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Débloquer',
          style: 'destructive',
          onPress: async () => {
            const success = await unblockUser(selectedConversation.otherUser!.id);
            if (success) {
              setIsBlocked(false);
              Alert.alert('Succès', 'Utilisateur débloqué');
            } else {
              Alert.alert('Erreur', 'Impossible de débloquer l\'utilisateur');
            }
          },
        },
      ]
    );
  };

  const handleDeleteConversation = async () => {
    if (!selectedConversation || !currentUser?.id) return;

    Alert.alert(
      'Supprimer la conversation',
      'Êtes-vous sûr de vouloir supprimer cette conversation ? Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            const success = await deleteConversation(selectedConversation.id);
            if (success) {
              setActiveView('list');
              setSelectedConversation(null);
              setConversationMessages([]);
              getConversations();
            } else {
              Alert.alert('Erreur', 'Impossible de supprimer la conversation');
            }
          },
        },
      ]
    );
  };

  const handleDeleteMessage = async (messageId: string) => {
    Alert.alert(
      'Supprimer le message',
      'Êtes-vous sûr de vouloir supprimer ce message ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            const success = await deleteMessage(messageId);
            if (success && selectedConversation) {
              loadConversationMessages(selectedConversation.id);
            } else {
              Alert.alert('Erreur', 'Impossible de supprimer le message');
            }
          },
        },
      ]
    );
  };

  // Vue de chat individuel
  if (activeView === 'chat' && selectedConversation && selectedConversation.otherUser) {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          {/* Chat Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => {
              setActiveView('list');
              setSelectedConversation(null);
              setConversationMessages([]);
            }}>
              <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
            <View style={styles.headerUser}>
              <ImageWithFallback
                source={{ uri: selectedConversation.otherUser?.photo || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400' }}
                style={styles.headerAvatar}
              />
              {selectedConversation.otherUser?.lastSeen === 'En ligne' && (
                <View style={styles.headerOnlineIndicator} />
              )}
            </View>
            <View style={styles.headerInfo}>
              <Text style={styles.headerName}>{selectedConversation.otherUser?.pseudo || 'Utilisateur'}</Text>
              <Text style={styles.headerStatus}>{selectedConversation.otherUser?.lastSeen || 'Hors ligne'}</Text>
            </View>
            <TouchableOpacity onPress={() => setShowMenu(true)}>
              <Ionicons name="ellipsis-vertical" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Messages */}
          {isLoadingMessages ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.pink500} />
            </View>
          ) : (
            <ScrollView
              ref={scrollViewRef}
              style={styles.messagesContainer}
              contentContainerStyle={styles.messagesContent}
              onContentSizeChange={() => {
                scrollViewRef.current?.scrollToEnd({ animated: false });
              }}
            >
              {conversationMessages.map((message) => {
                const isOwnMessage = message.senderId === currentUser?.id;
                return (
                  <TouchableOpacity
                    key={message.id}
                    style={[styles.messageWrapper, isOwnMessage && styles.messageWrapperOwn]}
                    onLongPress={() => isOwnMessage && handleDeleteMessage(message.id)}
                  >
                    <View
                      style={[
                        styles.messageBubble,
                        isOwnMessage ? styles.messageBubbleOwn : styles.messageBubbleOther,
                      ]}
                    >
                      <Text style={[
                        styles.messageText,
                        isOwnMessage && styles.messageTextOwn
                      ]}>
                        {message.content || ''}
                      </Text>
                    </View>
                    <View style={styles.messageMeta}>
                      <Text style={styles.messageTime}>
                        {formatMessageTime(message.createdAt) || ''}
                      </Text>
                      {isOwnMessage && (
                        <Ionicons
                          name={message.isRead ? 'checkmark-done' : 'checkmark'}
                          size={16}
                          color={message.isRead ? colors.pink400 : colors.textTertiary}
                        />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* Input */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={newMessage}
              onChangeText={setNewMessage}
              placeholder="Écrire un message..."
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={1000}
              editable={!isSending}
            />
            <TouchableOpacity
              style={[styles.sendButton, (!newMessage.trim() || isSending) && styles.sendButtonDisabled]}
              onPress={handleSendMessage}
              disabled={!newMessage.trim() || isSending}
            >
              {isSending ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Ionicons name="send" size={20} color="#ffffff" />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>

        {/* Menu Options */}
        <Modal
          visible={showMenu}
          transparent
          animationType="fade"
          onRequestClose={() => setShowMenu(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowMenu(false)}
          >
            <View style={styles.menuContainer} onStartShouldSetResponder={() => true}>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={handleViewProfile}
              >
                <Ionicons name="person-outline" size={20} color={colors.text} />
                <Text style={styles.menuItemText}>Voir le profil</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setShowMenu(false);
                  setShowDetails(true);
                }}
              >
                <Ionicons name="information-circle-outline" size={20} color={colors.text} />
                <Text style={styles.menuItemText}>Voir détails</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.menuItem, styles.menuItemCancel]}
                onPress={() => setShowMenu(false)}
              >
                <Text style={styles.menuItemTextCancel}>Annuler</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Modal Détails de la conversation */}
        <Modal
          visible={showDetails}
          transparent
          animationType="slide"
          onRequestClose={() => setShowDetails(false)}
        >
          <View style={styles.detailsModalOverlay}>
            <View style={styles.detailsModalContent}>
              <View style={styles.detailsModalHeader}>
                <Text style={styles.detailsModalTitle}>Détails de la conversation</Text>
                <TouchableOpacity onPress={() => setShowDetails(false)}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.detailsModalBody}>
                {selectedConversation?.otherUser && (
                  <View style={styles.detailsUserInfo}>
                    <ImageWithFallback
                      source={{ uri: selectedConversation.otherUser.photo || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400' }}
                      style={styles.detailsAvatar}
                    />
                    <View style={styles.detailsUserText}>
                      <Text style={styles.detailsUserName}>
                        {selectedConversation.otherUser.pseudo || 'Utilisateur'}
                      </Text>
                      <Text style={styles.detailsUserStatus}>
                        {selectedConversation.otherUser.lastSeen || 'Hors ligne'}
                      </Text>
                    </View>
                  </View>
                )}

                <View style={styles.detailsSection}>
                  <Text style={styles.detailsSectionTitle}>Informations</Text>
                  <View style={styles.detailsInfoRow}>
                    <Text style={styles.detailsInfoLabel}>Messages</Text>
                    <Text style={styles.detailsInfoValue}>
                      {conversationMessages.length}
                    </Text>
                  </View>
                  {selectedConversation?.createdAt && (
                    <View style={styles.detailsInfoRow}>
                      <Text style={styles.detailsInfoLabel}>Créée le</Text>
                      <Text style={styles.detailsInfoValue}>
                        {new Date(selectedConversation.createdAt).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.detailsActions}>
                  {isBlocked ? (
                    <TouchableOpacity
                      style={[styles.detailsActionButton, styles.detailsActionButtonUnblock]}
                      onPress={handleUnblockUser}
                    >
                      <Ionicons name="lock-open-outline" size={20} color={colors.text} />
                      <Text style={styles.detailsActionButtonText}>Débloquer</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.detailsActionButton, styles.detailsActionButtonBlock]}
                      onPress={handleBlockUser}
                    >
                      <Ionicons name="lock-closed-outline" size={20} color={colors.red500} />
                      <Text style={[styles.detailsActionButtonText, { color: colors.red500 }]}>
                        Bloquer
                      </Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.detailsActionButton, styles.detailsActionButtonDelete]}
                    onPress={handleDeleteConversation}
                  >
                    <Ionicons name="trash-outline" size={20} color={colors.red500} />
                    <Text style={[styles.detailsActionButtonText, { color: colors.red500 }]}>
                      Supprimer la conversation
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  // Vue de liste des conversations
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Messages</Text>
        <View style={{ width: 24 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.pink500} />
        </View>
      ) : conversations.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIcon}>
            <Ionicons name="chatbubbles-outline" size={40} color={colors.textTertiary} />
          </View>
          <Text style={styles.emptyTitle}>Aucun message</Text>
          <Text style={styles.emptySubtitle}>Vos conversations apparaîtront ici</Text>
        </View>
      ) : (
        <ScrollView style={styles.conversationsList}>
          {conversations.map((conversation) => (
            <TouchableOpacity
              key={conversation.id}
              style={styles.conversationItem}
              onPress={() => handleSelectConversation(conversation)}
            >
              <View style={styles.conversationAvatar}>
                {conversation.otherUser ? (
                  <>
                    <ImageWithFallback
                      source={{ uri: conversation.otherUser?.photo || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400' }}
                      style={styles.avatarImage}
                    />
                    {conversation.otherUser?.lastSeen === 'En ligne' && (
                      <View style={styles.conversationOnlineIndicator} />
                    )}
                  </>
                ) : (
                  <View style={styles.avatarImage} />
                )}
              </View>
              <View style={styles.conversationInfo}>
                <View style={styles.conversationHeader}>
                  <Text style={styles.conversationName}>
                    {conversation.otherUser?.pseudo || 'Utilisateur'}
                  </Text>
                  {conversation.lastMessageAt && (
                    <Text style={styles.conversationTime}>
                      {formatConversationTime(conversation.lastMessageAt) || ''}
                    </Text>
                  )}
                </View>
                <View style={styles.conversationFooter}>
                  <Text style={styles.conversationMessage} numberOfLines={1}>
                    {conversation.lastMessage?.content || 'Aucun message'}
                  </Text>
                  {conversation.unreadCount && conversation.unreadCount > 0 ? (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadText}>
                        {conversation.unreadCount > 99 ? '99+' : String(conversation.unreadCount || 0)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: `${colors.backgroundSecondary}80`,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSecondary,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  headerUser: {
    position: 'relative',
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  headerOnlineIndicator: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.green500,
    borderWidth: 2,
    borderColor: colors.backgroundSecondary,
  },
  headerInfo: {
    flex: 1,
    gap: 2,
  },
  headerName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  headerStatus: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 24,
    gap: 16,
  },
  messageWrapper: {
    alignItems: 'flex-start',
    gap: 4,
  },
  messageWrapperOwn: {
    alignItems: 'flex-end',
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
  },
  messageBubbleOwn: {
    backgroundColor: colors.pink600,
    borderBottomRightRadius: 4,
  },
  messageBubbleOther: {
    backgroundColor: colors.backgroundTertiary,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    color: colors.text,
  },
  messageTextOwn: {
    color: '#ffffff',
  },
  messageMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
  },
  messageTime: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: `${colors.backgroundSecondary}80`,
    borderTopWidth: 1,
    borderTopColor: colors.borderSecondary,
  },
  input: {
    flex: 1,
    backgroundColor: `${colors.backgroundTertiary}80`,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
    maxHeight: 100,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.pink600,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 16,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.backgroundTertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  conversationsList: {
    flex: 1,
  },
  conversationItem: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSecondary,
  },
  conversationAvatar: {
    position: 'relative',
  },
  avatarImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  conversationOnlineIndicator: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.green500,
    borderWidth: 2,
    borderColor: colors.background,
  },
  conversationInfo: {
    flex: 1,
    gap: 4,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  conversationName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  conversationTime: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  conversationFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  conversationMessage: {
    flex: 1,
    fontSize: 14,
    color: colors.textSecondary,
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.pink600,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  unreadText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  menuContainer: {
    backgroundColor: colors.backgroundSecondary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
    paddingTop: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSecondary,
  },
  menuItemCancel: {
    borderBottomWidth: 0,
    marginTop: 8,
  },
  menuItemText: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '500',
  },
  menuItemTextCancel: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '500',
    textAlign: 'center',
    width: '100%',
  },
  detailsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  detailsModalContent: {
    backgroundColor: colors.backgroundSecondary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  detailsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSecondary,
  },
  detailsModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  detailsModalBody: {
    padding: 24,
  },
  detailsUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 24,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSecondary,
  },
  detailsAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  detailsUserText: {
    flex: 1,
    gap: 4,
  },
  detailsUserName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  detailsUserStatus: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  detailsSection: {
    marginBottom: 24,
  },
  detailsSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  detailsInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  detailsInfoLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  detailsInfoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  detailsActions: {
    gap: 12,
    marginTop: 8,
  },
  detailsActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
  },
  detailsActionButtonBlock: {
    backgroundColor: 'transparent',
    borderColor: colors.border,
  },
  detailsActionButtonUnblock: {
    backgroundColor: 'transparent',
    borderColor: colors.border,
  },
  detailsActionButtonDelete: {
    backgroundColor: 'transparent',
    borderColor: colors.red500,
  },
  detailsActionButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
});
