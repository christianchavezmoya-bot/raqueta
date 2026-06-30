// Dynamic config — replaces app.json so secrets can be injected via env vars.
// Read at build time (expo run:android / eas build), not bundled into JS.
// GOOGLE_MAPS_ANDROID_KEY is a build-time-only variable, not EXPO_PUBLIC_.

/** @type {import('expo/config').ExpoConfig} */
const config = {
  name: 'n-go',
  slug: 'n-go',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#1b4a86',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'app.ngo',
    infoPlist: {
      NSLocalNetworkUsageDescription:
        'N-Go usa tu red local para conectarse a la API de desarrollo mientras pruebas la app en este iPhone.',
      NSLocationWhenInUseUsageDescription:
        'Usamos tu ubicación solo mientras activas Disponible para partidos y para encontrar jugadores cercanos.',
      NSLocationTemporaryUsageDescriptionDictionary: {
        'player-matchmaking':
          'Tu ubicación se usa temporalmente para mostrar rivales dentro de 1 km mientras eliges jugar.',
      },
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#1b4a86',
    },
    package: 'app.ngo',
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'],
    config: {
      googleMaps: {
        // Set GOOGLE_MAPS_ANDROID_KEY in apps/mobile/.env (or shell env at build time).
        // Restrict the key in Google Cloud Console to package name "app.ngo"
        // + your release SHA-1 fingerprint so it can't be freely reused if extracted.
        apiKey: process.env.GOOGLE_MAPS_ANDROID_KEY ?? '',
      },
    },
  },
  web: {
    favicon: './assets/favicon.png',
  },
  scheme: 'ngo',
  plugins: ['expo-router'],
};

module.exports = config;
