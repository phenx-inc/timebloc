import { 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  AuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  User,
  UserCredential 
} from 'firebase/auth';
import { auth, googleProvider, microsoftProvider } from './firebase';

export interface CalendarProvider {
  id: string;
  name: string;
  icon: string;
  provider: AuthProvider;
}

export interface CalendarConnection {
  id: string;
  provider: string;
  email: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  connectedAt: number;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  isAllDay: boolean;
  description?: string;
  location?: string;
  provider: string;
}

export const calendarProviders: CalendarProvider[] = [
  {
    id: 'google',
    name: 'Google Calendar',
    icon: '📅',
    provider: googleProvider
  },
  {
    id: 'microsoft',
    name: 'Microsoft Outlook',
    icon: '📮',
    provider: microsoftProvider
  }
];

class CalendarService {
  private connections: Map<string, CalendarConnection> = new Map();
  private isInitialized = false;

  async initialize() {
    if (this.isInitialized) return;
    
    console.log('🔥 Initializing calendar service...');
    
    // Check for any pending redirect results
    try {
      console.log('🔥 Checking for redirect result...');
      const result = await getRedirectResult(auth);
      if (result) {
        console.log('🔥 Found redirect result! Processing...', result.user?.email);
        const connection = await this.processAuthResult(result);
        console.log('🔥 Redirect result processed successfully:', connection.email);
        
        // Notify user that connection was successful
        if (typeof window !== 'undefined') {
          setTimeout(() => {
            alert(`Successfully connected ${connection.provider} calendar for ${connection.email}!`);
          }, 1000);
        }
      } else {
        console.log('🔥 No redirect result found');
      }
    } catch (error) {
      console.error('🔥 Error processing redirect result:', error);
    }
    
    // Load connections from backend
    await this.loadConnections();
    this.isInitialized = true;
    console.log('🔥 Calendar service initialization complete');
  }

  async connectProvider(providerId: string): Promise<CalendarConnection> {
    const providerConfig = calendarProviders.find(p => p.id === providerId);
    if (!providerConfig) {
      throw new Error(`Provider ${providerId} not supported`);
    }

    try {
      // Try popup first, fallback to redirect if blocked
      let result: UserCredential | null = null;
      
      try {
        console.log('🔥 Attempting authentication for:', providerId);
        
        // Check if we're in Tauri environment
        if (typeof window !== 'undefined' && '__TAURI__' in window) {
          console.log('🔥 Detected Tauri environment, using web-based auth');
          
          try {
            const { open } = await import('@tauri-apps/api/shell');
            
            // Open the web-based auth page with provider parameter
            const authUrl = `https://www.phenx.io/timebloc?provider=${providerId}`;
            console.log('🔥 Opening web auth page in system browser:', authUrl);
            
            // Open returns a promise, await it to ensure it completes
            await open(authUrl);
            console.log('🔥 Browser should have opened with auth page');
            
            // Give browser a moment to open
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Signal that we need token input
            throw new Error(`AUTH_TOKEN_NEEDED:${providerId}`);
          } catch (openError) {
            console.error('🔥 Failed to open browser:', openError);
            // If opening fails, still show token input
            if (openError instanceof Error && !openError.message.includes('AUTH_TOKEN_NEEDED')) {
              console.error('Browser open failed, but continuing with token input flow');
            }
            throw new Error(`AUTH_TOKEN_NEEDED:${providerId}`);
          }
        } else {
          // Regular web environment - use popup
          result = await signInWithPopup(auth, providerConfig.provider);
          console.log('🔥 Popup authentication successful:', result);
        }
      } catch (popupError: unknown) {
        console.log('🔥 Popup/redirect error:', popupError);
        
        const errorCode = popupError && typeof popupError === 'object' && 'code' in popupError ? popupError.code : '';
        const errorMessage = popupError instanceof Error ? popupError.message : String(popupError);
        
        if (errorCode === 'auth/popup-blocked' || 
            errorCode === 'auth/popup-closed-by-user' ||
            errorMessage?.includes('popup')) {
          
          // Check if we're in a Tauri environment
          if (typeof window !== 'undefined' && '__TAURI__' in window) {
            try {
              // Fallback to redirect in Tauri
              console.log('Attempting redirect authentication for:', providerId);
              await signInWithRedirect(auth, providerConfig.provider);
              throw new Error('Redirect initiated. Please wait for the authentication to complete.');
            } catch (redirectError) {
              console.error('Redirect error:', redirectError);
              throw new Error(`Authentication failed. Please try again. Error: ${redirectError}`);
            }
          } else {
            // In web environment, try redirect
            console.log('Attempting redirect authentication for:', providerId);
            await signInWithRedirect(auth, providerConfig.provider);
            throw new Error('Redirect initiated. The page will reload after authentication.');
          }
        }
        throw popupError;
      }
      
      console.log('🔥 About to call processAuthResult with:', !!result);
      const connection = await this.processAuthResult(result);
      console.log('🔥 processAuthResult completed, connection created:', !!connection);
      return connection;
      
    } catch (error: unknown) {
      console.error('Failed to connect provider:', error);
      throw error;
    }
  }

  private async processAuthResult(result: UserCredential): Promise<CalendarConnection> {
    console.log('🔥 processAuthResult called with result:', !!result);
    if (!result || !result.user) {
      throw new Error('Authentication failed - no result received');
    }
    
    const user = result.user;
    console.log('🔥 User from auth result:', user.uid, user.email, user.providerData);
    const providerId = this.getProviderIdFromUser(user);
    
    console.log('🔥 Processing auth result for provider:', providerId, 'user:', user.email);
    
    // Get access token
    let accessToken = '';
    let refreshToken: string | undefined;
    
    try {
      if (providerId === 'google') {
        const credential = GoogleAuthProvider.credentialFromResult(result);
        accessToken = credential?.accessToken || '';
        console.log('Google credential extracted, has access token:', !!accessToken);
      } else if (providerId === 'microsoft') {
        const credential = OAuthProvider.credentialFromResult(result);
        accessToken = credential?.accessToken || '';
        console.log('Microsoft credential extracted, has access token:', !!accessToken);
      }
      
      // Fallback: try to get token from user
      if (!accessToken) {
        console.log('No access token from credential, trying user.getIdToken()');
        try {
          accessToken = await user.getIdToken();
          console.log('Got ID token from user:', !!accessToken);
        } catch (tokenError) {
          console.error('Failed to get ID token:', tokenError);
        }
      }
    } catch (credError) {
      console.error('Error extracting credentials:', credError);
    }

    if (!accessToken) {
      throw new Error('Failed to get access token from authentication result');
    }

    // Create connection
    const connection: CalendarConnection = {
      id: `${providerId}-${user.uid}`,
      provider: providerId,
      email: user.email || '',
      accessToken,
      refreshToken,
      expiresAt: Date.now() + 3600 * 1000, // 1 hour from now
      connectedAt: Date.now()
    };

    console.log('Created connection:', { ...connection, accessToken: '***' });

    // Store connection
    this.connections.set(connection.id, connection);

    // Save to backend
    await this.saveConnectionToBackend(connection);

    return connection;
  }

  private getProviderIdFromUser(user: User): string {
    // Try to determine provider from user's providerData
    for (const provider of user.providerData) {
      if (provider.providerId === 'google.com') {
        return 'google';
      } else if (provider.providerId === 'microsoft.com') {
        return 'microsoft';
      }
    }
    
    // Fallback: check the first provider
    if (user.providerData.length > 0) {
      const firstProvider = user.providerData[0];
      if (firstProvider.providerId.includes('google')) {
        return 'google';
      } else if (firstProvider.providerId.includes('microsoft')) {
        return 'microsoft';
      }
    }
    
    throw new Error('Could not determine provider from user data');
  }

  async loadConnections(): Promise<void> {
    try {
      const { invoke } = await import('@tauri-apps/api/tauri');
      const backendConnections = await invoke('get_calendar_connections') as Array<{
        id: string;
        provider: string;
        account_name: string;
        access_token: string;
        refresh_token: string | null;
        expires_at: number;
        connected_at: number;
      }>;
      
      console.log('Loaded connections from backend:', backendConnections.length);
      
      this.connections.clear();
      for (const conn of backendConnections) {
        const connection: CalendarConnection = {
          id: conn.id?.toString() || `${conn.provider}-${Date.now()}`,
          provider: conn.provider,
          email: conn.account_name,
          accessToken: conn.access_token,
          refreshToken: conn.refresh_token || undefined,
          expiresAt: conn.expires_at || Date.now() + 3600 * 1000,
          connectedAt: conn.connected_at || Date.now()
        };
        
        this.connections.set(connection.id, connection);
      }
    } catch (error) {
      console.warn('Failed to load connections from backend:', error);
    }
  }

  async saveConnectionToBackend(connection: CalendarConnection): Promise<void> {
    try {
      const { invoke } = await import('@tauri-apps/api/tauri');
      
      console.log('🔥 Saving connection to backend:', { ...connection, accessToken: '***' });
      console.log('🔥 Connection details:', {
        id: connection.id,
        provider: connection.provider,
        email: connection.email,
        hasAccessToken: !!connection.accessToken,
        tokenLength: connection.accessToken.length,
        expiresAt: new Date(connection.expiresAt),
        connectedAt: new Date(connection.connectedAt)
      });
      
      const result = await invoke('save_firebase_calendar_connection', {
        connection: {
          id: connection.id,
          provider: connection.provider,
          account_name: connection.email,
          access_token: connection.accessToken,
          refresh_token: connection.refreshToken,
          expires_at: connection.expiresAt,
          connected_at: connection.connectedAt
        }
      });
      
      console.log('🔥 Connection saved successfully, result:', result);
    } catch (error) {
      console.error('🔥 Failed to save connection to backend:', error);
      throw error;
    }
  }

  async fetchGoogleCalendarEvents(connection: CalendarConnection, startDate: Date, endDate: Date): Promise<CalendarEvent[]> {
    console.log('🔥 Fetching Google Calendar events...');
    console.log('🔥 Connection:', connection.email, 'Token length:', connection.accessToken.length);
    console.log('🔥 Date range:', startDate.toISOString(), 'to', endDate.toISOString());
    
    try {
      // Check if token is expired
      if (connection.expiresAt && Date.now() > connection.expiresAt) {
        console.log('🔥 Google access token expired, attempting refresh');
        const refreshedConnection = await this.refreshToken(connection);
        if (refreshedConnection) {
          connection = refreshedConnection;
        }
      }
      
      const timeMin = startDate.toISOString();
      const timeMax = endDate.toISOString();
      
      const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`;
      console.log('🔥 Google Calendar API URL:', url);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${connection.accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      
      console.log('🔥 Google Calendar API response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Google Calendar API error: ${response.status}`, errorText);
        
        if (response.status === 401) {
          // Token is invalid, try to refresh
          console.log('Google API returned 401, attempting token refresh');
          const refreshedConnection = await this.refreshToken(connection);
          if (refreshedConnection) {
            // Retry with refreshed token
            return this.fetchGoogleCalendarEvents(refreshedConnection, startDate, endDate);
          }
        }
        
        throw new Error(`Google Calendar API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.items || !Array.isArray(data.items)) {
        console.warn('No items in Google Calendar response:', data);
        return [];
      }
      
      return data.items.map((item: {
        id: string;
        summary?: string;
        start: { dateTime?: string; date?: string };
        end: { dateTime?: string; date?: string };
        description?: string;
        location?: string;
      }) => ({
        id: item.id,
        title: item.summary || '(No title)',
        start: new Date(item.start.dateTime || item.start.date || ''),
        end: new Date(item.end.dateTime || item.end.date || ''),
        isAllDay: !!item.start.date,
        description: item.description,
        location: item.location,
        provider: 'google'
      }));
    } catch (error) {
      console.error('Failed to fetch Google calendar events:', error);
      // Remove connection if authentication failed permanently
      if (error instanceof Error && error.message.includes('401')) {
        console.log('Removing invalid Google connection:', connection.id);
        this.removeConnection(connection.id);
      }
      return [];
    }
  }

  async fetchMicrosoftCalendarEvents(connection: CalendarConnection, startDate: Date, endDate: Date): Promise<CalendarEvent[]> {
    try {
      // Check if token is expired
      if (connection.expiresAt && Date.now() > connection.expiresAt) {
        console.log('Microsoft access token expired, attempting refresh');
        const refreshedConnection = await this.refreshToken(connection);
        if (refreshedConnection) {
          connection = refreshedConnection;
        }
      }
      
      const startTime = startDate.toISOString();
      const endTime = endDate.toISOString();
      
      const response = await fetch(
        `https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${startTime}&endDateTime=${endTime}`,
        {
          headers: {
            'Authorization': `Bearer ${connection.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Microsoft Graph API error: ${response.status}`, errorText);
        
        if (response.status === 401) {
          // Token is invalid, try to refresh
          console.log('Microsoft API returned 401, attempting token refresh');
          const refreshedConnection = await this.refreshToken(connection);
          if (refreshedConnection) {
            // Retry with refreshed token
            return this.fetchMicrosoftCalendarEvents(refreshedConnection, startDate, endDate);
          }
        }
        
        throw new Error(`Microsoft Graph API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.value || !Array.isArray(data.value)) {
        console.warn('No value in Microsoft Calendar response:', data);
        return [];
      }
      
      return data.value.map((item: {
        id: string;
        subject?: string;
        start: { dateTime: string };
        end: { dateTime: string };
        isAllDay: boolean;
        bodyPreview?: string;
        location?: { displayName?: string };
      }) => ({
        id: item.id,
        title: item.subject || '(No title)',
        start: new Date(item.start.dateTime),
        end: new Date(item.end.dateTime),
        isAllDay: item.isAllDay,
        description: item.bodyPreview,
        location: item.location?.displayName,
        provider: 'microsoft'
      }));
    } catch (error) {
      console.error('Failed to fetch Microsoft calendar events:', error);
      // Remove connection if authentication failed permanently
      if (error instanceof Error && error.message.includes('401')) {
        console.log('Removing invalid Microsoft connection:', connection.id);
        this.removeConnection(connection.id);
      }
      return [];
    }
  }

  async getAllCalendarEvents(startDate: Date, endDate: Date): Promise<CalendarEvent[]> {
    console.log('🔥 Getting all calendar events for date range:', startDate, 'to', endDate);
    console.log('🔥 Available connections:', this.connections.size);
    
    const allEvents: CalendarEvent[] = [];
    
    for (const connection of this.connections.values()) {
      console.log('🔥 Processing connection:', connection.provider, connection.email);
      try {
        let events: CalendarEvent[] = [];
        
        if (connection.provider === 'google') {
          events = await this.fetchGoogleCalendarEvents(connection, startDate, endDate);
        } else if (connection.provider === 'microsoft') {
          events = await this.fetchMicrosoftCalendarEvents(connection, startDate, endDate);
        }
        
        console.log(`🔥 Fetched ${events.length} events from ${connection.provider}`);
        allEvents.push(...events);
      } catch (error) {
        console.error(`🔥 Failed to fetch events from ${connection.provider}:`, error);
      }
    }
    
    console.log(`🔥 Total events fetched: ${allEvents.length}`);
    return allEvents.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  getConnections(): CalendarConnection[] {
    return Array.from(this.connections.values());
  }

  async refreshToken(connection: CalendarConnection): Promise<CalendarConnection | null> {
    if (!connection.refreshToken) {
      console.warn('No refresh token available for connection:', connection.id);
      return null;
    }

    try {
      console.log('Refreshing token for:', connection.provider, connection.email);
      
      if (connection.provider === 'google') {
        // For Google, we would need to implement OAuth2 token refresh
        // This requires the client secret which should be handled server-side
        console.warn('Google token refresh not implemented - requires server-side handling');
        return null;
      } else if (connection.provider === 'microsoft') {
        // For Microsoft, same issue - requires client secret
        console.warn('Microsoft token refresh not implemented - requires server-side handling');
        return null;
      }
      
      return null;
    } catch (error) {
      console.error('Failed to refresh token:', error);
      return null;
    }
  }

  async processAuthToken(providerId: string, token: string): Promise<CalendarConnection> {
    console.log('🔥 Processing auth token for:', providerId);
    
    try {
      // Decode the token
      const authData = JSON.parse(atob(token.trim()));
      console.log('🔥 Decoded auth data:', { ...authData, accessToken: '***', idToken: '***' });
      
      if (authData.provider !== providerId) {
        throw new Error(`Token is for ${authData.provider} but expected ${providerId}`);
      }
      
      // Create connection
      const connection: CalendarConnection = {
        id: `${providerId}-${authData.uid}`,
        provider: providerId,
        email: authData.email,
        accessToken: authData.accessToken,
        refreshToken: undefined,
        expiresAt: Date.now() + 3600 * 1000,
        connectedAt: Date.now()
      };
      
      console.log('🔥 Created connection:', { ...connection, accessToken: '***' });
      
      // Save and return
      this.connections.set(connection.id, connection);
      await this.saveConnectionToBackend(connection);
      
      return connection;
    } catch (decodeError) {
      console.error('🔥 Failed to decode token:', decodeError);
      throw new Error('Invalid token format. Please try authentication again.');
    }
  }

  async removeConnection(connectionId: string): Promise<void> {
    this.connections.delete(connectionId);
    
    // Also remove from backend
    try {
      const { invoke } = await import('@tauri-apps/api/tauri');
      await invoke('remove_calendar_connection', { connectionId });
    } catch (error) {
      console.warn('Failed to remove connection from backend:', error);
    }
  }
}

// Create and initialize the service
const calendarService = new CalendarService();

// Auto-initialize when imported
if (typeof window !== 'undefined') {
  calendarService.initialize().catch(error => {
    console.warn('Failed to initialize calendar service:', error);
  });
}

export { calendarService };