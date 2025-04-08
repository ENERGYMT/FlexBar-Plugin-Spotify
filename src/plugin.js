const { plugin, pluginPath, resourcesPath } = require("@eniac/flexdesigner")
const logger = require("./loggerWrapper")
const path = require('path')
const open = require('open')
const { escapeXml } = require('./utils');
const spotifyAuth = require('./spotifyAuth'); 
const spotifyApi = require('./spotifyApi'); 
const renderer = require('./canvasRenderer'); 
const keyManager = require('./keyManager'); 

// Global state for tracking Spotify playback
let currentPlaybackState = {
    trackId: null,
    isLiked: null,
    lastCheckedTrackId: null,
    isActive: false,
    isPlaying: false,
    progressAtLastUpdate: 0,
    lastApiUpdateTime: 0,
    durationMs: 0,
    songEndTimerId: null // Timer ID for song end detection
};



logger.info(`Plugin path: ${pluginPath}`)
logger.info(`Plugin Resources path: ${resourcesPath}`)


// async function controlSpotify(action, value = null) {  }

// function triggerNowPlayingUpdate() {
//     logger.info("Triggering manual update for all active 'now playing' and 'like' keys.");
//     Object.keys(keyManager.activeKeys).forEach(keyId => {
//         const [serialNumber, keyUid] = keyId.split('-');
//         const key = keyManager.keyData[keyUid];
//         if (!key) return;

//         if (key.cid === 'com.energy.spotify_integration.nowplaying') {
//             logger.debug(`Manually updating now playing key ${keyId}`);
//             updateNowPlayingKey(serialNumber, key, true);
//         } else if (key.cid === 'com.energy.spotify_integration.like') {
//             logger.debug(`Manually updating like key display ${keyId}`);
//             updateLikeKeyDisplay(serialNumber, key);
//         }
//     });
// }

// --- Refactored Event Handler Logic (Update to use keyManager) --- //

function _handleDeviceStatus(devices) {
    logger.info('Device status changed (handler):', devices);
    const connectedSerialNumbers = devices.map(device => String(device.serialNumber));
    
    // Check if there are any now playing keys still active
    let nowPlayingKeysRemain = false;
    
    Object.keys(keyManager.activeKeys).forEach(keyId => { 
        const [serialNumber, keyUid] = keyId.split('-');
        if (!connectedSerialNumbers.includes(serialNumber)) {
            logger.info(`Device ${serialNumber} disconnected, cleaning up key ${keyUid} via handler`);
            keyManager.cleanupKey(serialNumber, keyUid); 
        } else {
            // Device is still connected, check if this is a now playing key
            const key = keyManager.keyData[keyUid];
            if (key && key.cid === 'com.energy.spotify_integration.nowplaying') {
                nowPlayingKeysRemain = true;
            }
        }
    });
    
    // If no now playing keys remain, clear the song end timer
    if (!nowPlayingKeysRemain) {
        clearSongEndTimer();
    }
}

function _handlePluginAlive(payload) {
    logger.info('Processing plugin.alive (handler):', payload);
    const incomingKeys = payload.keys || [];
    const serialNumber = String(payload.serialNumber);
    const incomingKeyUids = new Set(incomingKeys.map(k => k.uid).filter(uid => uid !== undefined && uid !== null));

    logger.debug(`[plugin.alive] Handler received ${incomingKeys.length} keys for device ${serialNumber}. UIDs: ${Array.from(incomingKeyUids)}`);

    const keysToCleanup = [];
    Object.keys(keyManager.activeKeys).forEach(keyId => {
        const [sn, keyUid] = keyId.split('-');
        if (sn === serialNumber && !incomingKeyUids.has(keyUid)) {
            keysToCleanup.push({ serialNumber: sn, keyUid });
        }
    });

    if (keysToCleanup.length > 0) {
        logger.info(`[plugin.alive] Cleaning up ${keysToCleanup.length} stale keys for device ${serialNumber}:`, keysToCleanup.map(k => k.keyUid));
        keysToCleanup.forEach(({ serialNumber: sn, keyUid }) => {
            keyManager.cleanupKey(sn, keyUid);
        });
    } else {
         logger.debug(`[plugin.alive] No stale keys to clean up for device ${serialNumber}.`);
    }

    // Track if we found any now playing keys
    let hasNowPlayingKey = false;

    for (const key of incomingKeys) {
        const keyUid = key.uid;
        if (keyUid === undefined || keyUid === null) {
            logger.error('[plugin.alive] Received key with invalid UID, skipping:', key);
            continue;
        }
        const keyId = `${serialNumber}-${keyUid}`;

        const wasAlreadyActive = keyManager.activeKeys[keyId];
        keyManager.activeKeys[keyId] = true;
        keyManager.keyData[keyUid] = key;

        if (key.cid === 'com.energy.spotify_integration.nowplaying') {
            hasNowPlayingKey = true;
            
            // If this now playing key is newly active, we need to setup the song end timer
            if (!wasAlreadyActive && currentPlaybackState.isActive && currentPlaybackState.isPlaying) {
                logger.debug(`[plugin.alive] Setting up song end timer for new now playing key: ${keyId}`);
                setupSongEndTimer(
                    currentPlaybackState.progressAtLastUpdate, 
                    currentPlaybackState.durationMs, 
                    currentPlaybackState.isPlaying
                );
            }
        }

        if (!wasAlreadyActive) {
            logger.info(`[plugin.alive] Initializing NEW key: ${key.cid} (UID: ${keyUid}) on device ${serialNumber}`);
            if (key.cid === 'com.energy.spotify_integration.nowplaying') {
                initializeNowPlayingKey(serialNumber, key);
            } else if (key.cid === 'com.energy.spotify_integration.counter') {
                initializeCounterKey(serialNumber, key);
            } else if (key.cid === 'com.energy.spotify_integration.like') {
                initializeLikeKey(serialNumber, key);
            }
        } else {
             logger.debug(`[plugin.alive] Key ${keyId} confirmed active.`);
        }
    }

    // If no now playing keys exist, clear the song end timer
    if (!hasNowPlayingKey) {
        clearSongEndTimer();
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

    if (!keyManager.activeKeys[keyId]) { 
        logger.warn(`Received interaction for inactive key ${keyId} (handler). Re-registering.`);
        keyManager.activeKeys[keyId] = true;
        if (!keyManager.keyData[keyUid]) {
             keyManager.keyData[keyUid] = key;
             logger.warn(`Data for key ${keyUid} was missing, using received data (handler).`);
        }
    }
    logger.info(`Received plugin.data for key ${key} (handler).`);
    
    if (key.cid === "com.energy.spotify_integration.nowplaying") {
        // handleNowPlayingInteraction(serialNumber, key, data);
        return { status: "success", message: "Handled now playing interaction." };
    } else if (key.cid === "com.energy.spotify_integration.like") {
        handleLikeInteraction(serialNumber, key, data);
        return { status: "success", message: "Handled like interaction." };
    }
    
     logger.warn(`Unhandled key interaction via handler for CID: ${key.cid}`);
     return { status: "ignored", message: `No handler for CID ${key.cid}` };
}

/** 
 * Setup or update the song end timer for automatic playback refresh
 * @param {number} progressMs Current playback position in ms
 * @param {number} durationMs Total song duration in ms
 * @param {boolean} isPlaying Whether playback is currently active
 */
function setupSongEndTimer(progressMs, durationMs, isPlaying) {
    // Clear any existing timer first
    if (currentPlaybackState.songEndTimerId) {
        logger.debug('Clearing existing song end timer');
        clearTimeout(currentPlaybackState.songEndTimerId);
        currentPlaybackState.songEndTimerId = null;
    }

    // Only set up a timer if the song is playing
    if (!isPlaying || !durationMs) {
        logger.debug('Not setting song end timer - playback inactive or no duration');
        return;
    }

    // Calculate remaining time (with a small buffer to ensure we're past the end)
    const remainingMs = Math.max(0, durationMs - progressMs + 200); // 200ms buffer
    
    logger.debug(`Setting song end timer for ${remainingMs}ms (Progress: ${progressMs}ms, Duration: ${durationMs}ms)`);
    
    // Set the timeout to call getCurrentPlayback when the song should end
    currentPlaybackState.songEndTimerId = setTimeout(async () => {
        logger.info('Song end timer triggered - requesting current playback state');
        try {
            const playbackState = await spotifyApi.getCurrentPlayback();
            logger.debug('Successfully fetched playback after song end');
            
            // Iterate through all now playing keys and update them
            Object.keys(keyManager.activeKeys).forEach(keyId => {
                const [serialNumber, keyUid] = keyId.split('-');
                const key = keyManager.keyData[keyUid];
                if (key && key.cid === 'com.energy.spotify_integration.nowplaying') {
                    logger.debug(`Updating now playing key ${keyId} after song end`);
                    updateNowPlayingKey(serialNumber, key, false);
                }
            });
        } catch (error) {
            logger.error(`Error fetching playback after song end: ${error.message}`);
        }
        currentPlaybackState.songEndTimerId = null;
    }, remainingMs);
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
            default: return { success: false, error: 'Unknown command' };
        }
    } catch (error) {
        const needsAuth = !spotifyAuth.getAuthenticationStatus() || error.message.includes('authenticate');
        return { success: false, error: error.message, needsAuth };
    }
});

// Register this function as a listener for keyManager cleanup operations
// This ensures our song end timer is cleared when the now playing key is removed
plugin.on('device.status', (devices) => {
    // If no devices are connected, clear the song end timer
    if (!devices || devices.length === 0) {
        clearSongEndTimer();
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
    logger.debug(`Rendering interpolated state for key: ${keyId}`);

    const currentKeyData = keyManager.keyData[keyUid];
    if (!currentKeyData || !currentKeyData.data) {
        logger.error(`Key data or key.data missing for ${keyUid} during interpolated render.`);
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
        showTimeInfo,
        titleFontSize,
        artistFontSize,
        timeFontSize,
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
        const title = escapeXml(currentTrackDetails?.name || (isActive ? 'Loading...' : 'Nothing Playing'));
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
            showTimeInfo,
            timeFontSize,
            {}
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

    key.data = key.data || {};
    const progressBarColor = key.data.progressBarColor || '#1ED760';

    key.data = {
        updateInterval: key.data.updateInterval || 4000,
        interpolationIntervalMs: key.data.interpolationIntervalMs || 1000,
        enableInterpolation: key.data.enableInterpolation !== undefined ? key.data.enableInterpolation : true,
        showArtist: key.data.showArtist !== undefined ? key.data.showArtist : true,
        showProgress: key.data.showProgress !== undefined ? key.data.showProgress : true,
        showTitle: key.data.showTitle !== undefined ? key.data.showTitle : true,
        showPlayPause: key.data.showPlayPause !== undefined ? key.data.showPlayPause : true,
        showTimeInfo: key.data.showTimeInfo !== undefined ? key.data.showTimeInfo : true,
        titleFontSize: key.data.titleFontSize || 18,
        artistFontSize: key.data.artistFontSize || 14,
        timeFontSize: key.data.timeFontSize || 10,
        progressBarColor: progressBarColor,
        currentTrackDetails: null,
        lastApiUpdateTime: 0,
        progressAtLastUpdate: 0,
        durationMs: 0,
        interpolationIntervalId: null,
    };
    
    keyManager.keyData[keyUid] = key;

    key.style = key.style || {};
    key.style.showIcon = false;
    key.style.showTitle = false;
    key.style.showEmoji = false;
    key.style.showImage = true;
    key.style.progressBarColor = key.data.progressBarColor;

    try {
        const renderStyle = {
            ...key.style,
            progressBarColor: key.data.progressBarColor
        };
        
        const loadingImage = await renderer.createSpotifyButtonDataUrl(
            key.width || 360, 'Loading...', 'Connecting...', false, null, 0, 0, 
            renderStyle,
            key.data.showProgress, key.data.showTitle, key.data.showPlayPause,
            key.data.titleFontSize, key.data.artistFontSize, 
            key.data.showTimeInfo, key.data.timeFontSize
        );
        keyManager.simpleDraw(serialNumber, key, loadingImage);
    } catch (error) {
        logger.error(`Failed loading image for ${keyId}: ${error.message}`);
        keyManager.textOnlyDraw(serialNumber, key, 'Error');
    }

    await updateNowPlayingKey(serialNumber, key, true);
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

    const { updateInterval, interpolationIntervalMs, enableInterpolation } = currentKeyData.data;

    if (keyManager.keyIntervals[keyId]) {
        logger.debug(`Clearing existing API fetch timer for ${keyId}`);
        clearInterval(keyManager.keyIntervals[keyId]);
        delete keyManager.keyIntervals[keyId];
    }
    if (currentKeyData.data.interpolationIntervalId) {
         logger.debug(`Clearing existing interpolation timer for ${keyId}`);
        clearInterval(currentKeyData.data.interpolationIntervalId);
        currentKeyData.data.interpolationIntervalId = null;
    }

    logger.info(`Starting API fetch updates for key ${keyId} every ${updateInterval}ms.`);
    const apiFetchIntervalId = setInterval(async () => {
        const keyExists = keyManager.activeKeys[keyId] && keyManager.keyData[keyUid];
        if (!keyExists) {
            logger.info(`Key ${keyId} no longer active/valid, clearing API fetch interval.`);
            clearInterval(apiFetchIntervalId);
            delete keyManager.keyIntervals[keyId];
            const latestKeyData = keyManager.keyData[keyUid];
            if (latestKeyData?.data?.interpolationIntervalId) {
                 logger.info(`Clearing orphaned interpolation interval for inactive key ${keyId}.`);
                clearInterval(latestKeyData.data.interpolationIntervalId);
                latestKeyData.data.interpolationIntervalId = null;
            }
            return;
        }
        await updateNowPlayingKey(serialNumber, keyManager.keyData[keyUid], false);
    }, updateInterval);
    keyManager.keyIntervals[keyId] = apiFetchIntervalId;

    if (enableInterpolation) {
        logger.info(`Starting UI interpolation updates for key ${keyId} every ${interpolationIntervalMs}ms.`);
        const interpolationIntervalId = setInterval(async () => {
            const keyExists = keyManager.activeKeys[keyId] && keyManager.keyData[keyUid];
            if (!keyExists) {
                logger.info(`Key ${keyId} no longer active/valid, clearing interpolation interval.`);
                clearInterval(interpolationIntervalId);
                const latestKeyData = keyManager.keyData[keyUid];
                if (latestKeyData?.data?.interpolationIntervalId === interpolationIntervalId) {
                    latestKeyData.data.interpolationIntervalId = null;
                }
                return;
            }
            await renderInterpolatedNowPlaying(serialNumber, keyManager.keyData[keyUid]);
        }, interpolationIntervalMs);
        currentKeyData.data.interpolationIntervalId = interpolationIntervalId;
    } else {
        logger.info(`UI interpolation disabled for key ${keyId}.`);
        currentKeyData.data.interpolationIntervalId = null;
    }

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

    if (key.data?.progressBarColor && currentKeyData.data) {
        currentKeyData.data.progressBarColor = key.data.progressBarColor;
        if (!currentKeyData.style) currentKeyData.style = {};
        currentKeyData.style.progressBarColor = key.data.progressBarColor;
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
        if (!spotifyAuth.getAuthenticationStatus()) {
            const initSuccess = await spotifyAuth.initializeAuthentication();
            if (!initSuccess) {
                needsAuth = true;
                throw new Error('Authentication required and initialization failed.');
            }
        }
        playbackState = await spotifyApi.getCurrentPlayback();
    } catch (error) {
        fetchError = error;
    }

    const now = Date.now();
    const isActive = !!(playbackState && playbackState.item);
    const isPlaying = isActive && playbackState.is_playing;
    const currentTrack = isActive ? playbackState.item : null;
    const trackId = currentTrack?.id;
    const progressMs = isActive ? playbackState.progress_ms : 0;
    const durationMs = currentTrack?.duration_ms || 0;

    // Store previous state for comparison
    let previousTrackId = currentPlaybackState.trackId;
    let previousProgress = currentPlaybackState.progressAtLastUpdate;
    let previousDuration = currentPlaybackState.durationMs;
    let previousPlaying = currentPlaybackState.isPlaying;
    
    // Update state
    currentPlaybackState.isActive = isActive;
    currentPlaybackState.isPlaying = isPlaying;
    currentPlaybackState.trackId = trackId;
    currentPlaybackState.progressAtLastUpdate = progressMs;
    currentPlaybackState.lastApiUpdateTime = now;
    currentPlaybackState.durationMs = durationMs;

    let trackChanged = false;
    let likedStatusChanged = false;
    let seekOccurred = false;

    // Detect if a seek operation occurred
    if (isPlaying && previousPlaying && trackId === previousTrackId && 
        Math.abs((progressMs - previousProgress) - (now - currentPlaybackState.lastApiUpdateTime)) > 1000) {
        seekOccurred = true;
        logger.info(`Seek detected: Progress jumped from ${previousProgress}ms to ${progressMs}ms`);
    }

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
                } else {
                    logger.warn(`Could not determine liked status for track ${trackId}`);
                    currentPlaybackState.isLiked = null;
                }
                currentPlaybackState.lastCheckedTrackId = trackId;
            } catch (error) {
                logger.error(`Error checking if track ${trackId} is saved: ${error.message}`);
                currentPlaybackState.isLiked = null;
            }
        } else if (!isActive) {
            logger.info("Playback stopped or became inactive.");
            currentPlaybackState.isLiked = null;
            currentPlaybackState.lastCheckedTrackId = null;
        }
    }

    currentKeyData = keyManager.keyData[keyUid];
    if (!currentKeyData || !currentKeyData.data) {
        logger.error(`Key data for ${keyUid} disappeared during update processing.`);
        keyManager.cleanupKey(serialNumber, keyUid);
        return;
    }

    currentKeyData.data.currentTrackDetails = currentTrack;
    currentKeyData.data.lastApiUpdateTime = now;
    currentKeyData.data.progressAtLastUpdate = progressMs;
    currentKeyData.data.durationMs = durationMs;
    
    if (key.data?.progressBarColor) {
        currentKeyData.data.progressBarColor = key.data.progressBarColor;
        if (!currentKeyData.style) currentKeyData.style = {};
        currentKeyData.style.progressBarColor = key.data.progressBarColor;
    }

    if (shouldStartTimers) {
        startOrRestartNowPlayingUpdates(serialNumber, currentKeyData);
        await renderInterpolatedNowPlaying(serialNumber, currentKeyData);
    }

    if (trackChanged || likedStatusChanged || seekOccurred || isPlaying !== previousPlaying || durationMs !== previousDuration) {
        logger.debug(`Setting up song end timer due to: ${trackChanged ? 'track change' : seekOccurred ? 'seek' : 'play state change'}`);
        setupSongEndTimer(progressMs, durationMs, isPlaying);
    }

    if (trackChanged || likedStatusChanged) {
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

    logger.debug(`[updateNowPlayingKey] Key ${keyId} - Update cycle finished.`);
}

/** Initialize Like Key */
async function initializeLikeKey(serialNumber, key) {
    const keyUid = key.uid;
    const keyId = `${serialNumber}-${keyUid}`;
    logger.info('Initializing like key:', keyId);

    key.data = {
        likedColor: key.data?.likedColor || '#1ED760',
        unlikedColor: key.data?.unlikedColor || '#FFFFFF',
        likeBgColor: key.data?.likeBgColor || '#424242',
        isLiked: currentPlaybackState.isLiked,
        currentTrackId: currentPlaybackState.trackId
    };
    keyManager.keyData[keyUid] = key;
    keyManager.activeKeys[keyId] = true;

    updateLikeKeyDisplay(serialNumber, key);
}

/** Update Like Key Display */
async function updateLikeKeyDisplay(serialNumber, key) {
    const keyUid = key.uid;
    const keyId = `${serialNumber}-${keyUid}`;
    logger.debug(`Updating like key display: ${keyId}`);

    if (!keyManager.activeKeys[keyId]) {
        logger.warn(`Attempted to update inactive like key ${keyId}.`);
        return;
    }

    const currentKeyData = keyManager.keyData[keyUid];
    if (!currentKeyData || !currentKeyData.data) {
        logger.error(`Key data or key.data missing for like key ${keyUid} during display update.`);
        return;
    }

    const { isLiked, likedColor, unlikedColor, likeBgColor } = currentKeyData.data;
    
    try {
        const buttonDataUrl = await renderer.createSpotifyButtonDataUrl(
            currentKeyData.width || 80,
            null,
            null,
            null,
            null,
            0,
            0,
            currentKeyData.style || {},
            false,
            false,
            false,
            0,
            0,
            false,
            0,
            {
                buttonType: 'like',
                isLiked: isLiked,
                likedColor: likedColor,
                unlikedColor: unlikedColor,
                likeBgColor: likeBgColor
            }
        );
        keyManager.simpleDraw(serialNumber, currentKeyData, buttonDataUrl);
    } catch (error) {
        logger.error(`Error rendering like key ${keyId}: ${error.message}`);
        const errorText = isLiked === null ? '?' : (isLiked ? '♥' : '♡');
        keyManager.textOnlyDraw(serialNumber, currentKeyData, errorText);
    }
}

/** Handle Interaction for Like Key */
async function handleLikeInteraction(serialNumber, key, data) {
    const keyUid = key.uid;
    const keyId = `${serialNumber}-${keyUid}`;
    logger.info(`Handling like interaction for key ${keyId}`);

    const currentKeyData = keyManager.keyData[keyUid];
    if (!currentKeyData || !currentKeyData.data) {
        logger.error(`Key data or key.data missing for like key ${keyUid} during interaction.`);
        return;
    }

    const { currentTrackId, isLiked } = currentKeyData.data;

    if (!currentTrackId) {
        logger.warn(`Like button pressed (${keyId}) but no current track ID is known.`);
        return;
    }

    if (isLiked === null) {
         logger.warn(`Like button pressed (${keyId}) but liked status is unknown.`);
         return;
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
            currentPlaybackState.isLiked = false;
        } else {
            logger.info(`Attempting to add track ${currentTrackId} to library (key: ${keyId})`);
            await spotifyApi.saveTracks([currentTrackId]);
            logger.info(`Successfully saved track ${currentTrackId}`);
            currentKeyData.data.isLiked = true;
            currentPlaybackState.isLiked = true;
        }

        await updateLikeKeyDisplay(serialNumber, currentKeyData);

    } catch (error) {
        logger.error(`Failed to ${isLiked ? 'remove' : 'save'} track ${currentTrackId}: ${error.message}`);
    }
}

/** Initialize Counter Key */
function initializeCounterKey(serialNumber, key) {
     const keyUid = key.uid;
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

     if (!keyManager.keyData[keyUid]) keyManager.keyData[keyUid] = {};
     Object.assign(keyManager.keyData[keyUid], key);
     const currentKeyData = keyManager.keyData[keyUid];

    currentKeyData.style = currentKeyData.style || {};
    currentKeyData.style.showIcon = false;
    currentKeyData.style.showTitle = false;
    currentKeyData.style.showEmoji = false;
    currentKeyData.style.showImage = true;
    
    if (data.evt === 'click') { 
        // try {
        //     if (!spotifyAuth.getAuthenticationStatus()) {
        //         logger.error(`Cannot toggle play/pause for ${keyId}: Not auth.`);
        //         const authErrImg = await renderer.createSpotifyButtonDataUrl(/* Auth Error Params */);
        //         keyManager.simpleDraw(serialNumber, currentKeyData, authErrImg);
        //         return;
        //     }
        //     const playback = await spotifyApi.getCurrentPlayback();
        //     const isCurrentlyPlaying = playback?.is_playing || false;
        //     await controlSpotify(isCurrentlyPlaying ? 'pause' : 'play');
            
        //     await new Promise(resolve => setTimeout(resolve, 250));
        //     await updateNowPlayingKey(serialNumber, currentKeyData); 

        //     if (!keyManager.keyIntervals[keyId]) {
        //          logger.info(`Restarting update interval for ${keyId} after interaction.`);
        //          startOrRestartNowPlayingUpdates(serialNumber, currentKeyData);
        //      }
        // } catch (error) {
        //     logger.error(`Error handling play/pause click for ${keyId}:`, error);
        //     const errorImage = await renderer.createSpotifyButtonDataUrl(/* Error Params */);
        //     keyManager.simpleDraw(serialNumber, currentKeyData, errorImage);
        // }
    } else { 
         await updateNowPlayingKey(serialNumber, currentKeyData); 
    }
}


/**
 * Reset and clear the song end timer if it exists
 */
function clearSongEndTimer() {
    if (currentPlaybackState.songEndTimerId) {
        logger.debug('Clearing song end timer during cleanup');
        clearTimeout(currentPlaybackState.songEndTimerId);
        currentPlaybackState.songEndTimerId = null;
    }
}

// --- Plugin Start & Global Handlers --- //
plugin.start();
process.on('uncaughtException', (error) => { 
    logger.error('Uncaught exception:', error);
});
process.on('unhandledRejection', (reason, promise) => { 
    logger.error('Unhandled rejection:', reason);
});
plugin.on('ready', async () => { 
    logger.info('Plugin ready');
});