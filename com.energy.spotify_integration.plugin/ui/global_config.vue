<template>
    <v-container>
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
                    Save
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
                    message: "Spotify settings have been saved successfully"
                },
                auth: {
                    show: false,
                    message: "",
                    color: "info",
                    icon: "mdi-information"
                }
            }
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
                    this.modelValue.config.redirectUri = "http://127.0.0.1:8888/callback";
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
                // Save the configuration first to ensure the backend has the latest credentials
                await this.saveConfig();
                
                // Send authentication request to the backend plugin
                const response = await this.$fd.sendToBackend({
                    data: 'spotify-auth',
                    config: this.modelValue.config
                });

                // Add null check for the response
                if (!response) {
                    throw new Error("No response received from backend");
                }

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
                } else {
                    throw new Error(response.error || "Authentication failed");
                }
            } catch (error) {
                this.$fd.error('Auth error:', error);
                
                // Show error notification
                this.notifications.auth.message = `Could not connect to Spotify: ${error.message}`;
                this.notifications.auth.color = "error";
                this.notifications.auth.icon = "mdi-alert-circle";
                this.notifications.auth.show = true;
            }
        },
        async disconnectSpotify() {
            try {
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
        
        this.initializeConfig().then(() => {
            this.checkAuthStatus();
        });
    }
};
</script>

<style scoped>
/* Add specific styles if needed */
.v-card-item {
    padding-bottom: 12px; /* Adjust spacing */
}
</style>