import axios from '../lib/axios';

export interface MobilePairingToken {
  /** Single-use secret the phone redeems for its own session. */
  pairingToken: string;
  /** ISO instant after which the token is refused. */
  expiresAt: string;
  /** Public origin of the API as configured on the server (BASE_URL). */
  serverUrl: string;
}

export const mobilePairingService = {
  /** Mint a five-minute, single-use token for pairing the mobile companion app. */
  async createPairingToken(): Promise<MobilePairingToken> {
    const response = await axios.post<MobilePairingToken>('/auth/mobile/pairing-token');
    return response.data;
  },
};

export default mobilePairingService;
