const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { logger } = require("@eniac/flexdesigner");
const { truncateText, getImageColors, roundedRect, createFallbackImage } = require('./utils'); // Import necessary utils

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
    ctx.lineWidth = 3.5 / scale; // Restore for bolder outline
    ctx.strokeStyle = unlikedColor; // Restore for outline
    ctx.fillStyle = likedColor; // Restore for fill
    // Shadow is still removed

    // Conditional fill/stroke logic restored
    if (isLiked === true) {
        ctx.fill(); // Fill if liked
    } else if (isLiked === false) {
        ctx.stroke(); // Outline if not liked
    } else {
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
async function createModernNowPlayingCanvas(config) { // Changed to accept a single config object
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
        titleFontSize = 18,
        artistFontSize = 14,
        options = {} // Destructure the nested options object as well
    } = config; // Destructure from the single argument

    try {
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        
        // --- Extract options for different button types --- 
        const { 
            buttonType = 'nowPlaying', // Default to existing behavior
            isLiked = null,           // Relevant for 'like' button
            likedColor,              // Color for liked state
            unlikedColor             // Color for unliked state
        } = options;

        // === RENDER LIKE BUTTON ===
        if (buttonType === 'like') {
            const cornerRadius = 12;
            
            // Draw background using the path directly - #1c1c1c, no stroke, 1px inset
            ctx.save();
            const inset = 1; // Inset by 1 pixel
            roundedRect(ctx, inset, inset, width - (inset * 2), height - (inset * 2), cornerRadius - inset); // Draw slightly smaller
            ctx.fillStyle = '#1c1c1c'; // Set fill color to #1c1c1c
            ctx.fill(); // Fill the path
            ctx.restore();

            // Draw the like icon in the center (on top of background)
            const iconSize = Math.min(width, height) * 0.6; 
            const iconX = width / 2;
            const iconY = height / 2;
            drawLikeIcon(ctx, iconX, iconY, iconSize, isLiked, likedColor, unlikedColor);
            
            return canvas; // Return early for like button
        }
        
        // === RENDER NOW PLAYING BUTTON (Existing Logic) ===
        let albumArt = null;
        if (albumArtUrl) {
            try {
                albumArt = await loadImage(albumArtUrl);
            } catch (imgError) {
                logger.error(`Failed to load album art from ${albumArtUrl}:`, imgError);
            }
        }

        let gradientColors = ['#282828', '#1E1E1E'];
        if (albumArt) {
            // Assuming getImageColors remains synchronous for now
            gradientColors = getImageColors(ctx, albumArt); 
        }
        
        const gradient = ctx.createLinearGradient(0, 0, width, 0);
        gradient.addColorStop(0, gradientColors[0]);
        gradient.addColorStop(1, gradientColors[1]);
        
        const cornerRadius = 8;
        ctx.save(); // Save before clipping
        roundedRect(ctx, 0, 0, width, height, cornerRadius); 
        ctx.clip();
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'; 
        ctx.fillRect(0, 0, width, height);
        
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

        // Progress Bar
        if (showProgress && duration > 0) {
            const progressBarHeight = 4;
            const progressBarY = height - progressBarHeight;
            const progressBarRadius = progressBarHeight / 2;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
            roundedRect(ctx, 0, progressBarY, width, progressBarHeight, progressBarRadius);
            ctx.fill();
            ctx.fillStyle = accentColor;
            const progressRatio = Math.min(1, Math.max(0, progress / duration)); 
            if (width * progressRatio > 0) {
                 roundedRect(ctx, 0, progressBarY, width * progressRatio, progressBarHeight, progressBarRadius);
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

        if (showTitle && trackName && availableTextWidth > 10) {
            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
            ctx.shadowBlur = 5;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 1;
            ctx.font = `600 ${finalTitleFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
            ctx.fillStyle = '#FFFFFF';
            let displayTrackName = truncateText(ctx, trackName, availableTextWidth); // Uses util
            ctx.fillText(displayTrackName, textX, titleY);
            ctx.restore();
        }
        
        if (artistName && availableTextWidth > 10) {
            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 1;
            ctx.font = `500 ${finalArtistFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            let displayArtistName = truncateText(ctx, artistName, availableTextWidth); // Uses util
            ctx.fillText(displayArtistName, textX, artistY);
            ctx.restore();
        }
        
        ctx.restore(); // Restore from background clip
        
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
async function createSpotifyButtonDataUrl(width, trackName, artistName, isPlaying, albumArtUrl, progress, duration, style = {}, showProgress = true, showTitle = true, showPlayPause = true, titleFontSize = 18, artistFontSize = 14, options = {}) { // ADDED options param
    try {
        const { backgroundColor = '#1E1E1E', accentColor = '#1DB954' } = style; // Use style from args
        
        const canvas = await createModernNowPlayingCanvas({ // Call the canvas generator
            width,
            height: 60, // Standard height
            trackName,
            artistName,
            isPlaying,
            accentColor, // Pass accent color
            albumArtUrl,
            progress,
            duration,
            showProgress,
            showTitle,
            showPlayPause,
            titleFontSize, 
            artistFontSize,
            options // Pass options through
        });

        // Convert the resulting canvas to Data URL
        return canvas.toDataURL('image/png');

    } catch (error) {
        logger.error('Error creating Spotify button Data URL:', error);
        // Use the utility fallback function which returns a Data URL directly
        return createFallbackImage(width, 60); // Uses util
    }
}

module.exports = {
    renderSimpleCanvas,
    drawPlayIcon,
    drawPauseIcon,
    drawNextIcon,
    drawPrevIcon,
    drawLikeIcon,
    createModernNowPlayingCanvas,
    createSpotifyButtonDataUrl
}; 