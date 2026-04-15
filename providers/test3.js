const TMDB_API_KEY = "20bf0a5cbc307e7889137457fa5b6b37";
const PRIMESRC_BASE = "https://primesrc.me/api/v1/";
const PRIMESRC_SITE = "https://primesrc.me";

async function makeRequest(url, options = {}) {
    const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Referer": `${PRIMESRC_SITE}/`,
        "Origin": PRIMESRC_SITE,
        ...options.headers
    };

    try {
        const response = await fetch(url, {
            method: options.method || "GET",
            headers: headers,
            timeout: 10000 // 10s timeout
        });

        if (!response.ok) {
            console.error(`[PrimeSrc] Error ${response.status} at ${url}`);
            return null;
        }
        return await response.json();
    } catch (e) {
        console.error(`[PrimeSrc] Fetch failed: ${e.message}`);
        return null;
    }
}

async function getStreams(tmdbId, mediaType = "movie", seasonNum, episodeNum) {
    console.log(`[PrimeSrc] Start: ID ${tmdbId} | ${mediaType}`);

    // 1. Validate TMDB Data
    const tmdbUrl = `https://api.themoviedb.org/3/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}?api_key=${TMDB_API_KEY}`;
    const tmdbData = await makeRequest(tmdbUrl);
    
    if (!tmdbData) {
        console.error("[PrimeSrc] TMDB check failed. Check your API Key.");
        return [];
    }

    const title = mediaType === "tv" ? tmdbData.name : tmdbData.title;
    const year = (mediaType === "tv" ? tmdbData.first_air_date : tmdbData.release_date || "").substring(0, 4);

    // 2. Fetch Server List
    // Some versions of this API require 'tmdb' param, others use 'id'
    const typePath = mediaType === "tv" ? "tv" : "movie";
    let searchUrl = `${PRIMESRC_BASE}s?tmdb=${tmdbId}&type=${typePath}`;
    
    if (mediaType === "tv") {
        searchUrl += `&season=${seasonNum}&episode=${episodeNum}`;
    }

    const searchData = await makeRequest(searchUrl);

    if (!searchData || !searchData.servers || searchData.servers.length === 0) {
        console.warn("[PrimeSrc] No servers found for this content.");
        return [];
    }

    // 3. Resolve Stream Links
    const streams = [];
    for (const server of searchData.servers) {
        if (!server.key) continue;

        // The link endpoint often requires the same Referer
        const linkData = await makeRequest(`${PRIMESRC_BASE}l?key=${server.key}`);
        
        if (linkData && linkData.link) {
            streams.push({
                name: `PrimeSrc - ${server.name || "Auto"}`,
                title: `${title} ${mediaType === 'tv' ? `S${seasonNum}E${episodeNum}` : `(${year})`}`,
                url: linkData.link,
                quality: "1080p",
                headers: { "Referer": PRIMESRC_SITE },
                provider: "primesrc"
            });
        }
    }

    console.log(`[PrimeSrc] Total Streams found: ${streams.length}`);
    return streams;
}
