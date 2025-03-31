const { logger: flexbarLogger } = require("@eniac/flexdesigner");

// Define log levels (higher number = higher priority)
const LOG_LEVELS = {
  OFF: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4,
};

// --- Configuration ---
// Set the initial desired log level here.
// Example: LOG_LEVELS.INFO means INFO, WARN, and ERROR messages will be shown.
// Example: LOG_LEVELS.OFF disables all logging through this wrapper.
let currentLogLevel = LOG_LEVELS.INFO;
// --- End Configuration ---

// Function to change the log level dynamically
function setLogLevel(levelName) {
  const level = LOG_LEVELS[levelName.toUpperCase()];
  if (level !== undefined) {
    currentLogLevel = level;
    console.log(`[LoggerWrapper] Log level set to ${levelName.toUpperCase()} (${level})`);
    // Use console.log here directly in case logger itself is turned off
  } else {
    console.warn(`[LoggerWrapper] Invalid log level requested: ${levelName}. Current level remains ${currentLogLevel}.`);
  }
}

// Wrapper functions
const loggerWrapper = {
  debug: (...args) => {
    if (currentLogLevel >= LOG_LEVELS.DEBUG) {
      flexbarLogger.debug(...args);
    }
  },
  info: (...args) => {
    if (currentLogLevel >= LOG_LEVELS.INFO) {
      flexbarLogger.info(...args);
    }
  },
  warn: (...args) => {
    if (currentLogLevel >= LOG_LEVELS.WARN) {
      flexbarLogger.warn(...args);
    }
  },
  error: (...args) => {
    // Always log errors unless level is OFF
    if (currentLogLevel >= LOG_LEVELS.ERROR) {
      flexbarLogger.error(...args); // Assuming flexbarLogger has an .error method
    }
  },
  // Expose the level setting function and the levels themselves
  setLogLevel,
  LOG_LEVELS
};

module.exports = loggerWrapper; 