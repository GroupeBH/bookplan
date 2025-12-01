import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useAuth } from '../../context/AuthContext';
import Animated, { FadeInDown } from 'react-native-reanimated';

const paymentMethods = [
  { name: 'Orange Money', icon: '🟠', color: ['#f97316', '#ea580c'] },
  { name: 'Airtel Money', icon: '🔴', color: ['#ef4444', '#dc2626'] },
  { name: 'M-Pesa', icon: '🟢', color: ['#22c55e', '#16a34a'] },
];

const features = [
  'Voir tous les profils à proximité',
  'Messagerie illimitée',
  'Demandes de compagnie illimitées',
  'Accès aux informations vérifiées',
  'Badge vérifié sur votre profil',
  'Support prioritaire',
];

export default function SubscriptionScreen() {
  const router = useRouter();
  const { user, login } = useAuth();

  const handleSubscribe = async () => {
    if (user) {
      const updatedUser = {
        ...user,
        isSubscribed: true,
        subscriptionStatus: 'active' as const,
      };
      // Sauvegarder l'abonnement dans AsyncStorage
      await login(updatedUser);
    }
    router.replace('/(screens)/dashboard');
  };

  const handleSkip = () => {
    router.replace('/(screens)/dashboard');
  };

  return (
    <LinearGradient
      colors={['#581c87', '#171717', '#000000']}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Animated.View entering={FadeInDown.delay(100)}>
            <LinearGradient
              colors={[colors.yellow400, colors.yellow600]}
              style={styles.crownContainer}
            >
              <Ionicons name="diamond" size={40} color="#ffffff" />
            </LinearGradient>
          </Animated.View>
        </View>

        <View style={styles.content}>
          <Animated.View entering={FadeInDown.delay(200)} style={styles.titleContainer}>
            <Text style={styles.title}>Accédez à toutes les fonctionnalités</Text>
            <View style={styles.priceContainer}>
              <Text style={styles.price}>1000 CDF</Text>
              <Text style={styles.priceUnit}>/ mois</Text>
            </View>
          </Animated.View>

          {/* Features */}
          <Animated.View entering={FadeInDown.delay(300)} style={styles.featuresContainer}>
            {features.map((feature, index) => (
              <Animated.View
                key={index}
                entering={FadeInDown.delay(300 + index * 100)}
                style={styles.featureItem}
              >
                <View style={styles.checkIcon}>
                  <Ionicons name="checkmark" size={12} color={colors.purple400} />
                </View>
                <Text style={styles.featureText}>{feature}</Text>
              </Animated.View>
            ))}
          </Animated.View>

          {/* Payment methods */}
          <Animated.View entering={FadeInDown.delay(400)} style={styles.paymentSection}>
            <Text style={styles.paymentTitle}>Choisissez votre moyen de paiement</Text>
            <View style={styles.paymentMethods}>
              {paymentMethods.map((method, index) => (
                <Animated.View
                  key={index}
                  entering={FadeInDown.delay(400 + index * 100)}
                >
                  <Button
                    title={method.name}
                    onPress={handleSubscribe}
                    variant="outline"
                    style={styles.paymentButton}
                    icon={<Text style={styles.paymentIcon}>{method.icon}</Text>}
                  />
                </Animated.View>
              ))}
            </View>
          </Animated.View>

          {/* Status badges */}
          <Animated.View entering={FadeInDown.delay(500)} style={styles.badgesContainer}>
            <Text style={styles.badgesTitle}>Statut d'abonnement</Text>
            <View style={styles.badges}>
              <Badge variant="success">Actif</Badge>
              <Badge variant="error">Expiré</Badge>
              <Badge variant="warning">En attente</Badge>
            </View>
          </Animated.View>
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <Button
          title="Passer pour le moment"
          onPress={handleSkip}
          variant="ghost"
          textStyle={{ color: colors.textSecondary }}
        />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  crownContainer: {
    width: 80,
    height: 80,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.yellow500,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  content: {
    gap: 24,
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  titleContainer: {
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  price: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.text,
  },
  priceUnit: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  featuresContainer: {
    backgroundColor: `${colors.backgroundTertiary}4d`,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: `${colors.border}80`,
    gap: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: `${colors.purple500}33`,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  featureText: {
    flex: 1,
    fontSize: 16,
    color: colors.textSecondary,
  },
  paymentSection: {
    gap: 12,
  },
  paymentTitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  paymentMethods: {
    gap: 12,
  },
  paymentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  paymentIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  badgesContainer: {
    backgroundColor: `${colors.backgroundTertiary}4d`,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: `${colors.border}80`,
    gap: 12,
  },
  badgesTitle: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
});

