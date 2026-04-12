// Dahmer Movies Scraper for Nuvio Local Scrapers
console.log('[DahmerMovies] Initializing Dahmer Movies scraper');

// Constants
const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const DAHMER_MOVIES_API = 'https://a.111477.xyz';
const TIMEOUT = 60000;

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

// HTTP request helper
function makeRequest(url, options = {}) {
    return fetch(url, {
        timeout: TIMEOUT,
        headers: {
            'User-Agent': 'Mozilla/5.0',
            'Accept': '*/*',
            'Connection': 'keep-alive',
            ...options.headers
        },
        ...options
    }).then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res;
    });
}

// Utils
function getEpisodeSlug(season, episode) {
    if (!season || !episode) return ['', ''];
    return [
        season < 10 ? `0${season}` : `${season}`,
        episode < 10 ? `0${episode}` : `${episode}`
    ];
}

function getIndexQuality(str) {
    const m = str?.match(/(\d{3,4})p/i);
    return m ? parseInt(m[1]) : 0;
}

function formatFileSize(sizeText) {
    if (!sizeText) return null;
    if (/\d+(\.\d+)?\s*(GB|MB|KB)/i.test(sizeText)) return sizeText;

    const bytes = parseInt(sizeText);
    if (isNaN(bytes)) return sizeText;

    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

// Parse links
function parseLinks(html) {
    const links = [];
    const regex = /<a[^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi;
    let match;

    while ((match = regex.exec(html))) {
        const href = match[1];
        const text = match[2].trim();
        if (!text || text === '../') continue;
        links.push({ href, text, size: null });
    }

    return links;
}

// MAIN SCRAPER
function invokeDahmerMovies(title, year, season = null, episode = null) {

    const encodedUrl = season === null
        ? `${DAHMER_MOVIES_API}/movies/${encodeURIComponent(title + ' (' + year + ')')}/`
        : `${DAHMER_MOVIES_API}/tvs/${encodeURIComponent(title)}/Season ${season}/`;

    return makeRequest(encodedUrl)
        .then(r => r.text())
        .then(html => {

            const paths = parseLinks(html);

            let filtered = season === null
                ? paths.filter(p => /(1080p|2160p)/i.test(p.text))
                : paths.filter(p => {
                    const [s, e] = getEpisodeSlug(season, episode);
                    return new RegExp(`S${s}E${e}`, 'i').test(p.text);
                });

            return filtered.map(path => {

                let fullUrl;

                // ✅ FIXED URL HANDLING
                if (path.href.startsWith('http')) {
                    fullUrl = path.href;
                } else {
                    const base = encodedUrl.endsWith('/') ? encodedUrl : encodedUrl + '/';
                    const cleanPath = path.href.startsWith('/') ? path.href.slice(1) : path.href;

                    // ✅ correct encoding (keeps folders)
                    fullUrl = base + encodeURI(cleanPath);
                }

                console.log("FINAL URL:", fullUrl);

                return {
                    name: "DahmerMovies",
                    title: path.text,
                    url: fullUrl,
                    quality: getIndexQuality(path.text),
                    size: formatFileSize(path.size),

                    // ✅ FIXED HEADERS (important)
                    headers: {
                        "User-Agent": "Mozilla/5.0",
                        "Referer": DAHMER_MOVIES_API + "/",
                        "Origin": DAHMER_MOVIES_API,
                        "Accept": "*/*"
                    },

                    filename: path.text
                };
            });
        })
        .catch(err => {
            console.log("ERROR:", err.message);
            return [];
        });
}

// TMDB wrapper
function getStreams(tmdbId, type = 'movie', season = null, episode = null) {

    const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_API_KEY}`;

    return makeRequest(url)
        .then(r => r.json())
        .then(data => {

            const title = type === 'tv' ? data.name : data.title;
            const year = (type === 'tv'
                ? data.first_air_date
                : data.release_date)?.slice(0, 4);

            return invokeDahmerMovies(title, year, season, episode);
        })
        .catch(() => []);
}

// Export
if (typeof module !== 'undefined') {
    module.exports = { getStreams };
} else {
    global.getStreams = getStreams;
}
