const { createCanvas } = require('@napi-rs/canvas');
const { logger } = require("@eniac/flexdesigner"); // Assuming logger is needed, maybe not

/**
 * Helper function to adjust color brightness
 */
function adjustColor(color, amount) {
    const clamp = (num) => Math.min(255, Math.max(0, num));
    color = color.replace('#', '');
    // Ensure the hex color string is valid before parsing
    if (!/^[0-9a-fA-F]{6}$/.test(color)) {
        logger.error(`Invalid color format in adjustColor: ${color}`);
        return '#000000'; // Return a default color on error
    }
    try {
        const r = parseInt(color.substring(0, 2), 16);
        const g = parseInt(color.substring(2, 4), 16);
        const b = parseInt(color.substring(4, 6), 16);
        const adjustR = clamp(r + amount).toString(16).padStart(2, '0');
        const adjustG = clamp(g + amount).toString(16).padStart(2, '0');
        const adjustB = clamp(b + amount).toString(16).padStart(2, '0');
        return `#${adjustR}${adjustG}${adjustB}`;
    } catch (error) {
        logger.error(`Error adjusting color ${color}: ${error.message}`);
        return '#000000'; // Default fallback
    }
}

/**
 * Helper function to truncate text with ellipsis
 */
function truncateText(ctx, text, maxWidth) {
    if (!text) return ''; // Handle null or undefined text input
    let displayText = String(text); // Ensure text is a string
    let metrics;

    try {
        metrics = ctx.measureText(displayText);
        
        // Basic check for maxWidth validity
        if (typeof maxWidth !== 'number' || maxWidth <= 0) {
           // logger.warn(`Invalid maxWidth provided to truncateText: ${maxWidth}. Returning original text.`);
            return displayText; 
        }

        while (metrics.width > maxWidth && displayText.length > 3) {
            displayText = displayText.slice(0, -1);
            // Check if ctx.measureText is still valid - might not be if canvas context changed
            if (typeof ctx.measureText !== 'function') {
                //logger.error("Context became invalid during text truncation.");
                return text; // Return original text if context is lost
            }
            metrics = ctx.measureText(displayText + '...');
        }
    } catch (error) {
        //logger.error(`Error measuring text in truncateText: ${error.message}`);
        // In case of error (e.g., invalid context), return original text or a safe default
        return text || ''; 
    }

    return displayText.length < String(text).length ? displayText + '...' : displayText;
}


/**
 * Creates a simple fallback image
 */
function createFallbackImage(width, height = 60) {
    try {
        // Add basic validation for width and height
        if (typeof width !== 'number' || width <= 0 || typeof height !== 'number' || height <= 0) {
            logger.error(`Invalid dimensions for fallback image: ${width}x${height}`);
            return ''; // Return empty string or a default placeholder?
        }
        
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = '#1E1E1E';
        ctx.fillRect(0, 0, width, height);
        
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Error', width/2, height/2); // Changed text to 'Error'
        
        return canvas.toDataURL('image/png');
    } catch (error) {
        logger.error('Failed to create fallback image:', error);
        // Consider returning a minimal, known-good Base64 string or empty
        return ''; 
    }
}

// Add this helper function to extract dominant colors from an image
function getImageColors(ctx, image, numColors = 2) {
    try {
        // Validate image input
        if (!image || typeof image.width !== 'number' || typeof image.height !== 'number' || image.width <= 0 || image.height <= 0) {
            //logger.warn('Invalid image provided to getImageColors');
            return ['#1E1E1E', '#2E2E2E']; // Return default dark colors
        }

        // Create a small version of the image for color analysis
        const sampleSize = Math.min(50, image.width, image.height); // Ensure sample size isn't larger than image
        const tempCanvas = createCanvas(sampleSize, sampleSize);
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(image, 0, 0, sampleSize, sampleSize);
        
        // Get image data safely
        const imageData = tempCtx.getImageData(0, 0, sampleSize, sampleSize).data;
        
        // Simple color extraction (consider more robust methods like k-means if needed)
        // Using corners might be more representative than just first/last pixel
        const topLeft = [imageData[0], imageData[1], imageData[2]];
        const topRightIndex = (sampleSize - 1) * 4;
        const topRight = [imageData[topRightIndex], imageData[topRightIndex + 1], imageData[topRightIndex + 2]];
        
        // Helper to format RGB array to Hex string
        const componentToHex = (c) => {
            const hex = c.toString(16);
            return hex.length == 1 ? "0" + hex : hex;
        };
        const rgbToHex = (rgb) => `#${componentToHex(rgb[0])}${componentToHex(rgb[1])}${componentToHex(rgb[2])}`;

        // Return two distinct colors, falling back to defaults if corners are too similar or invalid
        // Basic check for validity (non-zero alpha assumed by structure)
        if (topLeft.every(c => c >= 0 && c <= 255) && topRight.every(c => c >= 0 && c <= 255)) {
             // Simple difference check - could be improved
             const diff = Math.abs(topLeft[0] - topRight[0]) + Math.abs(topLeft[1] - topRight[1]) + Math.abs(topLeft[2] - topRight[2]);
             const hexTopLeft = rgbToHex(topLeft);
             if (diff > 30) { // Arbitrary threshold for distinct colors
                 return [hexTopLeft, rgbToHex(topRight)];
             } else {
                // If colors are too similar, maybe return one color and a slightly adjusted version
                // Now adjustColor should work as it receives hex
                return [hexTopLeft, adjustColor(hexTopLeft, 20)]; 
             }
        } else {
             //logger.warn("Could not read valid corner pixel data.");
             return ['#1E1E1E', '#2E2E2E'];
        }

    } catch (error) {
        logger.error('Error extracting colors:', error);
        return ['#1E1E1E', '#2E2E2E']; // Fallback to default dark colors
    }
}

/**
 * Escape XML special characters for text
 */
function escapeXml(unsafe) {
    if (typeof unsafe !== 'string') {
       // logger.warn(`Invalid input to escapeXml: expected string, got ${typeof unsafe}`);
        return ''; // Return empty string for non-string input
    }
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Helper function to draw a rounded rectangle
 */
function roundedRect(ctx, x, y, width, height, radius) {
     // Add input validation
    if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number' || typeof radius !== 'number') {
        logger.error('Invalid arguments provided to roundedRect');
        return; // Stop execution if inputs are invalid
    }
    
    // Ensure radius is not larger than half the shortest side
    radius = Math.max(0, Math.min(radius, width / 2, height / 2));

    try {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.arcTo(x + width, y, x + width, y + height, radius);
        ctx.arcTo(x + width, y + height, x, y + height, radius);
        ctx.arcTo(x, y + height, x, y, radius);
        ctx.arcTo(x, y, x + width, y, radius);
        ctx.closePath();
        // Decision: Should this function also fill/stroke? 
        // Keeping it simple: only creates the path. The caller decides to fill or stroke.
        // If fill is always intended, add ctx.fill() here. Let's assume caller handles fill/stroke.
    } catch (error) {
        logger.error(`Error drawing rounded rectangle: ${error.message}`);
        // Optionally draw a regular rectangle as fallback?
        // ctx.rect(x, y, width, height); // Fallback to sharp corners
    }
}


module.exports = {
    adjustColor,
    truncateText,
    createFallbackImage,
    getImageColors,
    escapeXml,
    roundedRect
}; 