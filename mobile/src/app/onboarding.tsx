/**
 * Server onboarding: point the app at a self-hosted Travel Life server and
 * sign in — by QR pairing, single sign-on, or email and password.
 */
import * as ExpoCrypto from 'expo-crypto';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';

import { AppText, Banner, Button, Card, Field, Screen } from '@/components/ui';
import { normalizeServerUrl } from '@/lib/apiClient';
import { checkServer, useSession } from '@/lib/session';
import { syncNow } from '@/lib/sync';

/** Must match `MOBILE_OIDC_REDIRECT` in the backend's oidc.controller.ts. */
const OIDC_REDIRECT = 'travellife://auth/oidc';

interface ServerInfo {
  url: string;
  oidcEnabled: boolean;
  oidcButtonText: string;
  passwordLoginDisabled: boolean;
}

const messageOf = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

export default function OnboardingScreen() {
  const [serverUrl, setServerUrl] = useState('');
  const [server, setServer] = useState<ServerInfo | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (caught) {
      setError(messageOf(caught, 'Something went wrong'));
    } finally {
      setBusy(false);
    }
  };

  const connect = () =>
    run(async () => {
      if (!serverUrl.trim()) throw new Error('Enter your server address');
      const url = normalizeServerUrl(serverUrl);
      try {
        const info = await checkServer(url);
        setServer({ url, ...info });
      } catch (caught) {
        throw new Error(
          `Could not reach a Travel Life server at ${url.replace(/\/api$/, '')}. ${messageOf(caught, '')}`.trim()
        );
      }
    });

  const signIn = () =>
    run(async () => {
      if (!server) return;
      await useSession.getState().signInWithPassword(server.url, email.trim(), password);
      void syncNow();
    });

  const signInWithSso = () =>
    run(async () => {
      if (!server) return;
      // The provider round trip happens in a system browser session. The
      // server then shows a confirmation page there, and only once the user
      // taps Continue does it redirect to the app scheme with a one-time code.
      //
      // The code comes back over a custom URL scheme that another installed app
      // could also claim, so it is bound to this app: a random verifier stays
      // here, only its SHA-256 goes out, and the server will not redeem the
      // code without the verifier.
      const codeVerifier = Array.from(ExpoCrypto.getRandomBytes(32), (byte) =>
        byte.toString(16).padStart(2, '0')
      ).join('');
      const challenge = await ExpoCrypto.digestStringAsync(
        ExpoCrypto.CryptoDigestAlgorithm.SHA256,
        codeVerifier
      );
      const result = await WebBrowser.openAuthSessionAsync(
        `${server.url}/auth/oidc/login?client=mobile&code_challenge=${challenge}`,
        OIDC_REDIRECT
      );
      if (result.type !== 'success') return;
      const params = new URL(result.url).searchParams;
      // Cancel on the confirmation page: treat it like closing the browser.
      if (params.get('error') === 'cancelled') return;
      const code = params.get('code');
      if (!code) throw new Error('Single sign-on did not complete. Please try again.');
      await useSession.getState().signInWithOidcCode(server.url, code, codeVerifier);
      void syncNow();
    });

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <AppText variant="title">Travel Life</AppText>
        <AppText muted>Your trip, in your pocket — even with no signal.</AppText>

        {error ? <Banner text={error} tone="danger" /> : null}

        <Card>
          <AppText variant="heading">Fastest: scan a pairing code</AppText>
          <AppText muted>
            In the web app open Settings → Integrations → Mobile App and choose Pair Mobile App.
          </AppText>
          <Button label="Scan QR code" onPress={() => router.push('/scan')} disabled={busy} />
        </Card>

        <Card>
          <AppText variant="heading">Or connect manually</AppText>
          <Field
            label="Server address"
            placeholder="travel.example.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            value={serverUrl}
            onChangeText={(text) => {
              setServerUrl(text);
              setServer(null);
            }}
            onSubmitEditing={connect}
          />
          {!server ? (
            <Button label="Connect" variant="secondary" onPress={connect} loading={busy} />
          ) : (
            <>
              <AppText variant="caption" muted>
                Connected to {server.url.replace(/\/api$/, '')}
              </AppText>
              {server.oidcEnabled ? (
                <Button label={server.oidcButtonText} onPress={signInWithSso} loading={busy} />
              ) : null}
              {!server.passwordLoginDisabled ? (
                <>
                  <Field
                    label="Email"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    textContentType="username"
                    value={email}
                    onChangeText={setEmail}
                  />
                  <Field
                    label="Password"
                    secureTextEntry
                    textContentType="password"
                    value={password}
                    onChangeText={setPassword}
                    onSubmitEditing={signIn}
                  />
                  <Button
                    label="Sign in"
                    variant={server.oidcEnabled ? 'secondary' : 'primary'}
                    onPress={signIn}
                    loading={busy}
                    disabled={!email || !password}
                  />
                </>
              ) : null}
            </>
          )}
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}
