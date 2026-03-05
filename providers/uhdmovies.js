// UHDMovies Scraper for Nuvio Local Scrapers
// Uses a likely working mirror
console.log("[UHDMovies] initializing");

// TMDB API key (same as Dahmer code)
const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";

// Candidate mirrors
const MIRRORS = [
    "https://uhdmovies.run",
    "https://uhdmovies.space",
    "https://uhdmovies.tips"
];

function makeRequest(url, options = {}) {
    return fetch(url, {
        ...options,
        headers: {
            "User-Agent": "Mozilla/5.0",
            "Accept": "*/*",
            ...options.headers
        },
        timeout: 15000
    }).then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res;
    }).catch(() => null);
}

function extractQuality(text) {
    if (!text) return "Unknown";
    text = text.toLowerCase();
    if (text.includes("2160") || text.includes("4k")) return "2160p";
    if (text.includes("1080")) return "1080p";
    if (text.includes("720")) return "720p";
    return "HD";
}

function parseLinks(html) {
    const links = [];
    const regex = /<a[^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi;
    let m;
    while ((m = regex.exec(html)) !== null) {
        const href = m[1];
        const text = m[2].trim();
        if (!href || href === "../" || !text) continue;
        links.push({ href, text });
    }
    return links;
}

function searchOnMirror(domain, title, year) {
    const q = encodeURIComponent(`${title} ${year}`);
    const url = `${domain}/?s=${q}`;
    console.log("[UHDMovies] searching:", url);
    return makeRequest(url)?.then(res => res.text()).catch(() => "");
}

function findFirstResult(html, domain) {
    const results = [];
    const regex = /<a href="([^"]+)"[^>]*>/gi;
    let m;
    while ((m = regex.exec(html)) !== null) {
        const link = m[1];
        if (link && link.includes(domain)) {
            results.push(link);
        }
    }
    return results.length ? results[0] : null;
}

function getStreamsFromPage(pageUrl) {
    console.log("[UHDMovies] fetch page:", pageUrl);
    return makeRequest(pageUrl)?.then(res => res.text()).then(html => {
        const rawLinks = parseLinks(html);
        const streams = [];
        rawLinks.forEach(l => {
            if (/(\.mkv|\.mp4|driveleech|video-seed|video-leech)/i.test(l.href)) {
                streams.push({
                    name: "UHDMovies",
                    title: `${extractQuality(l.text)} | ${l.text}`,
                    url: l.href.startsWith("http") ? l.href : pageUrl + l.href,
                    quality: extractQuality(l.text),
                    provider: "uhdmovies"
                });
            }
        });
        return streams;
    }).catch(() => []);
}

function invokeUHDMovies(title, year) {
    // loop mirrors and pick first that returns something
    return new Promise(async resolve => {
        for (const domain of MIRRORS) {
            const searchHtml = await searchOnMirror(domain, title, year);
            if (!searchHtml) continue;
            const firstLink = findFirstResult(searchHtml, domain);
            if (!firstLink) continue;
            const streams = await getStreamsFromPage(firstLink);
            if (streams.length) {
                resolve(streams);
                return;
            }
        }
        resolve([]);
    });
}

function getStreams(tmdbId, mediaType = "movie", season = null, episode = null) {
    console.log("[UHDMovies] getStreams called for:", tmdbId);

    const tmdbUrl = `https://api.themoviedb.org/3/${mediaType === "tv"? "tv": "movie" }/${tmdbId}?api_key=${TMDB_API_KEY}`;

    return makeRequest(tmdbUrl)?.then(res => res.json()).then(tmdb => {
        const title = mediaType === "tv" ? tmdb.name : tmdb.title;
        const year = mediaType === "tv"? tmdb.first_air_date?.substring(0,4) : tmdb.release_date?.substring(0,4);
        if (!title) return [];
        return invokeUHDMovies(title, year);
    }).catch(() => []);
}

// export in Nuvio’s expected structure
if (typeof module !== "undefined" && module.exports) {
    module.exports = { getStreams, enabled: true };
} else {
    global.getStreams = getStreams;
}
