const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { truncateText, getImageColors, roundedRect, createFallbackImage, decodeHtmlEntities } = require('./utils'); // Import necessary utils
const spotifyAuth = require('./spotifyAuth');
const spotifyApi = require('./spotifyApi');
const renderer = require('./canvasRenderer'); // Require the renderer
const keyManager = require('./keyManager');
const logger = require("./loggerWrapper"); // Add this line

/**
 * Draws a custom play icon
 * @param {CanvasRenderingContext2D} ctx Canvas context
 * @param {number} x Center X position
 * @param {number} y Center Y position
 * @param {number} size Icon size
 * @param {string} color Icon color
 */
function drawPlayIcon(ctx, x, y, size, color = '#FFFFFF') {
    const scale = size / 24; // Base size is 24px
    
    ctx.save();
    ctx.translate(x, y);
    
    // Create play triangle path
    ctx.beginPath();
    // Adjusted points for better centering
    ctx.moveTo(-5 * scale, -8 * scale); 
    ctx.lineTo(7 * scale, 0);
    ctx.lineTo(-5 * scale, 8 * scale);
    ctx.closePath();
    
    // Add glow effect
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    
    // Fill the path
    ctx.fillStyle = color;
    ctx.fill();
    
    ctx.restore();
}

/**
 * Draws a custom pause icon
 * @param {CanvasRenderingContext2D} ctx Canvas context
 * @param {number} x Center X position
 * @param {number} y Center Y position
 * @param {number} size Icon size
 * @param {string} color Icon color
 */
function drawPauseIcon(ctx, x, y, size, color = '#FFFFFF') {
    const scale = size / 24;
    const barWidth = 4 * scale;
    const barHeight = 16 * scale;
    const spacing = 2 * scale; // Reduced spacing for centering
    
    ctx.save();
    ctx.translate(x, y);
    
    // Add glow effect
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    
    // Draw two rounded rectangles
    ctx.fillStyle = color;
    
    // Use roundedRect utility function
    // Left bar
    const leftX = -spacing - barWidth; 
    const topY = -barHeight / 2;
    roundedRect(ctx, leftX, topY, barWidth, barHeight, 2 * scale);
    ctx.fill(); // Fill the path created by roundedRect
    
    // Right bar
    const rightX = spacing; 
    roundedRect(ctx, rightX, topY, barWidth, barHeight, 2 * scale);
    ctx.fill(); // Fill the path created by roundedRect
    
    ctx.restore();
}

/**
 * Draws a custom next track icon
 * @param {CanvasRenderingContext2D} ctx Canvas context
 * @param {number} x Center X position
 * @param {number} y Center Y position
 * @param {number} size Icon size
 * @param {string} color Icon color
 */
function drawNextIcon(ctx, x, y, size, color = '#FFFFFF') {
    const scale = size / 24;
    
    ctx.save();
    ctx.translate(x, y);
    
    // Add glow effect
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = color;
    
    // Draw first triangle (right part of skip icon)
    ctx.beginPath();
    ctx.moveTo(-6 * scale, -8 * scale);
    ctx.lineTo(2 * scale, 0);
    ctx.lineTo(-6 * scale, 8 * scale);
    ctx.closePath();
    ctx.fill();
    
    // Draw vertical bar (right part of skip icon)
    // Centered around x=6*scale
    const barWidth = 3 * scale;
    const barHeight = 16 * scale;
    roundedRect(ctx, 6 * scale - barWidth / 2, -barHeight / 2, barWidth, barHeight, 1.5 * scale);
    ctx.fill();
    
    ctx.restore();
}

/**
 * Draws a custom previous track icon
 * @param {CanvasRenderingContext2D} ctx Canvas context
 * @param {number} x Center X position
 * @param {number} y Center Y position
 * @param {number} size Icon size
 * @param {string} color Icon color
 */
function drawPrevIcon(ctx, x, y, size, color = '#FFFFFF') {
    const scale = size / 24;
    
    ctx.save();
    ctx.translate(x, y);
    
    // Add glow effect
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = color;
    
    // Draw triangle (left part of skip icon)
    ctx.beginPath();
    ctx.moveTo(6 * scale, -8 * scale);
    ctx.lineTo(-2 * scale, 0);
    ctx.lineTo(6 * scale, 8 * scale);
    ctx.closePath();
    ctx.fill();
    
    // Draw vertical bar (left part of skip icon)
    // Centered around x = -6 * scale
    const barWidth = 3 * scale;
    const barHeight = 16 * scale;
    roundedRect(ctx, -6 * scale - barWidth / 2, -barHeight / 2, barWidth, barHeight, 1.5 * scale);
    ctx.fill();
    
    ctx.restore();
}

/**
 * Draws a custom like icon
 * @param {CanvasRenderingContext2D} ctx Canvas context
 * @param {number} x Center X position
 * @param {number} y Center Y position
 * @param {number} size Icon size
 * @param {boolean} isLiked Liked state
 * @param {string} likedColor Color for liked/fill state
 * @param {string} unlikedColor Color for unliked/stroke state
 */
function drawLikeIcon(ctx, x, y, size, isLiked, likedColor = '#1DB954', unlikedColor = '#FFFFFF') {
    // Log the received value and its type
    logger.info(`[drawLikeIcon] Received isLiked: ${isLiked} (type: ${typeof isLiked})`);

    // --- Calculate Scaling & Translation --- 
    // Original path bounds (approximate, based on SVG data: X:100-900, Y:192-881)
    // ViewBox 0 0 1000 1000
    const pathWidth = 800; // 900 - 100
    const pathHeight = 689; // 881 - 192
    const pathOriginX = 100; // Original left-most point relative to viewBox
    const pathOriginY = 192; // Original top-most point relative to viewBox
    const viewBoxSize = 1000; // SVG path is defined within a 1000x1000 box
    
    // Determine the scale factor to fit the path within the target 'size'
    // Maintain aspect ratio based on the original path dimensions
    const scaleX = size / pathWidth;
    const scaleY = size / pathHeight;
    const scale = Math.min(scaleX, scaleY); // Use the smaller scale to fit completely

    // Scaled dimensions
    const scaledWidth = pathWidth * scale;
    const scaledHeight = pathHeight * scale;

    // Calculate translation needed to center the *scaled* path at (x, y)
    const translateX = x - scaledWidth / 2;
    const translateY = y - scaledHeight / 2;
    // --- End Calculation ---

    ctx.save();
    
    // Apply transformations: Translate to center, then scale relative to the original viewBox
    // We translate to the desired top-left corner (translateX, translateY)
    // Then we scale the drawing context
    // Then, when drawing, we subtract the original path's origin offset
    ctx.translate(translateX, translateY);
    ctx.scale(scale, scale);
    
    // --- Draw Path Manually using SVG Commands --- 
    // Path: M 300 192 C 353 192 404 213 441 250 C 500 317 500 317 559 250 C 596 213 647 192 700 192 C 753 192 804 213 841 250 C 879 288 900 339 900 392 C 900 443 880 492 845 529 C 845 529 845 530 845 530 C 845 530 550 846 550 846 C 512 881 487 881 450 846 C 450 846 159 533 159 533 C 121 495 100 445 100 392 C 100 339 121 288 159 250 C 196 213 247 192 300 192 C 300 192 300 192 300 192
    ctx.beginPath();
    ctx.moveTo(300 - pathOriginX, 192 - pathOriginY); // M 300 192 (Adjusted for origin)
    ctx.bezierCurveTo(353 - pathOriginX, 192 - pathOriginY, 404 - pathOriginX, 213 - pathOriginY, 441 - pathOriginX, 250 - pathOriginY); // C 353 192 404 213 441 250
    ctx.bezierCurveTo(500 - pathOriginX, 317 - pathOriginY, 500 - pathOriginX, 317 - pathOriginY, 559 - pathOriginX, 250 - pathOriginY); // C 500 317 500 317 559 250
    ctx.bezierCurveTo(596 - pathOriginX, 213 - pathOriginY, 647 - pathOriginX, 192 - pathOriginY, 700 - pathOriginX, 192 - pathOriginY); // C 596 213 647 192 700 192
    ctx.bezierCurveTo(753 - pathOriginX, 192 - pathOriginY, 804 - pathOriginX, 213 - pathOriginY, 841 - pathOriginX, 250 - pathOriginY); // C 753 192 804 213 841 250
    ctx.bezierCurveTo(879 - pathOriginX, 288 - pathOriginY, 900 - pathOriginX, 339 - pathOriginY, 900 - pathOriginX, 392 - pathOriginY); // C 879 288 900 339 900 392
    ctx.bezierCurveTo(900 - pathOriginX, 443 - pathOriginY, 880 - pathOriginX, 492 - pathOriginY, 845 - pathOriginX, 529 - pathOriginY); // C 900 443 880 492 845 529
    // C 845 529 845 530 845 530 (These are points, not curves, seems like a duplicate point)
    ctx.bezierCurveTo(845 - pathOriginX, 530 - pathOriginY, 550 - pathOriginX, 846 - pathOriginY, 550 - pathOriginX, 846 - pathOriginY); // C 845 530 550 846 550 846
    ctx.bezierCurveTo(512 - pathOriginX, 881 - pathOriginY, 487 - pathOriginX, 881 - pathOriginY, 450 - pathOriginX, 846 - pathOriginY); // C 512 881 487 881 450 846
    // C 450 846 159 533 159 533 (Points, not curves)
    ctx.bezierCurveTo(159 - pathOriginX, 533 - pathOriginY, 121 - pathOriginX, 495 - pathOriginY, 100 - pathOriginX, 392 - pathOriginY); // C 121 495 100 445 100 392 (Approximation, original SVG uses points)
    ctx.bezierCurveTo(100 - pathOriginX, 339 - pathOriginY, 121 - pathOriginX, 288 - pathOriginY, 159 - pathOriginX, 250 - pathOriginY); // C 100 339 121 288 159 250
    ctx.bezierCurveTo(196 - pathOriginX, 213 - pathOriginY, 247 - pathOriginX, 192 - pathOriginY, 300 - pathOriginX, 192 - pathOriginY); // C 196 213 247 192 300 192
    // Last C 300 192 300 192 300 192 likely closes the path or is redundant
    ctx.closePath();
    // --- End Path Drawing ---

    // Style and draw - Conditional fill/stroke based on isLiked
    ctx.lineWidth = 3.5 / scale; // Use a scaled line width
    ctx.strokeStyle = unlikedColor; 
    ctx.fillStyle = likedColor; 

    // Conditional fill/stroke logic
    if (isLiked === true) {
        logger.info(`[drawLikeIcon] Action: Filling (isLiked is true)`);
        ctx.fill(); // Fill if liked
    } else if (isLiked === false) {
        logger.info(`[drawLikeIcon] Action: Stroking (isLiked is false)`);
        ctx.stroke(); // Outline if not liked
    } else {
        logger.info(`[drawLikeIcon] Action: Stroking dimmed (isLiked is null/undefined)`);
        // Unknown state: draw dimmed outline
        ctx.globalAlpha = 0.6;
        ctx.stroke(); // Outline for unknown state
        ctx.globalAlpha = 1.0;
    }
    
    ctx.restore();
}

/**
 * Renders simple elements (text, rect, icon) to a canvas.
 * @param {object} options Configuration options
 * @param {number} options.width Canvas width
 * @param {number} options.height Canvas height
 * @param {object[]} options.elements Array of elements to render
 * @param {string} options.backgroundColor Background color
 * @returns {Canvas} The rendered canvas
 */
function renderSimpleCanvas({ width = 360, height = 60, elements = [], backgroundColor = '#1DB954' }) {
    try {
        // Create canvas
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Set background
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, width, height);

        // Process each element
        elements.forEach(element => {
            const {
                type,
                text,
                x = 0,
                y = 0,
                font = '14px sans-serif',
                color = 'white',
                align = 'left',
                baseline = 'top',
                maxWidth,
                padding = 0
            } = element;

            switch (type) {
                case 'text':
                    ctx.font = font;
                    ctx.fillStyle = color;
                    ctx.textAlign = align;
                    ctx.textBaseline = baseline;
                    
                    // Use truncateText utility
                    const displayText = maxWidth ? truncateText(ctx, text, maxWidth - (padding * 2)) : text;
                    ctx.fillText(displayText, x + padding, y + padding);
                    break;

                case 'rect':
                    const { width: rectWidth, height: rectHeight, fill, radius = 0 } = element;
                    ctx.fillStyle = fill || color;
                     if (radius > 0) {
                        roundedRect(ctx, x, y, rectWidth, rectHeight, radius);
                        ctx.fill();
                     } else {
                        ctx.fillRect(x, y, rectWidth, rectHeight);
                     }
                    break;

                case 'icon': // Simple text-based icon rendering
                    ctx.font = element.size || '14px sans-serif';
                    ctx.fillStyle = color;
                    ctx.textAlign = align;
                    ctx.textBaseline = baseline;
                    ctx.fillText(element.icon, x + padding, y + padding);
                    break;
                 
                 // Add case for custom drawn icons if needed
                 case 'playIcon':
                    drawPlayIcon(ctx, element.x, element.y, element.size, element.color);
                    break;
                 case 'pauseIcon':
                    drawPauseIcon(ctx, element.x, element.y, element.size, element.color);
                    break;
                 case 'nextIcon':
                    drawNextIcon(ctx, element.x, element.y, element.size, element.color);
                    break;
                 case 'prevIcon':
                    drawPrevIcon(ctx, element.x, element.y, element.size, element.color);
                    break;
            }
        });

        return canvas;
    } catch (error) {
        logger.error('Error rendering simple canvas:', error);
        // Return a basic fallback canvas using the utility
        return createFallbackImage(width, height).then(loadImage); // Needs async handling potentially
        // Safer: return a synchronously created fallback canvas
         const fallbackCanvas = createCanvas(width, height);
         const fbCtx = fallbackCanvas.getContext('2d');
         fbCtx.fillStyle = '#FF0000'; // Red background for error
         fbCtx.fillRect(0, 0, width, height);
         fbCtx.fillStyle = '#FFFFFF';
         fbCtx.font = '12px sans-serif';
         fbCtx.textAlign = 'center';
         fbCtx.fillText('Render Error', width/2, height/2);
         return fallbackCanvas;
    }
}


/**
 * Creates a modern-looking now playing display with album art.
 * Returns a Canvas object.
 * @param {object} config Configuration object
 * @returns {Promise<Canvas>} A promise that resolves with the Canvas object.
 */
async function createModernNowPlayingCanvas(config) {
    // Destructure all properties from the config object
    const {
        width = 360,
        height = 60,
        trackName = 'No track playing',
        artistName = '',
        isPlaying = false,
        accentColor = '#1DB954',
        albumArtUrl = null,
        progress = 0,
        duration = 0,
        showProgress = true,
        showTitle = true,
        showPlayPause = true,
        showTimeInfo = true,
        titleFontSize = 18,
        artistFontSize = 14,
        timeFontSize = 10, // Add default timeFontSize parameter
        progressBarColor = '#1DB954', // Add default progressBarColor parameter
        options = {} // Destructure the nested options object as well
    } = config; // Destructure from the single argument

    try {
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        
        // --- Enable Image Smoothing --- //
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high'; // Use the best quality
        // --- End Enable Image Smoothing --- //

        // --- Extract options for different button types --- 
        const { 
            buttonType = 'nowPlaying',
            isLiked = null,
            likedColor,          
            unlikedColor,
            likeBgColor // Extract likeBgColor from options
        } = options;

        // === RENDER LIKE BUTTON ===
        if (buttonType === 'like') {
            // Log the received values
            logger.info(`[createModernNowPlayingCanvas] Rendering 'like' button with isLiked: ${isLiked}, bgColor: ${likeBgColor}`);
            
            const finalLikedColor = likedColor || '#1DB954';
            const finalUnlikedColor = unlikedColor || '#FFFFFF';
            
            // Use the provided background color or default
            const finalLikeBgColor = likeBgColor || '#424242'; 
            ctx.fillStyle = finalLikeBgColor;
            
            // Use roundedRect for the background
            const cornerRadius = 10; // Use a standard corner radius
            roundedRect(ctx, 0, 0, width, height, cornerRadius);
            ctx.fill(); // Fill the rounded path
            
            // Draw the like icon using the correct function name and parameters
            const iconSize = Math.min(width, height) * 0.6; // Use appropriate size calculation
            drawLikeIcon(ctx, width / 2, height / 2, iconSize, isLiked, finalLikedColor, finalUnlikedColor);
            
            return canvas; // Return early for like button
        }
        
        // === RENDER NOW PLAYING BUTTON (Existing Logic) ===
        let albumArt = null;
        if (albumArtUrl) {
            // --- Add Retry Logic for loadImage ---
            const MAX_RETRIES = 2;
            const RETRY_DELAY_MS = 500; // 0.5 seconds delay
            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                try {
                    albumArt = await loadImage(albumArtUrl);
                    logger.debug(`Album art loaded successfully on attempt ${attempt}`);
                    break; // Success, exit loop
                } catch (imgError) {
                    logger.warn(`Failed to load album art (Attempt ${attempt}/${MAX_RETRIES}) from ${albumArtUrl}: ${imgError.message}`);
                    if (attempt === MAX_RETRIES) {
                        logger.error(`Failed to load album art after ${MAX_RETRIES} attempts. Using fallback.`);
                        // albumArt remains null, fallback will be used
                    } else {
                        // Wait before retrying
                        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                    }
                }
            }
            // --- End Retry Logic ---
        }

        let gradientColors = ['#282828', '#1E1E1E'];
        if (albumArt) {
            // Assuming getImageColors remains synchronous for now
            gradientColors = getImageColors(ctx, albumArt); 
        }
        
        const gradient = ctx.createLinearGradient(0, 0, width, 0);
        gradient.addColorStop(0, gradientColors[0]);
        gradient.addColorStop(1, gradientColors[1]);
        
        const cornerRadius = 10;
        
        // --- MODIFIED DRAWING LOGIC ---
        // Create the rounded rectangle path first
        roundedRect(ctx, 0, 0, width, height, cornerRadius); 
        
        // Fill the path with the gradient
        ctx.fillStyle = gradient;
        ctx.fill();

        // Fill the same path again with the overlay color
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'; 
        ctx.fill();
        // --- END MODIFIED DRAWING LOGIC ---

        // Layout
        const padding = 4;
        const artSize = height - (padding * 2);
        const artX = padding;
        const artY = padding;
        const buttonSize = Math.min(28, artSize * 0.6);
        const hasArt = !!albumArt;
        const buttonX = hasArt ? artX + (artSize/2) : (padding + (buttonSize / 2) + 4);
        const buttonY = height / 2;
        const textX = buttonX + (buttonSize / 2) + 20;
        const availableTextWidth = width - textX - padding;

        // Album Art
        if (albumArt) {
            ctx.save();
            const artRadius = 4;
            roundedRect(ctx, artX, artY, artSize, artSize, artRadius);
            ctx.clip();
            ctx.drawImage(albumArt, artX, artY, artSize, artSize);
            ctx.restore(); // Restore from image clip
        }

        // Define progressBarHeight here so it's always available
        const progressBarHeight = 4; 
        let progressBarY = height - padding; // Default Y if no progress bar (align to bottom padding)

        // Progress Bar (Adjusted positioning)
        if (showProgress && duration > 0) {
            // Update progressBarY when it's actually shown
            progressBarY = height - progressBarHeight - padding; 
            const progressBarRadius = progressBarHeight / 2;
            
            // Draw background bar, slightly indented
            ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
            roundedRect(ctx, padding, progressBarY, width - (padding * 2), progressBarHeight, progressBarRadius);
            ctx.fill();
            
            // Draw progress fill - use progressBarColor parameter with direct assignment
            ctx.fillStyle = progressBarColor;
            
            const progressRatio = Math.min(1, Math.max(0, progress / duration)); 
            const progressWidth = (width - (padding * 2)) * progressRatio; // Calculate width based on indented bar
            
            if (progressWidth > 0) {
                 roundedRect(ctx, padding, progressBarY, progressWidth, progressBarHeight, progressBarRadius);
                 ctx.fill();
            }
        }
        
        // Play/Pause Button
        ctx.shadowColor = 'transparent'; 
        ctx.shadowBlur = 0;
        if (showPlayPause) {
            if (isPlaying) {
                drawPauseIcon(ctx, buttonX, buttonY, buttonSize, '#FFFFFF'); // Call local icon func
            } else {
                drawPlayIcon(ctx, buttonX, buttonY, buttonSize, '#FFFFFF'); // Call local icon func
            }
        }
        
        // Text
        const finalTitleFontSize = Math.max(8, titleFontSize); 
        const finalArtistFontSize = Math.max(8, artistFontSize);
        const lineSpacing = 4;
        const titleY = padding + 4;
        const artistY = titleY + finalTitleFontSize + lineSpacing;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        // Decode HTML entities in track name and artist name
        const decodedTrackName = decodeHtmlEntities(trackName);
        const decodedArtistName = decodeHtmlEntities(artistName);
        
        // Helper function to format time for both pre-calculation and display
        function formatTime(milliseconds) {
            if (!milliseconds || isNaN(milliseconds)) return '0:00';
            
            const totalSeconds = Math.floor(milliseconds / 1000);
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            return `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
        
        // Calculate time text width for overlap prevention if time info is shown
        let timeTextWidth = 0;
        if (showTimeInfo && duration > 0) {
            ctx.save();
            // Ensure timeFontSize is a number (might be a string from UI)
            let parsedTimeFontSize = timeFontSize;
            if (typeof timeFontSize === 'string') {
                parsedTimeFontSize = parseInt(timeFontSize, 10);
            }
            const finalTimeFontSize = Math.max(8, Math.min(24, parsedTimeFontSize || 10));
            ctx.font = `${finalTimeFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
            
            // Pre-calculate time text width to reserve space
            const currentTime = formatTime(progress);
            const totalTime = formatTime(duration);
            const timeText = `${currentTime} / ${totalTime}`;
            timeTextWidth = ctx.measureText(timeText).width + padding * 2;
            ctx.restore();
        }
        
        // Adjust availableTextWidth to account for time information
        const adjustedAvailableTextWidth = availableTextWidth - (showTimeInfo ? timeTextWidth : 0);

        if (showTitle && decodedTrackName && availableTextWidth > 10) {
            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
            ctx.shadowBlur = 5;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 1;
            ctx.font = `600 ${finalTitleFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
            ctx.fillStyle = '#FFFFFF';
            // Use the adjusted width for track name to avoid overlap with time
            let displayTrackName = truncateText(ctx, decodedTrackName, adjustedAvailableTextWidth);
            ctx.fillText(displayTrackName, textX, titleY);
            ctx.restore();
        }
        
        if (decodedArtistName && availableTextWidth > 10) {
            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 1;
            ctx.font = `500 ${finalArtistFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            // Use the adjusted width for artist name to avoid overlap with time
            let displayArtistName = truncateText(ctx, decodedArtistName, adjustedAvailableTextWidth);
            ctx.fillText(displayArtistName, textX, artistY);
            ctx.restore();
        }
        
        // Time Information
        if (showTimeInfo && duration > 0) {
            const currentTime = formatTime(progress);
            const totalTime = formatTime(duration);
            const timeText = `${currentTime} / ${totalTime}`;
            
            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 4;
            
            // Ensure timeFontSize is a number (might be a string from UI)
            let parsedTimeFontSize = timeFontSize;
            if (typeof timeFontSize === 'string') {
                parsedTimeFontSize = parseInt(timeFontSize, 10);
            }
            
            // Use the configured timeFontSize with fallback to a minimum size
            const finalTimeFontSize = Math.max(8, Math.min(24, parsedTimeFontSize || 10));
            
            ctx.font = `${finalTimeFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'bottom';
            
            // Position time info in the bottom right
            let timeY;
            if (showProgress) {
                // Position slightly above the visible progress bar
                timeY = progressBarY - (padding / 2); 
            } else {
                // Position near the bottom edge when progress bar is hidden
                timeY = height - padding - 2; // Adjust '2' as needed for vertical alignment
            }
            const timeX = width - padding; // Position from right edge with padding
            
            ctx.fillText(timeText, timeX, timeY);
            ctx.restore(); // Restore from time info shadow save
        }
        
        return canvas; // Return the canvas object

    } catch (error) {
        logger.error('Failed to create modern now playing canvas:', error);
        // Return a fallback canvas synchronously
        const fallbackCanvas = createCanvas(width, height);
        const fbCtx = fallbackCanvas.getContext('2d');
        fbCtx.fillStyle = '#1E1E1E';
        fbCtx.fillRect(0, 0, width, height);
        fbCtx.fillStyle = '#FFFFFF';
        fbCtx.font = '14px sans-serif';
        fbCtx.textAlign = 'center';
        fbCtx.textBaseline = 'middle';
        fbCtx.fillText('Error Loading', width/2, height/2);
        return fallbackCanvas; // Return the canvas itself
    }
}

/**
 * Creates the Spotify button image as a Base64 PNG data URL.
 * This is the primary function expected by plugin.js for drawing.
 * @returns {Promise<string>} Base64 encoded PNG image data URL
 */
async function createSpotifyButtonDataUrl(width, trackName, artistName, isPlaying, albumArtUrl, progress, duration, style = {}, showProgress = true, showTitle = true, showPlayPause = true, titleFontSize = 18, artistFontSize = 14, showTimeInfo = true, timeFontSize = 10, options = {}) {
    try {
        // CRITICAL: Extract progressBarColor from style DIRECTLY
        // Don't rely on destructuring with default values
        let progressBarColor = '#1DB954'; // Default Spotify green
        
        // Check if progressBarColor exists in style and is non-empty
        if (style && style.progressBarColor) {
            progressBarColor = style.progressBarColor;
        }
        
        // For debugging only - extract other style properties
        const backgroundColor = style.backgroundColor || '#1E1E1E';
        const accentColor = style.accentColor || '#1DB954';
        
        // IMPORTANT: Use this progressBarColor directly in createModernNowPlayingCanvas
        const canvas = await createModernNowPlayingCanvas({
            width,
            height: 60, // Standard height
            trackName,
            artistName,
            isPlaying,
            accentColor, 
            albumArtUrl,
            progress,
            duration,
            showProgress,
            showTitle,
            showPlayPause,
            showTimeInfo,
            titleFontSize, 
            artistFontSize,
            timeFontSize,
            // CRITICAL: Pass through the progressBarColor directly
            progressBarColor, 
            options
        });

        // Convert the resulting canvas to Data URL
        return canvas.toDataURL('image/png');

    } catch (error) {
        logger.error('Error creating Spotify button Data URL:', error);
        // Use the utility fallback function which returns a Data URL directly
        return createFallbackImage(width, 60); // Uses util
    }
}

// --- Global State for Playback ---
let currentPlaybackState = {
    trackId: null,
    isLiked: null,
    lastCheckedTrackId: null,
    isActive: false,
    isPlaying: false,
    // Add fields to store the *exact* moment state was last fetched for interpolation
    progressAtLastUpdate: 0,
    lastApiUpdateTime: 0,
    durationMs: 0,
};
// --- End Global State ---

// --- Interpolated Rendering Function ---

/** Renders the Now Playing key using interpolated progress */
async function renderInterpolatedNowPlaying(serialNumber, key) {
    const keyUid = key.uid;
    const keyId = `${serialNumber}-${keyUid}`;
    logger.debug(`Rendering interpolated state for key: ${keyId}`);

    const currentKeyData = keyManager.keyData[keyUid];
    if (!currentKeyData || !currentKeyData.data) {
        logger.error(`Key data or key.data missing for ${keyUid} during interpolated render.`);
        keyManager.cleanupKey(serialNumber, keyUid); // Clean up if data is missing
        return;
    }

    // Extract data from the current key state
    const {
        currentTrackDetails, // Stores details from the last API call
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
        progressBarColor // Extract progressBarColor directly from keyData
    } = currentKeyData.data;

    const isPlaying = currentPlaybackState.isPlaying; // Use global state for playing status
    let estimatedProgress = progressAtLastUpdate;

    if (isPlaying && lastApiUpdateTime > 0 && durationMs > 0) {
        const elapsed = Date.now() - lastApiUpdateTime;
        estimatedProgress = progressAtLastUpdate + elapsed;
        // Clamp progress
        if (estimatedProgress > durationMs) {
            estimatedProgress = durationMs;
        }
        if (estimatedProgress < 0) {
            estimatedProgress = 0;
        }
    }
     // Use 0 if paused or no update time
     else if (!isPlaying) {
         estimatedProgress = progressAtLastUpdate; // Keep last known progress if paused
     } else {
         estimatedProgress = 0; // Default to 0 if no data yet
     }

    const isActive = !!(currentTrackDetails); // Active if we have track details

    try {
        const imageUrl = currentTrackDetails?.album?.images?.[0]?.url;
        
        // Use stored details, fallback if none, and decode any HTML entities
        const title = decodeHtmlEntities(currentTrackDetails?.name || 'Nothing Playing');
        const artist = decodeHtmlEntities(currentTrackDetails?.artists?.map(a => a.name).join(', ') || '');

        // Create a NEW style object that FORCES the progressBarColor from key.data
        const renderStyle = {
            // Start with minimal required properties instead of inheriting everything
            width: currentKeyData.width || 360,
            showImage: true,
            // Force progressBarColor to match the one in key.data
            progressBarColor: progressBarColor
        };

        const buttonDataUrl = await renderer.createSpotifyButtonDataUrl(
            currentKeyData.width || 360,
            title,
            artist,
            isPlaying, // Use current playing status
            imageUrl,
            Math.round(estimatedProgress), // Use rounded interpolated progress
            durationMs, // Use stored duration
            renderStyle, // Pass the minimal style object with FORCED progressBarColor
            showProgress,
            showTitle,
            showPlayPause,
            titleFontSize,
            artistFontSize,
            showTimeInfo,
            timeFontSize,
            {} // Empty options obj -> defaults to nowPlaying
        );
        keyManager.simpleDraw(serialNumber, currentKeyData, buttonDataUrl);
    } catch (error) {
        logger.error(`Error rendering interpolated now playing key ${keyId}: ${error.message}`);
        keyManager.textOnlyDraw(serialNumber, currentKeyData, 'Error rendering');
    }
}


// --- Initialization and Interaction Handlers ---

/** Initialize Now Playing Key */
async function initializeNowPlayingKey(serialNumber, key) {
    const keyUid = key.uid;
    const keyId = `${serialNumber}-${keyUid}`;
    logger.info('Initializing nowplaying key:', keyId);

    // Create initial style object if it doesn't exist
    key.style = key.style || {};
    key.style.showIcon = false;
    key.style.showTitle = false;
    key.style.showEmoji = false;
    key.style.showImage = true;

    // Extract initial progressBarColor from the incoming key data
    const initialProgressBarColor = key.data?.progressBarColor || '#1DB954';
    
    // Initialize data and store in keyManager
    key.data = {
        updateInterval: key.data?.updateInterval || 4000, // API update interval (e.g., 4s)
        interpolationIntervalMs: key.data?.interpolationIntervalMs || 1000, // UI update interval (e.g., 1s)
        showArtist: key.data?.showArtist !== undefined ? key.data.showArtist : true,
        showProgress: key.data?.showProgress !== undefined ? key.data.showProgress : true,
        showTitle: key.data?.showTitle !== undefined ? key.data.showTitle : true,
        showPlayPause: key.data?.showPlayPause !== undefined ? key.data.showPlayPause : true,
        showTimeInfo: key.data?.showTimeInfo !== undefined ? key.data.showTimeInfo : true,
        titleFontSize: key.data?.titleFontSize || 18,
        artistFontSize: key.data?.artistFontSize || 14,
        // Convert the timeFontSize to a number if it's a string
        timeFontSize: key.data?.timeFontSize !== undefined ? (typeof key.data.timeFontSize === 'string' ? parseInt(key.data.timeFontSize, 10) : key.data.timeFontSize) : 10, 
        // Use the extracted progressBarColor
        progressBarColor: initialProgressBarColor,
        // Interpolation state
        currentTrackDetails: null, // Store details like name, artist, duration, image
        lastApiUpdateTime: 0,
        progressAtLastUpdate: 0,
        durationMs: 0,
        interpolationIntervalId: null, // Store the UI update interval ID
    };
    
    // Make sure progressBarColor is copied directly to the style object
    if (!key.style.progressBarColor && key.data.progressBarColor) {
        key.style.progressBarColor = key.data.progressBarColor;
    }
    
    keyManager.keyData[keyUid] = key;

    try {
        // Create an explicit render style object
        const renderStyle = {
            ...key.style,
            // Force the progressBarColor to be the one from key.data, not from style
            progressBarColor: key.data.progressBarColor
        };
        
        const loadingImage = await renderer.createSpotifyButtonDataUrl(
            key.width || 360, 'Loading...', 'Connecting...', false, null, 0, 0, 
            renderStyle, // Use the explicit style with progressBarColor
            key.data.showProgress, key.data.showTitle, key.data.showPlayPause,
            key.data.titleFontSize, key.data.artistFontSize,
            key.data.showTimeInfo,
            key.data.timeFontSize,
            {} // Empty options obj -> defaults to nowPlaying
        );
        keyManager.simpleDraw(serialNumber, key, loadingImage);
    } catch (error) {
        logger.error(`Failed loading image for ${keyId}: ${error.message}`);
        keyManager.textOnlyDraw(serialNumber, key, 'Error');
    }

    // Fetch initial state AND start updates
    await updateNowPlayingKey(serialNumber, key, true); // Pass flag to indicate it should start timers
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

    const { updateInterval, interpolationIntervalMs } = currentKeyData.data;

    // --- Clear existing timers ---
    // Clear API Fetch Timer (stored in keyManager.keyIntervals)
    if (keyManager.keyIntervals[keyId]) {
        logger.debug(`Clearing existing API fetch timer for ${keyId}`);
        clearInterval(keyManager.keyIntervals[keyId]);
        delete keyManager.keyIntervals[keyId];
    }
    // Clear Interpolation Timer (stored in key.data)
    if (currentKeyData.data.interpolationIntervalId) {
         logger.debug(`Clearing existing interpolation timer for ${keyId}`);
        clearInterval(currentKeyData.data.interpolationIntervalId);
        currentKeyData.data.interpolationIntervalId = null;
    }

    // --- Start API Fetch Timer ---
    logger.info(`Starting API fetch updates for key ${keyId} every ${updateInterval}ms.`);
    const apiFetchIntervalId = setInterval(async () => {
        const keyExists = keyManager.activeKeys[keyId] && keyManager.keyData[keyUid];
        if (!keyExists) {
            logger.info(`Key ${keyId} no longer active/valid, clearing API fetch interval.`);
            clearInterval(apiFetchIntervalId); // Clear self
            delete keyManager.keyIntervals[keyId];
            // Also clear the interpolation timer if it exists
            const latestKeyData = keyManager.keyData[keyUid]; // Re-fetch in case it changed
            if (latestKeyData?.data?.interpolationIntervalId) {
                 logger.info(`Clearing interpolation interval for inactive key ${keyId}.`);
                clearInterval(latestKeyData.data.interpolationIntervalId);
                latestKeyData.data.interpolationIntervalId = null; // Prevent memory leaks
            }
            return;
        }
        // Fetch new data (don't start timers again)
        await updateNowPlayingKey(serialNumber, keyManager.keyData[keyUid], false);
    }, updateInterval);
    keyManager.keyIntervals[keyId] = apiFetchIntervalId; // Store API fetch timer ID

    // --- Start Interpolation Timer ---
     logger.info(`Starting UI interpolation updates for key ${keyId} every ${interpolationIntervalMs}ms.`);
     const interpolationIntervalId = setInterval(async () => {
         const keyExists = keyManager.activeKeys[keyId] && keyManager.keyData[keyUid];
         if (!keyExists) {
             logger.info(`Key ${keyId} no longer active/valid, clearing interpolation interval.`);
             clearInterval(interpolationIntervalId); // Clear self
             // Ensure the reference in key data is also cleared if cleanup didn't catch it
             const latestKeyData = keyManager.keyData[keyUid];
             if (latestKeyData?.data?.interpolationIntervalId === interpolationIntervalId) {
                latestKeyData.data.interpolationIntervalId = null;
             }
             return;
         }
         // Render using interpolated data
         await renderInterpolatedNowPlaying(serialNumber, keyManager.keyData[keyUid]);
     }, interpolationIntervalMs);
     // Store interpolation timer ID in key data
     currentKeyData.data.interpolationIntervalId = interpolationIntervalId;

}

/** Update Now Playing Key Display and Fetch State */
// Add 'shouldStartTimers' flag, defaults to false
async function updateNowPlayingKey(serialNumber, key, shouldStartTimers = false) {
    const keyUid = key.uid;
    const keyId = `${serialNumber}-${keyUid}`;
    logger.debug(`Updating now playing key state: ${keyId}`);

    // IMPORTANT: Check if the incoming key has a progressBarColor and log it
    if (key.data?.progressBarColor) {
        logger.info(`[updateNowPlayingKey] Incoming key has progressBarColor: ${key.data.progressBarColor}`);
    }

    // Retrieve the latest key data from the manager
    let currentKeyData = keyManager.keyData[keyUid];
    if (!currentKeyData) {
        logger.error(`Key data for ${keyUid} not found during update start.`);
        keyManager.cleanupKey(serialNumber, keyUid);
        return;
    }

    // CRITICAL: Always update progressBarColor from incoming key data
    // This ensures that changes made in the UI are immediately reflected
    if (key.data?.progressBarColor && currentKeyData.data) {
        const oldColor = currentKeyData.data.progressBarColor;
        currentKeyData.data.progressBarColor = key.data.progressBarColor;
        
        // Always ensure style also has the correct progressBarColor
        if (!currentKeyData.style) currentKeyData.style = {};
        currentKeyData.style.progressBarColor = key.data.progressBarColor;
        
        logger.info(`[updateNowPlayingKey] Updated progressBarColor: ${oldColor} → ${key.data.progressBarColor}`);
    }

    if (!keyManager.activeKeys[keyId]) {
        logger.warn(`Attempted to update inactive key ${keyId}, cleaning up.`);
        keyManager.cleanupKey(serialNumber, keyUid); // Let cleanup handle timers
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
        logger.error(`Error fetching playback state for ${keyId}: ${error.message}`);
        fetchError = error;
    }

    // --- Process fetched state ---
    const now = Date.now();
    const isActive = !!(playbackState && playbackState.item);
    const isPlaying = isActive && playbackState.is_playing;
    const currentTrack = isActive ? playbackState.item : null;
    const trackId = currentTrack?.id;
    const progressMs = isActive ? playbackState.progress_ms : 0;
    const durationMs = currentTrack?.duration_ms || 0;

    // --- Update Global Playback State ---
    let previousTrackId = currentPlaybackState.trackId;
    currentPlaybackState.isActive = isActive;
    currentPlaybackState.isPlaying = isPlaying;
    currentPlaybackState.trackId = trackId;
    // Update global interpolation helpers
    currentPlaybackState.progressAtLastUpdate = progressMs;
    currentPlaybackState.lastApiUpdateTime = now;
    currentPlaybackState.durationMs = durationMs;

    let trackChanged = false;
    let likedStatusChanged = false;

    if (trackId !== previousTrackId) {
        trackChanged = true;
        logger.info(`Track changed: ${trackId} (was ${previousTrackId})`);
        currentPlaybackState.isLiked = null; // Reset like status

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
            // Playback stopped or became inactive
            logger.info("Playback stopped or became inactive.");
            currentPlaybackState.isLiked = null;
            currentPlaybackState.lastCheckedTrackId = null;
        }
    }
    // --- End Update Global Playback State ---

    // Re-fetch key data in case it was modified during async operations
    currentKeyData = keyManager.keyData[keyUid];
    if (!currentKeyData || !currentKeyData.data) {
        logger.error(`Key data for ${keyUid} disappeared during update processing.`);
        keyManager.cleanupKey(serialNumber, keyUid); // Clean up if data is missing
        return;
    }

    // --- Update Key-Specific Data for Interpolation ---
    currentKeyData.data.currentTrackDetails = currentTrack; // Store the whole item or necessary parts
    currentKeyData.data.lastApiUpdateTime = now;
    currentKeyData.data.progressAtLastUpdate = progressMs;
    currentKeyData.data.durationMs = durationMs;
    
    // ENSURE progressBarColor is always preserved through the update cycle
    // This makes absolutely sure it doesn't get lost even after playback state updates
    if (key.data?.progressBarColor) {
        logger.debug(`[updateNowPlayingKey] Re-ensuring progressBarColor: ${key.data.progressBarColor}`);
        currentKeyData.data.progressBarColor = key.data.progressBarColor;
        if (!currentKeyData.style) currentKeyData.style = {};
        currentKeyData.style.progressBarColor = key.data.progressBarColor;
    }
    // --- End Update Key-Specific Data ---

    // --- Start or Restart Timers if requested (e.g., on initialization) ---
    if (shouldStartTimers) {
        logger.debug(`Starting/restarting timers for key ${keyId}...`);
        startOrRestartNowPlayingUpdates(serialNumber, currentKeyData);
        logger.debug(`[updateNowPlayingKey] Key ${keyId} - Calling immediate renderInterpolatedNowPlaying...`);
        await renderInterpolatedNowPlaying(serialNumber, currentKeyData);
        logger.debug(`[updateNowPlayingKey] Key ${keyId} - Immediate render call complete.`);
    }

    // --- Trigger Update for Like Keys if needed --- //
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
    // --- End Trigger Update for Like Keys --- //

    logger.debug(`[updateNowPlayingKey] Key ${keyId} - Update cycle finished.`);
}

module.exports = {
    renderSimpleCanvas,
    drawPlayIcon,
    drawPauseIcon,
    drawNextIcon,
    drawPrevIcon,
    drawLikeIcon,
    createModernNowPlayingCanvas,
    createSpotifyButtonDataUrl,
    initializeNowPlayingKey, 
    startOrRestartNowPlayingUpdates,
    renderInterpolatedNowPlaying,
    updateNowPlayingKey
};