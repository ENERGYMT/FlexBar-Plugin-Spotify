const { plugin, logger } = require("@eniac/flexdesigner");

// --- State Management --- //

// Stores configuration and state for each key, keyed by key.uid
const keyData = {}; 

// Stores interval IDs for periodic updates, keyed by `${serialNumber}-${keyUid}`
const keyIntervals = {};

// Tracks currently active/connected keys, keyed by `${serialNumber}-${keyUid}`
const activeKeys = {};

// Tracks last update time for throttling
let lastUpdateTime = 0;
const MIN_UPDATE_INTERVAL = 2000; // Minimum ms between updates

// --- Helper Functions --- //

/**
 * Checks if a device is considered connected based on activeKeys.
 * @param {string} serialNumber 
 * @returns {boolean}
 */
function isDeviceConnected(serialNumber) {
    try {
        if (!serialNumber) {
            logger.error(`Invalid serialNumber in isDeviceConnected check: ${typeof serialNumber}`);
            return false;
        }
        serialNumber = String(serialNumber); // Ensure string
        
        // Check if any active key entry starts with this serial number
        const isConnected = Object.keys(activeKeys).some(keyId => keyId.startsWith(`${serialNumber}-`));
        logger.debug(`Device connection check - serialNumber: ${serialNumber}, connected: ${isConnected}`);
        return isConnected;
    } catch (error) {
        logger.error(`Error checking device connection: ${error.message}`);
        return false;
    }
}

/**
 * Safely cleans up resources (intervals, active status) for a specific key.
 * @param {string} serialNumber 
 * @param {string|number} keyUid 
 */
function cleanupKey(serialNumber, keyUid) {
    if (!serialNumber || keyUid === undefined || keyUid === null) {
         logger.warn(`Attempted cleanupKey with invalid serialNumber or keyUid: SN=${serialNumber}, UID=${keyUid}`);
         return;
    }
    const keyId = `${serialNumber}-${keyUid}`;
    
    // Remove from active keys
    if (activeKeys[keyId]) {
         delete activeKeys[keyId];
         logger.debug(`Removed key ${keyId} from activeKeys.`);
    } else {
         logger.debug(`Key ${keyId} was not in activeKeys during cleanup.`);
    }
    
    // Clear any intervals
    if (keyIntervals[keyId]) {
        clearInterval(keyIntervals[keyId]);
        delete keyIntervals[keyId];
         logger.debug(`Cleared interval for key ${keyId}.`);
    }
    
    // Optionally: Clean up key data references if they are no longer needed
    // Be cautious here if keyData[keyUid] might be needed elsewhere even if inactive
    // if (keyData[keyUid]) {
    //     // Check if any other active key uses this uid (unlikely with current structure)
    //     const isUidActiveElsewhere = Object.keys(activeKeys).some(k => k.endsWith(`-${keyUid}`));
    //     if (!isUidActiveElsewhere) {
    //        // delete keyData[keyUid]; // Consider implications before uncommenting
    //        // logger.info(`Removed data for key UID ${keyUid}`);
    //     } 
    // }
    
    logger.info(`Cleaned up resources for key ${keyUid} on device ${serialNumber}`);
}

/**
 * Throttled update check.
 * @returns {boolean} True if update can proceed, false if throttled.
 */
function throttledUpdateCheck() {
    const now = Date.now();
    // Skip update if it's too soon since the last one
    if (now - lastUpdateTime < MIN_UPDATE_INTERVAL) {
        logger.debug('Skipping update due to throttling');
        return false;
    }
    
    // Update the last update time
    lastUpdateTime = now;
    return true;
}

// --- Drawing Functions --- //

/**
 * Fallback to draw text-only when images fail or are not provided.
 * @param {string} serialNumber 
 * @param {object} key 
 */
function textOnlyDraw(serialNumber, key) {
    try {
        if (!serialNumber || !key || typeof key !== 'object') {
            logger.error(`Invalid args in textOnlyDraw: SN=${serialNumber}, key type=${typeof key}`);
            return;
        }
        serialNumber = String(serialNumber);
        const keyUid = key.uid;
        const keyId = `${serialNumber}-${keyUid}`;

        logger.debug(`Text-only draw attempt for key ${keyId}`);
        
        if (!isDeviceConnected(serialNumber)) {
            logger.warn(`Skipping text draw: Device ${serialNumber} not connected (key: ${keyId})`);
            return;
        }
        
        if (!keyUid || !activeKeys[keyId]) {
            logger.debug(`Skipping text draw for inactive/invalid key: ${keyId}`);
            return;
        }
        
        // Create a safe, minimal copy of the key for drawing
        const safeKey = {
             uid: key.uid,
             title: key.title, // Preserve existing title if any
             style: { ...(key.style || {}) } // Copy style safely
        };

        // Configure for text-only display
        safeKey.style.showTitle = true;
        safeKey.style.showImage = false;
        safeKey.style.showIcon = false;
        safeKey.style.showEmoji = false;
        
        // Set title based on key data if available (example from original code)
        // This logic might need adjustment depending on where title is set
        if (key.data && key.data.currentTrack) {
            safeKey.title = key.data.currentTrack.name;
            if (key.data.showArtist && key.data.currentTrack.artist) {
                safeKey.title += ` - ${key.data.currentTrack.artist}`;
            }
            safeKey.title += key.data.currentTrack.isPlaying ? ' ▶' : ' ⏸';
        } else if (!safeKey.title) {
            safeKey.title = 'Spotify'; // Original default
        }
        
        plugin.draw(serialNumber, safeKey);
        logger.debug(`Executed text-only draw for key ${keyId}`);

    } catch (error) {
        logger.error(`Text-only draw failed for key ${key?.uid || 'unknown'} on SN ${serialNumber}: ${error.message}`);
        if (error.message.includes('not alive') || error.message.includes('not connected')) {
            cleanupKey(serialNumber, key.uid);
        }
    }
}

/**
 * Reliable drawing function: handles base64 image data or falls back to text.
 * @param {string} serialNumber 
 * @param {object} key 
 * @param {string|null} imageData Base64 encoded image data, or null for text-only.
 */
function simpleDraw(serialNumber, key, imageData = null) {
    try {
        if (!serialNumber || !key || typeof key !== 'object') {
             logger.error(`Invalid args in simpleDraw: SN=${serialNumber}, key type=${typeof key}`);
            return;
        }
        serialNumber = String(serialNumber);
        const keyUid = key.uid;
        const keyId = `${serialNumber}-${keyUid}`;
        
        logger.debug(`Drawing attempt for key ${keyId}, Image: ${!!imageData}`);
        
        if (!isDeviceConnected(serialNumber)) {
            logger.warn(`Skipping draw: Device ${serialNumber} not connected (key: ${keyId})`);
            return;
        }
        
        if (!keyUid || !activeKeys[keyId]) {
            logger.debug(`Skipping draw for inactive/invalid key: ${keyId}`);
            return;
        }
        
        // Create a minimal safe key copy
        // Include properties needed by plugin.draw and potentially style info
        const safeKey = {
             uid: key.uid,
             // Include other essential props passed by FlexBar if needed, e.g., width
             width: key.width, 
             // Make style explicit for image drawing
             style: { 
                 ...(key.style || {}),
                 showImage: true, // Assume image display if imageData is provided
                 showTitle: false // Typically hide title when showing image
             }
             // Avoid passing the full key.data here unless absolutely necessary
        };

        if (imageData && typeof imageData === 'string' && imageData.startsWith('data:image/png;base64,')) { // Basic validation
            try {
                logger.debug(`Drawing image for key ${keyId}, data length: ${imageData.length}`);
                // Use 'base64' draw type
                plugin.draw(serialNumber, safeKey, 'base64', imageData);
            } catch (imageError) {
                logger.error(`Base64 draw failed for ${keyId}: ${imageError.message}. Falling back to text.`);
                textOnlyDraw(serialNumber, key); // Pass the original key for fallback text generation
            }
        } else {
             if (imageData) { // Log if imageData was provided but invalid
                 logger.warn(`Invalid or missing image data for key ${keyId}, using text-only mode. Type: ${typeof imageData}, StartsWith: ${typeof imageData === 'string' ? imageData.startsWith('data:image') : 'N/A'}`);
             } else {
                 logger.debug(`No image data provided for key ${keyId}, using text-only mode.`);
             }
            textOnlyDraw(serialNumber, key); // Pass the original key for fallback text generation
        }
    } catch (error) {
        logger.error(`Draw error for key ${key?.uid || 'unknown'} on SN ${serialNumber}: ${error.message}`);
         logger.error('Full error details:', error); // Log full error object
         logger.error('Draw parameters:', { 
             serialNumber: serialNumber, 
             keyUid: key?.uid,
             hasImageData: !!imageData 
         });
        
        // If the key/device is gone, clean up
        if (error.message.includes('not alive') || 
            error.message.includes('not connected') || 
            error.message.includes('device not connected') ||
            error.message.includes('first argument must be')) { // Handle potential type errors on SN
            cleanupKey(serialNumber, key.uid);
        }
    }
}

/**
 * Draw a key using only its title property (no image).
 * @param {string} serialNumber 
 * @param {object} key Key object (must have uid, title, style)
 */
function simpleTextDraw(serialNumber, key) {
    try {
        if (!serialNumber || !key || typeof key !== 'object' || key.uid === undefined || key.uid === null) {
            logger.error(`Invalid args in simpleTextDraw: SN=${serialNumber}, key type=${typeof key}, UID=${key?.uid}`);
            return;
        }
         serialNumber = String(serialNumber);
         const keyUid = key.uid;
         const keyId = `${serialNumber}-${keyUid}`;

        logger.debug(`simpleTextDraw attempt for key ${keyId}`);

        if (!isDeviceConnected(serialNumber)) {
            logger.warn(`Skipping simpleTextDraw: Device ${serialNumber} not connected (key: ${keyId})`);
            return;
        }
        
        if (!activeKeys[keyId]) {
            logger.debug(`Skipping simpleTextDraw for inactive key: ${keyId}`);
            return;
        }
        
        // Create a minimal safe key copy, ensuring title is shown
        const safeKey = {
            uid: key.uid,
            title: key.title || ' ', // Ensure title exists
            style: { 
                ...(key.style || {}),
                showTitle: true, 
                showImage: false, 
                showIcon: false, 
                showEmoji: false 
            }
        };
        
        plugin.draw(serialNumber, safeKey); // Draw without type or data args
        logger.debug(`Executed simpleTextDraw for key ${keyId}`);

    } catch (error) {
        logger.error(`simpleTextDraw error for key ${key?.uid || 'unknown'} on SN ${serialNumber}: ${error.message}`);
        if (error.message.includes('not alive') || 
            error.message.includes('not connected') || 
            error.message.includes('Unknown command type')) { // Handle specific draw errors
            cleanupKey(serialNumber, key.uid);
        }
    }
}

// --- Exports --- //

module.exports = {
    // State (Exporting directly - use with caution or create accessors)
    keyData,
    keyIntervals,
    activeKeys,
    
    // Functions
    cleanupKey,
    isDeviceConnected,
    simpleDraw,
    textOnlyDraw,
    simpleTextDraw,
    throttledUpdateCheck
}; 