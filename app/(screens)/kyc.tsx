import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import { Button } from '../../components/ui/Button';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';

export default function KYCScreen() {
  const router = useRouter();
  const [photo, setPhoto] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<'success' | 'failed' | null>(null);

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission requise', 'Nous avons besoin de l\'accès à votre caméra');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
    });

    if (!result.canceled) {
      setPhoto(result.assets[0].uri);
    }
  };

  const handleSubmit = () => {
    if (!photo) return;
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      const success = Math.random() > 0.3;
      setResult(success ? 'success' : 'failed');
      if (success) {
        setTimeout(() => {
          router.replace('/(screens)/chat');
        }, 2000);
      }
    }, 3000);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Vérification KYC</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        {!result && !isProcessing && (
          <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.stepContainer}>
            <View style={styles.instructionsCard}>
              <Text style={styles.instructionsTitle}>Instructions</Text>
              <View style={styles.instructionsList}>
                <View style={styles.instructionItem}>
                  <View style={styles.instructionNumber}>
                    <Text style={styles.instructionNumberText}>1</Text>
                  </View>
                  <Text style={styles.instructionText}>
                    Assurez-vous d'être dans un endroit bien éclairé
                  </Text>
                </View>
                <View style={styles.instructionItem}>
                  <View style={styles.instructionNumber}>
                    <Text style={styles.instructionNumberText}>2</Text>
                  </View>
                  <Text style={styles.instructionText}>Positionnez votre visage dans le cadre</Text>
                </View>
                <View style={styles.instructionItem}>
                  <View style={styles.instructionNumber}>
                    <Text style={styles.instructionNumberText}>3</Text>
                  </View>
                  <Text style={styles.instructionText}>
                    Faites le signe ✌️ avec votre main
                  </Text>
                </View>
              </View>
            </View>

            {photo ? (
              <View style={styles.photoContainer}>
                <View style={styles.photoPreview}>
                  {/* Photo preview would go here */}
                  <Text style={styles.photoPreviewText}>Photo capturée</Text>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => setPhoto(null)}
                  >
                    <Ionicons name="close-circle" size={24} color={colors.text} />
                  </TouchableOpacity>
                </View>
                <Button
                  title="Envoyer la photo"
                  onPress={handleSubmit}
                  icon={<Ionicons name="cloud-upload-outline" size={20} color="#ffffff" />}
                  style={styles.button}
                />
              </View>
            ) : (
              <View style={styles.captureContainer}>
                <View style={styles.capturePlaceholder}>
                  <Ionicons name="camera-outline" size={64} color={colors.textTertiary} />
                  <Text style={styles.captureText}>Prenez un selfie</Text>
                  <Text style={styles.captureSubtext}>Avec le signe ✌️</Text>
                </View>
                <Button
                  title="Prendre une photo"
                  onPress={handleTakePhoto}
                  icon={<Ionicons name="camera" size={20} color="#ffffff" />}
                  style={styles.button}
                />
              </View>
            )}
          </Animated.View>
        )}

        {isProcessing && (
          <Animated.View entering={FadeIn} style={styles.processingContainer}>
            <View style={styles.processingIcon}>
              <Ionicons name="camera-outline" size={40} color={colors.purple400} />
            </View>
            <Text style={styles.processingTitle}>Vérification en cours...</Text>
            <Text style={styles.processingSubtitle}>Nous analysons votre photo</Text>
          </Animated.View>
        )}

        {result === 'success' && (
          <Animated.View entering={FadeIn} style={styles.resultContainer}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark-circle" size={48} color={colors.green500} />
            </View>
            <Text style={styles.resultTitle}>Vérification réussie !</Text>
            <Text style={styles.resultSubtitle}>Votre identité a été confirmée</Text>
          </Animated.View>
        )}

        {result === 'failed' && (
          <Animated.View entering={FadeIn} style={styles.resultContainer}>
            <View style={styles.failedIcon}>
              <Ionicons name="close-circle" size={48} color={colors.red500} />
            </View>
            <Text style={styles.resultTitle}>Vérification échouée</Text>
            <Text style={styles.resultSubtitle}>Veuillez réessayer avec une meilleure photo</Text>
            <View style={styles.failedCard}>
              <Text style={styles.failedText}>
                Assurez-vous que votre visage est clairement visible et que vous faites le signe ✌️
              </Text>
            </View>
            <Button
              title="Réessayer"
              onPress={() => {
                setResult(null);
                setPhoto(null);
              }}
              style={styles.button}
            />
          </Animated.View>
        )}
      </View>
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
  content: {
    flex: 1,
    padding: 24,
  },
  stepContainer: {
    gap: 24,
  },
  instructionsCard: {
    backgroundColor: `${colors.purple500}33`,
    borderWidth: 1,
    borderColor: `${colors.purple500}4d`,
    borderRadius: 16,
    padding: 24,
    gap: 16,
  },
  instructionsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  instructionsList: {
    gap: 12,
  },
  instructionItem: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  instructionNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: `${colors.purple500}33`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  instructionNumberText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.purple400,
  },
  instructionText: {
    flex: 1,
    fontSize: 14,
    color: colors.purple400,
    lineHeight: 20,
  },
  photoContainer: {
    gap: 16,
  },
  photoPreview: {
    aspectRatio: 3 / 4,
    borderRadius: 24,
    backgroundColor: colors.backgroundTertiary,
    borderWidth: 2,
    borderColor: colors.borderSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  photoPreviewText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  removeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
  },
  captureContainer: {
    gap: 16,
  },
  capturePlaceholder: {
    aspectRatio: 3 / 4,
    borderRadius: 24,
    backgroundColor: `${colors.backgroundTertiary}80`,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    padding: 32,
  },
  captureText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  captureSubtext: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  button: {
    marginTop: 0,
  },
  processingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 16,
  },
  processingIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${colors.purple500}33`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  processingSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  resultContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 16,
  },
  successIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: `${colors.green500}33`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  failedIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: `${colors.red500}33`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  resultSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  failedCard: {
    backgroundColor: `${colors.red500}33`,
    borderWidth: 1,
    borderColor: `${colors.red500}4d`,
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
  },
  failedText: {
    fontSize: 14,
    color: colors.red500,
    lineHeight: 20,
    textAlign: 'center',
  },
});

