<template>
  <v-container class="pa-4" v-if="isInitialized">
    <v-row>
      <v-col cols="12">
        <v-card elevation="2" class="rounded-lg">
          <v-card-item>
            <v-card-title class="text-h6 font-weight-regular">Key Settings</v-card-title>
            <v-card-subtitle>Configure update frequency and font sizes</v-card-subtitle>
          </v-card-item>

          <v-card-text class="pt-0">
            <v-row dense>
              <v-col cols="12" sm="4">
                <v-text-field
                  v-model="modelValue.data.updateInterval"
                  label="API Update Interval (ms)"
                  type="number"
                  min="1000"
                  hint="How often to fetch data (min 1000)"
                  persistent-hint
                  density="compact"
                  variant="outlined"
                  @update:model-value="updateInterval"
                ></v-text-field>
              </v-col>
              <v-col cols="12" sm="4">
                <v-text-field
                  v-model="modelValue.data.interpolationIntervalMs"
                  label="UI Update Interval (ms)"
                  type="number"
                  min="100"
                  :disabled="!modelValue.data.enableInterpolation"
                  hint="Smoothness (min 100, if enabled)"
                  persistent-hint
                  density="compact"
                  variant="outlined"
                  @update:model-value="updateInterpolationInterval"
                ></v-text-field>
              </v-col>
              <v-col cols="12" sm="4">
                <v-text-field
                  v-model="modelValue.data.titleFontSize"
                  label="Title Font (px)"
                  type="number"
                  min="8"
                  max="36"
                  hint="8-36px"
                  persistent-hint
                  density="compact"
                  variant="outlined"
                  @update:model-value="updateTitleFontSize"
                ></v-text-field>
              </v-col>

              <v-col cols="12" sm="4">
                <v-text-field
                  v-model="modelValue.data.artistFontSize"
                  label="Artist Font (px)"
                  type="number"
                  min="8"
                  max="32"
                  hint="8-32px"
                  persistent-hint
                  density="compact"
                  variant="outlined"
                  @update:model-value="updateArtistFontSize"
                ></v-text-field>
              </v-col>
              
              <v-col cols="12" sm="4">
                <v-text-field
                  v-model="modelValue.data.timeFontSize"
                  label="Time Info Font (px)"
                  type="number"
                  min="8"
                  max="24"
                  hint="8-24px"
                  persistent-hint
                  density="compact"
                  variant="outlined"
                  @update:model-value="updateTimeFontSize"
                ></v-text-field>
              </v-col>
            </v-row>
          </v-card-text>

          <v-divider></v-divider>

          <v-list lines="one" density="compact">
            <v-list-subheader>DISPLAY OPTIONS</v-list-subheader>
            <v-list-item title="Enable Smooth Progress">
              <template v-slot:append>
                <v-switch v-model="modelValue.data.enableInterpolation" hide-details inset color="primary"></v-switch>
              </template>
            </v-list-item>
            <v-list-item title="Show Title">
              <template v-slot:append>
                <v-switch v-model="modelValue.data.showTitle" hide-details inset color="primary"></v-switch>
              </template>
            </v-list-item>
            <v-list-item title="Show Artist Name">
              <template v-slot:append>
                <v-switch v-model="modelValue.data.showArtist" hide-details inset color="primary"></v-switch>
              </template>
            </v-list-item>
            <v-list-item title="Show Progress Bar">
              <template v-slot:append>
                <v-switch v-model="modelValue.data.showProgress" hide-details inset color="primary"></v-switch>
              </template>
            </v-list-item>
            <v-list-item title="Show Time Information">
              <template v-slot:append>
                <v-switch v-model="modelValue.data.showTimeInfo" hide-details inset color="primary"></v-switch>
              </template>
            </v-list-item>
            <v-list-item title="Show Play/Pause Button">
              <template v-slot:append>
                <v-switch v-model="modelValue.data.showPlayPause" hide-details inset color="primary"></v-switch>
              </template>
            </v-list-item>
          </v-list>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
const DEFAULT_MODEL_VALUE = {
  data: {
    updateInterval: 4000, // Default API interval
    interpolationIntervalMs: 1000, // Default UI interval
    enableInterpolation: true, // Default to enabled
    showArtist: true,
    showProgress: true,
    showTimeInfo: true, // Default to showing time information
    currentTrack: null,
    showTitle: true,
    showPlayPause: true,
    titleFontSize: 18, // Default title font size
    artistFontSize: 14, // Default artist font size
    timeFontSize: 14 // Default time font size
  },
  title: 'No track playing'
};

export default {
  name: 'NowPlaying',
  props: {
    modelValue: {
      type: Object,
      required: true
    },
  },
  emits: ['update:modelValue'],
  data() {
    return {
      isInitialized: false,
    };
  },
  methods: {
    initializeModelValue() {
      if (!this.modelValue.data) this.modelValue.data = {};
      if (!this.modelValue.style) this.modelValue.style = {};
      
      this.modelValue.data = { ...DEFAULT_MODEL_VALUE.data, ...this.modelValue.data };
      this.modelValue.style = { ...DEFAULT_MODEL_VALUE.style, ...this.modelValue.style };
      this.modelValue.title = this.modelValue.title || DEFAULT_MODEL_VALUE.title;
      
      this.isInitialized = true;
    },
    updateInterval(value) {
      const parsedVal = parseInt(value);
      const minInterval = 1000;
      if (isNaN(parsedVal) || parsedVal < minInterval) {
        this.modelValue.data.updateInterval = minInterval;
      }
    },
    updateInterpolationInterval(value) {
      const parsedVal = parseInt(value);
      const minInterval = 100; // Allow faster UI updates
      if (isNaN(parsedVal) || parsedVal < minInterval) {
        this.modelValue.data.interpolationIntervalMs = minInterval;
      }
    },
    updateTitleFontSize(value) {
      const parsedVal = parseInt(value);
      const minSize = 8;
      const maxSize = 36;
      if (isNaN(parsedVal) || parsedVal < minSize) {
        this.modelValue.data.titleFontSize = minSize;
      } else if (parsedVal > maxSize) {
        this.modelValue.data.titleFontSize = maxSize;
      }
    },
    updateArtistFontSize(value) {
      const parsedVal = parseInt(value);
      const minSize = 8;
      const maxSize = 32;
      if (isNaN(parsedVal) || parsedVal < minSize) {
        this.modelValue.data.artistFontSize = minSize;
      } else if (parsedVal > maxSize) {
        this.modelValue.data.artistFontSize = maxSize;
      }
    },
    updateTimeFontSize(value) {
      const parsedVal = parseInt(value);
      const minSize = 8;
      const maxSize = 24;
      if (isNaN(parsedVal) || parsedVal < minSize) {
        this.modelValue.data.timeFontSize = minSize;
      } else if (parsedVal > maxSize) {
        this.modelValue.data.timeFontSize = maxSize;
      }
    },
  },
  created() {
    this.initializeModelValue();
  },
  mounted() {
  },
  beforeUnmount() {
  }
};
</script>

<style scoped>
/* Add any specific styles if needed */
:deep(.v-list-item__append > .v-input) {
  margin-left: auto;
}

:deep(.v-list-subheader) {
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0.08em;
}
</style>
