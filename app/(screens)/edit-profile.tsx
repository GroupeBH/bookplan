import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ImageWithFallback } from '../../components/ImageWithFallback';
import { useAuth } from '../../context/AuthContext';
import * as ImagePicker from 'expo-image-picker';

export default function EditProfileScreen() {
  const router = useRouter();
  const { user: authUser, updateUser, isLoading: authLoading } = useAuth();
  const [pseudo, setPseudo] = useState('');
  const [age, setAge] = useState('');
  const [description, setDescription] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [photo, setPhoto] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const prevAuthUserRef = React.useRef<User | null>(null);

  // Charger les données de l'utilisateur depuis authUser (qui vient de Supabase)
  // Ne charger qu'une seule fois au montage ou si les données importantes ont vraiment changé
  useEffect(() => {
    if (authUser) {
      // Si c'est la première initialisation, charger les données
      if (!isInitialized) {
        setPseudo(authUser.pseudo || '');
        setAge(authUser.age?.toString() || '');
        setDescription(authUser.description || '');
        setSpecialty(authUser.specialty || '');
        setPhoto(authUser.photo || '');
        setIsLoading(false);
        setIsInitialized(true);
        prevAuthUserRef.current = authUser;
      } else {
        // Si déjà initialisé, ne mettre à jour que si les données importantes ont changé
        // (pas la position qui change souvent)
        const prevUser = prevAuthUserRef.current;
        if (prevUser) {
          const hasImportantChange = 
            prevUser.pseudo !== authUser.pseudo ||
            prevUser.age !== authUser.age ||
            prevUser.description !== authUser.description ||
            prevUser.specialty !== authUser.specialty ||
            prevUser.photo !== authUser.photo;
          
          // Ne mettre à jour que si c'est un changement important (pas juste la position)
          if (hasImportantChange) {
            setPseudo(authUser.pseudo || '');
            setAge(authUser.age?.toString() || '');
            setDescription(authUser.description || '');
            setSpecialty(authUser.specialty || '');
            setPhoto(authUser.photo || '');
            prevAuthUserRef.current = authUser;
          }
        }
      }
    } else if (!authLoading && !authUser) {
      // Si pas d'utilisateur et pas en chargement, rediriger
      router.back();
    }
  }, [authUser, authLoading, isInitialized]);

  if (authLoading || isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.purple500} />
          <Text style={styles.loadingText}>Chargement...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!authUser) {
    return null;
  }

  const handleChangePhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission requise', 'Nous avons besoin de l\'accès à vos photos');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setPhoto(result.assets[0].uri);
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission requise', 'Nous avons besoin de l\'accès à votre caméra');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setPhoto(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!pseudo.trim()) {
      Alert.alert('Erreur', 'Le pseudonyme est requis');
      return;
    }

    if (!age || isNaN(Number(age)) || Number(age) < 18 || Number(age) > 100) {
      Alert.alert('Erreur', 'Veuillez entrer un âge valide (18-100 ans)');
      return;
    }

    if (!description.trim()) {
      Alert.alert('Erreur', 'La description est requise');
      return;
    }

    setIsSaving(true);
    try {
      // Mettre à jour le profil dans Supabase
      console.log('💾 Sauvegarde du profil avec:', {
        pseudo: pseudo.trim(),
        age: Number(age),
        description: description.trim(),
        photo: photo || authUser.photo,
      });

      const updateData = {
        pseudo: pseudo.trim(),
        age: Number(age),
        description: description.trim(),
        specialty: specialty.trim() || undefined,
        photo: photo || authUser.photo,
      };

      console.log('💾 edit-profile - Données à sauvegarder:', updateData);
      
      await updateUser(updateData);

      console.log('✅ edit-profile - Profil mis à jour avec succès');
      
      // Attendre un peu pour que les données soient bien synchronisées
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Vérifier que les données ont bien été mises à jour
      console.log('🔍 edit-profile - Vérification après mise à jour:', {
        authUserDescription: authUser?.description,
        authUserPseudo: authUser?.pseudo,
        authUserAge: authUser?.age,
      });
      
      Alert.alert('Succès', 'Profil modifié avec succès', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error('❌ Erreur lors de la sauvegarde:', error);
      Alert.alert('Erreur', 'Une erreur est survenue lors de la sauvegarde. Veuillez réessayer.');
    } finally {
      setIsSaving(false);
    }
  };

  const showPhotoOptions = () => {
    Alert.alert(
      'Changer la photo',
      'Choisissez une option',
      [
        { text: 'Prendre une photo', onPress: handleTakePhoto },
        { text: 'Choisir depuis la galerie', onPress: handleChangePhoto },
        { text: 'Annuler', style: 'cancel' },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Modifier le profil</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Photo Section */}
        <View style={styles.photoSection}>
          <View style={styles.avatarContainer}>
            <ImageWithFallback
              source={{ uri: photo || authUser.photo || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400' }}
              style={styles.avatar}
            />
            <TouchableOpacity style={styles.editPhotoButton} onPress={showPhotoOptions}>
              <Ionicons name="camera" size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={showPhotoOptions}>
            <Text style={styles.changePhotoText}>Changer la photo</Text>
          </TouchableOpacity>
        </View>

        {/* Form Fields */}
        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>Pseudonyme</Text>
            <Input
              placeholder="Votre pseudonyme"
              value={pseudo}
              onChangeText={setPseudo}
              containerStyle={styles.inputContainer}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Âge</Text>
            <Input
              placeholder="Votre âge"
              value={age}
              onChangeText={(text) => setAge(text.replace(/\D/g, ''))}
              keyboardType="number-pad"
              containerStyle={styles.inputContainer}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Description</Text>
            <Input
              placeholder="Parlez-nous de vous..."
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={6}
              style={styles.textArea}
              containerStyle={styles.inputContainer}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Savoir-faire particulier</Text>
            <Input
              placeholder="Ex: Avocat, Médecin, Ingénieur..."
              value={specialty}
              onChangeText={setSpecialty}
              containerStyle={styles.inputContainer}
              leftIcon={<Ionicons name="briefcase-outline" size={20} color={colors.textTertiary} />}
            />
          </View>

          {/* Info Section */}
          <View style={styles.infoCard}>
            <Ionicons name="information-circle-outline" size={20} color={colors.purple400} />
            <View style={styles.infoText}>
              <Text style={styles.infoTitle}>Informations importantes</Text>
              <Text style={styles.infoDescription}>
                Votre pseudonyme et votre description seront visibles par tous les utilisateurs. 
                Assurez-vous que ces informations sont appropriées.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Save Button */}
      <View style={styles.footer}>
        <Button
          title={isSaving ? "Enregistrement..." : "Enregistrer les modifications"}
          onPress={handleSave}
          disabled={isSaving}
          loading={isSaving}
          icon={<Ionicons name="checkmark" size={20} color="#ffffff" />}
          style={styles.saveButton}
        />
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    gap: 24,
  },
  photoSection: {
    alignItems: 'center',
    gap: 16,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 128,
    height: 128,
    borderRadius: 24,
    borderWidth: 4,
    borderColor: `${colors.purple500}4d`,
  },
  editPhotoButton: {
    position: 'absolute',
    bottom: -8,
    right: -8,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.purple600,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  changePhotoText: {
    fontSize: 16,
    color: colors.purple400,
    fontWeight: '500',
  },
  form: {
    gap: 20,
  },
  field: {
    gap: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  inputContainer: {
    marginBottom: 0,
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: 'top',
    paddingTop: 16,
  },
  infoCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: `${colors.purple500}33`,
    borderWidth: 1,
    borderColor: `${colors.purple500}4d`,
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
  },
  infoText: {
    flex: 1,
    gap: 4,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.purple400,
  },
  infoDescription: {
    fontSize: 12,
    color: colors.purple400,
    opacity: 0.8,
    lineHeight: 18,
  },
  footer: {
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: colors.borderSecondary,
    backgroundColor: colors.background,
  },
  saveButton: {
    marginTop: 0,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
});

