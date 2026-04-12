// Dahmer Movies Scraper for Nuvio Local Scrapers
// React Native compatible version

console.log('[DahmerMovies] Initializing Dahmer Movies scraper');

// Constants
const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const DAHMER_MOVIES_API = 'https://a.111477.xyz';
const TIMEOUT = 60000; // 60 seconds

// Quality mapping
const Qualities = {
    Unknown: 0,
    P144: 144,
    P240: 240,
    P360: 360,
    P480: 480,
    P720: 720,
    P1080: 1080,
    P1440: 1440,
    P2160: 2160
};

// Helper function to make HTTP requests
function makeRequest(url, options = {}) {
    const requestOptions = {
        timeout: TIMEOUT,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Connection': 'keep-alive',
            ...options.headers
        },
        ...options
    };

    return fetch(url, requestOptions).then(function(response) {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response;
    });
}

// Utility functions
function getEpisodeSlug(season = null, episode = null) {
    if (season === null && episode === null) {
        return ['', ''];
    }
    const seasonSlug = season < 10 ? `0${season}` : `${season}`;
    const episodeSlug = episode < 10 ? `0${episode}` : `${episode}`;
    return [seasonSlug, episodeSlug];
}

function getIndexQuality(str) {
    if (!str) return Qualities.Unknown;
    const match = str.match(/(\d{3,4})[pP]/);
    return match ? parseInt(match[1]) : Qualities.Unknown;
}

function getIndexQualityTags(str) {
    if (!str) return '';
    const match = str.match(/\d{3,4}[pP]\.?(.*?)\.(mkv|mp4|avi)/i);
    return match ? match[1].replace(/\./g, ' ').trim() : str;
}

function formatFileSize(sizeText) {
    if (!sizeText) return null;
    if (/\d+(\.\d+)?\s*(GB|MB|KB|TB)/i.test(sizeText)) return sizeText;

    const bytes = parseInt(sizeText);
    if (isNaN(bytes)) return sizeText;

    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

function encodeUrl(url) {
    try { return encodeURI(url); } catch (e) { return url; }
}

// ======================================================
// 🔥 FIX 1 — SAFE LINK PARSER (DO NOT OVER-RESTRICT)
// ======================================================
function parseLinks(html) {
    const links = [];

    const regex = /<a[^>]*href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
    let match;

    while ((match = regex.exec(html)) !== null) {
        const href = match[1];
        const text = (match[2] || '').trim();

        if (!href || href === '../') continue;

        links.push({ href, text });
    }

    return links;
}

// ======================================================
// 🔥 FIX 2 — SAFE MEDIA CHECK
// ======================================================
function isMediaFile(href, text) {
    const combined = (href + ' ' + text).toLowerCase();
    return combined.includes('.mkv') ||
           combined.includes('.mp4') ||
           combined.includes('.avi');
}

// Main Dahmer Movies fetcher function
function invokeDahmerMovies(title, year, season = null, episode = null) {

    console.log(`[DahmerMovies] Searching: ${title} (${year})`);

    const encodedUrl = season === null
        ? `${DAHMER_MOVIES_API}/movies/${encodeURIComponent(title.replace(/:/g, '') + ' (' + year + ')')}/`
        : `${DAHMER_MOVIES_API}/tvs/${encodeURIComponent(title.replace(/:/g, ' -'))}/Season ${season}/`;

    return makeRequest(encodedUrl)
        .then(function(response) {
            return response.text();
        })
        .then(function(html) {

            let paths = parseLinks(html);

            console.log(`[DahmerMovies] Found links: ${paths.length}`);

            // FILTER ONLY AFTER PARSING (FIXED LOGIC)
            let filteredPaths;

            if (season === null) {
                filteredPaths = paths.filter(function(p) {
                    return isMediaFile(p.href, p.text) &&
                           /(1080p|2160p)/i.test(p.text);
                });
            } else {
                const [s, e] = getEpisodeSlug(season, episode);
                const reg = new RegExp(`S${s}E${e}`, 'i');

                filteredPaths = paths.filter(function(p) {
                    return isMediaFile(p.href, p.text) &&
                           reg.test(p.text);
                });
            }

            console.log(`[DahmerMovies] Filtered: ${filteredPaths.length}`);

            const results = filteredPaths.map(function(path) {

                let fullUrl;

                // ======================================================
                // 🔥 FIX 3 — SAFE URL BUILD (NO DUPLICATION / NO %2520)
                // ======================================================
                if (path.href.startsWith('http')) {
                    fullUrl = path.href;
                } else {
                    fullUrl = new URL(path.href, DAHMER_MOVIES_API).href;
                }

                return {
                    name: "DahmerMovies",
                    title: `DahmerMovies ${getIndexQualityTags(path.text) || path.text}`,
                    url: fullUrl,
                    quality: getIndexQuality(path.text),
                    size: formatFileSize(path.size),
                    headers: {
                        "User-Agent": "Mozilla/5.0",
                        "Referer": DAHMER_MOVIES_API + "/",
                        "Range": "bytes=0-"
                    },
                    provider: "dahmermovies",
                    filename: path.text
                };
            });

            return results;
        })
        .catch(function(error) {
            console.log('[DahmerMovies] Error:', error.message);
            return [];
        });
}

// Main function to get streams for TMDB content
function getStreams(tmdbId, mediaType = 'movie', seasonNum = null, episodeNum = null) {

    const tmdbUrl = `https://api.themoviedb.org/3/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}?api_key=${TMDB_API_KEY}`;

    return makeRequest(tmdbUrl)
        .then(function(tmdbResponse) {
            return tmdbResponse.json();
        })
        .then(function(tmdbData) {

            const title = mediaType === 'tv' ? tmdbData.name : tmdbData.title;
            const year = mediaType === 'tv'
                ? tmdbData.first_air_date?.substring(0, 4)
                : tmdbData.release_date?.substring(0, 4);

            return invokeDahmerMovies(title, year ? parseInt(year) : null, seasonNum, episodeNum);
        })
        .catch(function(error) {
            console.log('[DahmerMovies] TMDB Error:', error.message);
            return [];
        });
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.getStreams = getStreams;
}
