export type Screen = 'splash' | 'auth' | 'subscription' | 'dashboard' | 'profile' | 'user-profile' | 'search' | 'booking' | 'kyc' | 'chat' | 'admin' | 'settings';

export interface User {
  id: string;
  pseudo: string;
  age: number;
  phone?: string;
  photo: string;
  description: string;
  specialty?: string; // Savoir-faire particulier (ex: avocat, médecin, etc.)
  distance?: number;
  rating: number;
  reviewCount: number;
  isSubscribed: boolean;
  subscriptionStatus: 'active' | 'expired' | 'pending';
  lastSeen: string;
  gender: 'male' | 'female';
  lat?: number;
  lng?: number;
  isAvailable?: boolean;
  currentBookingId?: string;
}

export interface AlbumPhoto {
  id: string;
  userId: string;
  photoUrl: string;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  recipientId: string;
  content: string;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
  updatedAt: string;
  sender?: User;
  recipient?: User;
}

export interface Conversation {
  id: string;
  user1Id: string;
  user2Id: string;
  lastMessageId?: string;
  lastMessageAt?: string;
  user1UnreadCount: number;
  user2UnreadCount: number;
  createdAt: string;
  updatedAt: string;
  // Données enrichies côté client
  otherUser?: User;
  lastMessage?: Message;
  unreadCount?: number; // Calculé selon l'utilisateur connecté
}

export interface Review {
  id: string;
  author: string;
  rating: number;
  comment: string;
  date: string;
}

export interface Subscription {
  id: string;
  userId: string;
  planType: 'basic' | 'premium' | 'vip';
  status: 'active' | 'expired' | 'pending' | 'cancelled';
  startDate: string;
  endDate?: string;
  price?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CompanionshipTopic {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  isActive: boolean;
  displayOrder: number;
}

export interface Booking {
  id: string;
  requesterId: string;
  providerId: string;
  status: 'pending' | 'accepted' | 'rejected' | 'completed' | 'cancelled' | 'expired';
  bookingDate: string;
  durationHours: number;
  location?: string;
  lat?: number;
  lng?: number;
  notes?: string;
  topicId?: string;
  topic?: CompanionshipTopic;
  createdAt: string;
  updatedAt: string;
  requester?: User;
  provider?: User;
  extensionRequestedHours?: number;
  extensionRequestedAt?: string;
}

export interface InfoAccessRequest {
  id: string;
  requesterId: string;
  targetId: string;
  status: 'pending' | 'accepted' | 'rejected';
  requesterInfoRevealed: boolean;
  createdAt: string;
  updatedAt: string;
  requester?: User;
  target?: User;
}

export interface Rating {
  id: string;
  raterId: string;
  ratedId: string;
  rating: number;
  comment?: string;
  bookingId?: string;
  createdAt: string;
  updatedAt: string;
  rater?: User;
  rated?: User;
}

export type OfferType = 'drink' | 'food' | 'transport' | 'gift';

export interface Offer {
  id: string;
  authorId: string;
  offerType: OfferType;
  title: string;
  description?: string;
  notes?: string;
  offerDate: string;
  durationHours: number;
  location?: string;
  lat?: number;
  lng?: number;
  status: 'active' | 'closed' | 'cancelled' | 'expired';
  selectedApplicationId?: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  author?: User;
  selectedApplication?: OfferApplication;
  applicationCount?: number;
}

export interface OfferApplication {
  id: string;
  offerId: string;
  applicantId: string;
  message: string;
  status: 'pending' | 'selected' | 'rejected' | 'expired';
  rejectionMessage?: string;
  createdAt: string;
  updatedAt: string;
  applicant?: User;
  offer?: Offer;
}

