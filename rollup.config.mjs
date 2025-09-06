import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import copy from "rollup-plugin-copy";
import path from "node:path";
import url from "node:url";
import json from '@rollup/plugin-json';
import { glob } from 'glob'
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const isWatching = !!process.env.ROLLUP_WATCH;
const flexPlugin = "com.energy.spotify_integration.plugin";
const __dirname = path.dirname(fileURLToPath(import.meta.url));


/**
 * @type {import('rollup').RollupOptions}
 */
const config = {
  input: "src/plugin.js",
  output: {
    file: `${flexPlugin}/backend/plugin.cjs`,
    format: "cjs",
    sourcemap: isWatching,
    sourcemapPathTransform: (relativeSourcePath, sourcemapPath) => {
      return url.pathToFileURL(path.resolve(path.dirname(sourcemapPath), relativeSourcePath)).href;
    },
  },
  plugins: [
    json(),
    {
      name: "watch-externals",
      buildStart: function () {
        this.addWatchFile(`${flexPlugin}/manifest.json`);
        const vueFiles = glob.sync(`${flexPlugin}/ui/*.vue`);
        vueFiles.forEach((file) => {
          this.addWatchFile(file);
        });
      },
    },
    copy({
      targets: (() => {
        const targets = [];

        // Define all possible Canvas platform modules
        const canvasPlatforms = [
          'canvas-win32-x64-msvc',
          'canvas-darwin-universal',
          'canvas-darwin-x64',
          'canvas-darwin-arm64',
          'canvas-linux-x64-gnu',
          'canvas-linux-arm64-gnu',
          'canvas-linux-x64-musl',
          'canvas-linux-arm64-musl'
        ];

        // Auto-detect and copy all available platform modules
        for (const platform of canvasPlatforms) {
          const modulePath = `node_modules/@napi-rs/${platform}`;

          if (fs.existsSync(modulePath)) {
            // Find .node files
            try {
              const files = fs.readdirSync(modulePath);
              const nodeFile = files.find(f => f.endsWith('.node'));

              if (nodeFile) {
                // Copy .node file to backend root directory (relative path require)
                targets.push({
                  src: `${modulePath}/${nodeFile}`,
                  dest: `${flexPlugin}/backend/`
                });

                // Copy icudtl.dat if exists
                if (files.includes('icudtl.dat')) {
                  targets.push({
                    src: `${modulePath}/icudtl.dat`,
                    dest: `${flexPlugin}/backend/`
                  });
                }

                // Copy complete module (module path require)
                targets.push({
                  src: `${modulePath}/*`,
                  dest: `${flexPlugin}/backend/node_modules/@napi-rs/${platform}/`
                });
              }
            } catch (e) {
              // Ignore read errors, continue with next platform
              console.warn(`Warning: Could not process ${platform}: ${e.message}`);
            }
          }
        }

        console.log(`Canvas: Found ${targets.length / 3} platform(s) to copy`);
        return targets;
      })()
    }),
    nodeResolve({
      browser: false,
      exportConditions: ["node"],
      preferBuiltins: true
    }),
    commonjs(),
    !isWatching && terser(),
    {
      name: "emit-module-package-file",
      generateBundle() {
        this.emitFile({ fileName: "package.json", source: `{ "type": "module" }`, type: "asset" });
      }
    }
  ],
  external: id => {
    // All .node files must be externalized as Rollup cannot handle binary files
    if (id.endsWith('.node')) {
      return true;
    }

    // Externalize all napi-rs canvas platform-specific modules as they mainly contain .node files
    if (id.startsWith('@napi-rs/canvas-')) {
      return true;
    }

    // Externalize axios and express for Node.js runtime
    if (id === 'axios' || id === 'express') {
      return true;
    }

    // Other modules are not externalized by default
    return false;
  }
};


export default config;
