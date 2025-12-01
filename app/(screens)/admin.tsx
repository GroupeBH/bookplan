import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ImageWithFallback } from '../../components/ImageWithFallback';

interface AdminUser {
  id: string;
  pseudo: string;
  phone: string;
  status: 'active' | 'suspended' | 'deleted';
  reports: number;
  joinDate: string;
  photo: string;
}

interface Report {
  id: string;
  reportedUser: string;
  reportedBy: string;
  reason: string;
  date: string;
  status: 'pending' | 'reviewed' | 'dismissed';
}

const mockAdminUsers: AdminUser[] = [
  {
    id: '1',
    pseudo: 'Amina',
    phone: '+243 XXX XXX 001',
    status: 'active',
    reports: 0,
    joinDate: '10 nov 2024',
    photo: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400',
  },
  {
    id: '2',
    pseudo: 'Joël',
    phone: '+243 XXX XXX 002',
    status: 'active',
    reports: 1,
    joinDate: '08 nov 2024',
    photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
  },
  {
    id: '3',
    pseudo: 'UserTest',
    phone: '+243 XXX XXX 003',
    status: 'suspended',
    reports: 5,
    joinDate: '01 nov 2024',
    photo: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400',
  },
];

const mockReports: Report[] = [
  {
    id: '1',
    reportedUser: 'Joël',
    reportedBy: 'Marie',
    reason: 'Comportement inapproprié',
    date: '12 nov 2024',
    status: 'pending',
  },
  {
    id: '2',
    reportedUser: 'UserTest',
    reportedBy: 'David',
    reason: 'Photo non conforme',
    date: '11 nov 2024',
    status: 'reviewed',
  },
];

export default function AdminScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'users' | 'reports'>('users');
  const [searchQuery, setSearchQuery] = useState('');

  const getStatusBadge = (status: AdminUser['status']) => {
    if (status === 'active') {
      return <Badge variant="success">Actif</Badge>;
    }
    if (status === 'suspended') {
      return <Badge variant="warning">Suspendu</Badge>;
    }
    return <Badge variant="error">Supprimé</Badge>;
  };

  const getReportStatusBadge = (status: Report['status']) => {
    if (status === 'pending') {
      return <Badge variant="warning">En attente</Badge>;
    }
    if (status === 'reviewed') {
      return <Badge variant="success">Traité</Badge>;
    }
    return <Badge variant="default">Rejeté</Badge>;
  };

  const pendingReportsCount = mockReports.filter((r) => r.status === 'pending').length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Administration</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'users' && styles.tabActive]}
          onPress={() => setActiveTab('users')}
        >
          <Text style={[styles.tabText, activeTab === 'users' && styles.tabTextActive]}>
            Utilisateurs
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'reports' && styles.tabActive]}
          onPress={() => setActiveTab('reports')}
        >
          <View style={styles.tabWithBadge}>
            <Text style={[styles.tabText, activeTab === 'reports' && styles.tabTextActive]}>
              Signalements
            </Text>
            {pendingReportsCount > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{pendingReportsCount}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Input
          placeholder={
            activeTab === 'users' ? 'Rechercher un utilisateur...' : 'Rechercher un signalement...'
          }
          value={searchQuery}
          onChangeText={setSearchQuery}
          leftIcon={<Ionicons name="search-outline" size={20} color={colors.textTertiary} />}
          containerStyle={styles.searchInput}
        />
      </View>

      {/* Content */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {activeTab === 'users' ? (
          <View style={styles.usersList}>
            {mockAdminUsers.map((user) => (
              <View key={user.id} style={styles.userCard}>
                <View style={styles.userHeader}>
                  <ImageWithFallback source={{ uri: user.photo }} style={styles.userAvatar} />
                  <View style={styles.userInfo}>
                    <View style={styles.userNameRow}>
                      <Text style={styles.userName}>{user.pseudo}</Text>
                      {getStatusBadge(user.status)}
                    </View>
                    <Text style={styles.userPhone}>{user.phone}</Text>
                    <Text style={styles.userJoinDate}>Inscrit le {user.joinDate}</Text>
                    {user.reports > 0 && (
                      <View style={styles.reportsRow}>
                        <Ionicons name="flag-outline" size={16} color={colors.red500} />
                        <Text style={styles.reportsText}>
                          {user.reports} signalement{user.reports > 1 ? 's' : ''}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={styles.userActions}>
                  <Button
                    title="Voir"
                    onPress={() => {}}
                    variant="outline"
                    icon={<Ionicons name="eye-outline" size={16} color={colors.text} />}
                    style={styles.actionButton}
                  />
                  <Button
                    title="Suspendre"
                    onPress={() => {}}
                    variant="outline"
                    disabled={user.status === 'suspended'}
                    icon={<Ionicons name="ban-outline" size={16} color={colors.yellow400} />}
                    style={[styles.actionButton, styles.actionButtonWarning]}
                    textStyle={{ color: colors.yellow400 }}
                  />
                  <Button
                    title="Supprimer"
                    onPress={() => {}}
                    variant="outline"
                    icon={<Ionicons name="trash-outline" size={16} color={colors.red500} />}
                    style={[styles.actionButton, styles.actionButtonDanger]}
                    textStyle={{ color: colors.red500 }}
                  />
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.reportsList}>
            {mockReports.map((report) => (
              <View key={report.id} style={styles.reportCard}>
                <View style={styles.reportHeader}>
                  <View>
                    <Text style={styles.reportTitle}>Signalement contre {report.reportedUser}</Text>
                    <Text style={styles.reportBy}>Par {report.reportedBy}</Text>
                    <Text style={styles.reportDate}>{report.date}</Text>
                  </View>
                  {getReportStatusBadge(report.status)}
                </View>
                <View style={styles.reportReason}>
                  <Text style={styles.reportReasonText}>{report.reason}</Text>
                </View>
                {report.status === 'pending' && (
                  <View style={styles.reportActions}>
                    <Button
                      title="Approuver"
                      onPress={() => {}}
                      icon={<Ionicons name="checkmark-circle-outline" size={16} color="#ffffff" />}
                      style={[styles.reportActionButton, styles.reportActionButtonSuccess]}
                    />
                    <Button
                      title="Rejeter"
                      onPress={() => {}}
                      variant="outline"
                      icon={<Ionicons name="close-circle-outline" size={16} color={colors.text} />}
                      style={styles.reportActionButton}
                    />
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: `${colors.backgroundSecondary}4d`,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSecondary,
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.purple500,
  },
  tabText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  tabTextActive: {
    color: colors.text,
  },
  tabWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  tabBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.red500,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  searchContainer: {
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  searchInput: {
    marginBottom: 0,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    gap: 12,
  },
  usersList: {
    gap: 12,
  },
  userCard: {
    backgroundColor: `${colors.backgroundSecondary}80`,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
    borderRadius: 16,
    padding: 16,
    gap: 16,
  },
  userHeader: {
    flexDirection: 'row',
    gap: 16,
  },
  userAvatar: {
    width: 64,
    height: 64,
    borderRadius: 16,
  },
  userInfo: {
    flex: 1,
    gap: 4,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  userPhone: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  userJoinDate: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  reportsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  reportsText: {
    fontSize: 12,
    color: colors.red500,
  },
  userActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    marginTop: 0,
    paddingVertical: 8,
  },
  actionButtonWarning: {
    borderColor: colors.yellow400,
  },
  actionButtonDanger: {
    borderColor: colors.red500,
  },
  reportsList: {
    gap: 12,
  },
  reportCard: {
    backgroundColor: `${colors.backgroundSecondary}80`,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  reportTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  reportBy: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  reportDate: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 2,
  },
  reportReason: {
    backgroundColor: `${colors.red500}33`,
    borderWidth: 1,
    borderColor: `${colors.red500}4d`,
    borderRadius: 12,
    padding: 12,
  },
  reportReasonText: {
    fontSize: 14,
    color: colors.red500,
    lineHeight: 20,
  },
  reportActions: {
    flexDirection: 'row',
    gap: 8,
  },
  reportActionButton: {
    flex: 1,
    marginTop: 0,
  },
  reportActionButtonSuccess: {
    backgroundColor: colors.green600,
  },
});

