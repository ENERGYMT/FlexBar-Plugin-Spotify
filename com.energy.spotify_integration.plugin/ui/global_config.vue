<template>
    <v-container>
        <!-- Notification snackbars -->
        <v-snackbar
            v-model="notifications.save.show"
            timeout="3000"
            color="success"
            location="top"
            variant="tonal"
        >
            <div class="d-flex align-center">
                <v-icon class="mr-2">mdi-check-circle</v-icon>
                <span>{{ notifications.save.message }}</span>
            </div>
        </v-snackbar>

        <v-snackbar
            v-model="notifications.auth.show"
            timeout="3000"
            :color="notifications.auth.color"
            location="top"
            variant="tonal"
        >
            <div class="d-flex align-center">
                <v-icon class="mr-2">{{ notifications.auth.icon }}</v-icon>
                <span>{{ notifications.auth.message }}</span>
            </div>
        </v-snackbar>

        <!-- API Configuration Card -->
        <v-card elevation="2" class="mb-4 rounded-lg">
            <v-card-item prepend-icon="mdi-spotify">
                <v-card-title>Spotify API Configuration</v-card-title>
                <v-card-subtitle>Enter your Spotify App credentials</v-card-subtitle>
            </v-card-item>
            <v-divider></v-divider>
            <v-card-text>
                <v-text-field 
                    v-model="modelValue.config.clientId" 
                    label="Spotify Client ID" 
                    outlined 
                    density="compact"
                    hide-details="auto"
                    class="mb-3"
                ></v-text-field>
                
                <v-text-field 
                    v-model="modelValue.config.clientSecret" 
                    label="Spotify Client Secret" 
                    outlined 
                    density="compact"
                    hide-details="auto"
                    type="password"
                    class="mb-3"
                ></v-text-field>
                
                <v-text-field 
                    v-model="modelValue.config.redirectUri" 
                    label="Redirect URI" 
                    outlined 
                    density="compact"
                    hide-details="auto"
                    class="mb-3"
                    placeholder="http://localhost:8888/callback"
                    :disabled="isAuthenticated"
                ></v-text-field>
                
                <v-alert
                    v-if="isAuthenticated"
                    type="success"
                    text="Connected to Spotify"
                    variant="tonal"
                    density="compact"
                    class="mt-3"
                ></v-alert>
            </v-card-text>
            <v-card-actions class="pa-3">
                <v-spacer></v-spacer>
                <v-btn 
                    v-if="!isAuthenticated && canAuthenticate"
                    color="green"
                    variant="flat"
                    @click="authenticateSpotify"
                    prepend-icon="mdi-spotify"
                >
                    Connect
                </v-btn>
                
                <v-btn 
                    v-if="isAuthenticated"
                    color="primary"
                    variant="tonal"
                    @click="testSpotifyConnection"
                    prepend-icon="mdi-connection"
                    class="ml-2"
                >
                    Test
                </v-btn>
                <v-btn 
                    v-if="isAuthenticated"
                    color="error"
                    variant="tonal"
                    @click="disconnectSpotify"
                    prepend-icon="mdi-link-off"
                    class="ml-2"
                >
                    Disconnect
                </v-btn>
                 <v-btn 
                    variant="tonal" 
                    @click="saveConfig" 
                    prepend-icon="mdi-content-save-outline"
                    class="ml-2"
                    :disabled="isInitializing"
                >
                    Save
                </v-btn>
            </v-card-actions>
        </v-card>

        <!-- Playback Control Card -->
        <v-card v-if="isAuthenticated" elevation="2" class="mb-4 rounded-lg">
             <v-card-item prepend-icon="mdi-play-box-outline">
                <v-card-title>Playback Controls</v-card-title>
                <v-card-subtitle v-if="currentTrack">{{ currentTrack.name }} - {{ currentTrack.artist }}</v-card-subtitle>
                <v-card-subtitle v-else>No track playing</v-card-subtitle>
            </v-card-item>
            <v-divider></v-divider>
            <v-card-text>
                <!-- Playback Controls -->
                <v-row align="center" justify="center" class="mb-2">
                    <v-col cols="auto">
                        <v-btn icon variant="text" @click="controlPlayback('previous')">
                            <v-icon>mdi-skip-previous</v-icon>
                        </v-btn>
                    </v-col>
                     <v-col cols="auto">
                        <v-btn icon variant="text" size="large" @click="controlPlayback(currentTrack?.isPlaying ? 'pause' : 'play')">
                            <v-icon>{{ currentTrack?.isPlaying ? 'mdi-pause' : 'mdi-play' }}</v-icon>
                        </v-btn>
                    </v-col>
                    <v-col cols="auto">
                        <v-btn icon variant="text" @click="controlPlayback('next')">
                            <v-icon>mdi-skip-next</v-icon>
                        </v-btn>
                    </v-col>
                </v-row>

                <!-- Volume Slider -->
                <v-slider
                    v-model="volume"
                    @update:model-value="setVolume" 
                    min="0"
                    max="100"
                    step="1"
                    label="Volume"
                    density="compact"
                    prepend-icon="mdi-volume-low"
                    append-icon="mdi-volume-high"
                    hide-details
                ></v-slider>
            </v-card-text>
        </v-card>

        <!-- Search Card -->
        <v-card v-if="isAuthenticated" elevation="2" class="mb-4 rounded-lg">
            <v-card-item prepend-icon="mdi-magnify">
                <v-card-title>Search Spotify</v-card-title>
            </v-card-item>
            <v-divider></v-divider>
            <v-card-text>
                <v-text-field
                    v-model="searchQuery"
                    label="Search tracks, albums, or playlists"
                    @keyup.enter="performSearch"
                    density="compact"
                    variant="solo-filled"
                    flat
                    hide-details
                    clearable
                    class="mb-3"
                >
                    <template v-slot:append-inner>
                        <v-btn icon="mdi-magnify" size="small" variant="tonal" @click="performSearch" :disabled="!searchQuery"></v-btn>
                    </template>
                </v-text-field>

                <!-- Search Results -->
                <v-tabs v-if="searchResults" v-model="activeTab" density="compact" grow class="mb-2">
                    <v-tab value="tracks">Tracks ({{ searchResults.tracks?.items?.length || 0 }})</v-tab>
                    <v-tab value="albums">Albums ({{ searchResults.albums?.items?.length || 0 }})</v-tab>
                    <v-tab value="playlists">Playlists ({{ searchResults.playlists?.items?.length || 0 }})</v-tab>
                </v-tabs>

                <v-window v-model="activeTab">
                    <v-window-item value="tracks">
                        <v-list v-if="searchResults?.tracks?.items?.length" density="compact" lines="two">
                            <v-list-item
                                v-for="track in searchResults.tracks.items"
                                :key="track.id"
                                @click="playTrack(track.uri)"
                                :prepend-avatar="track.album.images[track.album.images.length - 1]?.url"
                            >
                                <v-list-item-title>{{ track.name }}</v-list-item-title>
                                <v-list-item-subtitle>{{ track.artists[0].name }} • {{ track.album.name }}</v-list-item-subtitle>
                                <template v-slot:append>
                                    <v-btn icon="mdi-play" variant="text" size="small"></v-btn>
                                </template>
                            </v-list-item>
                        </v-list>
                         <v-alert v-else type="info" variant="tonal" density="compact" class="mt-2">No tracks found.</v-alert>
                    </v-window-item>

                    <v-window-item value="albums">
                        <v-list v-if="searchResults?.albums?.items?.length" density="compact" lines="two">
                             <v-list-item
                                v-for="album in searchResults.albums.items"
                                :key="album.id"
                                @click="playPlaylist(album.uri)"
                                :prepend-avatar="album.images[album.images.length - 1]?.url"
                            >
                                <v-list-item-title>{{ album.name }}</v-list-item-title>
                                <v-list-item-subtitle>{{ album.artists[0].name }}</v-list-item-subtitle>
                                <template v-slot:append>
                                    <v-btn icon="mdi-play" variant="text" size="small"></v-btn>
                                </template>
                            </v-list-item>
                        </v-list>
                        <v-alert v-else type="info" variant="tonal" density="compact" class="mt-2">No albums found.</v-alert>
                    </v-window-item>
                     <v-window-item value="playlists">
                        <v-list v-if="searchResults?.playlists?.items?.length" density="compact" lines="two">
                             <v-list-item
                                v-for="playlist in searchResults.playlists.items"
                                :key="playlist.id"
                                @click="playPlaylist(playlist.uri)"
                                :prepend-avatar="playlist.images[playlist.images.length - 1]?.url"
                            >
                                <v-list-item-title>{{ playlist.name }}</v-list-item-title>
                                <v-list-item-subtitle>{{ playlist.owner.display_name }} • {{ playlist.tracks.total }} tracks</v-list-item-subtitle>
                                <template v-slot:append>
                                    <v-btn icon="mdi-play" variant="text" size="small"></v-btn>
                                </template>
                            </v-list-item>
                        </v-list>
                        <v-alert v-else type="info" variant="tonal" density="compact" class="mt-2">No playlists found.</v-alert>
                    </v-window-item>
                </v-window>
            </v-card-text>
        </v-card>

        <!-- Playlists Card -->
        <v-card v-if="isAuthenticated" elevation="2" class="mb-4 rounded-lg">
             <v-card-item prepend-icon="mdi-playlist-music-outline">
                <v-card-title>Your Playlists</v-card-title>
                 <v-card-subtitle>Click to play</v-card-subtitle>
            </v-card-item>
            <v-divider></v-divider>
            <v-card-text class="pa-0">
                <v-list v-if="userPlaylists.length" density="compact" lines="two">
                    <v-list-item
                        v-for="playlist in userPlaylists"
                        :key="playlist.id"
                        @click="playPlaylist(playlist.uri)"
                        :prepend-avatar="playlist.images[playlist.images.length - 1]?.url"
                    >
                        <v-list-item-title>{{ playlist.name }}</v-list-item-title>
                        <v-list-item-subtitle>{{ playlist.tracks.total }} tracks</v-list-item-subtitle>
                         <template v-slot:append>
                            <v-btn icon="mdi-play" variant="text" size="small"></v-btn>
                        </template>
                    </v-list-item>
                </v-list>
                 <v-alert v-else type="info" variant="tonal" density="compact" class="ma-3">No playlists found or loaded yet.</v-alert>
            </v-card-text>
        </v-card>
    </v-container>
</template>

<script>
export default {
    props: {
        modelValue: {
            type: Object,
            required: true,
        },
    },
    data() {
        return {
            isAuthenticated: false,
            isInitializing: false,
            notifications: {
                save: {
                    show: false,
                    message: "Spotify settings have been saved successfully"
                },
                auth: {
                    show: false,
                    message: "",
                    color: "info",
                    icon: "mdi-information"
                }
            },
            currentTrack: null,
            volume: 50,
            searchQuery: '',
            searchResults: null,
            activeTab: 'tracks',
            userPlaylists: [],
            refreshInterval: null
        };
    },
    computed: {
        canAuthenticate() {
            return this.modelValue.config.clientId && 
                   this.modelValue.config.clientSecret && 
                   this.modelValue.config.redirectUri;
        }
    },
    watch: {
        'modelValue.config': {
            handler: function(newConfig) {
                if (this.isInitializing) return;
                
                this.$fd.info('Config changed:', newConfig);
                this.checkAuthStatus();
            },
            deep: true,
            immediate: true
        }
    },
    methods: {
        async saveConfig() {
            this.$fd.info('Saving config:', this.modelValue.config);
            
            try {
                // First get the current config to make sure we don't override tokens
                const currentConfig = await this.$fd.getConfig();
                
                // Preserve important authentication data
                const updatedConfig = {
                    ...currentConfig,
                    // Only update fields that should be controlled by the UI
                    clientId: this.modelValue.config.clientId,
                    clientSecret: this.modelValue.config.clientSecret,
                    redirectUri: this.modelValue.config.redirectUri,
                    isAuthenticated: this.modelValue.config.isAuthenticated
                };
                
                // Make sure we don't accidentally clear tokens
                if (this.modelValue.config.accessToken) {
                    updatedConfig.accessToken = this.modelValue.config.accessToken;
                }
                
                if (this.modelValue.config.refreshToken) {
                    updatedConfig.refreshToken = this.modelValue.config.refreshToken;
                }
                
                // Save the merged config
                await this.$fd.setConfig(updatedConfig);
                
                // Update the local model with the full config
                this.modelValue.config = updatedConfig;
                
                // Show save confirmation
                this.notifications.save.show = true;
            } catch (error) {
                this.$fd.error('Failed to save config:', error);
                this.notifications.auth.message = `Error saving config: ${error.message}`;
                this.notifications.auth.color = "error";
                this.notifications.auth.icon = "mdi-alert-circle";
                this.notifications.auth.show = true;
            }
        },
        async initializeConfig() {
            // Set flag to prevent watcher from triggering recursively
            this.isInitializing = true;
            
            try {
                // get config from local file
                const config = await this.$fd.getConfig();
                
                // Merge with existing config
                if (config) {
                    this.modelValue.config = config;
                } else if (!this.modelValue.config) {
                    this.modelValue.config = {};
                }
                
                this.$fd.info('initializeConfig', this.modelValue.config);
                
                // Set default redirect URI if not already set
                if (!this.modelValue.config.redirectUri) {
                    this.modelValue.config.redirectUri = "http://localhost:8888/callback";
                }
                
                return true;
            } catch (error) {
                this.$fd.error('Failed to initialize config:', error);
                return false;
            } finally {
                // Reset flag when done
                this.isInitializing = false;
            }
        },
        async authenticateSpotify() {
            // Show notification that we're starting authentication
            this.notifications.auth.message = "Starting Spotify authentication...";
            this.notifications.auth.color = "info";
            this.notifications.auth.icon = "mdi-spotify";
            this.notifications.auth.show = true;
            
            try {
                // Send authentication request to the backend plugin
                const response = await this.$fd.sendToBackend({
                    data: 'spotify-auth',
                    config: this.modelValue.config
                });

                if (response.success) {
                    // Get the updated config with tokens from backend
                    const updatedConfig = await this.$fd.getConfig();
                    
                    // Update our local model with the full config including tokens
                    this.modelValue.config = updatedConfig;
                    
                    // Update authentication state
                    this.isAuthenticated = true;
                    
                    // Show success notification
                    this.notifications.auth.message = response.message || "Successfully connected to Spotify!";
                    this.notifications.auth.color = "success";
                    this.notifications.auth.icon = "mdi-check-circle";
                    this.notifications.auth.show = true;
                    
                    // Initialize playlists and playback state
                    this.loadPlaylists();
                    this.updatePlaybackState();
                    this.startRefreshInterval();
                } else {
                    throw new Error(response.error || "Authentication failed");
                }
            } catch (error) {
                this.$fd.info('Auth error:', error);
                
                // Show error notification
                this.notifications.auth.message = `Could not connect to Spotify: ${error.message}`;
                this.notifications.auth.color = "error";
                this.notifications.auth.icon = "mdi-alert-circle";
                this.notifications.auth.show = true;
            }
        },
        async disconnectSpotify() {
            try {
                // Clear any refresh interval
                if (this.refreshInterval) {
                    clearInterval(this.refreshInterval);
                    this.refreshInterval = null;
                }
                
                // Get current config
                const currentConfig = await this.$fd.getConfig();
                
                // Create a new config without authentication data
                const updatedConfig = {
                    ...currentConfig,
                    isAuthenticated: false,
                    accessToken: null,
                    refreshToken: null
                };
                
                // Save the updated config
                await this.$fd.setConfig(updatedConfig);
                
                // Update the local model
                this.modelValue.config = updatedConfig;
                
                // Reset UI state
                this.isAuthenticated = false;
                this.currentTrack = null;
                this.userPlaylists = [];
                
                // Show disconnection notification
                this.notifications.auth.message = "Successfully disconnected from Spotify";
                this.notifications.auth.color = "success";
                this.notifications.auth.icon = "mdi-check-circle";
                this.notifications.auth.show = true;
            } catch (error) {
                this.$fd.error('Failed to disconnect:', error);
                this.notifications.auth.message = `Error disconnecting: ${error.message}`;
                this.notifications.auth.color = "error";
                this.notifications.auth.icon = "mdi-alert-circle";
                this.notifications.auth.show = true;
            }
        },
        startRefreshInterval() {
            // Clear any existing interval
            if (this.refreshInterval) {
                clearInterval(this.refreshInterval);
            }
            
            // Refresh playback state every 5 seconds
            this.refreshInterval = setInterval(() => {
                this.updatePlaybackState();
            }, 5000);
        },
        async testSpotifyConnection() {
            try {
                const response = await this.$fd.sendToBackend({
                    data: 'get-playback'
                });
                
                // Check response format
                if (response.needsAuth) {
                    this.isAuthenticated = false;
                    this.notifications.auth.message = response.message || "Authentication required";
                    this.notifications.auth.color = "warning";
                    this.notifications.auth.icon = "mdi-alert";
                    this.notifications.auth.show = true;
                    this.currentTrack = null;
                    return;
                }
                
                if (response.error) {
                    throw new Error(response.error);
                }
                
                // Handle successful playback response
                if (response && response.item) {
                    this.currentTrack = {
                        name: response.item.name,
                        artist: response.item.artists[0].name,
                        album: response.item.album.name,
                        isPlaying: response.is_playing
                    };
                    
                    this.notifications.auth.message = "Successfully connected to Spotify!";
                    this.notifications.auth.color = "success";
                    this.notifications.auth.icon = "mdi-check-circle";
                    this.notifications.auth.show = true;
                } else {
                    this.currentTrack = null;
                    this.notifications.auth.message = "Connected, but no track is currently playing";
                    this.notifications.auth.color = "info";
                    this.notifications.auth.icon = "mdi-information";
                    this.notifications.auth.show = true;
                }
            } catch (error) {
                this.currentTrack = null;
                this.notifications.auth.message = `Test failed: ${error.message}`;
                this.notifications.auth.color = "error";
                this.notifications.auth.icon = "mdi-alert-circle";
                this.notifications.auth.show = true;
                
                // Check if this is an auth error
                if (error.message.includes('authenticate')) {
                    this.isAuthenticated = false;
                }
            }
        },
        async controlPlayback(action, uri) {
            try {
                const response = await this.$fd.sendToBackend({
                    data: 'spotify-control',
                    action,
                    uri
                });
                
                // Check for auth errors
                if (response && response.needsAuth) {
                    this.isAuthenticated = false;
                    this.notifications.auth.message = response.message || "Authentication required";
                    this.notifications.auth.color = "warning";
                    this.notifications.auth.icon = "mdi-alert";
                    this.notifications.auth.show = true;
                    return;
                }
                
                await this.updatePlaybackState();
            } catch (error) {
                this.showError(error);
            }
        },
        async setVolume() {
            try {
                await this.$fd.sendToBackend({
                    data: 'spotify-control',
                    action: 'volume',
                    volume: this.volume
                })
            } catch (error) {
                this.showError(error)
            }
        },
        async performSearch() {
            try {
                const results = await this.$fd.sendToBackend({
                    data: 'search',
                    query: this.searchQuery,
                    types: ['track', 'album', 'playlist']
                })
                this.searchResults = results
            } catch (error) {
                this.showError(error)
            }
        },
        async loadPlaylists() {
            try {
                const response = await this.$fd.sendToBackend({
                    data: 'get-playlists'
                });
                
                // Check for auth errors
                if (response && response.needsAuth) {
                    this.isAuthenticated = false;
                    this.notifications.auth.message = response.message || "Authentication required";
                    this.notifications.auth.color = "warning";
                    this.notifications.auth.icon = "mdi-alert";
                    this.notifications.auth.show = true;
                    return;
                }
                
                if (response && response.items) {
                    this.userPlaylists = response.items;
                }
            } catch (error) {
                this.showError(error);
            }
        },
        async updatePlaybackState() {
            try {
                const playback = await this.$fd.sendToBackend({
                    data: 'get-playback'
                });
                
                // Check for auth errors in the response
                if (playback && playback.needsAuth) {
                    this.isAuthenticated = false;
                    return;
                }
                
                if (playback && playback.item) {
                    this.currentTrack = {
                        name: playback.item.name,
                        artist: playback.item.artists[0].name,
                        album: playback.item.album.name,
                        isPlaying: playback.is_playing
                    };
                    if (playback.device && playback.device.volume_percent !== undefined) {
                        this.volume = playback.device.volume_percent;
                    }
                }
            } catch (error) {
                // Only show error if it's not an auth error (those are handled silently)
                if (!error.message || !error.message.includes('authenticate')) {
                    this.showError(error);
                } else {
                    this.isAuthenticated = false;
                }
            }
        },
        showError(error) {
            // Check if this is an auth error
            if (error.message && error.message.includes('authenticate')) {
                this.isAuthenticated = false;
                this.notifications.auth.message = "Authentication required. Please reconnect to Spotify.";
                this.notifications.auth.color = "warning";
                this.notifications.auth.icon = "mdi-alert";
            } else {
                this.notifications.auth.message = `Error: ${error.message}`;
                this.notifications.auth.color = "error";
                this.notifications.auth.icon = "mdi-alert-circle";
            }
            this.notifications.auth.show = true;
        },
        async playTrack(uri) {
            await this.controlPlayback('play', uri)
        },
        async playPlaylist(uri) {
            await this.controlPlayback('play', uri)
        },
        checkAuthStatus() {
            // Check if we have valid authentication configuration
            this.isAuthenticated = !!(
                this.modelValue.config && 
                this.modelValue.config.isAuthenticated &&
                this.modelValue.config.accessToken &&
                this.modelValue.config.refreshToken
            );
            this.$fd.info('Auth status checked:', this.isAuthenticated);
        },
    },
    created() {
        this.$fd.info('Component created, modelValue:', this.modelValue);
    },
    mounted() {
        this.$fd.info('Component mounted, modelValue:', this.modelValue);
        this.$fd.info('this.$fd',Object.keys(this.$fd));
        
        this.initializeConfig().then(() => {
            this.checkAuthStatus();
            
            if (this.isAuthenticated) {
                this.loadPlaylists();
                this.updatePlaybackState();
                this.startRefreshInterval();
            }
        });
    },
    beforeDestroy() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
    }
};
</script>

<style scoped>
/* Add specific styles if needed */
.v-card-item {
    padding-bottom: 12px; /* Adjust spacing */
}
</style>