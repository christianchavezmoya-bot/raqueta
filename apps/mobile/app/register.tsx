import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import api from '../src/lib/api';

export default function RegisterScreen() {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '', displayName: '', phone: '' });
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!form.email || !form.password || !form.displayName) {
      Alert.alert('Error', 'Completa todos los campos obligatorios');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/register', form);
      Alert.alert(
        '¡Cuenta creada!',
        'Revisa tu correo electrónico y haz clic en el enlace de verificación antes de iniciar sesión.',
        [{ text: 'Ir al login', onPress: () => router.replace('/login') }],
      );
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message ?? 'Error al registrarse');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.container}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <Text style={s.emoji}>🎾</Text>
          <Text style={s.title}>Crear cuenta</Text>
          <Text style={s.subtitle}>Únete a la comunidad Raqueta</Text>
        </View>

        <View style={s.form}>
          {[
            { key: 'displayName', label: 'Nombre completo *', placeholder: 'Juan Pérez' },
            { key: 'email', label: 'Email *', placeholder: 'juan@ejemplo.cl', keyboard: 'email-address' as const },
            { key: 'password', label: 'Contraseña *', placeholder: '••••••••', secure: true },
            { key: 'phone', label: 'Teléfono (opcional)', placeholder: '+56912345678' },
          ].map(({ key, label, placeholder, keyboard, secure }) => (
            <View key={key} style={s.inputGroup}>
              <Text style={s.label}>{label}</Text>
              <TextInput
                style={s.input}
                value={(form as any)[key]}
                onChangeText={v => setForm(f => ({ ...f, [key]: v }))}
                placeholder={placeholder}
                placeholderTextColor="#9ca3af"
                keyboardType={keyboard}
                secureTextEntry={secure}
                autoCapitalize={key === 'email' ? 'none' : 'words'}
                autoCorrect={false}
              />
            </View>
          ))}

          <View style={s.infoBox}>
            <Text style={s.infoText}>
              Recibirás un correo de verificación. Debes confirmar tu email antes de iniciar sesión.
            </Text>
          </View>

          <TouchableOpacity style={[s.button, loading && s.buttonDisabled]} onPress={handleRegister} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Crear cuenta</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()} style={s.link}>
            <Text style={s.linkText}>¿Ya tienes cuenta? <Text style={s.linkBold}>Inicia sesión</Text></Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#16a34a' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 28 },
  emoji: { fontSize: 48, marginBottom: 8 },
  title: { fontSize: 28, fontWeight: '800', color: '#fff' },
  subtitle: { fontSize: 15, color: '#bbf7d0', marginTop: 4 },
  form: { backgroundColor: '#fff', borderRadius: 24, padding: 24 },
  inputGroup: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 5 },
  input: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#111827',
  },
  infoBox: {
    backgroundColor: '#f0fdf4', borderRadius: 8, padding: 12, marginBottom: 14,
    borderWidth: 1, borderColor: '#bbf7d0',
  },
  infoText: { fontSize: 12, color: '#166534', lineHeight: 18 },
  button: {
    backgroundColor: '#16a34a', borderRadius: 10, paddingVertical: 14,
    alignItems: 'center', marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  link: { alignItems: 'center', marginTop: 18 },
  linkText: { fontSize: 14, color: '#6b7280' },
  linkBold: { fontWeight: '700', color: '#16a34a' },
});
