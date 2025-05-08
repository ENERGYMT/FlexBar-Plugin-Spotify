const { plugin, logger: flexbarLogger } = require("@eniac/flexdesigner");

// Define log levels (higher number = higher priority)
const LOG_LEVELS = {
  OFF: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4,
};

// --- Configuration --- Updated by _updateLogLevelFromConfig ---
// This variable will store the *name* of the current log level (e.g., "INFO", "DEBUG").
// It defaults to 'INFO' and is updated by reading the plugin configuration.
let currentConfiguredLogLevelName = 'INFO'; 
// --- End Configuration ---

const PLUGIN_PREFIX = "[SpotifyPlugin]";

// Function to get the numeric value of the current log level for comparison
function getCurrentNumericLogLevel() {
  const levelName = currentConfiguredLogLevelName.toUpperCase();
  return LOG_LEVELS.hasOwnProperty(levelName) ? LOG_LEVELS[levelName] : LOG_LEVELS.INFO;
}

// Internal function to read config and update the logger's level.
// This should be called on init and when config might have changed.
async function _updateLogLevelFromConfig() {
  try {
    const config = await plugin.getConfig();
    const oldLogLevelName = currentConfiguredLogLevelName;

    if (config && typeof config.logLevel === 'string' && LOG_LEVELS.hasOwnProperty(config.logLevel.toUpperCase())) {
      loggerWrapper.info(PLUGIN_PREFIX, `Updating log level from config. New level: ${config.logLevel}`);
      const newLevelName = config.logLevel.toUpperCase();
      currentConfiguredLogLevelName = newLevelName;
    } else {
      // If no valid logLevel in config, or config is missing, revert to/ensure default 'INFO'
      currentConfiguredLogLevelName = 'INFO';
      if (config && typeof config.logLevel !== 'undefined') {
        // Only log warning if there was an invalid logLevel value in config
        if (getCurrentNumericLogLevel() >= LOG_LEVELS.WARN) {
            flexbarLogger.warn(PLUGIN_PREFIX, `Invalid 'logLevel' ("${config.logLevel}") in config. Using default: ${currentConfiguredLogLevelName}.`);
        }
      }
    }

    if (oldLogLevelName !== currentConfiguredLogLevelName) {
      // Log the change if the new level allows for INFO or higher
      if (getCurrentNumericLogLevel() >= LOG_LEVELS.INFO) {
        flexbarLogger.info(PLUGIN_PREFIX, `Log level updated from config. New level: ${currentConfiguredLogLevelName}`);
      } else if (LOG_LEVELS[oldLogLevelName.toUpperCase()] >= LOG_LEVELS.INFO) {
        // If new level is too low to log, but old one was high enough, log the transition using old setting just once.
        flexbarLogger.info(PLUGIN_PREFIX, `Log level changed to ${currentConfiguredLogLevelName}. Further INFO logs may be suppressed based on new level.`);
      }
    }
  } catch (error) {
    // Use console.error as this is a logger setup/config issue, FlexBar logger might not be working or set to OFF
    console.error(PLUGIN_PREFIX, 'Failed to load logLevel from config:', error, `Using current/default: ${currentConfiguredLogLevelName}.`);
  }
}


// Wrapper functions
const loggerWrapper = {
  debug: (...args) => {
    if (getCurrentNumericLogLevel() >= LOG_LEVELS.DEBUG) {
      flexbarLogger.debug(PLUGIN_PREFIX, ...args);
    }
  },
  info: (...args) => {
    if (getCurrentNumericLogLevel() >= LOG_LEVELS.INFO) {
      flexbarLogger.info(PLUGIN_PREFIX, ...args);
    }
  },
  warn: (...args) => {
    if (getCurrentNumericLogLevel() >= LOG_LEVELS.WARN) {
      flexbarLogger.warn(PLUGIN_PREFIX, ...args);
    }
  },
  error: (...args) => {
    // Errors are logged if current level is ERROR or higher (i.e., not OFF)
    if (getCurrentNumericLogLevel() >= LOG_LEVELS.ERROR) {
      flexbarLogger.error(PLUGIN_PREFIX, ...args);
    }
  },
  
  // Public function to allow explicit setting of log level (e.g., for testing or specific commands)
  // This bypasses config for the current session until next config update/reload.
  setLogLevel: (levelName) => {
    if (typeof levelName === 'string' && LOG_LEVELS.hasOwnProperty(levelName.toUpperCase())) {
      const newLevelName = levelName.toUpperCase();
      if (newLevelName !== currentConfiguredLogLevelName) {
        const oldLevelNumeric = getCurrentNumericLogLevel();
        currentConfiguredLogLevelName = newLevelName;
        if (getCurrentNumericLogLevel() >= LOG_LEVELS.INFO) {
          flexbarLogger.info(PLUGIN_PREFIX, `Log level explicitly set to: ${currentConfiguredLogLevelName}`);
        } else if (oldLevelNumeric >=LOG_LEVELS.INFO) {
            flexbarLogger.info(PLUGIN_PREFIX, `Log level explicitly set to: ${currentConfiguredLogLevelName}. INFO logs may be suppressed.`);
        }
      }
    } else {
       if (getCurrentNumericLogLevel() >= LOG_LEVELS.WARN) { // Log warning if possible
        flexbarLogger.warn(PLUGIN_PREFIX, `Invalid log level requested for explicit set: ${levelName}.`);
      }
    }
  },

  // Expose this function for the main plugin to call during init and on config change notifications
  updateLogLevelFromConfig: _updateLogLevelFromConfig,

  LOG_LEVELS // Expose LOG_LEVELS object for reference if needed
};

module.exports = loggerWrapper; 