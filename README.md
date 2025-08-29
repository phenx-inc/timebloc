# Time Blocker React

A modern, privacy-focused time management application built with Tauri, React, and Next.js. Features time blocking, calendar integration, and a unique brain dump canvas for capturing ideas.

![Time Blocker React](https://img.shields.io/badge/version-0.1.0-blue.svg)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## ✨ Features

- **Time Blocking Grid**: Visual 24-hour timeline with 30-minute intervals
- **Calendar Integration**: Sync with Google Calendar and Microsoft Outlook
- **Brain Dump Canvas**: Drag-and-drop space for text notes and images
- **Priority Tracking**: Keep your top 5 priorities visible
- **Dark Mode**: Easy on the eyes during late-night planning
- **Privacy First**: All data stored locally on your device
- **Offline First**: Works without internet (except for calendar sync)

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
- **Rust** (latest stable) - [Install Rust](https://www.rust-lang.org/tools/install)
- **Git** - [Download](https://git-scm.com/)

### Platform-Specific Requirements

**macOS:**
- Xcode Command Line Tools: `xcode-select --install`

**Windows:**
- Microsoft C++ Build Tools - [Download](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
- WebView2 - [Download](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)

**Linux:**
- Development libraries:
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.0-dev \
    build-essential \
    curl \
    wget \
    libssl-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev
```

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/phenx-inc/timebloc.git
cd timebloc
```

### 2. Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Install Tauri CLI globally (optional, but recommended)
npm install -g @tauri-apps/cli
```

### 3. Set Up Environment Variables

Create a `.env.local` file in the root directory:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your Firebase configuration (see Firebase Setup section below).

### 4. Run in Development Mode

```bash
npm run tauri:dev
```

This will start the Next.js development server and launch the Tauri application window.

### 5. Build for Production

```bash
npm run tauri:build
```

The built application will be in `src-tauri/target/release/bundle/`:
- **macOS**: `Time Blocker React.app`
- **Windows**: `Time Blocker React.msi`
- **Linux**: `time-blocker-react.AppImage` or `.deb`

## 🔥 Firebase Setup (Required for Calendar Integration)

Calendar integration requires Firebase Authentication. Follow these steps:

### 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create Project"
3. Name it (e.g., "time-blocker")
4. Disable Google Analytics (optional)
5. Click "Create Project"

### 2. Enable Authentication

1. In Firebase Console, go to **Authentication** → **Get Started**
2. Go to **Sign-in method** tab
3. Enable **Google** provider:
   - Click on Google
   - Enable it
   - Set a public-facing name
   - Choose a support email
   - Click Save
4. Enable **Microsoft** provider (optional):
   - Click on Microsoft
   - Enable it
   - Get Application ID and Secret from Azure Portal (see Azure Setup below)
   - Click Save

### 3. Configure Authorized Domains

1. Go to **Authentication** → **Settings** → **Authorized domains**
2. Add your domains:
   - `localhost` (for development)
   - Your production domain (if hosting the auth page)
   - Any domains where you'll embed the app

### 4. Get Firebase Configuration

1. Go to **Project Settings** (gear icon)
2. Scroll to "Your apps" section
3. Click "Web" icon (</>) to add a web app
4. Register app with a nickname
5. Copy the configuration:

```javascript
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-auth-domain",
  projectId: "your-project-id",
  storageBucket: "your-storage-bucket",
  messagingSenderId: "your-sender-id",
  appId: "your-app-id"
};
```

6. Add these to your `.env.local`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-auth-domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-storage-bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
```

## 📅 Google Calendar Setup

### 1. Enable Google Calendar API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable APIs:
   - Search for "Google Calendar API"
   - Click Enable

### 2. Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Choose "External" user type
3. Fill in required fields:
   - App name
   - User support email
   - Developer contact email
4. Add scopes:
   - `https://www.googleapis.com/auth/calendar.readonly`
5. Add test users (for development)
6. Submit for verification (for production)

### 3. Create OAuth 2.0 Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Choose "Web application"
4. Add authorized redirect URIs:
   ```
   https://your-domain.com/__/auth/handler
   http://localhost:3000/__/auth/handler
   ```
5. Save the Client ID and Secret (though Firebase handles this)

## 📮 Microsoft Outlook Setup (Optional)

### 1. Register Application in Azure

1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to **Azure Active Directory** → **App registrations**
3. Click **New registration**
4. Configure:
   - Name: "Time Blocker"
   - Supported account types: "Personal Microsoft accounts only"
   - Redirect URI: `https://your-auth-domain.firebaseapp.com/__/auth/handler`
5. Save the Application (client) ID

### 2. Create Client Secret

1. Go to **Certificates & secrets**
2. Click **New client secret**
3. Add description and expiry
4. Copy the secret value immediately

### 3. Configure API Permissions

1. Go to **API permissions**
2. Click **Add a permission**
3. Choose **Microsoft Graph**
4. Select **Delegated permissions**
5. Add:
   - `Calendars.Read`
   - `User.Read`
6. Click **Add permissions**

### 4. Add to Firebase

1. In Firebase Console, go to Authentication → Sign-in method
2. Configure Microsoft provider with:
   - Application ID from Azure
   - Application Secret from Azure

## 🌐 Hosting the Authentication Page

For Tauri desktop apps, OAuth requires a web page to handle the authentication flow.

### Option 1: Use Our Hosted Page

We provide a hosted authentication page at `https://www.phenx.io/timebloc`. 

To use it, ensure your Firebase project's authorized domains include:
- `phenx.io`
- `www.phenx.io`

### Option 2: Host Your Own

Create an `auth.html` file and host it on any static hosting service:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Time Blocker - Authenticate</title>
    <meta charset="utf-8">
    <style>
        body {
            font-family: -apple-system, system-ui, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .container {
            background: white;
            padding: 2rem;
            border-radius: 10px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            text-align: center;
            max-width: 400px;
        }
        .token-box {
            background: #f5f5f5;
            padding: 1rem;
            border-radius: 5px;
            margin: 1rem 0;
            word-break: break-all;
            font-family: monospace;
            font-size: 0.9rem;
        }
        button {
            background: #667eea;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
        }
        button:hover {
            background: #5a67d8;
        }
        .error {
            color: #e53e3e;
            margin: 1rem 0;
        }
        .success {
            color: #38a169;
            margin: 1rem 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔐 Time Blocker Auth</h1>
        <p>Click below to sign in with your calendar provider:</p>
        
        <div id="auth-buttons">
            <button onclick="signInWithGoogle()">📅 Sign in with Google</button>
            <button onclick="signInWithMicrosoft()" style="margin-left: 10px;">📮 Sign in with Microsoft</button>
        </div>
        
        <div id="status"></div>
        <div id="token-display" style="display: none;">
            <h3>✅ Success! Copy this token:</h3>
            <div class="token-box" id="token"></div>
            <button onclick="copyToken()">📋 Copy Token</button>
            <p><small>Paste this token back in the Time Blocker app</small></p>
        </div>
    </div>

    <script type="module">
        import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
        import { getAuth, signInWithPopup, GoogleAuthProvider, OAuthProvider } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js';
        
        // Your Firebase config
        const firebaseConfig = {
            apiKey: "YOUR_API_KEY",
            authDomain: "YOUR_AUTH_DOMAIN",
            projectId: "YOUR_PROJECT_ID",
            storageBucket: "YOUR_STORAGE_BUCKET",
            messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
            appId: "YOUR_APP_ID"
        };
        
        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        
        window.signInWithGoogle = async function() {
            const provider = new GoogleAuthProvider();
            provider.addScope('https://www.googleapis.com/auth/calendar.readonly');
            await signIn(provider, 'google');
        }
        
        window.signInWithMicrosoft = async function() {
            const provider = new OAuthProvider('microsoft.com');
            provider.addScope('https://graph.microsoft.com/calendars.read');
            await signIn(provider, 'microsoft');
        }
        
        async function signIn(provider, providerName) {
            const statusEl = document.getElementById('status');
            statusEl.innerHTML = '<p>Signing in...</p>';
            
            try {
                const result = await signInWithPopup(auth, provider);
                const credential = providerName === 'google' 
                    ? GoogleAuthProvider.credentialFromResult(result)
                    : OAuthProvider.credentialFromResult(result);
                
                const tokenData = {
                    provider: providerName,
                    email: result.user.email,
                    uid: result.user.uid,
                    accessToken: credential.accessToken,
                    idToken: await result.user.getIdToken()
                };
                
                const token = btoa(JSON.stringify(tokenData));
                
                document.getElementById('auth-buttons').style.display = 'none';
                document.getElementById('token-display').style.display = 'block';
                document.getElementById('token').textContent = token;
                statusEl.innerHTML = '<p class="success">Authentication successful!</p>';
                
            } catch (error) {
                console.error('Auth error:', error);
                statusEl.innerHTML = `<p class="error">Error: ${error.message}</p>`;
            }
        }
        
        window.copyToken = function() {
            const token = document.getElementById('token').textContent;
            navigator.clipboard.writeText(token).then(() => {
                alert('Token copied to clipboard!');
            });
        }
    </script>
</body>
</html>
```

Host this file on:
- GitHub Pages
- Netlify
- Vercel
- Firebase Hosting
- Any static hosting service

Then update your app to use your hosted URL.

## 🔧 Configuration

### Application Settings

The app stores configuration in:
- **macOS**: `~/Library/Application Support/com.timeblock.react.app/`
- **Windows**: `%APPDATA%\com.timeblock.react.app\`
- **Linux**: `~/.config/com.timeblock.react.app/`

### Database

SQLite database is automatically created at:
- `timeblock.db` in the app data directory

### Encryption

Tokens are encrypted using AES-256-GCM. The encryption key is auto-generated and stored as `.encryption_key` in the app data directory.

## 🐛 Troubleshooting

### Common Issues

**1. "Missing Firebase configuration" error**
- Ensure `.env.local` exists with all required Firebase variables
- Restart the development server after creating `.env.local`

**2. Browser doesn't open for authentication**
- Check that `shell-open` permission is enabled in `src-tauri/tauri.conf.json`
- Manually visit the authentication URL shown in the alert

**3. Build fails with DMG bundling error (macOS)**
- The `.app` file is still created successfully
- Find it at `src-tauri/target/release/bundle/macos/Time Blocker React.app`
- You can use it directly or create a DMG manually

**4. Calendar events not showing**
- Verify calendar permissions in Google/Microsoft account
- Check that tokens haven't expired
- Try disconnecting and reconnecting the calendar

**5. "Popup blocked" error**
- Allow popups for the authentication domain
- Or use the external authentication page method

### Development Tips

1. **Clear application data** (for testing):
```bash
# macOS
rm -rf ~/Library/Application\ Support/com.timeblock.react.app/

# Windows
rmdir /s "%APPDATA%\com.timeblock.react.app"

# Linux
rm -rf ~/.config/com.timeblock.react.app/
```

2. **Check Tauri logs**:
```bash
# Run with debug output
RUST_LOG=debug npm run tauri:dev
```

3. **Inspect web console**:
- Right-click in the app window
- Select "Inspect Element" (if dev tools are enabled)

## 📦 Project Structure

```
time_blocker_react/
├── src/                    # React/Next.js frontend
│   ├── app/               # Next.js app directory
│   │   └── page.tsx       # Main application component
│   ├── components/        # React components
│   └── lib/              # Utilities and services
│       ├── calendar-service.ts
│       ├── firebase.ts
│       └── validation.ts
├── src-tauri/             # Rust backend
│   ├── src/
│   │   ├── main.rs       # Application entry point
│   │   ├── calendar.rs   # Calendar integration
│   │   ├── crypto.rs     # Token encryption
│   │   └── models.rs     # Data models
│   ├── Cargo.toml        # Rust dependencies
│   └── tauri.conf.json   # Tauri configuration
├── public/                # Static assets
├── .env.example          # Environment variables template
├── package.json          # Node.js dependencies
└── README.md            # This file
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Tauri](https://tauri.app/) - Secure cross-platform desktop apps
- UI powered by [Next.js](https://nextjs.org/) and [React](https://react.org/)
- Calendar integration via [Firebase Auth](https://firebase.google.com/docs/auth)
- Icons from [Lucide](https://lucide.dev/)

## 💬 Support

For bugs and feature requests, please [open an issue](https://github.com/phenx-inc/timebloc/issues).

---

**Built by Humans and AI from Earth** 🌍