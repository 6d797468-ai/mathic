import type { CapacitorConfig } from '@capacitor/cli';

// Wrapper natif MATHIC (Phase 4). Le plein écran immersif et le
// verrouillage portrait sont ancrés au niveau NATIF (AndroidManifest.xml :
// android:screenOrientation="portrait" ; MainActivity.java : barres système
// masquées en continu) — plus robuste qu'une clé config, Capacitor n'ayant
// pas de réglage standard « fullScreen ».
const config: CapacitorConfig = {
  appId: 'com.mathic.game',
  appName: 'MATHIC',
  webDir: 'dist',
};

export default config;