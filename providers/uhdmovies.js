// UHDMovies Scraper for Nuvio Local Scrapers
// React Native compatible version

console.log('[UHDMovies] Initializing UHDMovies scraper');

// Constants
const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const BASE = "https://uhdmovies.zip"; // fallback domain
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
    return fetch(url, {
        timeout: TIMEOUT,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Accept': '*/*',
            ...options.headers
        },
        ...options
    }).then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res;
    });
}

// Extract quality with codecs
function getQuality(str) {
    if (!str) return "Unknown";
    str = str.toLowerCase();

    let quality = "HD";
    if (str.includes("2160") || str.includes("4k")) quality = "2160p";
    else if (str.includes("1080")) quality = "1080p";
    else if (str.includes("720")) quality = "720p";

    const codecs = [];
    if (str.includes("hdr")) codecs.push("HDR");
    if (str.includes("dolby vision") || str.includes("dv")) codecs.push("DV");
    if (str.includes("imax")) codecs.push("IMAX");
    if (str.includes("remux")) codecs.push("REMUX");

    if (codecs.length > 0) return `${quality} | ${codecs.join(" | ")}`;
    return quality;
}

// Parse HTML links
function parseLinks(html) {
    const links = [];
    const regex = /<a[^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi;
    let m;
    while ((m = regex.exec(html)) !== null) {
        const href = m[1];
        const text = m[2].trim();
        if (!href || !text || href === '../') continue;
        links.push({ href, text });
    }
    return links;
}

// Fetch search results from UHDMovies
function searchUHD(title, year) {
    const query = encodeURIComponent(`${title} ${year}`);
    const url = `${BASE}/?s=${query}`;
    console.log("[UHDMovies] Search URL:", url);
    return makeRequest(url)
        .then(res => res.text())
        .then(html => {
            const results = parseLinks(html);
            if (results.length === 0) return [];
            return results.map(r => r.href);
        });
}

// Extract streams from a page URL
function extractStreams(pageUrl) {
    console.log("[UHDMovies] Extract page:", pageUrl);
    return makeRequest(pageUrl)
        .then(res => res.text())
        .then(html => {
            const links = parseLinks(html);
            const streams = links
                .filter(l => /(\.mkv|\.mp4|driveleech|video-seed|video-leech)/i.test(l.href))
                .map(l => ({
                    name: "UHDMovies",
                    title: `UHDMovies ${l.text}`,
                    url: l.href.startsWith("http") ? l.href : `${BASE}${l.href}`,
                    quality: getQuality(l.text),
                    provider: "uhdmovies",
                    filename: l.text
                }));
            return streams;
        });
}

// Main invoke function
function invokeUHD(title, year) {
    return searchUHD(title, year)
        .then(results => {
            if (!results.length) return [];
            return extractStreams(results[0]);
        })
        .catch(err => {
            console.log("[UHDMovies] Error in invokeUHD:", err);
            return [];
        });
}

// Main getStreams function
function getStreams(tmdbId, mediaType = 'movie', season = null, episode = null) {
    console.log(`[UHDMovies] Fetching TMDB ID: ${tmdbId}, Type: ${mediaType}`);
    const tmdbUrl = `https://api.themoviedb.org/3/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}?api_key=${TMDB_API_KEY}`;
    return makeRequest(tmdbUrl)
        .then(res => res.json())
        .then(tmdb => {
            const title = mediaType === 'tv' ? tmdb.name : tmdb.title;
            const year = mediaType === 'tv' ? tmdb.first_air_date?.substring(0,4) : tmdb.release_date?.substring(0,4);
            if (!title) return [];
            return invokeUHD(title, year);
        })
        .catch(err => {
            console.log("[UHDMovies] Error in getStreams:", err);
            return [];
        });
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams, enabled: true };
} else {
    global.getStreams = getStreams;
}
