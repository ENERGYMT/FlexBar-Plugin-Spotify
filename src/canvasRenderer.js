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
 * @param {object} options Render options.
 * @returns {Promise<Canvas>} A promise that resolves with the Canvas object.
 */
async function createModernNowPlayingCanvas({ // Changed name to reflect async Canvas return
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
    artistFontSize = 14 
}) {
    try {
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        
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
            // Draw border/shadow after restoring
            ctx.save();
            roundedRect(ctx, artX, artY, artSize, artSize, artRadius);
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 6;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 1;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();
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
async function createSpotifyButtonDataUrl(width, trackName, artistName, isPlaying, albumArtUrl, progress, duration, style = {}, showProgress = true, showTitle = true, showPlayPause = true, titleFontSize = 18, artistFontSize = 14) {
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
            artistFontSize 
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
    createModernNowPlayingCanvas,
    createSpotifyButtonDataUrl
}; 