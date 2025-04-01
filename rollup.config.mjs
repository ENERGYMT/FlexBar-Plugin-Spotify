import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import path from "node:path";
import url from "node:url";
import json from '@rollup/plugin-json';
import { glob } from 'glob'
import natives from 'rollup-plugin-natives';
import nodeExternals from 'rollup-plugin-node-externals';
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
    natives({
      copyTo: `${flexPlugin}/backend/native-modules`,
      destDir: './native-modules'
    }),
    nodeExternals({
      deps: false,
      devDeps: false,
    }),
    {
      name: 'copy-modules',
      buildEnd() {
        // Main modules to copy
        const moduleNames = ['skia-canvas'];
        
        // Additional dependencies needed by skia-canvas
        const additionalDeps = [
          'simple-get', 
          'decompress-response', 
          'once', 
          'wrappy', 
          'mimic-response',
          'simple-concat',
          'glob',
          'minimatch',
          'path-scurry',
          'lru-cache',
          'brace-expansion',
          'balanced-match',
          'minipass',
          'yallist',
          'string-split-by',
          'parenthesis'
        ];
        
        // Copy all modules
        [...moduleNames, ...additionalDeps].forEach(moduleName => {
          const srcDir = path.resolve(__dirname, 'node_modules', moduleName);
          const destDir = path.resolve(__dirname, flexPlugin, 'backend', 'node_modules', moduleName);
          
          // Create destination directory
          if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
          }
          
          // Copy the entire module directory
          if (fs.existsSync(srcDir)) {
            copyFolderRecursiveSync(srcDir, path.resolve(destDir, '..'));
            console.log(`Copied ${moduleName} module to ${destDir}`);
          } else {
            console.warn(`Warning: Could not find module ${moduleName} at ${srcDir}`);
          }
        });
      }
    },
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
  external: [
    'skia-canvas',
    'canvas',
    /\.node$/
  ]
};

// Helper function to copy directories recursively
function copyFolderRecursiveSync(source, destination) {
  // Check if source exists
  if (!fs.existsSync(source)) {
    console.error(`Source directory not found: ${source}`);
    return;
  }

  // Get the name of the directory
  const folderName = path.basename(source);
  const destFolderPath = path.join(destination, folderName);

  // Create destination directory if it doesn't exist
  if (!fs.existsSync(destFolderPath)) {
    fs.mkdirSync(destFolderPath, { recursive: true });
  }

  // Read all files in the source directory
  const items = fs.readdirSync(source);
  
  items.forEach(item => {
    const sourcePath = path.join(source, item);
    const destPath = path.join(destFolderPath, item);
    
    // Check if it's a file or directory
    const stat = fs.statSync(sourcePath);
    
    if (stat.isFile()) {
      // Copy the file
      fs.copyFileSync(sourcePath, destPath);
    } 
    else if (stat.isDirectory()) {
      // Recursively copy the directory
      copyFolderRecursiveSync(sourcePath, destFolderPath);
    }
  });
}

export default config;
