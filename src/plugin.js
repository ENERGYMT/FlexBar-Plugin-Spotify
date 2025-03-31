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
    logger.info("Triggering manual update for all active 'now playing' keys.");
    Object.keys(keyManager.activeKeys).forEach(keyId => {
        const [serialNumber, keyUid] = keyId.split('-');
        // Retrieve the full key object using the Uid from keyManager's store
        const key = keyManager.keyData[keyUid]; 
        // Check if the key exists and is a now playing key
        if (key && key.cid === 'com.energy.spotify_integration.nowplaying') {
             logger.debug(`Manually updating now playing key ${keyId}`);
            // Make sure to pass the serial number associated with this active key instance
            updateNowPlayingKey(serialNumber, key);
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

/** Update Logic for a Single Now Playing Key */
async function updateNowPlayingKey(serialNumber, key) {
     const keyUid = key.uid;
     const keyId = `${serialNumber}-${keyUid}`;
     // logger.debug(`Attempting update for now playing key ${keyId}`);

    try {
        // Use keyManager function
        if (!keyManager.throttledUpdateCheck()) return; 

        if (!spotifyAuth.getAuthenticationStatus()) { 
            const initSuccess = await spotifyAuth.initializeAuthentication();
            if (!initSuccess) {
                logger.warn(`Update skipped for ${keyId}: Auth required.`);
                const errorImage = await renderer.createSpotifyButtonDataUrl(/* Auth Error Params */);
                keyManager.simpleDraw(serialNumber, key, errorImage); // Use keyManager
                if (keyManager.keyIntervals[keyId]) { // Use keyManager
                     clearInterval(keyManager.keyIntervals[keyId]); // Use keyManager
                     delete keyManager.keyIntervals[keyId]; // Use keyManager
                }
                return;
            }
        }
        
        const playback = await spotifyApi.getCurrentPlayback();
        let newTrackData = null;
        if (playback && playback.item) { newTrackData = { /* ... extract ... */ 
            id: playback.item.id,
            name: playback.item.name,
            artist: playback.item.artists.map(artist => artist.name).join(', '),
            album: playback.item.album.name,
            isPlaying: playback.is_playing,
            albumArtUrl: playback.item.album.images[0]?.url,
            progress: playback.progress_ms,
            duration: playback.item.duration_ms
        }; }

        // Use keyManager state
        const oldTrackData = keyManager.keyData[keyUid]?.data?.currentTrack;
        const needsUpdate = JSON.stringify(oldTrackData) !== JSON.stringify(newTrackData);

        if (needsUpdate) {
             logger.info(`Track state changed for ${keyId}. Updating display.`);
             key.data.currentTrack = newTrackData;
             // Use keyManager state
             if (keyManager.keyData[keyUid]) {
                 keyManager.keyData[keyUid].data = key.data;
             }

             let buttonImage = await renderer.createSpotifyButtonDataUrl(
                 key.width || 360,
                 newTrackData ? newTrackData.name : 'No track playing',
                 newTrackData && key.data.showArtist ? newTrackData.artist : null,
                 newTrackData ? newTrackData.isPlaying : false,
                 newTrackData ? newTrackData.albumArtUrl : null,
                 newTrackData ? newTrackData.progress : 0,
                 newTrackData ? newTrackData.duration : 0,
                 key.style, key.data.showProgress, key.data.showTitle, key.data.showPlayPause,
                 key.data.titleFontSize, key.data.artistFontSize
             );
             // Use keyManager draw function
             keyManager.simpleDraw(serialNumber, key, buttonImage);
         } 
    } catch (error) {
        logger.error(`Failed update for ${keyId}:`, error);
        // Error handling uses:
        if (!spotifyAuth.getAuthenticationStatus() && keyManager.keyIntervals[keyId]) { // Use keyManager
             logger.error(`Stopping updates for ${keyId} due to auth error.`);
             clearInterval(keyManager.keyIntervals[keyId]); // Use keyManager
             delete keyManager.keyIntervals[keyId]; // Use keyManager
             const authErrImg = await renderer.createSpotifyButtonDataUrl(/* Auth Error Params */);
             keyManager.simpleDraw(serialNumber, key, authErrImg); // Use keyManager
         } 
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
