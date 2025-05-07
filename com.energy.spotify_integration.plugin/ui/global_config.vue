<template>
    <v-container class="scrollable-config-container">
        <!-- Notification snackbars -->
        <v-snackbar
            v-model="notifications.save.show"
            timeout="3000"
            color="success"
            location="top"
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
        >
            <div class="d-flex align-center">
                <v-icon class="mr-2">{{ notifications.auth.icon }}</v-icon>
                <span>{{ notifications.auth.message }}</span>
            </div>
        </v-snackbar>

        <!-- API Configuration Card -->
        <v-card elevation="2" class="mb-4 rounded-lg">
            <v-card-item :prepend-icon="isAuthenticated ? 'mdi-spotify-connect' : 'mdi-spotify'" :color="isAuthenticated ? 'green' : ''">
                <v-card-title>Spotify API Configuration</v-card-title>
                <v-card-subtitle>{{ isAuthenticated ? 'Connected to Spotify' : 'Enter your Spotify App credentials' }}</v-card-subtitle>
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
                    placeholder="http://127.0.0.1:8888/callback"
                    :disabled="isAuthenticated"
                ></v-text-field>
                
                <v-alert
                    v-if="isAuthenticated"
                    type="success"
                    text="Connected to Spotify"
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
                    Save API Settings
                </v-btn>
            </v-card-actions>
        </v-card>

        <!-- Logging Configuration Card -->
        <v-card elevation="2" class="mb-4 rounded-lg">
            <v-card-item prepend-icon="mdi-math-log">
                <v-card-title>Logging Configuration</v-card-title>
                <v-card-subtitle>Adjust plugin log verbosity</v-card-subtitle>
            </v-card-item>
            <v-divider></v-divider>
            <v-card-text>
                <v-select
                    v-model="modelValue.config.logLevel"
                    :items="logLevelOptions"
                    item-title="title"
                    item-value="value"
                    label="Log Level"
                    outlined
                    density="compact"
                    hide-details="auto"
                    class="mb-3"
                ></v-select>
                <v-alert
                    density="compact"
                    type="info"
                    variant="tonal"
                    icon="mdi-information-outline"
                    text="Changes to log level will apply after saving. The backend logger updates based on this saved setting."
                ></v-alert>
            </v-card-text>
            <v-card-actions class="pa-3">
                <v-spacer></v-spacer>
                <v-btn 
                    variant="tonal" 
                    @click="saveConfig" 
                    prepend-icon="mdi-content-save-outline"
                    class="ml-2"
                    :disabled="isInitializing"
                >
                    Save Log Settings
                </v-btn>
            </v-card-actions>
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
                    message: "Settings have been saved successfully" // Generic message
                },
                auth: {
                    show: false,
                    message: "",
                    color: "info",
                    icon: "mdi-information"
                }
            },
            logLevelOptions: [ // These must match LOG_LEVELS keys in loggerWrapper.js
                { title: 'Off', value: 'OFF' },
                { title: 'Error', value: 'ERROR' },
                { title: 'Warn', value: 'WARN' },
                { title: 'Info', value: 'INFO' },
                { title: 'Debug', value: 'DEBUG' },
            ],
        };
    },
    computed: {
        canAuthenticate() {
            return this.modelValue.config && // Ensure config exists
                   this.modelValue.config.clientId && 
                   this.modelValue.config.clientSecret && 
                   this.modelValue.config.redirectUri;
        }
    },
    watch: {
        'modelValue.config': {
            handler: function(newConfig, oldConfig) {
                if (this.isInitializing) return;
                
                this.$fd.info('Config changed in watcher:', JSON.parse(JSON.stringify(newConfig)));
                // Only call checkAuthStatus if relevant parts of config changed or if it's the initial call
                if (!oldConfig || 
                    (newConfig.isAuthenticated !== oldConfig.isAuthenticated ||
                     newConfig.accessToken !== oldConfig.accessToken ||
                     newConfig.refreshToken !== oldConfig.refreshToken)) {
                    this.checkAuthStatus();
                }
            },
            deep: true,
            immediate: true // Keep immediate to run checkAuthStatus on load via watcher
        }
    },
    methods: {
        async saveConfig() {
            this.$fd.info('Saving config with modelValue.config:', JSON.parse(JSON.stringify(this.modelValue.config)));
            
            try {
                // First get the current config to make sure we don't override tokens or other settings
                const currentFullConfig = await this.$fd.getConfig() || {};
                
                // Merge our current UI model (which now includes logLevel) with the full config
                const updatedConfig = {
                    ...currentFullConfig, // Base with all existing settings
                    ...this.modelValue.config, // Apply UI changes (clientId, clientSecret, redirectUri, logLevel, isAuthenticated)
                };
                
                // Ensure critical auth data from modelValue is preserved if it was part of it
                // This logic might be redundant if modelValue.config is already comprehensive
                // but it's safer.
                if (this.modelValue.config.hasOwnProperty('accessToken')) {
                    updatedConfig.accessToken = this.modelValue.config.accessToken;
                }
                if (this.modelValue.config.hasOwnProperty('refreshToken')) {
                    updatedConfig.refreshToken = this.modelValue.config.refreshToken;
                }
                if (this.modelValue.config.hasOwnProperty('isAuthenticated')) {
                    updatedConfig.isAuthenticated = this.modelValue.config.isAuthenticated;
                }


                this.$fd.info('Final config to save:', JSON.parse(JSON.stringify(updatedConfig)));
                await this.$fd.setConfig(updatedConfig);
                
                // Update the local model with the successfully saved (and potentially merged) config
                // This ensures the UI model is consistent with what's stored.
                this.modelValue.config = { ...updatedConfig };
                
                this.notifications.save.message = "Settings saved successfully";
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
            this.isInitializing = true;
            this.$fd.info('initializeConfig started. Current modelValue.config:', JSON.parse(JSON.stringify(this.modelValue.config)));
            
            try {
                const loadedConfig = await this.$fd.getConfig();
                this.$fd.info('Loaded config from $fd.getConfig():', JSON.parse(JSON.stringify(loadedConfig)));

                let newConfig = {
                    redirectUri: "http://127.0.0.1:8888/callback", // Default
                    logLevel: 'INFO', // Default log level
                    isAuthenticated: false, // Default auth state
                    clientId: '',
                    clientSecret: '',
                    accessToken: null,
                    refreshToken: null,
                    ...(loadedConfig || {}), // Override defaults with loaded config if it exists
                };
                
                // If redirectUri was loaded but is empty/null, re-apply default (should be covered by spread)
                if (!newConfig.redirectUri) {
                     newConfig.redirectUri = "http://127.0.0.1:8888/callback";
                }
                if (!newConfig.logLevel) { // Ensure logLevel has a value
                    newConfig.logLevel = 'INFO';
                }

                this.modelValue.config = newConfig;
                
                this.$fd.info('initializeConfig - final modelValue.config after merging:', JSON.parse(JSON.stringify(this.modelValue.config)));
                return true;
            } catch (error) {
                this.$fd.error('Failed to initialize config:', error);
                 // Ensure modelValue.config is an object to prevent errors with subsequent property access
                if (!this.modelValue.config) {
                    this.modelValue.config = {};
                }
                // Set a default logLevel on error too, so UI doesn't break if other parts fail
                if (typeof this.modelValue.config.logLevel === 'undefined') {
                    this.modelValue.config.logLevel = 'INFO';
                }
                return false;
            } finally {
                this.isInitializing = false;
                // Ensure reactivity after potential object replacement
                // This forces Vue to recognize changes if the object reference of modelValue.config changed
                this.modelValue.config = { ...this.modelValue.config };
                 this.$fd.info('initializeConfig finished. Final modelValue.config for UI:', JSON.parse(JSON.stringify(this.modelValue.config)));
            }
        },
        async authenticateSpotify() {
            // Show notification that we're starting authentication
            this.notifications.auth.message = "Starting Spotify authentication...";
            this.notifications.auth.color = "info";
            this.notifications.auth.icon = "mdi-spotify";
            this.notifications.auth.show = true;
            
            try {
                // Save the configuration first to ensure the backend has the latest credentials AND LOG LEVEL
                await this.saveConfig();
                
                // Send authentication request to the backend plugin
                // The backend will use the config saved by saveConfig()
                const response = await this.$fd.sendToBackend({
                    data: 'spotify-auth' 
                    // No need to send config here if backend reads from its saved version
                });

                if (!response) {
                    throw new Error("No response received from backend");
                }

                if (response.success) {
                    const updatedConfigFromBackend = await this.$fd.getConfig();
                    this.modelValue.config = { ...updatedConfigFromBackend }; // Update UI with latest, including tokens
                    this.isAuthenticated = true; // This will be re-evaluated by checkAuthStatus via watcher
                    
                    this.notifications.auth.message = response.message || "Successfully connected to Spotify!";
                    this.notifications.auth.color = "success";
                    this.notifications.auth.icon = "mdi-check-circle";
                } else {
                    throw new Error(response.error || "Authentication failed");
                }
            } catch (error) {
                this.$fd.error('Auth error:', error);
                this.notifications.auth.message = `Could not connect to Spotify: ${error.message}`;
                this.notifications.auth.color = "error";
                this.notifications.auth.icon = "mdi-alert-circle";
            } finally {
                 this.notifications.auth.show = true; // Ensure snackbar shows for success or failure
                 this.checkAuthStatus(); // Re-check auth status after operations
            }
        },
        async disconnectSpotify() {
            this.$fd.info('Disconnecting Spotify...');
            try {
                const currentConfig = await this.$fd.getConfig() || {};
                const updatedConfig = {
                    ...currentConfig,
                    isAuthenticated: false,
                    accessToken: null,
                    refreshToken: null
                };
                
                await this.$fd.setConfig(updatedConfig);
                this.modelValue.config = { ...updatedConfig };
                // this.isAuthenticated will be updated by the watcher calling checkAuthStatus

                this.notifications.auth.message = "Successfully disconnected from Spotify";
                this.notifications.auth.color = "success";
                this.notifications.auth.icon = "mdi-check-circle";
            } catch (error) {
                this.$fd.error('Failed to disconnect:', error);
                this.notifications.auth.message = `Error disconnecting: ${error.message}`;
                this.notifications.auth.color = "error";
                this.notifications.auth.icon = "mdi-alert-circle";
            } finally {
                this.notifications.auth.show = true;
                this.checkAuthStatus(); // Re-check auth status
            }
        },
        showError(error) { // This method seems to be for generic errors, might need context for auth specifically
            this.$fd.error("showError called:", error.message)
            if (error.message && (error.message.toLowerCase().includes('authenticate') || error.message.toLowerCase().includes('token'))) {
                // this.isAuthenticated = false; // Let checkAuthStatus handle this
                this.notifications.auth.message = "Authentication issue. Please check credentials or try reconnecting.";
                this.notifications.auth.color = "warning";
                this.notifications.auth.icon = "mdi-alert";
            } else {
                this.notifications.auth.message = `Error: ${error.message || 'An unknown error occurred.'}`;
                this.notifications.auth.color = "error";
                this.notifications.auth.icon = "mdi-alert-circle";
            }
            this.notifications.auth.show = true;
            this.checkAuthStatus(); // Re-check auth status
        },
        checkAuthStatus() {
            const wasAuthenticated = this.isAuthenticated;
            this.isAuthenticated = !!(
                this.modelValue.config && 
                this.modelValue.config.isAuthenticated &&
                this.modelValue.config.accessToken // refreshToken also good, but accessToken is primary for API calls
            );
            if (wasAuthenticated !== this.isAuthenticated) {
                 this.$fd.info('Authentication status changed to:', this.isAuthenticated, 'from model config:', JSON.parse(JSON.stringify(this.modelValue.config)));
            }
        },
    },
    created() {
        this.$fd.info('Component created, initial modelValue on prop:', JSON.parse(JSON.stringify(this.modelValue)));
        // Ensure modelValue.config is an object, especially on first load if modelValue is empty
        if (!this.modelValue.config) {
            this.modelValue.config = {}; // Initialize to prevent errors before initializeConfig runs
        }
    },
    mounted() {
        this.$fd.info('Component mounted, modelValue before init:', JSON.parse(JSON.stringify(this.modelValue)));
        
        this.initializeConfig().then(() => {
            // checkAuthStatus is called by the watcher on modelValue.config change after initializeConfig
            this.$fd.info('Component fully mounted, modelValue.config.logLevel after init:', this.modelValue.config ? this.modelValue.config.logLevel : 'config not set');
        });
    }
};
</script>

<style scoped>
/* Add specific styles if needed */
.v-card-item {
    padding-bottom: 12px; /* Adjust spacing */
}

.scrollable-config-container {
  max-height: 100vh; 
  overflow-y: auto;
  padding-bottom: 16px; /* Ensure some padding at the very bottom when scrolled */
}
</style>