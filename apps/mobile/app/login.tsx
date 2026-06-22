import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../src/stores/auth.store';

export default function LoginScreen() {
  const router = useRouter();
  const login = useAuthStore(s => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) return;
    setLoading(true);
    try {
      await login(email, password);
      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message ?? 'Credenciales inválidas');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Logo */}
        <View style={styles.header}>
          <Text style={styles.emoji}>🎾</Text>
          <Text style={styles.title}>Raqueta</Text>
          <Text style={styles.subtitle}>Tu comunidad de tenis</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Text style={styles.formTitle}>Iniciar sesión</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="juan@ejemplo.cl"
              placeholderTextColor="#9ca3af"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Contraseña</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor="#9ca3af"
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Ingresar</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push('/register')} style={styles.registerLink}>
            <Text style={styles.registerText}>¿No tienes cuenta? <Text style={styles.registerTextBold}>Regístrate</Text></Text>
          </TouchableOpacity>
        </View>

        {/* Demo */}
        <View style={styles.demo}>
          <Text style={styles.demoTitle}>Cuentas de prueba:</Text>
          <Text style={styles.demoText}>juan.perez@gmail.com / Player123!</Text>
          <Text style={styles.demoText}>carlos.silva@gmail.com / Player123!</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#16a34a' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 32 },
  emoji: { fontSize: 56, marginBottom: 8 },
  title: { fontSize: 32, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  subtitle: { fontSize: 16, color: '#bbf7d0', marginTop: 4 },
  form: {
    backgroundColor: '#fff', borderRadius: 24, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 16, elevation: 8,
  },
  formTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 20 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#111827', backgroundColor: '#fff',
  },
  button: {
    backgroundColor: '#16a34a', borderRadius: 10, paddingVertical: 14,
    alignItems: 'center', marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  registerLink: { alignItems: 'center', marginTop: 20 },
  registerText: { fontSize: 14, color: '#6b7280' },
  registerTextBold: { fontWeight: '700', color: '#16a34a' },
  demo: {
    marginTop: 24, backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12, padding: 16,
  },
  demoTitle: { fontSize: 13, fontWeight: '600', color: '#fff', marginBottom: 6 },
  demoText: { fontSize: 12, color: '#dcfce7', marginBottom: 2 },
});
