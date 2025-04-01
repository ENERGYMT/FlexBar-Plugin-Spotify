const { plugin } = require("@eniac/flexdesigner");
const auth = require('./spotifyAuth');
const logger = require("./loggerWrapper"); 

// Basic Spotify API wrapper
const spotifyApi = {
    /**
     * Makes a request to the Spotify API, handling authentication and token refresh.
     * @param {string} endpoint API endpoint (e.g., 'me/player')
     * @param {string} method HTTP method (GET, POST, PUT, etc.)
     * @param {object|null} body Request body for POST/PUT requests
     * @returns {Promise<object|null>} Parsed JSON response or null for empty response
     * @throws {Error} If the request fails or authentication is required/fails
     */
    async makeRequest(endpoint, method = 'GET', body = null) {
        if (!auth.getAuthenticationStatus()) {
             // Maybe try to initialize first?
             const initialized = await auth.initializeAuthentication();
             if (!initialized) {
                logger.warn('Attempted API call without authentication.');
                throw new Error('Please authenticate with Spotify first');
             }
        }
        
        let tokens = auth.getTokens();
        if (!tokens.accessToken) {
             logger.error('Authenticated but no access token found.');
             throw new Error('Authentication error: Missing access token.');
        }

        try {
            logger.debug(`Making Spotify API request: ${method} /${endpoint}`);
            const response = await fetch(`https://api.spotify.com/v1/${endpoint}`, {
                method,
                headers: {
                    'Authorization': `Bearer ${tokens.accessToken}`,
                    'Content-Type': 'application/json'
                },
                ...(body && { body: JSON.stringify(body) }) // Only add body if it exists
            });

            if (response.status === 401) {
                // Token expired, try to refresh
                logger.info('Token expired during API request, attempting refresh...');
                const refreshSuccess = await auth.attemptTokenRefresh();
                
                if (refreshSuccess) {                    
                    // Retry the request with the new token
                    logger.info('Token refreshed, retrying API request...');
                    // Need to get the *new* token after refresh
                    tokens = auth.getTokens(); 
                     const retryResponse = await fetch(`https://api.spotify.com/v1/${endpoint}`, {
                         method,
                         headers: {
                             'Authorization': `Bearer ${tokens.accessToken}`,
                             'Content-Type': 'application/json'
                         },
                         ...(body && { body: JSON.stringify(body) })
                     });
                     
                     // Handle response after retry
                     if (!retryResponse.ok) {
                         const errorText = await retryResponse.text();
                         logger.error(`Spotify API error after retry (${retryResponse.status}): ${errorText}`);
                         throw new Error(`Spotify API error after retry: ${retryResponse.statusText} - ${errorText}`);
                     }
                     
                     const retryText = await retryResponse.text();
                     return retryText ? JSON.parse(retryText) : null;

                } else {
                    logger.error('Token refresh failed. Authentication required.');
                    // Optional: Clear auth status? The auth module should handle its state.
                    throw new Error('Authentication expired and refresh failed. Please re-authenticate.');
                }
            }

            if (response.status === 204) { // Handle No Content response
                logger.debug(`API request successful with status 204 (No Content). Endpoint: /${endpoint}`);
                return null; // No content to parse
            }

            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage = `Spotify API error (${response.status}): ${response.statusText}`;
                try {
                    const errorJson = JSON.parse(errorText);
                    errorMessage = `${errorJson.error?.message || errorMessage} (Details: ${errorText})`;
                } catch (e) {
                    errorMessage = `${errorMessage} - ${errorText}`;
                }
                logger.error(`Spotify API request failed: ${errorMessage}. Endpoint: /${endpoint}`);
                throw new Error(errorMessage);
            }

            // Check if response body is empty before parsing JSON
            const text = await response.text();
            if (!text) {
                logger.debug(`API request successful with empty response body. Endpoint: /${endpoint}`);
                return null;
            }

            try {
                const jsonData = JSON.parse(text);
                logger.debug(`API request successful. Endpoint: /${endpoint}`);
                return jsonData;
            } catch (e) {
                logger.error('Failed to parse Spotify API JSON response:', text);
                throw new Error('Invalid JSON response from Spotify API');
            }
        } catch (error) {
            // Log network errors or errors from the try block (like JSON parsing)
            logger.error(`Error during Spotify API call to /${endpoint}: ${error.message}`);
             // Re-throw the error to be handled by the caller
            throw error; 
        }
    },

    async play(uri = null, deviceId = null) {
        const params = new URLSearchParams();
        if (deviceId) params.append('device_id', deviceId);
        const endpoint = `me/player/play${deviceId ? '?' + params.toString() : ''}`;
        const body = uri ? { context_uri: uri } : null;
        return this.makeRequest(endpoint, 'PUT', body);
    },

    async pause(deviceId = null) {
        const params = new URLSearchParams();
        if (deviceId) params.append('device_id', deviceId);
        const endpoint = `me/player/pause${deviceId ? '?' + params.toString() : ''}`;
        return this.makeRequest(endpoint, 'PUT');
    },

    async next(deviceId = null) {
         const params = new URLSearchParams();
        if (deviceId) params.append('device_id', deviceId);
        const endpoint = `me/player/next${deviceId ? '?' + params.toString() : ''}`;
        return this.makeRequest(endpoint, 'POST');
    },

    async previous(deviceId = null) {
        const params = new URLSearchParams();
        if (deviceId) params.append('device_id', deviceId);
        const endpoint = `me/player/previous${deviceId ? '?' + params.toString() : ''}`;
        return this.makeRequest(endpoint, 'POST');
    },

    async setVolume(volumePercent, deviceId = null) {
        const params = new URLSearchParams();
        params.append('volume_percent', volumePercent);
        if (deviceId) params.append('device_id', deviceId);
        const endpoint = `me/player/volume?${params.toString()}`;
        return this.makeRequest(endpoint, 'PUT');
    },

    async search(query, types = ['track', 'album', 'playlist'], limit = 10, offset = 0) {
        const params = new URLSearchParams({
            q: query,
            type: types.join(','),
            limit: limit,
            offset: offset
        });
        const endpoint = `search?${params.toString()}`;
        return this.makeRequest(endpoint, 'GET');
    },

    async getUserPlaylists(limit = 50, offset = 0) {
         const params = new URLSearchParams({
            limit: limit,
            offset: offset
        });
        const endpoint = `me/playlists?${params.toString()}`;
        return this.makeRequest(endpoint, 'GET');
    },

    async getCurrentPlayback() {
        // Add additional_types=track,episode if needed
        return this.makeRequest('me/player'); 
    },

    /**
     * Checks if one or more tracks are saved in the current user's 'Your Music' library.
     * @param {string[]} trackIds An array of Spotify track IDs.
     * @returns {Promise<boolean[]>} A Promise that resolves to an array of booleans.
     * @throws {Error} If the request fails.
     */
    async checkTracksSaved(trackIds) {
        if (!trackIds || trackIds.length === 0) {
            return [];
        }
        // Spotify API has a limit of 50 IDs per request for this endpoint
        if (trackIds.length > 50) {
            logger.warn('checkTracksSaved called with more than 50 IDs. Only checking the first 50.');
            trackIds = trackIds.slice(0, 50);
        }
        const params = new URLSearchParams({
            ids: trackIds.join(',')
        });
        const endpoint = `me/tracks/contains?${params.toString()}`;
        return this.makeRequest(endpoint, 'GET');
    },

    /**
     * Saves one or more tracks to the current user's 'Your Music' library.
     * @param {string[]} trackIds An array of Spotify track IDs.
     * @returns {Promise<null>} A Promise that resolves when the operation is complete.
     * @throws {Error} If the request fails.
     */
    async saveTracks(trackIds) {
        if (!trackIds || trackIds.length === 0) {
            return null;
        }
        // Spotify API has a limit of 50 IDs per request
        if (trackIds.length > 50) {
             logger.warn('saveTracks called with more than 50 IDs. Only saving the first 50.');
            trackIds = trackIds.slice(0, 50);
        }
        const endpoint = 'me/tracks';
        const body = { ids: trackIds };
        // This endpoint returns 200 OK on success with no body content
        await this.makeRequest(endpoint, 'PUT', body);
        return null; // Indicate success
    },

    /**
     * Removes one or more tracks from the current user's 'Your Music' library.
     * @param {string[]} trackIds An array of Spotify track IDs.
     * @returns {Promise<null>} A Promise that resolves when the operation is complete.
     * @throws {Error} If the request fails.
     */
    async removeTracks(trackIds) {
        if (!trackIds || trackIds.length === 0) {
            return null;
        }
         // Spotify API has a limit of 50 IDs per request
        if (trackIds.length > 50) {
             logger.warn('removeTracks called with more than 50 IDs. Only removing the first 50.');
            trackIds = trackIds.slice(0, 50);
        }
        const endpoint = 'me/tracks';
        const body = { ids: trackIds };
         // This endpoint returns 200 OK on success with no body content
        await this.makeRequest(endpoint, 'DELETE', body);
        return null; // Indicate success
    },

    /**
     * Exchanges an authorization code for access and refresh tokens.
     * Requires clientId, clientSecret, and redirectUri from config.
     * @param {string} code The authorization code from the callback.
     * @returns {Promise<object>} Object containing access_token, refresh_token, etc.
     * @throws {Error} If config is missing or the request fails.
     */
    async authorizationCodeGrant(code) {
        let config;
        try {
             config = await plugin.getConfig();
        } catch(e) {
            logger.error("Failed to get config for authorizationCodeGrant:", e);
            throw new Error("Configuration unavailable for token exchange.");
        }
        
        if (!config.clientId || !config.clientSecret || !config.redirectUri) {
            logger.error("Missing required config for authorizationCodeGrant (clientId, clientSecret, redirectUri).");
            throw new Error("Missing configuration for token exchange.");
        }

        try {
            const response = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    // Correctly encode client ID and secret for Basic Auth
                    'Authorization': 'Basic ' + Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')
                },
                body: new URLSearchParams({
                    grant_type: 'authorization_code',
                    code: code,
                    redirect_uri: config.redirectUri
                })
            });
    
            if (!response.ok) {
                const errorText = await response.text();
                logger.error(`Spotify token exchange error (${response.status}): ${errorText}`);
                throw new Error(`Spotify token exchange failed: ${response.statusText} - ${errorText}`);
            }
    
            const data = await response.json();
            logger.info("Authorization code grant successful.");
            return data; // Contains access_token, refresh_token, expires_in, etc.

        } catch (error) {
             logger.error("Error during authorizationCodeGrant fetch:", error);
             throw error; // Re-throw the error
        }
    }
};

module.exports = spotifyApi; 