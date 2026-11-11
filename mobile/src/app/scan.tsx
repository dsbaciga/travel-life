/**
 * QR pairing scanner: one scan configures the server URL and signs in.
 */
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Banner, Button, Screen } from '@/components/ui';
import { useSession } from '@/lib/session';
import { syncNow } from '@/lib/sync';
import { spacing } from '@/lib/theme';

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The camera fires for every frame the code is visible; a pairing token is
  // single-use, so only the first read may be sent.
  const handled = useRef(false);

  const onScanned = async (data: string) => {
    if (handled.current) return;
    handled.current = true;
    setBusy(true);
    setError(null);
    try {
      await useSession.getState().signInWithPairingPayload(data);
      void syncNow();
      // The auth guard swaps the stack to the signed-in screens.
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Pairing failed');
      setBusy(false);
      handled.current = false;
    }
  };

  if (!permission) return <Screen>{null}</Screen>;

  if (!permission.granted) {
    return (
      <Screen>
        <AppText variant="heading">Camera access is needed to scan the code</AppText>
        <AppText muted>The camera is only used on this screen, to read the pairing QR code.</AppText>
        <Button label="Allow camera" onPress={() => void requestPermission()} />
        <Button label="Enter details manually" variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={busy ? undefined : ({ data }) => void onScanned(data)}
      />
      <View style={styles.overlay}>
        {error ? <Banner text={error} tone="danger" /> : null}
        <AppText color="#ffffff" style={styles.hint}>
          {busy ? 'Pairing…' : 'Point the camera at the code shown in Settings → Mobile App'}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  overlay: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.xl, gap: spacing.md },
  hint: { textAlign: 'center' },
});
