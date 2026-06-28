import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../src/stores/auth.store';
import api from '../src/lib/api';

export default function LoginScreen() {
  const router = useRouter();
  const { login, verify2FA } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [step, setStep] = useState<'credentials' | '2fa'>('credentials');
  const [loading, setLoading] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [probeLoading, setProbeLoading] = useState(false);
  const [debugLines, setDebugLines] = useState<string[]>([
    `API: ${api.defaults.baseURL ?? 'N/A'}`,
    'Estado: sin intentos',
  ]);

  const setDebug = (lines: string[]) => {
    setDebugLines([
      `API: ${api.defaults.baseURL ?? 'N/A'}`,
      ...lines,
    ]);
  };

  const describeError = (err: any) => {
    const responseMessage = Array.isArray(err?.response?.data?.message)
      ? err.response.data.message.join(' | ')
      : err?.response?.data?.message;

    return [
      `Hora: ${new Date().toLocaleTimeString()}`,
      `HTTP: ${err?.response?.status ?? 'sin respuesta'}`,
      `Code: ${err?.code ?? 'N/A'}`,
      `Axios: ${err?.message ?? 'N/A'}`,
      `Server: ${responseMessage ?? 'N/A'}`,
    ];
  };

  const handleLogin = async () => {
    if (!email || !password) return;
    setLoading(true);
    setDebug([
      `Hora: ${new Date().toLocaleTimeString()}`,
      `Intento login: ${email}`,
      'Estado: enviando credenciales...',
    ]);
    try {
      const { twoFactorRequired } = await login(email, password);
      setDebug([
        `Hora: ${new Date().toLocaleTimeString()}`,
        `Login OK: ${email}`,
        `2FA: ${twoFactorRequired ? 'requerido' : 'no'}`,
      ]);
      if (twoFactorRequired) {
        setStep('2fa');
      } else {
        router.replace('/(tabs)');
      }
    } catch (err: any) {
      const serverMessage = err.response?.data?.message;
      setDebug(describeError(err));
      if (serverMessage) {
        Alert.alert('Error', serverMessage);
      } else {
        Alert.alert(
          'Sin conexión con el servidor',
          'La app no pudo llegar a la API local. Verifica que el iPhone y esta Mac estén en la misma red Wi-Fi y vuelve a abrir la app.',
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleProbeApi = async () => {
    setProbeLoading(true);
    setDebug([
      `Hora: ${new Date().toLocaleTimeString()}`,
      'Probe API: ejecutando...',
    ]);
    try {
      const { data, status } = await api.get('/clubs?limit=1');
      setDebug([
        `Hora: ${new Date().toLocaleTimeString()}`,
        `Probe API OK`,
        `HTTP: ${status}`,
        `Clubs devueltos: ${data?.data?.length ?? 0}`,
      ]);
    } catch (err: any) {
      setDebug(describeError(err));
      Alert.alert('Probe API falló', err?.response?.data?.message ?? err?.message ?? 'Error desconocido');
    } finally {
      setProbeLoading(false);
    }
  };

  const handleVerify2FA = async () => {
    if (otpCode.length !== 6) return;
    setLoading(true);
    try {
      await verify2FA(otpCode);
      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert('Código inválido', err.response?.data?.message ?? 'Código incorrecto o expirado');
      setOtpCode('');
    } finally {
      setLoading(false);
    }
  };

  if (step === '2fa') {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.emoji}>🔑</Text>
            <Text style={styles.title}>Verificación</Text>
            <Text style={styles.subtitle}>Ingresa el código enviado a tu email</Text>
          </View>
          <View style={styles.form}>
            <Text style={styles.formTitle}>Código de verificación</Text>
            <Text style={styles.otpHint}>
              Revisá tu correo. El código tiene 6 dígitos y expira en 10 minutos.
            </Text>
            <View style={styles.inputGroup}>
              <TextInput
                style={[styles.input, styles.otpInput]}
                value={otpCode}
                onChangeText={t => setOtpCode(t.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                placeholderTextColor="#9ca3af"
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
              />
            </View>
            <TouchableOpacity
              style={[styles.button, (loading || otpCode.length !== 6) && styles.buttonDisabled]}
              onPress={handleVerify2FA}
              disabled={loading || otpCode.length !== 6}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verificar</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setStep('credentials'); setOtpCode(''); }} style={styles.registerLink}>
              <Text style={styles.registerText}>← Volver al inicio de sesión</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.emoji}>🎾</Text>
          <Text style={styles.title}>N-Go</Text>
          <Text style={styles.subtitle}>Tu comunidad de tenis</Text>
        </View>

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
            <View style={styles.passwordWrap}>
              <TextInput
                style={styles.passwordInput}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor="#9ca3af"
                secureTextEntry={!passwordVisible}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                onPress={() => setPasswordVisible(v => !v)}
                style={styles.eyeButton}
                hitSlop={10}
              >
                <Ionicons
                  name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color="#6b7280"
                />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Ingresar</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryButton, probeLoading && styles.buttonDisabled]}
            onPress={handleProbeApi}
            disabled={probeLoading}
          >
            {probeLoading
              ? <ActivityIndicator color="#1b4a86" />
              : <Text style={styles.secondaryButtonText}>Probar conexión API</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push('/register')} style={styles.registerLink}>
            <Text style={styles.registerText}>¿No tienes cuenta? <Text style={styles.registerTextBold}>Regístrate</Text></Text>
          </TouchableOpacity>
        </View>

        <View style={styles.demo}>
          <Text style={styles.demoTitle}>Cuentas de prueba:</Text>
          <Text style={styles.demoText}>juan.perez@gmail.com / Player123!</Text>
          <Text style={styles.demoText}>carlos.silva@gmail.com / Player123!</Text>
        </View>

        <View style={styles.debugCard}>
          <Text style={styles.debugTitle}>Debug login</Text>
          {debugLines.map((line, index) => (
            <Text key={`${index}-${line}`} style={styles.debugText}>{line}</Text>
          ))}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1b4a86' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 32 },
  emoji: { fontSize: 56, marginBottom: 8 },
  title: { fontSize: 32, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  subtitle: { fontSize: 16, color: '#93b9e8', marginTop: 4 },
  form: {
    backgroundColor: '#fff', borderRadius: 24, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 16, elevation: 8,
  },
  formTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 20 },
  otpHint: { fontSize: 13, color: '#6b7280', marginBottom: 16 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#111827', backgroundColor: '#fff',
  },
  passwordWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
  },
  eyeButton: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  otpInput: { textAlign: 'center', fontSize: 28, fontWeight: '800', letterSpacing: 10 },
  button: {
    backgroundColor: '#1b4a86', borderRadius: 10, paddingVertical: 14,
    alignItems: 'center', marginTop: 8,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#1b4a86',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
    backgroundColor: '#eff6ff',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryButtonText: { color: '#1b4a86', fontSize: 15, fontWeight: '700' },
  registerLink: { alignItems: 'center', marginTop: 20 },
  registerText: { fontSize: 14, color: '#6b7280' },
  registerTextBold: { fontWeight: '700', color: '#1b4a86' },
  demo: {
    marginTop: 24, backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12, padding: 16,
  },
  demoTitle: { fontSize: 13, fontWeight: '600', color: '#fff', marginBottom: 6 },
  demoText: { fontSize: 12, color: '#93b9e8', marginBottom: 2 },
  debugCard: {
    marginTop: 16,
    backgroundColor: 'rgba(7, 15, 28, 0.48)',
    borderRadius: 12,
    padding: 16,
  },
  debugTitle: { fontSize: 13, fontWeight: '700', color: '#fff', marginBottom: 8 },
  debugText: { fontSize: 12, color: '#cbd5e1', marginBottom: 4 },
});
