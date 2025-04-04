# 🎵 Spotify Integration for FlexBar

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen)](https://nodejs.org/)
[![FlexDesigner](https://img.shields.io/badge/FlexDesigner-v1.0.0%2B-blue)](https://flexbar.dev)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A Spotify integration plugin for FlexBar that provides real-time music information display and "some" controls.



## 📋 Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Development](#development)
- [Authentication](#authentication)
- [Usage](#usage)
- [Contributing](#contributing)
- [License](#license)

## ✨ Features

### 🎧 Now Playing Display
- Track information with progress bar visualization
- Artist and song title display with dynamic updates
- Album artwork support

### 🎛️ Playback Controls
- Like/Unlike tracks with instant feedback

### 💫 Interactive Elements
- Visual feedback for user interactions
- Seamless integration with FlexBar UI

## 💻 Installation for Development

### Prerequisites

- **Node.js** 18 or later  
- **FlexDesigner** v1.0.0 or later  
- A **FlexBar** device 
- Install **FlexCLI**:
  ```bash
  npm install -g @eniac/flexcli
  ```

### Clone & Setup

```bash
git clone .git
cd Spotify-Integration
npm install
```


### Debug Mode
Run the development server with hot-reload:
```bash
npm run dev
```

### Build & Package
Create a production-ready plugin package:
```bash
npm run build
npm run plugin:pack
```

## 🔐 Authentication

The plugin requires Spotify authentication to function properly.

### Setting Up Spotify Authentication

1. **Create a Spotify Developer Account**
   - Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   - Sign in with your Spotify account
   - Accept the Developer Agreement

2. **Create a New Application**
   - Click "Create App" in the dashboard
   - Fill in the app details:
     - App name: "FlexBar Spotify Integration" (or your preferred name)
     - App description: Brief description of your app
     - Website: Can be left blank for development
     - Redirect URI: `http://localhost:8888/callback`
     - Bundle ID: Can be left blank for development

3. **Get Your Credentials**
   - After creating the app, you'll see your app's dashboard
   - Note down your `Client ID` and `Client Secret`
   - These will be needed in the plugin configuration

4. **Configure the Plugin**
   - Open the plugin's configuration in FlexDesigner Settings > Application > Spotify
   - Enter your Spotify credentials:
     - Client ID: Your app's Client ID
     - Client Secret: Your app's Client Secret
     - Redirect URI: `http://localhost:8888/callback`
   - Click "Save"
   - Click "Connect" to start the authentication process

5. **Complete Authentication**
   - A browser window will open
   - Log in to your Spotify account if needed
   - Grant the requested permissions
   - You'll be redirected back to the plugin
   - The plugin will now be connected to your Spotify account

## 🎮 Usage

Once installed and authenticated, the plugin provides several interactive keys:

| Key Type | Description |
|----------|-------------|
| Now Playing | Displays current track, artist, and album art |
| Like/Unlike | Toggle to like or unlike the current track |

Each key provides specific functionality and visual feedback for the current Spotify playback state.

## 👥 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
