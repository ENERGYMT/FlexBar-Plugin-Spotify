const { plugin, logger } = require("@eniac/flexdesigner");
const open = require('open');
const http = require('http');

// Store auth tokens locally within this module
let spotifyTokens = {
    accessToken: null,
    refreshToken: null
};

// Store authentication state locally
let isAuthenticated = false;

// Store the refresh timer locally
let tokenRefreshTimer = null;

/**
 * Sets up or resets the automatic token refresh timer.
 * THIS MUST BE DEFINED BEFORE functions that call it (initializeTokensFromConfigInternal, refreshAccessTokenInternal).
 */
function setupTokenRefreshTimer() {
    // Clear existing timer if any
    if (tokenRefreshTimer) {
        clearInterval(tokenRefreshTimer);
        tokenRefreshTimer = null;
         logger.debug("Cleared existing token refresh timer.");
    }
    
    // Only set up timer if authenticated and we have a refresh token
    if (isAuthenticated && spotifyTokens.refreshToken) {
        const REFRESH_INTERVAL = 45 * 60 * 1000; // 45 minutes
        tokenRefreshTimer = setInterval(async () => {
            logger.info('Scheduled token refresh running...');
            const refreshed = await refreshAccessTokenInternal(); // Use internal function
            if (!refreshed) {
                logger.error("Scheduled token refresh failed. Authentication may be lost.");
                // Optionally stop timer if refresh consistently fails?
            }
        }, REFRESH_INTERVAL);
        logger.info(`Token refresh timer set for ${REFRESH_INTERVAL / 60000} minutes.`);
    } else {
         logger.info('Token refresh timer not set (not authenticated or no refresh token).');
    }
}

/**
 * Initializes tokens from config and validates them.
 * Returns true if authentication is successful (valid or refreshed token),
 * false otherwise.
 */
async function initializeTokensFromConfigInternal() {
    try {
        logger.info('Initializing tokens from config...');
        const config = await plugin.getConfig();
        // logger.info('config', config) // DEBUG

        // Check if we have the necessary credentials
        if (!config.clientId || !config.clientSecret) {
            logger.error('Missing Spotify API credentials in config');
            isAuthenticated = false;
            return false;
        }

        if (config.accessToken && config.refreshToken) {
            spotifyTokens.accessToken = config.accessToken;
            spotifyTokens.refreshToken = config.refreshToken;

            logger.info('Tokens found in config, validating...');

            // Check if token is valid by making a simple API call
            try {
                const response = await fetch('https://api.spotify.com/v1/me', {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${spotifyTokens.accessToken}`
                    }
                });

                if (response.status === 401) {
                    // Token expired, try to refresh it
                    logger.info('Token expired, attempting to refresh...');
                    const refreshSuccess = await refreshAccessTokenInternal(); // Use internal function
                    isAuthenticated = refreshSuccess; // Update state based on refresh result
                    if (refreshSuccess) {
                        logger.info('Token refreshed successfully during initialization');
                        setupTokenRefreshTimer(); // Re-setup timer after successful refresh
                        return true;
                    } else {
                        logger.error('Failed to refresh token during initialization');
                        return false;
                    }
                } else if (response.ok) {
                    isAuthenticated = true;
                    logger.info('Tokens validated successfully');
                    setupTokenRefreshTimer(); // Setup timer with valid tokens
                    return true;
                } else {
                    logger.error(`Token validation failed: ${response.status} ${response.statusText}`);
                    const errorBody = await response.text();
                    logger.error(`Response body: ${errorBody}`);
                    isAuthenticated = false;
                    return false;
                }
            } catch (error) {
                logger.error('Error validating token:', error);

                // Try to refresh the token
                logger.info('Attempting to refresh token after validation error');
                const refreshSuccess = await refreshAccessTokenInternal(); // Use internal function
                isAuthenticated = refreshSuccess;
                if(refreshSuccess) setupTokenRefreshTimer();
                return refreshSuccess;
            }
        } else {
            logger.info('No tokens found in config, authentication required');
            isAuthenticated = false;
            return false;
        }
    } catch (error) {
        logger.error('Failed to load tokens from config:', error);
        isAuthenticated = false;
        return false;
    }
}

/**
 * Refreshes the Spotify access token using the refresh token (Internal use).
 * Returns true on success, false on failure.
 */
async function refreshAccessTokenInternal(retryCount = 0) {
    const maxRetries = 2;
    try {
        logger.info(`Refreshing access token (attempt ${retryCount + 1}/${maxRetries + 1})...`);

        const config = await plugin.getConfig();
        if (!config.clientId || !config.clientSecret) {
            logger.error('Missing Spotify API credentials in config for refresh');
            isAuthenticated = false;
            return false;
        }

        if (!spotifyTokens.refreshToken) {
            logger.error('No refresh token available to refresh access token');
            isAuthenticated = false;
            return false;
        }

        const refreshResponse = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(config.clientId + ':' + config.clientSecret).toString('base64')
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: spotifyTokens.refreshToken
            })
        });

        if (!refreshResponse.ok) {
            const errorText = await refreshResponse.text();
            logger.error(`Failed to refresh token (${refreshResponse.status}): ${errorText}`);
            isAuthenticated = false; // Assume failure means not authenticated

            // Check if the error indicates an invalid refresh token
             if (refreshResponse.status === 400 && errorText.includes("Invalid refresh token")) {
                 logger.error("Refresh token is invalid. Clearing tokens and requiring re-authentication.");
                 spotifyTokens.accessToken = null;
                 spotifyTokens.refreshToken = null;
                 // Clear tokens from config as well? Maybe safer not to automatically delete.
                 // Consider adding a flag or message indicating re-auth is needed.
                 await plugin.setConfig({...config, accessToken: null, refreshToken: null}); // Clear tokens in config too
                 isAuthenticated = false;
                 stopTokenRefresh(); // Stop the timer
                 return false; // Don't retry if token is fundamentally invalid
             }

            // Retry logic for other errors
            if (retryCount < maxRetries) {
                logger.info(`Retrying token refresh in 3 seconds...`);
                await new Promise(resolve => setTimeout(resolve, 3000));
                return refreshAccessTokenInternal(retryCount + 1);
            }

            return false;
        }

        const refreshData = await refreshResponse.json();

        // Update local tokens
        spotifyTokens.accessToken = refreshData.access_token;
        // If a new refresh token was provided, update it too
        if (refreshData.refresh_token) {
            spotifyTokens.refreshToken = refreshData.refresh_token;
        } else {
            logger.warn("No new refresh token provided by Spotify during refresh.");
            // Keep using the old one, but this might indicate a future issue.
        }

        // Save to config
        try {
            const updatedConfig = {
                ...config, // Preserve existing config values
                accessToken: spotifyTokens.accessToken,
                refreshToken: spotifyTokens.refreshToken
            };
            await plugin.setConfig(updatedConfig);
             logger.info("Refreshed tokens saved to config.");
        } catch (saveError) {
             logger.error('Failed to save refreshed tokens to config:', saveError);
             // Even if saving fails, we might still be able to proceed with the new token in memory
        }
        
        isAuthenticated = true;
        logger.info('Access token refreshed successfully');
        setupTokenRefreshTimer(); // Ensure timer is (re)started after successful refresh
        return true;

    } catch (error) {
        logger.error('Token refresh error:', error);
        isAuthenticated = false; // Assume error means not authenticated

        // Retry logic
        if (retryCount < maxRetries) {
            logger.info(`Retrying token refresh in 3 seconds after error...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
            return refreshAccessTokenInternal(retryCount + 1);
        }

        return false;
    }
}

/**
 * Starts the OAuth authorization flow by opening the Spotify auth URL
 * and starting a local server to listen for the callback.
 * Uses the provided spotifyApi instance to exchange the code for tokens.
 * @param {object} spotifyApiInstance - An instance of the spotifyApi object with an authorizationCodeGrant method.
 * @returns {Promise<boolean>} True if authentication succeeds, false otherwise.
 */
async function initiateUserAuthentication(spotifyApiInstance) {
     // Clear any existing refresh timer during manual auth
     stopTokenRefresh();
    
    return new Promise(async (resolve, reject) => {
        let config;
        try {
             config = await plugin.getConfig();
        } catch(e){
            logger.error("Failed to get config before authentication:", e);
            return reject(new Error("Failed to read plugin configuration"));
        }
       
        if (!config.clientId || !config.redirectUri) {
             logger.error("Client ID or Redirect URI missing in config for authentication.");
             return reject(new Error("Client ID or Redirect URI missing"));
        }
        
        // Ensure spotifyApiInstance is provided and has the required method
        if (!spotifyApiInstance || typeof spotifyApiInstance.authorizationCodeGrant !== 'function') {
             logger.error("Invalid or missing spotifyApiInstance for initiateUserAuthentication.");
             return reject(new Error("Spotify API instance with authorizationCodeGrant method is required."));
        }

        let server; // Declare server variable outside the createServer scope

        try {
            server = http.createServer(async (req, res) => { // Make callback async
                const currentUrl = new URL(req.url, `http://${req.headers.host}`);

                if (currentUrl.pathname === '/callback') {
                    const code = currentUrl.searchParams.get('code');
                    const error = currentUrl.searchParams.get('error');
                    const state = currentUrl.searchParams.get('state'); // Optional: Handle state parameter if used

                    if (error) {
                        logger.error(`Spotify auth error from callback: ${error}`);
                        res.writeHead(500, { 'Content-Type': 'text/html' });
                        res.end(`<h1>Authentication Failed: ${error}. Please try again.</h1>`);
                        server.close(() => logger.info("Auth server closed due to callback error."));
                        isAuthenticated = false;
                        return reject(new Error(`Spotify authentication error: ${error}`));
                    }

                    if (code) {
                        try {
                             // Exchange code for tokens using the passed spotifyApiInstance
                            const data = await spotifyApiInstance.authorizationCodeGrant(code);
                                
                            spotifyTokens.accessToken = data.access_token;
                            spotifyTokens.refreshToken = data.refresh_token;
    
                            // Update config with new tokens
                            const currentConfig = await plugin.getConfig(); // Re-fetch in case changed
                            const updatedConfig = {
                                ...currentConfig,
                                accessToken: spotifyTokens.accessToken,
                                refreshToken: spotifyTokens.refreshToken
                            };
    
                            // Save to config
                            await plugin.setConfig(updatedConfig);
                            logger.info('Tokens saved to config after auth code grant');
    
                            // Set authenticated flag
                            isAuthenticated = true;
    
                            // Set up token refresh timer
                            setupTokenRefreshTimer();
    
                            res.writeHead(200, { 'Content-Type': 'text/html' });
                            res.end('<h1>Authentication successful! You can close this window.</h1>');
                            server.close(() => logger.info("Auth server closed after successful authentication."));
                            resolve(true);
                        } catch (grantError) {
                            logger.error('Auth code grant error:', grantError);
                            res.writeHead(500, { 'Content-Type': 'text/html' });
                            res.end('<h1>Authentication failed during token exchange. Please check logs and try again.</h1>');
                             server.close(() => logger.info("Auth server closed due to grant error."));
                            isAuthenticated = false;
                            reject(grantError);
                        }
                    } else {
                        res.writeHead(400, { 'Content-Type': 'text/html' });
                        res.end('<h1>Missing authorization code. Please try again.</h1>');
                        server.close(() => logger.info("Auth server closed due to missing code."));
                        isAuthenticated = false;
                        reject(new Error('Missing authorization code in callback'));
                    }
                } else {
                    // Handle other paths - respond with 404
                    res.writeHead(404, { 'Content-Type': 'text/html' });
                    res.end('<h1>Not Found</h1>');
                }
            });

            server.listen(8888, () => {
                logger.info('Auth callback server listening on port 8888');
                const scopes = 'user-read-playback-state user-modify-playback-state user-read-currently-playing';
                // Consider adding state parameter for security:
                // const state = require('crypto').randomBytes(16).toString('hex'); 
                // Store state temporarily and verify in callback
                const authUrl = `https://accounts.spotify.com/authorize?client_id=${config.clientId}&response_type=code&redirect_uri=${encodeURIComponent(config.redirectUri)}&scope=${encodeURIComponent(scopes)}`;
                
                logger.info(`Opening auth URL: ${authUrl}`);
                open(authUrl)
                    .catch(err => {
                        logger.error('Failed to open auth URL:', err);
                        if (server && server.listening) {
                            server.close(); // Close server if browser fails to open
                        }
                        reject(err);
                    });
            });
            
            server.on('error', (err) => {
                logger.error('Auth server error:', err);
                 // Handle specific errors like EADDRINUSE
                 if (err.code === 'EADDRINUSE') {
                     logger.error("Port 8888 is already in use. Cannot start authentication server.");
                     reject(new Error("Port 8888 is already in use."));
                 } else {
                    reject(err);
                 }
            });

        } catch (serverSetupError) {
             logger.error("Failed to setup authentication server:", serverSetupError);
             reject(serverSetupError);
        }
    });
}

// --- Exported Functions --- //

/** Get current authentication status */
function getAuthenticationStatus() {
    return isAuthenticated;
}

/** Get current tokens (use carefully, returns a copy) */
function getTokens() {
    // Return a copy to prevent external modification
    return { ...spotifyTokens }; 
}

/** Manually trigger a token refresh */
async function attemptTokenRefresh() {
    return await refreshAccessTokenInternal(); // Use internal function
}

/** Attempt to initialize authentication state from stored config */
async function initializeAuthentication() {
    return await initializeTokensFromConfigInternal(); // Use internal function
}

/** Start the user authentication flow */
async function startUserAuthenticationFlow(spotifyApiInstance) {
    return await initiateUserAuthentication(spotifyApiInstance); // Use internal function
}

/** Stop the token refresh timer */
function stopTokenRefresh() {
    if (tokenRefreshTimer) {
        clearInterval(tokenRefreshTimer);
        tokenRefreshTimer = null;
        logger.info('Token refresh timer stopped.');
    }
}

module.exports = {
    initializeAuthentication,
    startUserAuthenticationFlow,
    getAuthenticationStatus,
    getTokens, // Provides access token needed by API calls
    attemptTokenRefresh, // Needed by API wrapper for retries
    stopTokenRefresh // Export stop function if needed elsewhere (e.g., on plugin unload)
}; 