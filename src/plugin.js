const { plugin, pluginPath, resourcesPath } = require("@eniac/flexdesigner")
const logger = require("./loggerWrapper")
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
    isPlaying: false, // Is it currently playing vs paused?
    progressAtLastUpdate: 0,
    lastApiUpdateTime: 0,
    durationMs: 0
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
            updateNowPlayingKey(serialNumber, key, true); // Will fetch new state and update relevant keys
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
    const incomingKeys = payload.keys || []; // Ensure it's an array
    const serialNumber = String(payload.serialNumber);
    const incomingKeyUids = new Set(incomingKeys.map(k => k.uid).filter(uid => uid !== undefined && uid !== null)); // Set of valid UIDs from payload

    logger.debug(`[plugin.alive] Handler received ${incomingKeys.length} keys for device ${serialNumber}. UIDs: ${Array.from(incomingKeyUids)}`);

    // --- Step 1: Clean up stale keys ---
    const keysToCleanup = [];
    Object.keys(keyManager.activeKeys).forEach(keyId => {
        const [sn, keyUid] = keyId.split('-');
        // Check if this key belongs to the current device and is NOT in the incoming list
        if (sn === serialNumber && !incomingKeyUids.has(keyUid)) {
            keysToCleanup.push({ serialNumber: sn, keyUid });
        }
    });

    if (keysToCleanup.length > 0) {
        logger.info(`[plugin.alive] Cleaning up ${keysToCleanup.length} stale keys for device ${serialNumber}:`, keysToCleanup.map(k => k.keyUid));
        keysToCleanup.forEach(({ serialNumber: sn, keyUid }) => {
            keyManager.cleanupKey(sn, keyUid); // Call cleanup for each stale key
        });
    } else {
         logger.debug(`[plugin.alive] No stale keys to clean up for device ${serialNumber}.`);
    }


    // --- Step 2: Process incoming keys (add new/update existing) ---
    for (const key of incomingKeys) {
        const keyUid = key.uid;
        if (keyUid === undefined || keyUid === null) {
            logger.error('[plugin.alive] Received key with invalid UID, skipping:', key);
            continue;
        }
        const keyId = `${serialNumber}-${keyUid}`;

        // Check if this key is NEW or just confirming it's still alive
        const wasAlreadyActive = keyManager.activeKeys[keyId];

        // Always ensure data is up-to-date and key is marked active
        keyManager.activeKeys[keyId] = true;
        // Merge incoming data with existing? For now, let's just store the latest from payload
        // If merging is needed, fetch existing keyManager.keyData[keyUid] first
        keyManager.keyData[keyUid] = key;

        if (!wasAlreadyActive) {
            // This key is newly added or the plugin just started
            logger.info(`[plugin.alive] Initializing NEW key: ${key.cid} (UID: ${keyUid}) on device ${serialNumber}`);
            // Call the appropriate initialization function
            if (key.cid === 'com.energy.spotify_integration.nowplaying') {
                initializeNowPlayingKey(serialNumber, key);
            } else if (key.cid === 'com.energy.spotify_integration.counter') {
                initializeCounterKey(serialNumber, key);
            } else if (key.cid === 'com.energy.spotify_integration.like') {
                initializeLikeKey(serialNumber, key);
            }
        } else {
            // Key was already active, just confirmed alive. Maybe log?
             logger.debug(`[plugin.alive] Key ${keyId} confirmed active.`);
             // Potentially trigger a redraw if settings could have changed?
             // Or rely on the key's own update interval. For now, do nothing extra.
        }
    }
     logger.debug(`[plugin.alive] Finished processing keys for device ${serialNumber}.`);
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

/** Renders the Now Playing key using interpolated progress */
async function renderInterpolatedNowPlaying(serialNumber, key) {
    const keyUid = key.uid;
    const keyId = `${serialNumber}-${keyUid}`;

    const currentKeyData = keyManager.keyData[keyUid];
    if (!currentKeyData || !currentKeyData.data) {
        logger.error(`[renderInterpolated] Key ${keyId} - Key data or key.data missing.`);
        keyManager.cleanupKey(serialNumber, keyUid);
        return;
    }

    const {
        currentTrackDetails,
        lastApiUpdateTime,
        progressAtLastUpdate,
        durationMs,
        showProgress,
        showTitle,
        showPlayPause,
        titleFontSize,
        artistFontSize
    } = currentKeyData.data;

    const isPlaying = currentPlaybackState.isPlaying;
    let estimatedProgress = progressAtLastUpdate;

    if (isPlaying && lastApiUpdateTime > 0 && durationMs > 0) {
        const elapsed = Date.now() - lastApiUpdateTime;
        estimatedProgress = progressAtLastUpdate + elapsed;
        if (estimatedProgress > durationMs) estimatedProgress = durationMs;
        if (estimatedProgress < 0) estimatedProgress = 0;
    } else if (!isPlaying) {
        estimatedProgress = progressAtLastUpdate;
    } else {
        estimatedProgress = 0;
    }

    const isActive = !!(currentTrackDetails);

    try {
        const imageUrl = currentTrackDetails?.album?.images?.[0]?.url;
        const title = escapeXml(currentTrackDetails?.name || (isActive ? 'Loading...' : 'Nothing Playing')); // Adjust fallback
        const artist = escapeXml(currentTrackDetails?.artists?.map(a => a.name).join(', ') || '');

        const buttonDataUrl = await renderer.createSpotifyButtonDataUrl(
            currentKeyData.width || 360,
            title,
            artist,
            isPlaying,
            imageUrl,
            Math.round(estimatedProgress),
            durationMs,
            currentKeyData.style || {},
            showProgress,
            showTitle,
            showPlayPause,
            titleFontSize,
            artistFontSize,
            {} // Empty options obj
        );
        keyManager.simpleDraw(serialNumber, currentKeyData, buttonDataUrl);
    } catch (error) {

        try {
             keyManager.textOnlyDraw(serialNumber, currentKeyData, 'Render Error');
        } catch (fallbackError) {
            logger.error(`[renderInterpolated] Key ${keyId} - FAILED to draw fallback text: ${fallbackError.message}`);
        }
    }
}

/** Initialize Now Playing Key */
async function initializeNowPlayingKey(serialNumber, key) {
    const keyUid = key.uid;
    const keyId = `${serialNumber}-${keyUid}`;
    logger.info('Initializing nowplaying key:', keyId);

    // Ensure data object exists
    key.data = key.data || {};

    // Initialize data and store in keyManager, applying defaults from UI if not present
    key.data = {
        updateInterval: key.data.updateInterval || 4000, // API update interval
        interpolationIntervalMs: key.data.interpolationIntervalMs || 1000, // UI update interval
        enableInterpolation: key.data.enableInterpolation !== undefined ? key.data.enableInterpolation : true, // Optional interpolation
        showArtist: key.data.showArtist !== undefined ? key.data.showArtist : true,
        showProgress: key.data.showProgress !== undefined ? key.data.showProgress : true,
        showTitle: key.data.showTitle !== undefined ? key.data.showTitle : true,
        showPlayPause: key.data.showPlayPause !== undefined ? key.data.showPlayPause : true,
        titleFontSize: key.data.titleFontSize || 18,
        artistFontSize: key.data.artistFontSize || 14,
        // Interpolation state (reset on init)
        currentTrackDetails: null,
        lastApiUpdateTime: 0,
        progressAtLastUpdate: 0,
        durationMs: 0,
        interpolationIntervalId: null, // Initialize as null
    };
    keyManager.keyData[keyUid] = key; // Store the fully initialized key data

    // ... rest of style setup and initial loading image draw ...
    key.style = key.style || {};
    key.style.showIcon = false;
    key.style.showTitle = false;
    key.style.showEmoji = false;
    key.style.showImage = true;

    try {
        const loadingImage = await renderer.createSpotifyButtonDataUrl(
            key.width || 360, 'Loading...', 'Connecting...', false, null, 0, 0, key.style,
            key.data.showProgress, key.data.showTitle, key.data.showPlayPause,
            key.data.titleFontSize, key.data.artistFontSize
        );
        keyManager.simpleDraw(serialNumber, key, loadingImage);
    } catch (error) {
        logger.error(`Failed loading image for ${keyId}: ${error.message}`);
        keyManager.textOnlyDraw(serialNumber, key, 'Error');
    }

    // Fetch initial state AND start updates
    // ADD Log: Indicate start of initial fetch
    logger.info(`[initializeNowPlayingKey] Key ${keyId} - Triggering initial fetch and timer start...`);
    await updateNowPlayingKey(serialNumber, key, true); // Pass flag to indicate it should start timers
    // ADD Log: Indicate end of initial fetch call
    logger.info(`[initializeNowPlayingKey] Key ${keyId} - Initial fetch/start call complete.`);
}

/** Start Periodic Updates (API Fetch and Interpolation) for Now Playing Key */
function startOrRestartNowPlayingUpdates(serialNumber, key) {
    const keyUid = key.uid;
    const keyId = `${serialNumber}-${keyUid}`;
    const currentKeyData = keyManager.keyData[keyUid];

    if (!currentKeyData || !currentKeyData.data) {
        logger.error(`Cannot start updates for ${keyId}, key data missing.`);
        return;
    }

    // Read settings from the validated key data
    const { updateInterval, interpolationIntervalMs, enableInterpolation } = currentKeyData.data;

    // --- Clear existing timers --- //
    if (keyManager.keyIntervals[keyId]) {
        // ... (clearing API fetch timer - no change) ...
        logger.debug(`Clearing existing API fetch timer for ${keyId}`);
        clearInterval(keyManager.keyIntervals[keyId]);
        delete keyManager.keyIntervals[keyId];
    }
    if (currentKeyData.data.interpolationIntervalId) {
        // ... (clearing Interpolation timer - no change) ...
         logger.debug(`Clearing existing interpolation timer for ${keyId}`);
        clearInterval(currentKeyData.data.interpolationIntervalId);
        currentKeyData.data.interpolationIntervalId = null;
    }
    // --- End Clear existing timers --- //


    // --- Start API Fetch Timer --- //
    logger.info(`Starting API fetch updates for key ${keyId} every ${updateInterval}ms.`);
    const apiFetchIntervalId = setInterval(async () => {
        const keyExists = keyManager.activeKeys[keyId] && keyManager.keyData[keyUid];
        if (!keyExists) {
            logger.info(`Key ${keyId} no longer active/valid, clearing API fetch interval.`);
            clearInterval(apiFetchIntervalId);
            delete keyManager.keyIntervals[keyId];
            // Also clear the interpolation timer if it exists (safety check)
            const latestKeyData = keyManager.keyData[keyUid];
            if (latestKeyData?.data?.interpolationIntervalId) {
                 logger.info(`Clearing orphaned interpolation interval for inactive key ${keyId}.`);
                clearInterval(latestKeyData.data.interpolationIntervalId);
                latestKeyData.data.interpolationIntervalId = null;
            }
            return;
        }
        await updateNowPlayingKey(serialNumber, keyManager.keyData[keyUid], false); // Fetch only
    }, updateInterval);
    keyManager.keyIntervals[keyId] = apiFetchIntervalId;
    // --- End Start API Fetch Timer --- //


    // --- Start Interpolation Timer (Conditionally) --- //
    if (enableInterpolation) {
        logger.info(`Starting UI interpolation updates for key ${keyId} every ${interpolationIntervalMs}ms.`);
        const interpolationIntervalId = setInterval(async () => {
            const keyExists = keyManager.activeKeys[keyId] && keyManager.keyData[keyUid];
            if (!keyExists) {
                logger.info(`Key ${keyId} no longer active/valid, clearing interpolation interval.`);
                clearInterval(interpolationIntervalId);
                // Ensure the reference in key data is also cleared if cleanup didn't catch it
                const latestKeyData = keyManager.keyData[keyUid];
                if (latestKeyData?.data?.interpolationIntervalId === interpolationIntervalId) {
                    latestKeyData.data.interpolationIntervalId = null;
                }
                return;
            }
            await renderInterpolatedNowPlaying(serialNumber, keyManager.keyData[keyUid]);
        }, interpolationIntervalMs);
        // Store interpolation timer ID in key data
        currentKeyData.data.interpolationIntervalId = interpolationIntervalId;
    } else {
        logger.info(`UI interpolation disabled for key ${keyId}.`);
        currentKeyData.data.interpolationIntervalId = null; // Ensure it's null if disabled
    }
    // --- End Start Interpolation Timer --- //

    // ADD Log: Indicate timer setup finished
    logger.info(`[startOrRestartNowPlayingUpdates] Key ${keyId} - Timer setup complete.`);
}

/** Update Now Playing Key Display and Fetch State */
async function updateNowPlayingKey(serialNumber, key, shouldStartTimers = false) {
    const keyUid = key.uid;
    const keyId = `${serialNumber}-${keyUid}`;
    logger.debug(`[updateNowPlayingKey] Key ${keyId} - Updating state (Start timers: ${shouldStartTimers})...`);

    let currentKeyData = keyManager.keyData[keyUid];
    if (!currentKeyData) {
        logger.error(`Key data for ${keyUid} not found during update start.`);
        keyManager.cleanupKey(serialNumber, keyUid);
        return;
    }

    if (!keyManager.activeKeys[keyId]) {
        logger.warn(`Attempted to update inactive key ${keyId}, cleaning up.`);
        keyManager.cleanupKey(serialNumber, keyUid);
        return;
    }

    let playbackState = null;
    let fetchError = null;
    let needsAuth = false;
    try {
        // ADD Log: Before auth check/API call
        logger.debug(`[updateNowPlayingKey] Key ${keyId} - Checking auth and preparing to fetch playback state...`);
        if (!spotifyAuth.getAuthenticationStatus()) {
            logger.info(`[updateNowPlayingKey] Key ${keyId} - Attempting auth initialization...`);
            const initSuccess = await spotifyAuth.initializeAuthentication();
            if (!initSuccess) {
                needsAuth = true;
                logger.error(`[updateNowPlayingKey] Key ${keyId} - Auth initialization failed.`);
                throw new Error('Authentication required and initialization failed.');
            }
             logger.info(`[updateNowPlayingKey] Key ${keyId} - Auth initialization successful.`);
        }
        // ADD Log: Before API call
        logger.debug(`[updateNowPlayingKey] Key ${keyId} - Calling spotifyApi.getCurrentPlayback()...`);
        playbackState = await spotifyApi.getCurrentPlayback();
        // ADD Log: After successful API call
        logger.debug(`[updateNowPlayingKey] Key ${keyId} - spotifyApi.getCurrentPlayback() successful. State:`, playbackState);

    } catch (error) {
        // ADD Log: On API error
        logger.error(`[updateNowPlayingKey] Key ${keyId} - Error fetching playback state: ${error.message}`);
        fetchError = error;
    }

    const now = Date.now();
    const isActive = !!(playbackState && playbackState.item);
    const isPlaying = isActive && playbackState.is_playing;
    const currentTrack = isActive ? playbackState.item : null;
    const trackId = currentTrack?.id;
    const progressMs = isActive ? playbackState.progress_ms : 0;
    const durationMs = currentTrack?.duration_ms || 0;

    let previousTrackId = currentPlaybackState.trackId;
    currentPlaybackState.isActive = isActive;
    currentPlaybackState.isPlaying = isPlaying;
    currentPlaybackState.trackId = trackId;
    currentPlaybackState.progressAtLastUpdate = progressMs;
    currentPlaybackState.lastApiUpdateTime = now;
    currentPlaybackState.durationMs = durationMs;

    let trackChanged = false;
    let likedStatusChanged = false;

    if (trackId !== previousTrackId) {
        trackChanged = true;
        logger.info(`Track changed: ${trackId} (was ${previousTrackId})`);
        currentPlaybackState.isLiked = null;

        if (isActive && trackId && trackId !== currentPlaybackState.lastCheckedTrackId) {
            logger.debug(`Checking liked status for new track: ${trackId}`);
            try {
                const savedStatus = await spotifyApi.checkTracksSaved([trackId]);
                if (savedStatus && savedStatus.length > 0) {
                    currentPlaybackState.isLiked = savedStatus[0];
                    likedStatusChanged = true;
                    logger.info(`Track ${trackId} liked status: ${currentPlaybackState.isLiked}`);
                } else {
                    logger.warn(`Could not determine liked status for track ${trackId}`);
                }
                currentPlaybackState.lastCheckedTrackId = trackId;
            } catch (error) {
                logger.error(`Error checking if track ${trackId} is saved: ${error.message}`);
            }
        } else if (!isActive) {
            logger.info("Playback stopped or became inactive.");
            currentPlaybackState.isLiked = null;
            currentPlaybackState.lastCheckedTrackId = null;
        }
    }

    // Re-fetch key data IN CASE IT CHANGED (e.g. UI update while waiting for API)
    currentKeyData = keyManager.keyData[keyUid];
    if (!currentKeyData || !currentKeyData.data) {
        logger.error(`Key data for ${keyUid} disappeared during update processing.`);
        keyManager.cleanupKey(serialNumber, keyUid);
        return;
    }

    // --- Update Key-Specific Data for Interpolation --- //
    logger.debug(`[updateNowPlayingKey] Key ${keyId} - Updating key data with fetched state...`);
    currentKeyData.data.currentTrackDetails = currentTrack;
    currentKeyData.data.lastApiUpdateTime = now;
    currentKeyData.data.progressAtLastUpdate = progressMs;
    currentKeyData.data.durationMs = durationMs;
    // --- End Update Key-Specific Data --- //

    // --- Start or Restart Timers if requested (e.g., on initialization) --- //
    if (shouldStartTimers) {
        // ADD Log: Before calling start/restart timers
        logger.debug(`[updateNowPlayingKey] Key ${keyId} - Calling startOrRestartNowPlayingUpdates...`);
        startOrRestartNowPlayingUpdates(serialNumber, currentKeyData);
    }

    // --- Trigger Interpolated Render (Always) --- //
    // ADD Log: Before calling immediate render
    logger.debug(`[updateNowPlayingKey] Key ${keyId} - Calling immediate renderInterpolatedNowPlaying...`);
    await renderInterpolatedNowPlaying(serialNumber, currentKeyData);
    // ADD Log: After calling immediate render
    logger.debug(`[updateNowPlayingKey] Key ${keyId} - Immediate render call complete.`);

    // --- Trigger Update for Like Keys if needed --- //
    if (trackChanged || likedStatusChanged) {
       // ... (like key update logic - no changes) ...
        logger.debug(`Track or liked status change detected. Updating relevant like keys.`);
        Object.keys(keyManager.activeKeys).forEach(activeKeyId => {
            const [sn, likeKeyUid] = activeKeyId.split('-');
            const likeKey = keyManager.keyData[likeKeyUid];
            if (likeKey && likeKey.cid === 'com.energy.spotify_integration.like') {
                likeKey.data = likeKey.data || {};
                likeKey.data.currentTrackId = currentPlaybackState.trackId;
                likeKey.data.isLiked = currentPlaybackState.isLiked;
                logger.debug(`Updating like key ${activeKeyId} display - Track: ${likeKey.data.currentTrackId}, Liked: ${likeKey.data.isLiked}`);
                updateLikeKeyDisplay(sn, likeKey);
            }
        });
    }
    // --- End Trigger Update for Like Keys --- //

    logger.debug(`[updateNowPlayingKey] Key ${keyId} - Update cycle finished.`);
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
                 startOrRestartNowPlayingUpdates(serialNumber, currentKeyData);
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
