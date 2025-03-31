const { plugin, logger, pluginPath, resourcesPath } = require("@eniac/flexdesigner")
const path = require('path')
const open = require('open')
// Remove canvas requires if they are no longer needed directly in plugin.js
// const { createCanvas, loadImage } = require('@napi-rs/canvas') 
const { 
    // Remove rendering-related utils if they are only used in canvasRenderer now
    // adjustColor, // Moved?
    // truncateText, // Moved?
    // createFallbackImage, // Moved?
    // getImageColors, // Moved?
    escapeXml,
    // roundedRect // Moved?
} = require('./utils');
const spotifyAuth = require('./spotifyAuth'); 
const spotifyApi = require('./spotifyApi'); 
const renderer = require('./canvasRenderer'); // Require the renderer
const keyManager = require('./keyManager'); // ADD require

// --- Global State for Playback ---
let currentPlaybackState = {
    trackId: null,
    isLiked: null,
    lastCheckedTrackId: null, // Track the ID we last checked the liked status for
    isActive: false, // Is Spotify actively playing something?
    isPlaying: false // Is it currently playing vs paused?
};
// --- End Global State ---

// --- Remove Key Management State --- //
// const keyData = {}; 
// var feedbackKeys = []; // Still keep locally?
// const keyIntervals = {};
// const activeKeys = {};
// let lastUpdateTime = 0;
// const MIN_UPDATE_INTERVAL = 2000;

// var feedbackKeys = []; // Remove this unused variable

logger.info(`Plugin path: ${pluginPath}`)
logger.info(`Plugin Resources path: ${resourcesPath}`)

// --- Remove Key Management Function Definitions --- //
// function cleanupKey(...) { ... }
// function isDeviceConnected(...) { ... }
// function simpleDraw(...) { ... }
// function textOnlyDraw(...) { ... }
// function throttledUpdateCheck(...) { ... }
// function simpleTextDraw(...) { ... }

// --- Canvas Function Placeholders (Removed previously) --- //

// --- Event Handlers / Logic (Using keyManager) --- //

async function controlSpotify(action, value = null) { /* Original - No change */ }

// Implement triggerNowPlayingUpdate using keyManager
function triggerNowPlayingUpdate() {
    logger.info("Triggering manual update for all active 'now playing' and 'like' keys.");
    Object.keys(keyManager.activeKeys).forEach(keyId => {
        const [serialNumber, keyUid] = keyId.split('-');
        const key = keyManager.keyData[keyUid];
        if (!key) return; // Skip if key data somehow missing

        // Trigger update for both now playing and like keys
        if (key.cid === 'com.energy.spotify_integration.nowplaying') {
            logger.debug(`Manually updating now playing key ${keyId}`);
            updateNowPlayingKey(serialNumber, key); // Will fetch new state and update relevant keys
        } else if (key.cid === 'com.energy.spotify_integration.like') {
            // Just ensure it redraws with current state
            logger.debug(`Manually updating like key display ${keyId}`);
            updateLikeKeyDisplay(serialNumber, key);
        }
    });
}

// --- Refactored Event Handler Logic (Update to use keyManager) --- //

function _handleDeviceStatus(devices) {
    logger.info('Device status changed (handler):', devices);
    const connectedSerialNumbers = devices.map(device => String(device.serialNumber));
    
    // Use keyManager.activeKeys and keyManager.cleanupKey
    Object.keys(keyManager.activeKeys).forEach(keyId => { 
        const [serialNumber, keyUid] = keyId.split('-');
        if (!connectedSerialNumbers.includes(serialNumber)) {
            logger.info(`Device ${serialNumber} disconnected, cleaning up key ${keyUid} via handler`);
            keyManager.cleanupKey(serialNumber, keyUid); 
        }
    });
}

function _handlePluginAlive(payload) {
    logger.info('Processing plugin.alive (handler):', payload);
    const keys = payload.keys;
    const serialNumber = String(payload.serialNumber);
    
    // Use keyManager.activeKeys and keyManager.cleanupKey
    Object.keys(keyManager.activeKeys).forEach(keyId => { 
        const [sn, keyUid] = keyId.split('-');
        if (sn === serialNumber) {
             logger.debug(`Cleaning up potentially stale key ${keyUid} on device ${serialNumber} via handler.`);
            keyManager.cleanupKey(serialNumber, keyUid); 
        }
    });
    
    for (let key of keys) {
        const keyUid = key.uid;
        if (keyUid === undefined || keyUid === null) {
             logger.error('Received key with invalid UID in plugin.alive (handler), skipping:', key);
             continue;
         }
        const keyId = `${serialNumber}-${keyUid}`;

        // Use keyManager state
        keyManager.activeKeys[keyId] = true; 
        keyManager.keyData[keyUid] = key; 
        logger.debug(`Registered key ${keyId} as active via handler.`);
        logger.info(`Initializing key via handler: ${key.cid} (UID: ${keyUid}) on device ${serialNumber}`);
        
        // Call local initialization functions (these will need keyManager too)
        if (key.cid === 'com.energy.spotify_integration.nowplaying') {
            initializeNowPlayingKey(serialNumber, key); 
        } else if (key.cid === 'com.energy.spotify_integration.counter') {
             initializeCounterKey(serialNumber, key); 
        } else if (key.cid === 'com.energy.spotify_integration.like') {
            initializeLikeKey(serialNumber, key);
        }
    }
}

function _handlePluginData(payload) {
     logger.info('Received plugin.data (handler):', payload);
    const data = payload.data;
    const serialNumber = String(payload.serialNumber);
    const key = data?.key;

    if (!key || key.uid === undefined || key.uid === null) {
         logger.error("Received plugin.data with invalid key object (handler).", data);
         return { status: "error", message: "Invalid key data received." };
    }
    
    const keyUid = key.uid;
    const keyId = `${serialNumber}-${keyUid}`;

    // Use keyManager state
    if (!keyManager.activeKeys[keyId]) { 
        logger.warn(`Received interaction for inactive key ${keyId} (handler). Re-registering.`);
        keyManager.activeKeys[keyId] = true;
        if (!keyManager.keyData[keyUid]) {
             keyManager.keyData[keyUid] = key; // Use keyManager state
             logger.warn(`Data for key ${keyUid} was missing, using received data (handler).`);
             // Consider re-initializing?
        }
    }
    
    // Delegate to local interaction handlers (these will need keyManager too)
    if (key.cid === "com.energy.spotify_integration.nowplaying") {
        handleNowPlayingInteraction(serialNumber, key, data);
        return { status: "success", message: "Handled now playing interaction." };
    } else if (key.cid === "com.energy.spotify_integration.counter") {
         handleCounterInteraction(serialNumber, key, data);
         return { status: "success", message: "Handled counter interaction." };
    } else if (key.cid === "com.energy.spotify_integration.cyclebutton") {
        logger.info(`Cycle button interaction: state=${data.state} (handler)`);
        return { status: "success", message: `Cycle button state: ${data.state}` };
    } else if (key.cid === "com.energy.spotify_integration.like") {
        handleLikeInteraction(serialNumber, key, data);
        return { status: "success", message: "Handled like interaction." };
    }
    
     logger.warn(`Unhandled key interaction via handler for CID: ${key.cid}`);
     return { status: "ignored", message: `No handler for CID ${key.cid}` };
}

// --- Plugin Event Listener Setup --- //

plugin.on('ui.message', async (payload) => { /* Original - No change needed here */ 
     logger.info('Received message from UI:', payload);
    if (payload.data === 'spotify-auth') {
        try {
            const success = await spotifyAuth.startUserAuthenticationFlow(spotifyApi);
            return { success: success, message: success ? 'Spotify auth initiated.' : 'Auth failed.' };
        } catch (error) { return { success: false, error: error.message }; }
    }
    if (!spotifyAuth.getAuthenticationStatus()) {
        const initSuccess = await spotifyAuth.initializeAuthentication(); 
        if (!initSuccess) return { success: false, error: 'Auth required', needsAuth: true };
    }
    try {
        switch (payload.data) {
            case 'get-playback': return { success: true, data: await spotifyApi.getCurrentPlayback() };
            case 'get-playlists': return { success: true, data: await spotifyApi.getUserPlaylists(payload.limit, payload.offset) };
            case 'search': 
                 if (!payload.query) return { success: false, error: 'Query required.' };
                 return { success: true, data: await spotifyApi.search(payload.query, payload.types, payload.limit, payload.offset) };
            case 'spotify-control':
                 if (!payload.action) return { success: false, error: 'Action required.' };
                await controlSpotify(payload.action, payload.value || payload.volume);
                 triggerNowPlayingUpdate(); 
                return { success: true, message: `Action '${payload.action}' successful` };
            default: return { success: false, error: 'Unknown command' };
        }
    } catch (error) {
        const needsAuth = !spotifyAuth.getAuthenticationStatus() || error.message.includes('authenticate');
        return { success: false, error: error.message, needsAuth };
    }
});

plugin.on('device.status', _handleDeviceStatus);
plugin.on('plugin.alive', _handlePluginAlive);
plugin.on('plugin.data', _handlePluginData);

// --- Initialization and Interaction Handlers (Update to use keyManager) --- //

/** Initialize Now Playing Key */
async function initializeNowPlayingKey(serialNumber, key) {
    const keyUid = key.uid;
    const keyId = `${serialNumber}-${keyUid}`;
    logger.info('Initializing nowplaying key:', keyId);

    // Initialize data and store in keyManager
    key.data = {
        updateInterval: key.data?.updateInterval || 5000,
        showArtist: key.data?.showArtist !== undefined ? key.data.showArtist : true,
        showProgress: key.data?.showProgress !== undefined ? key.data.showProgress : true,
        showTitle: key.data?.showTitle !== undefined ? key.data.showTitle : true,
        showPlayPause: key.data?.showPlayPause !== undefined ? key.data.showPlayPause : true,
        titleFontSize: key.data?.titleFontSize || 18, 
        artistFontSize: key.data?.artistFontSize || 14, 
        currentTrack: null
    };
    keyManager.keyData[keyUid] = key; // Use keyManager state
    
    key.style = key.style || {};
    key.style.showIcon = false;
    key.style.showTitle = false;
    key.style.showEmoji = false;
    key.style.showImage = true; 

    // Use renderer for image, keyManager for drawing
    try {
        const loadingImage = await renderer.createSpotifyButtonDataUrl( 
            key.width || 360, 'Loading...', 'Connecting...', false, null, 0, 0, key.style,
            key.data.showProgress, key.data.showTitle, key.data.showPlayPause, 
            key.data.titleFontSize, key.data.artistFontSize
        ); 
        keyManager.simpleDraw(serialNumber, key, loadingImage); 
    } catch (error) {
        logger.error(`Failed loading image for ${keyId}: ${error.message}`);
        keyManager.textOnlyDraw(serialNumber, key); 
    }

    updateNowPlayingKey(serialNumber, key); 
    startNowPlayingUpdates(serialNumber, key); 
}

/** Start Periodic Updates for Now Playing Key */
function startNowPlayingUpdates(serialNumber, key) {
     const keyUid = key.uid;
     const keyId = `${serialNumber}-${keyUid}`;
     const updateInterval = key.data?.updateInterval || 5000;

     // Use keyManager state
     if (keyManager.keyIntervals[keyId]) { 
         clearInterval(keyManager.keyIntervals[keyId]);
         delete keyManager.keyIntervals[keyId];
     }

     logger.info(`Starting updates for key ${keyId} every ${updateInterval}ms.`);
     const intervalId = setInterval(async () => {
         // Use keyManager state
         if (!keyManager.activeKeys[keyId]) { 
             logger.info(`Key ${keyId} no longer active, clearing update interval.`);
             clearInterval(intervalId);
             delete keyManager.keyIntervals[keyId]; 
             return;
         }
         await updateNowPlayingKey(serialNumber, key); 
     }, updateInterval);

     // Use keyManager state
     keyManager.keyIntervals[keyId] = intervalId; 
}

/** Update Now Playing Key Display and Fetch State */
async function updateNowPlayingKey(serialNumber, key) {
    const keyUid = key.uid;
    const keyId = `${serialNumber}-${keyUid}`;
    logger.debug(`Updating now playing key: ${keyId}`);

    if (!keyManager.activeKeys[keyId]) {
        logger.warn(`Attempted to update inactive key ${keyId}, cleaning up interval.`);
        keyManager.cleanupKey(serialNumber, keyUid); // Use keyManager cleanup
        return;
    }

    let playbackState = null;
    let fetchError = null;
    try {
        if (!spotifyAuth.getAuthenticationStatus()) {
             const initSuccess = await spotifyAuth.initializeAuthentication();
             if (!initSuccess) throw new Error('Authentication required and initialization failed.');
        }
        playbackState = await spotifyApi.getCurrentPlayback();
    } catch (error) {
        logger.error(`Error fetching playback state for ${keyId}: ${error.message}`);
        fetchError = error;
    }

    const isActive = !!(playbackState && playbackState.item);
    const isPlaying = isActive && playbackState.is_playing;
    const currentTrack = isActive ? playbackState.item : null;
    const trackId = currentTrack?.id;

    // --- Update Global Playback State --- 
    currentPlaybackState.isActive = isActive;
    currentPlaybackState.isPlaying = isPlaying;
    let trackChanged = false;
    let likedStatusChanged = false;

    if (isActive && trackId && trackId !== currentPlaybackState.trackId) {
        trackChanged = true;
        logger.info(`New track detected: ${trackId} (was ${currentPlaybackState.trackId})`);
        currentPlaybackState.trackId = trackId;
        currentPlaybackState.isLiked = null; // Reset like status until checked

        // Check liked status only if the track changed AND it hasn't been checked recently
        if (trackId !== currentPlaybackState.lastCheckedTrackId) {
             logger.debug(`Checking liked status for new track: ${trackId}`);
            try {
                const savedStatus = await spotifyApi.checkTracksSaved([trackId]);
                if (savedStatus && savedStatus.length > 0) {
                    currentPlaybackState.isLiked = savedStatus[0];
                    likedStatusChanged = true; // Status determined
                    logger.info(`Track ${trackId} liked status: ${currentPlaybackState.isLiked}`);
                } else {
                     logger.warn(`Could not determine liked status for track ${trackId}`);
                }
                currentPlaybackState.lastCheckedTrackId = trackId; // Mark as checked
            } catch (error) {
                logger.error(`Error checking if track ${trackId} is saved: ${error.message}`);
                // Keep isLiked as null, maybe retry later?
            }
        }
    } else if (!isActive && currentPlaybackState.trackId) {
        // Playback stopped
        trackChanged = true; // Treat stopping as a change
        logger.info("Playback stopped or became inactive.");
        currentPlaybackState.trackId = null;
        currentPlaybackState.isLiked = null;
        currentPlaybackState.lastCheckedTrackId = null;
    }
    // --- End Update Global Playback State ---

    // Retrieve the latest key data from the manager
    const currentKeyData = keyManager.keyData[keyUid];
    if (!currentKeyData) {
        logger.error(`Key data for ${keyUid} not found during update.`);
        return;
    }

    // Render Now Playing Key
    try {
        const imageUrl = currentTrack?.album?.images?.[0]?.url;
        const title = escapeXml(currentTrack?.name || (fetchError ? 'Error' : 'Nothing Playing'));
        const artist = escapeXml(currentTrack?.artists?.map(a => a.name).join(', ') || (fetchError ? fetchError.message : ''));
        const progress = isActive ? playbackState.progress_ms : 0;
        const duration = currentTrack?.duration_ms || 0;

        const buttonDataUrl = await renderer.createSpotifyButtonDataUrl(
            currentKeyData.width || 360,
            title,
            artist,
            isPlaying,
            imageUrl,
            progress,
            duration,
            currentKeyData.style || {},
            currentKeyData.data.showProgress,
            currentKeyData.data.showTitle,
            currentKeyData.data.showPlayPause,
            currentKeyData.data.titleFontSize,
            currentKeyData.data.artistFontSize,
            {} // Empty options obj -> defaults to nowPlaying
        );
        keyManager.simpleDraw(serialNumber, currentKeyData, buttonDataUrl);
    } catch (error) {
        logger.error(`Error rendering now playing key ${keyId}: ${error.message}`);
        keyManager.textOnlyDraw(serialNumber, currentKeyData, 'Error updating');
    }

    // --- Trigger Update for Like Keys if needed ---
    if (trackChanged || likedStatusChanged) {
        logger.debug(`Track change or liked status change detected. Updating like keys.`);
        Object.keys(keyManager.activeKeys).forEach(activeKeyId => {
            const [sn, likeKeyUid] = activeKeyId.split('-');
            const likeKey = keyManager.keyData[likeKeyUid];
            if (likeKey && likeKey.cid === 'com.energy.spotify_integration.like') {
                // Update the key data directly before redraw
                likeKey.data = likeKey.data || {}; // Ensure data object exists
                likeKey.data.currentTrackId = currentPlaybackState.trackId;
                likeKey.data.isLiked = currentPlaybackState.isLiked;
                logger.debug(`Updating like key ${activeKeyId} with track ${likeKey.data.currentTrackId}, liked: ${likeKey.data.isLiked}`);
                updateLikeKeyDisplay(sn, likeKey);
            }
        });
    }
    // --- End Trigger Update for Like Keys ---
}

/** Initialize Like Key */
async function initializeLikeKey(serialNumber, key) {
    const keyUid = key.uid;
    const keyId = `${serialNumber}-${keyUid}`;
    logger.info('Initializing like key:', keyId);

    // Initialize data and store in keyManager
    key.data = {
        currentTrackId: currentPlaybackState.trackId, // Start with current state
        isLiked: currentPlaybackState.isLiked,
        showStatusText: key.data?.showStatusText ?? false, // Example custom option
        likedColor: key.data?.likedColor || '#1DB954', // Spotify green
        unlikedColor: key.data?.unlikedColor || '#FFFFFF', // White
    };
    keyManager.keyData[keyUid] = key; // Store updated key data

    // Configure style - maybe force icon?
    key.style = key.style || {};
    key.style.showIcon = true; // Typically a like button is just an icon
    key.style.showTitle = false;
    key.style.showEmoji = false;
    key.style.showImage = false;

    // Initial draw
    await updateLikeKeyDisplay(serialNumber, key);

    // No interval needed for the like key itself, it updates when track changes
}

/** Update Like Key Display */
async function updateLikeKeyDisplay(serialNumber, key) {
    const keyUid = key.uid;
    const keyId = `${serialNumber}-${keyUid}`;
    logger.debug(`Updating like key display: ${keyId}`);

    if (!keyManager.activeKeys[keyId]) {
        logger.warn(`Attempted to update inactive like key ${keyId}.`);
        // No interval to clear, just return
        return;
    }

    // Retrieve the latest key data (important as it might have been updated)
    const currentKeyData = keyManager.keyData[keyUid];
    if (!currentKeyData || !currentKeyData.data) {
        logger.error(`Key data or key.data missing for like key ${keyUid} during display update.`);
        return; // Cannot proceed
    }

    const { isLiked, currentTrackId, showStatusText, likedColor, unlikedColor } = currentKeyData.data;
    const title = showStatusText ? (currentTrackId ? (isLiked ? 'Liked' : 'Not Liked') : 'No Track') : '';
    const artist = ''; // Like button usually doesn't show artist/title

    try {
        // Use the renderer, passing specific options for the 'like' button type
        const buttonDataUrl = await renderer.createSpotifyButtonDataUrl(
            currentKeyData.width || 80, // Like button specific default width
            null, null, null, null, 0, 0, // Non-relevant params for 'like' type
            currentKeyData.style || {},   // Pass base style
            false, false, false, 0, 0,    // Non-relevant params for 'like' type
            { // Options object
                buttonType: 'like',
                isLiked: isLiked,
                // currentTrackId: currentTrackId, // Pass track ID if renderer needs it
                likedColor: likedColor,     // Pass custom colors from key data
                unlikedColor: unlikedColor
            }
        );
        keyManager.simpleDraw(serialNumber, currentKeyData, buttonDataUrl);
    } catch (error) {
        logger.error(`Error rendering like key ${keyId}: ${error.message}`);
        const errorText = currentTrackId ? (isLiked === null ? '?' : (isLiked ? '♥' : '♡')) : '-';
        keyManager.textOnlyDraw(serialNumber, currentKeyData, errorText); // Fallback text
    }
}

/** Handle Interaction for Like Key */
async function handleLikeInteraction(serialNumber, key, data) {
    const keyUid = key.uid;
    const keyId = `${serialNumber}-${keyUid}`;
    logger.info(`Handling like interaction for key ${keyId}`);

    // Retrieve the latest key data
    const currentKeyData = keyManager.keyData[keyUid];
    if (!currentKeyData || !currentKeyData.data) {
        logger.error(`Key data or key.data missing for like key ${keyUid} during interaction.`);
        return; // Cannot proceed
    }

    const { currentTrackId, isLiked } = currentKeyData.data;

    if (!currentTrackId) {
        logger.warn(`Like button pressed (${keyId}) but no current track ID is known.`);
        // Optional: Provide visual feedback for error? (e.g., flash red)
        return; // No track to like/unlike
    }

    if (isLiked === null) {
         logger.warn(`Like button pressed (${keyId}) but liked status is unknown.`);
         // Optional: Trigger a check? Or just wait for next update cycle.
         return; // Don't perform action if status is uncertain
    }

    try {
        if (!spotifyAuth.getAuthenticationStatus()) {
             const initSuccess = await spotifyAuth.initializeAuthentication();
             if (!initSuccess) throw new Error('Authentication required.');
        }

        if (isLiked) {
            logger.info(`Attempting to remove track ${currentTrackId} from library (key: ${keyId})`);
            await spotifyApi.removeTracks([currentTrackId]);
            logger.info(`Successfully removed track ${currentTrackId}`);
            currentKeyData.data.isLiked = false;
            currentPlaybackState.isLiked = false; // Update global state too
        } else {
            logger.info(`Attempting to add track ${currentTrackId} to library (key: ${keyId})`);
            await spotifyApi.saveTracks([currentTrackId]);
            logger.info(`Successfully saved track ${currentTrackId}`);
            currentKeyData.data.isLiked = true;
            currentPlaybackState.isLiked = true; // Update global state too
        }

        // Update display immediately after successful action
        await updateLikeKeyDisplay(serialNumber, currentKeyData);

    } catch (error) {
        logger.error(`Failed to ${isLiked ? 'remove' : 'save'} track ${currentTrackId}: ${error.message}`);
        // Optional: Provide visual feedback for the error on the key
        // Revert optimistic update if needed (though check might fix it later)
        // currentKeyData.data.isLiked = isLiked; // Revert if failed?
    }
}

/** Initialize Counter Key */
function initializeCounterKey(serialNumber, key) {
     const keyUid = key.uid;
     // Use keyManager state and function
     keyManager.keyData[keyUid] = key; 
     keyManager.keyData[keyUid].counter = parseInt(key.data?.rangeMin || '0');
     key.style = key.style || {};
     key.style.showIcon = false;
     key.style.showTitle = true;
     key.title = 'Click Me!';
     keyManager.simpleTextDraw(serialNumber, key); 
}

/** Handle Interaction for Now Playing Key */
async function handleNowPlayingInteraction(serialNumber, key, data) {
    const keyUid = key.uid;
    const keyId = `${serialNumber}-${keyUid}`;
     // logger.info(`Handling interaction for nowplaying key ${keyId}`);

     // Use keyManager state
     if (!keyManager.keyData[keyUid]) keyManager.keyData[keyUid] = {};
     Object.assign(keyManager.keyData[keyUid], key);
     const currentKeyData = keyManager.keyData[keyUid];

    currentKeyData.style = currentKeyData.style || {};
    currentKeyData.style.showIcon = false;
    currentKeyData.style.showTitle = false;
    currentKeyData.style.showEmoji = false;
    currentKeyData.style.showImage = true;
    
    if (data.evt === 'click') { 
        try {
            if (!spotifyAuth.getAuthenticationStatus()) {
                logger.error(`Cannot toggle play/pause for ${keyId}: Not auth.`);
                const authErrImg = await renderer.createSpotifyButtonDataUrl(/* Auth Error Params */);
                keyManager.simpleDraw(serialNumber, currentKeyData, authErrImg); // Use keyManager
                return;
            }
            const playback = await spotifyApi.getCurrentPlayback();
            const isCurrentlyPlaying = playback?.is_playing || false;
            await controlSpotify(isCurrentlyPlaying ? 'pause' : 'play');
            
            // Force update after interaction
            await new Promise(resolve => setTimeout(resolve, 250));
            await updateNowPlayingKey(serialNumber, currentKeyData); 

            // Use keyManager state to check/restart interval
            if (!keyManager.keyIntervals[keyId]) {
                 logger.info(`Restarting update interval for ${keyId} after interaction.`);
                 startNowPlayingUpdates(serialNumber, currentKeyData);
             }
        } catch (error) {
            logger.error(`Error handling play/pause click for ${keyId}:`, error);
            const errorImage = await renderer.createSpotifyButtonDataUrl(/* Error Params */);
            keyManager.simpleDraw(serialNumber, currentKeyData, errorImage); // Use keyManager
        }
    } else { 
         await updateNowPlayingKey(serialNumber, currentKeyData); 
    }
}

/** Handle Interaction for Counter Key */
function handleCounterInteraction(serialNumber, key, data) {
    const keyUid = key.uid;
    // Use keyManager state
     if (!keyManager.keyData[keyUid]) { initializeCounterKey(serialNumber, key); }
     else { Object.assign(keyManager.keyData[keyUid], key); }
     const currentKeyData = keyManager.keyData[keyUid];

    if (data.evt === 'click') {
        let counter = currentKeyData.counter || 0;
        const max = parseInt(currentKeyData.data?.rangeMax || '10');
        const min = parseInt(currentKeyData.data?.rangeMin || '0');
        counter++;
        if (counter > max) counter = min; 
        currentKeyData.counter = counter;
        currentKeyData.title = `Count: ${counter}`;
        
        // Use keyManager function
        keyManager.simpleTextDraw(serialNumber, currentKeyData); 
    } 
}

// --- Plugin Start & Global Handlers --- //
plugin.start()
process.on('uncaughtException', (error) => { /* ... */ });
process.on('unhandledRejection', (reason, promise) => { /* ... */ });
plugin.on('ready', async () => { /* Original */ });
