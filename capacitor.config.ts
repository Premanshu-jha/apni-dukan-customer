import type { CapacitorConfig } from '@capacitor/cli'

/**
 * The Play Store app: this same website inside an Android app (Capacitor). `npm run android` builds the website for
 * the app (APP_BUILD=true, see vite.config.ts) and copies it into android/. Behaviour that differs between the app
 * and the website asks isApp() (src/lib/platform.ts).
 */
const config: CapacitorConfig = {
  appId: 'com.clozest.customer',
  appName: 'Clozest',
  webDir: 'dist',
  // Marks the app's web view (src/lib/platform.ts appShellWithoutBridge): on a phone whose Android System WebView is
  // too old for Capacitor's start-up, the page knows it is the app and asks for that update, instead of running as
  // the website
  appendUserAgent: 'ClozestAndroidApp',
  server: {
    // The app's pages load from its own files under the website's own address, so the backend's CORS list and the
    // Turnstile widget see clozest.in, as on the website (the backend refuses "localhost" in production). A link to
    // clozest.in (a salon's page) inside the app stays in the app.
    hostname: 'clozest.in',
    androidScheme: 'https',
  },
  android: {
    // The app's dark background behind the system bars and while it starts
    backgroundColor: '#0b0f26',
  },
  plugins: {
    SystemBars: {
      // Light icons on the dark bars; the app is kept below the status bar (index.html has no viewport-fit=cover in
      // the app's build)
      style: 'DARK',
      insetsHandling: 'css',
    },
    PushNotifications: {
      // Android shows a message itself only while the app is in the background; open, the app refreshes instead
      presentationOptions: [],
    },
  },
}

export default config
