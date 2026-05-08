// Movies4u Scraper for Nuvio Local Scrapers
// React Native compatible version

const cheerio = require('cheerio-without-node-native');

// TMDB API Configuration
const TMDB_API_KEY = '1b3113663c9004682ed61086cf967c44';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// Movies4u Configuration
const MAIN_URL = "https://movies4u.promo";
const M4UPLAY_BASE = "https://m4uplay.store";

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Referer": `${MAIN_URL}/`,
};

/**
 * Fetch with timeout to prevent hanging requests
 */
async function fetchWithTimeout(url, options = {}, timeout = 10000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error(`Request timeout after ${timeout}ms`);
        }
        throw error;
    }
}

/**
 * Converts string to Title Case
 * @param {string} str 
 * @returns {string}
 */
function toTitleCase(str) {
    if (!str) return '';
    return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

/**
 * Normalizes title for comparison
 * @param {string} title 
 * @returns {string}
 */
function normalizeTitle(title) {
    if (!title) return '';
    return title.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Calculates similarity score between two titles
 * @param {string} title1 First title
 * @param {string} title2 Second title
 * @returns {number} Similarity score (0-1)
 */
function calculateTitleSimilarity(title1, title2) {
    const norm1 = normalizeTitle(title1);
    const norm2 = normalizeTitle(title2);

    // Exact match after normalization
    if (norm1 === norm2) return 1.0;

    // Substring matches
    if (norm1.includes(norm2) || norm2.includes(norm1)) return 0.9;

    // Word-based similarity
    const words1 = new Set(norm1.split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(norm2.split(/\s+/).filter(w => w.length > 2));

    if (words1.size === 0 || words2.size === 0) return 0;

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
}

/**
 * Finds the best title match from search results
 * @param {Object} mediaInfo TMDB media info
 * @param {Array} searchResults Search results array
 * @returns {Object|null} Best matching result
 */
function findBestTitleMatch(mediaInfo, searchResults) {
    if (!searchResults || searchResults.length === 0) return null;

    const targetTitle = mediaInfo.title.toLowerCase().replace(/[^a-z0-9]/g, "");
    const targetYear = mediaInfo.year ? parseInt(mediaInfo.year) : null;

    let bestMatch = null;
    let bestScore = 0;

    for (const result of searchResults) {
        const normalizedResultTitle = result.title.toLowerCase().replace(/[^a-z0-9]/g, "");

        let score = calculateTitleSimilarity(mediaInfo.title, result.title);

        // Title match logic
        const titleMatch = normalizedResultTitle.includes(targetTitle) || targetTitle.includes(normalizedResultTitle);

        // Year matching logic
        const yearMatch = !targetYear ||
            result.title.includes(targetYear.toString()) ||
            result.title.includes((targetYear + 1).toString()) ||
            result.title.includes((targetYear - 1).toString());

        if (titleMatch && yearMatch) {
            score += 0.5; // High priority for match logic
        }

        if (score > bestScore) {
            bestScore = score;
            bestMatch = result;
        }
    }

    if (bestMatch && bestScore > 0.4) {
        console.log(`[Movies4u] Best title match: "${bestMatch.title}" (score: ${bestScore.toFixed(2)})`);
        return bestMatch;
    }

    return null;
}

function formatStreamTitle(mediaInfo, stream) {
    const quality = stream.quality || "Unknown";
    const title = mediaInfo.title || "Unknown";
    const isMaster = stream.isMaster || false;

    // Extract year from mediaInfo or search in title/text
    let year = mediaInfo.year || "";
    if (!year || year === "N/A") {
        const yearMatch = (title + " " + (stream.text || "")).match(/\b(19|20)\d{2}\b/);
        if (yearMatch) year = yearMatch[0];
    }

    const audioInfo = stream.audioInfo || "";

    // Extract size from text if available
    let size = "UNKNOWN";
    const sizeMatch = stream.text ? stream.text.match(/(\d+(?:\.\d+)?\s*(?:GB|MB))/i) : null;
    if (sizeMatch) size = sizeMatch[1].toUpperCase();

    // Determine type from text or URL
    let type = "UNKNOWN";
    const searchString = ((stream.text || "") + " " + (stream.url || "") + " " + (stream.label || "")).toLowerCase();

    if (searchString.includes('bluray') || searchString.includes('brrip')) type = "BluRay";
    else if (searchString.includes('web-dl')) type = "WEB-DL";
    else if (searchString.includes('webrip')) type = "WEBRip";
    else if (searchString.includes('hdrip')) type = "HDRip";
    else if (searchString.includes('dvdrip')) type = "DVDRip";
    else if (searchString.includes('bdrip')) type = "BDRip";
    else if (searchString.includes('hdtv')) type = "HDTV";

    const yearStr = year ? ` (${year})` : "";

    // Determine language - handle multi-audio consolidated display
    let lang = "UNKNOWN";

    if (audioInfo) {
        const multiMatch = audioInfo.match(/\[Multi Audio: (.*?)\]/i);
        if (multiMatch) {
            lang = multiMatch[1].toUpperCase();
        } else {
            const singleMatch = audioInfo.match(/\[Audio: (.*?)\]/i);
            if (singleMatch) {
                lang = singleMatch[1].toUpperCase();
            } else {
                lang = audioInfo.toUpperCase();
            }
        }
    }

    const displayQuality = quality;

    const typeLine = (type && type !== "UNKNOWN") ? `📺: ${type}\n` : "";
    const sizeLine = (size && size !== "UNKNOWN") ? `💾: ${size} | 🚜: movies4u\n` : "";

    return `Movies4u (Instant) (${displayQuality})
${typeLine}📼: ${title}${yearStr} - ${displayQuality}
${sizeLine}🌐: ${lang}`;
}

// =================================================================================
// DEOBFUSCATION
// =================================================================================

/**
 * De-obfuscates Packer-encoded string
 */
function unpack(p, a, c, k) {
    while (c--) {
        if (k[c]) {
            const placeholder = c.toString(a);
            p = p.replace(new RegExp('\\b' + placeholder + '\\b', 'g'), k[c]);
        }
    }
    return p;
}

/**
 * Resolves a master HLS playlist to get all variant streams and audio info
 * @param {string} masterUrl The master playlist URL
 * @returns {Promise<Object>} Object containing variants and audio tracks
 */
async function resolveHlsPlaylist(masterUrl) {
    const result = {
        masterUrl: masterUrl,
        variants: [], // {url, quality}
        audios: [],
        isMaster: false
    };

    try {
        console.log(`[Movies4u] Resolving HLS playlist: ${masterUrl}`);
        const response = await fetchWithTimeout(masterUrl, {
            headers: {
                ...HEADERS,
                'Referer': M4UPLAY_BASE
            }
        }, 5000);

        if (!response.ok) return result;

        const content = await response.text();

        if (!content.includes('#EXTM3U')) return result;

        // Skip audio-only master playlists that don't have video variants
        if (content.includes('#EXT-X-STREAM-INF')) {
            result.isMaster = true;
        } else if (content.includes('#EXT-X-MEDIA:TYPE=AUDIO') && !content.includes('#EXT-X-STREAM-INF')) {
            console.log(`[Movies4u] Found audio-only playlist, skipping resolution`);
            return result;
        }

        // Parse audio tracks (#EXT-X-MEDIA:TYPE=AUDIO)
        const audioMatches = content.matchAll(/#EXT-X-MEDIA:TYPE=AUDIO,.*?NAME="([^"]+)"(?:.*?LANGUAGE="([^"]+)")?(?:.*?CHANNELS="([^"]+)")?(?:.*?URI="([^"]+)")?/g);
        for (const match of audioMatches) {
            let audioName = match[1];
            const language = match[2];
            const channels = match[3];
            let audioUri = match[4];

            if (audioUri && !audioUri.startsWith('http')) {
                const baseUrl = masterUrl.substring(0, masterUrl.lastIndexOf('/') + 1);
                audioUri = baseUrl + audioUri;
            }

            if (channels) {
                const channelMap = { "1": "1.0", "2": "2.0", "6": "5.1", "8": "7.1" };
                const channelStr = channelMap[channels] || channels;
                audioName += ` (${channelStr})`;
            }

            if (!result.audios.some(a => a.name === audioName)) {
                result.audios.push({
                    name: audioName,
                    language: language || 'unknown',
                    uri: audioUri
                });
            }
        }

        // Look for variant playlists (#EXT-X-STREAM-INF)
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.includes('#EXT-X-STREAM-INF')) {
                let quality = "Unknown";
                const resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i);
                if (resMatch) {
                    const height = parseInt(resMatch[2]);
                    if (height >= 2160) quality = "4K";
                    else if (height >= 1080) quality = "1080p";
                    else if (height >= 720) quality = "720p";
                    else if (height >= 480) quality = "480p";
                    else quality = `${height}p`;
                }
                if (quality === "Unknown") {
                    const nameMatch = line.match(/NAME="([^"]+)"/i);
                    if (nameMatch) quality = nameMatch[1];
                }

                let j = i + 1;
                while (j < lines.length && (lines[j].trim().startsWith('#') || !lines[j].trim())) {
                    j++;
                }

                if (j < lines.length) {
                    let variantPath = lines[j].trim();
                    if (variantPath) {
                        let variantUrl = variantPath;
                        if (!variantUrl.startsWith('http')) {
                            const baseUrl = masterUrl.substring(0, masterUrl.lastIndexOf('/') + 1);
                            variantUrl = baseUrl + variantUrl;
                        }
                        if (!result.variants.some(v => v.url === variantUrl)) {
                            result.variants.push({ url: variantUrl, quality });
                        }
                    }
                }
                i = j;
            }
        }

        console.log(`[Movies4u] HLS Summary: ${result.variants.length} qualities, ${result.audios.length} audios found`);
        return result;
    } catch (error) {
        console.error(`[Movies4u] HLS resolution error: ${error.message}`);
        return result;
    }
}

// =================================================================================
// STREAM EXTRACTION
// =================================================================================

/**
 * Extracts stream URL from m4uplay.com embed page
 */
async function extractFromM4UPlay(embedUrl) {
    try {
        console.log(`[Movies4u] Extracting from m4uplay: ${embedUrl}`);
        const response = await fetchWithTimeout(embedUrl, {
            headers: { ...HEADERS, 'Referer': MAIN_URL }
        }, 8000);

        const html = await response.text();
        const packerMatch = html.match(/eval\(function\(p,a,c,k,e,d\)\{.*?\}\s*\((.*)\)\s*\)/s);
        let unpackedHtml = html;

        if (packerMatch) {
            try {
                const rawArgs = packerMatch[1].trim();
                const argsMatch = rawArgs.match(/^['"](.*)['"]\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*['"](.*?)['"]\.split\(['"]\|['"]\)/s);
                if (argsMatch) {
                    unpackedHtml += "\n" + unpack(argsMatch[1], parseInt(argsMatch[2]), parseInt(argsMatch[3]), argsMatch[4].split('|'));
                }
            } catch (unpackError) { }
        }

        let finalStreamUrl = null;
        const hlsPatterns = [
            /https?:\/\/[^\s"']+\.(?:m3u8|txt)(?:\?[^\s"']*)?/,
            /["']?(\/(?:stream|3o)\/[^"'\s]+\.(?:m3u8|txt))[^\s"']*/,
            /["']file["']\s*:\s*["']([^"']+\.(?:m3u8|txt)[^"']*)["']/,
            /https?:\/\/[^\s"']*master\.txt[^\s"']*/,
            /["'](?:playlist|sources)["']\s*:\s*\[\s*\{[^}]*["']file["']\s*:\s*["']([^"']+)["']/s,
            /([\/a-zA-Z0-9_\-\.]+\/master\.(?:m3u8|txt))/
        ];

        for (const pattern of hlsPatterns) {
            const match = unpackedHtml.match(pattern);
            if (match) {
                let url = match[1] || match[0];
                if (url.startsWith('/')) url = M4UPLAY_BASE + url;
                finalStreamUrl = url;
                break;
            }
        }

        if (finalStreamUrl) {
            if (finalStreamUrl.includes('master.')) {
                console.log(`[Movies4u] Resolving master playlist...`);
                const resolutionResult = await resolveHlsPlaylist(finalStreamUrl);

                if (resolutionResult.isMaster) {
                    const audioNames = resolutionResult.audios.map(a => a.name);
                    const audioInfo = audioNames.length > 1 ? ` [Multi Audio: ${audioNames.join(', ')}]` : "";

                    if (audioNames.length > 1) {
                        console.log(`[Movies4u] Found multi-audio: ${audioNames.join(', ')}`);
                    }

                    // Identify best quality from variants
                    const qualities = resolutionResult.variants.map(v => v.quality);
                    const bestQuality = qualities.includes('4K') ? '4K' :
                        qualities.includes('1080p') ? '1080p' :
                            qualities.includes('720p') ? '720p' :
                                qualities.includes('480p') ? '480p' :
                                    qualities[0] || "Unknown";

                    return [{
                        url: resolutionResult.masterUrl,
                        audios: resolutionResult.audios,
                        audioInfo: audioInfo,
                        quality: bestQuality,
                        isMaster: true
                    }];
                }
            }

            return [{
                url: finalStreamUrl,
                audios: [],
                audioInfo: "",
                quality: "Unknown"
            }];
        }

        console.log(`[Movies4u] Could not extract stream URL from m4uplay embed`);
        return [];
    } catch (error) {
        console.error(`[Movies4u] M4UPlay extraction error: ${error.message}`);
        return [];
    }
}

/**
 * Extracts watch links from movie page
 */
async function extractWatchLinks(movieUrl) {
    try {
        console.log(`[Movies4u] Extracting watch links from: ${movieUrl}`);
        const response = await fetchWithTimeout(movieUrl, { headers: HEADERS }, 8000);
        const html = await response.text();
        const $ = cheerio.load(html);
        const watchLinks = [];

        $('a.btn.btn-zip').each((i, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim();
            if (href && (href.includes('m4uplay.com') || href.includes('m4uplay.store') || href.includes('m4uplay.'))) {
                watchLinks.push({
                    url: href,
                    quality: text.includes('1080p') ? '1080p' :
                        text.includes('720p') ? '720p' :
                            text.includes('480p') ? '480p' :
                                text.includes('4K') || text.includes('2160p') ? '4K' : 'Unknown',
                    label: text
                });
            }
        });

        console.log(`[Movies4u] Found ${watchLinks.length} watch links`);
        return watchLinks;
    } catch (error) {
        console.error(`[Movies4u] Error extracting watch links: ${error.message}`);
        return [];
    }
}

// =================================================================================
// CORE FUNCTIONS
// =================================================================================

/**
 * Fetches metadata from TMDB
 */
async function getTMDBDetails(tmdbId, mediaType) {
    const type = mediaType === 'movie' ? 'movie' : 'tv';
    const url = `${TMDB_BASE_URL}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}`;
    const response = await fetchWithTimeout(url, {}, 8000);
    if (!response.ok) throw new Error(`TMDB error: ${response.status}`);
    const data = await response.json();
    return {
        title: data.title || data.name,
        year: (data.release_date || data.first_air_date || "").split("-")[0]
    };
}

/**
 * Searches movies4u.fans for a movie
 */
async function searchMovies(query) {
    try {
        const searchUrl = `${MAIN_URL}/?s=${encodeURIComponent(query)}`;
        console.log(`[Movies4u] Searching: ${searchUrl}`);
        const response = await fetchWithTimeout(searchUrl, { headers: HEADERS }, 8000);
        const html = await response.text();
        const $ = cheerio.load(html);
        const results = [];

        $('h3.entry-title a').each((i, el) => {
            const title = $(el).text().trim();
            const url = $(el).attr('href');
            if (title && url) results.push({ title, url });
        });

        console.log(`[Movies4u] Found ${results.length} search results`);
        return results;
    } catch (error) {
        console.error(`[Movies4u] Search error: ${error.message}`);
        return [];
    }
}

/**
 * Main function for Nuvio integration
 */
async function getStreams(tmdbId, mediaType = 'movie', season = null, episode = null) {
    console.log(`[Movies4u] Processing ${mediaType} ${tmdbId}`);
    try {
        let mediaInfo;
        const isNumericId = /^\d+$/.test(tmdbId);
        if (isNumericId) {
            try {
                mediaInfo = await getTMDBDetails(tmdbId, mediaType);
            } catch (error) {
                mediaInfo = { title: tmdbId, year: null };
            }
        } else {
            mediaInfo = { title: tmdbId, year: null };
        }

        const searchResults = await searchMovies(mediaInfo.title);
        if (searchResults.length === 0) return [];
        const bestMatch = findBestTitleMatch(mediaInfo, searchResults);
        if (!bestMatch) return [];

        console.log(`[Movies4u] Found match: ${bestMatch.title}`);
        const yearMatch = bestMatch.title.match(/\((20\d{2}|19\d{2})\)/);
        if (mediaInfo.title.toLowerCase() === tmdbId.toLowerCase()) {
            mediaInfo.title = bestMatch.title.split('(')[0].trim();
            if (yearMatch) mediaInfo.year = yearMatch[1];
        }

        const watchLinks = await extractWatchLinks(bestMatch.url);
        if (watchLinks.length === 0) return [];

        const streams = [];
        for (const watchLink of watchLinks) {
            const extractionResults = await extractFromM4UPlay(watchLink.url);
            for (const result of extractionResults) {
                const streamObj = {
                    ...result,
                    quality: result.quality !== "Unknown" ? result.quality : watchLink.quality,
                    text: watchLink.label,
                    isMaster: result.isMaster
                };

                streams.push({
                    name: "Movies4u",
                    title: formatStreamTitle(mediaInfo, streamObj),
                    url: result.url,
                    quality: streamObj.quality,
                    headers: { 
                        "Referer": "https://m4uplay.store/",
                        "User-Agent": HEADERS["User-Agent"],
                        "Origin": "https://m4uplay.store"
                    },
                    provider: 'Movies4u'
                });
            }
        }

        console.log(`[Movies4u] Extracted ${streams.length} streams`);
        return streams;
    } catch (error) {
        console.error("[Movies4u] getStreams failed:", error.message);
        return [];
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.getStreams = { getStreams };
}
