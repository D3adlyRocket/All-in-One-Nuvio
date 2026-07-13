# Nuvio Provider Development Guide

This is a comprehensive guide to developing streaming providers for the Nuvio app. It covers everything from setting up your environment to publishing your first provider.

## Table of Contents

1. [Introduction](#introduction)
2. [Prerequisites](#prerequisites)
3. [Architecture Overview](#architecture-overview)
4. [Setting Up Your Workspace](#setting-up-your-workspace)
5. [Tutorial: Building a Provider from Scratch](#tutorial-building-a-provider-from-scratch)
6. [The Provider API](#the-provider-api)
   - [Input Parameters](#input-parameters)
   - [Output Format](#output-format)
   - [Subtitle Support](#subtitle-support)
7. [Advanced Topics](#advanced-topics)
   - [Async/Await & Transpilation](#asyncawait--transpilation)
   - [HTML Parsing with Cheerio](#html-parsing-with-cheerio)
   - [Handling Encryption](#handling-encryption)
   - [Provider Settings](#provider-settings)
8. [Testing & Debugging](#testing--debugging)
9. [Publishing](#publishing)

---

## Introduction

A **Provider** in Nuvio is a JavaScript module that finds video streams for movies and TV shows. When a user selects a title (e.g., "Inception"), the app calls your provider with the movie's TMDB ID. Your provider's job is to search the web (programmatically) and return a list of playable video URLs.

Providers run locally on the user's device inside the Nuvio app's JavaScript engine (Hermes).

---

## Prerequisites

To develop providers, you need:
- **Node.js**: Version 16 or higher.
- **Code Editor**: VS Code is recommended.
- **Knowledge**: Basic JavaScript (ES6+), Promises, async/await, and HTTP requests.

---

## Architecture Overview

Nuvio providers operate in a specific environment:
- **Engine**: Hermes (React Native).
- **Environment**: "Neutral" (neither distinct Browser nor Node.js, but supports common APIs like `fetch`).
- **Restrictions**: 
  - Cannot use native Node.js modules like `fs` or `path` inside the provider code.
  - `async/await` has limited support in dynamically loaded code, so we use a build step to transpile it.

### File Structure
- **`src/`**: Where you write your code. One folder per provider (e.g., `src/vidlink/`).
- **`providers/`**: Where the bundled code lives (e.g., `providers/vidlink.js`). **Do not edit these files manually.**
- **`build.js`**: The script that converts your `src` code into the final `providers` file.

---

## Setting Up Your Workspace

1. **Clone the Repository**
   ```bash
   git clone -b dev https://github.com/D3adlyRocket/All-in-One-Nuvio.git
   cd All-in-One-Nuvio
   ```

2. **Install Tools**
   Install the build dependencies (esbuild, etc.):
   ```bash
   npm install
   ```

---

## Tutorial: Building a Provider from Scratch

Let's build a fictional provider called **"StreamFlix"**.

### Step 1: Create the Source Directory

Create a folder for your source code:
```bash
mkdir -p src/streamflix
```

### Step 2: Create Utility Modules

It is best practice to split your code. Let's create `src/streamflix/http.js` to handle networking.

**`src/streamflix/http.js`**
```javascript
export const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://streamflix.example/"
};

export async function fetchText(url) {
    console.log(`[StreamFlix] Fetching: ${url}`);
    const response = await fetch(url, { headers: HEADERS });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
}
```

### Step 3: Implement Extraction Logic

Now create `src/streamflix/extractor.js` to find the video.

**`src/streamflix/extractor.js`**
```javascript
import { fetchText, HEADERS } from './http.js';
import cheerio from 'cheerio-without-node-native';

export async function getMovieStream(tmdbId) {
    // 1. Search for the movie
    const searchUrl = `https://streamflix.example/search?id=${tmdbId}`;
    const html = await fetchText(searchUrl);
    
    // 2. Parse HTML
    const $ = cheerio.load(html);
    const videoUrl = $('video#player source').attr('src');
    
    if (!videoUrl) return [];

    // 3. Return a stream object
    return [{
        name: "StreamFlix",
        title: "1080p - Server 1",
        url: videoUrl,
        quality: "1080p",
        headers: HEADERS
    }];
}
```

### Step 4: Create the Entry Point

Every provider needs an `index.js`. This is what the app calls.

**`src/streamflix/index.js`**
```javascript
import { getMovieStream } from './extractor.js';

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        if (mediaType === 'movie') {
            return await getMovieStream(tmdbId);
        } else {
            // TV logic would go here
            return [];
        }
    } catch (error) {
        console.error(`[StreamFlix] Error: ${error.message}`);
        return [];
    }
}

module.exports = { getStreams };
```

### Step 5: Register in Manifest

Open `manifest.json` and add your provider:

```json
{
  "id": "streamflix",
  "name": "StreamFlix",
  "filename": "providers/streamflix.js",
  "supportedTypes": ["movie"],
  "enabled": true
}
```

### Step 6: Build

Run the build script to bundle your files into `providers/streamflix.js`:

```bash
node build.js streamflix
```

You should see: `✅ streamflix.js (XX KB)`

---

## The Provider API

Your `index.js` must export a function named `getStreams`.

### Input Parameters

```javascript
async function getStreams(tmdbId, mediaType, season, episode)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `tmdbId` | String | The ID from The Movie Database (e.g., "872585"). |
| `mediaType`| String | Either `"movie"` or `"tv"`. |
| `season` | Number | Season number (for TV shows, e.g., 1). `null` for movies. |
| `episode` | Number | Episode number (for TV shows, e.g., 1). `null` for movies. |

### Output Format

Return an **Array** of objects. Each object represents one playable link.

```javascript
[
  {
    "name": "StreamFlix",          // Provider Name
    "title": "My Stream 1080p",    // Display Title
    "url": "https://...",          // The actual video URL (.mp4, .m3u8)
    "quality": "1080p",            // Label: "4K", "1080p", "720p", "CAM"
    "size": 104857600,             // (Optional) Size in bytes
    "headers": {                   // (Optional) Headers valid for playback
      "User-Agent": "...",
      "Referer": "..."
    },
    "subtitles": [                 // (Optional) Array of subtitle objects
      {
        "url": "https://...",      // Subtitle URL (supports all formats: .vtt, .srt, .ass, etc.)
        "language": "en",          // Language code (ISO 639-1)
        "name": "English",         // Display name
        "headers": {               // (Optional) Headers to fetch the subtitle
          "User-Agent": "..."
        }
      }
    ]
  }
]
```

### Subtitle Support

Nuvio supports external subtitles in all formats (including VTT, SRT, ASS, SSA, etc.). You can include an array of subtitle objects within each stream object.

**Subtitle Object Properties:**
- `url`: The absolute URL to the subtitle file.
- `language`: The language of the subtitle (e.g., "en", "es", "hi").
- `name`: The label shown to the user in the subtitle selector.
- `headers`: (Optional) If the subtitle host requires specific headers (like a `Referer` or `User-Agent`), include them here.

---

## Advanced Topics

### Async/Await & Transpilation

**The Problem:** The Nuvio app loads plugins dynamically. The Hermes engine does not support `async` functions inside dynamically evaluated code.

**The Solution:** The `build.js` script automatically solves this!
- It converts your `async/await` code into Generator functions.
- This allows you to write modern async code in `src/` without worrying about compatibility.
- **Result:** Always use `src/` folders and the `build.js` script. Do not write complex single files manually in `providers/` unless you know what you are doing.

### HTML Parsing with Cheerio

We use `cheerio-without-node-native`. It implements a subset of jQuery core (like find, attr, text).

```javascript
import cheerio from 'cheerio-without-node-native';

const $ = cheerio.load(htmlContent);
const link = $('a.download-btn').attr('href');
const title = $('.movie-title').text().trim();
```

### Handling Encryption

Many streaming sites obfuscate their links. We include `crypto-js` to help.

```javascript
import CryptoJS from 'crypto-js';

// Decrypt AES
const bytes = CryptoJS.AES.decrypt(encryptedText, secretKey);
const originalText = bytes.toString(CryptoJS.enc.Utf8);
```

### Provider Settings

Nuvio allows you to create a custom settings screen for your provider. This is useful for API keys, server selection, or quality preferences.

#### Step 1: Export `onSettings`
In your `index.js`, export an `onSettings` function that returns a blueprint of your UI.

```javascript
// src/streamflix/index.js
async function onSettings() {
    return [
        { type: "header", label: "Account Configuration" },
        { 
            type: "text", 
            key: "apiKey", 
            label: "API Key", 
            placeholder: "Enter your key",
            description: "Required for premium streams." 
        },
        { type: "header", label: "Preferences" },
        { 
            type: "select", 
            key: "server", 
            label: "Primary Server",
            options: [
                { label: "Auto", value: "auto" },
                { label: "US East", value: "us" },
                { label: "Europe", value: "eu" }
            ],
            defaultValue: "auto"
        },
        { 
            type: "toggle", 
            key: "useHq", 
            label: "Force High Quality", 
            defaultValue: true 
        }
    ];
}

module.exports = { getStreams, onSettings };
```

#### Step 2: Enable in Manifest
Set `"hasSettings": true` in your `manifest.json`.

```json
{
  "id": "streamflix",
  "hasSettings": true,
  ...
}
```

#### Step 3: Use Settings in Scraper
The user's choices are automatically injected into `globalThis.SCRAPER_SETTINGS`.

```javascript
async function getStreams(tmdbId, mediaType) {
    const settings = globalThis.SCRAPER_SETTINGS || {};
    const apiKey = settings.apiKey;
    const preferredServer = settings.server || "auto";
    
    if (settings.useHq) {
        // Logic to find 4K/HDR content...
    }
}
```

**Supported Component Types:**
- `header`: Label only. Used for grouping.
- `info`: Label only. Used for descriptions or notes.
- `text`: String input. Supports `isPassword: true` for API keys.
- `toggle`: Boolean (true/false) switch.
- `select`: Dropdown list. Requires an `options` array of `{label, value}` objects.

---

## Testing & Debugging

### Creating a Test Script

Never rely on the app alone for debugging. Create a local test script:

**`test-streamflix.js`**
```javascript
const { getStreams } = require('./providers/streamflix.js');

async function test() {
    console.log("Testing StreamFlix...");
    
    // Movie Test (Oppenheimer)
    const streams = await getStreams('872585', 'movie');
    console.log(`Found ${streams.length} streams`);
    streams.forEach(s => console.log(`- ${s.title} (${s.quality})`));
}

test();
```

Run it:
```bash
node test-streamflix.js
```

### Debugging Tips
- Use `console.log()` liberally. These logs appear in the terminal when running the test script, and in the Metro bundler output when running in the app.
- Check headers. 90% of failures are due to missing `User-Agent` or `Referer` headers.

---

## Publishing

1. **Verify**: Ensure your test script passes for both Movies and TV shows.
2. **Build**: Run `node build.js streamflix`.
3. **Commit**:
    ```bash
    git add src/streamflix providers/streamflix.js manifest.json
    git commit -m "Add StreamFlix provider"
    ```
4. **Push**: Push your changes to GitHub.
5. **Update App**: Update the repository URL in the Nuvio app settings to point to your branch/repo.

---

Have fun building!
