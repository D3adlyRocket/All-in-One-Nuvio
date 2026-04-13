/**
 * CineStream Provider for Nuvio
 * ported from SaurabhKaperwanCSX ported by kabir
 */

const TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const API_BASE = "https://87d6a6ef6b58-webstreamrmbg.baby-beamup.club/";

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json"
};

/**
 * Get IMDB ID from TMDB
 */
async function getIMDBId(tmdbId, mediaType) {
    const url = `${TMDB_BASE_URL}/${mediaType}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    const data = await res.json();
    return {
        imdbId: data.external_ids?.imdb_id,
        title: mediaType === 'tv' ? data.name : data.title
    };
}

/**
 * Main function called by Nuvio
 */
async function getStreams(tmdbId, mediaType = 'movie', season = null, episode = null) {
    try {
        const info = await getIMDBId(tmdbId, mediaType);
        if (!info.imdbId) return [];

        let apiUrl = "";
        if (mediaType === 'movie') {
            apiUrl = `${API_BASE}/stream/movie/${info.imdbId}.json`;
        } else {
            apiUrl = `${API_BASE}/stream/series/${info.imdbId}:${season}:${episode}.json`;
        }

        console.log(`[CineStream] Fetching: ${apiUrl}`);
        const res = await fetch(apiUrl, { headers: HEADERS });
        if (!res.ok) return [];

        const data = await res.json();
        const streams = data.streams || [];

        return streams.map(s => ({
            name: `CS [${s.name.split('|').pop().trim()}]`,
            title: s.title.split('\n')[0],
            url: s.url,
            quality: s.title.includes('1080p') ? '1080p' : (s.title.includes('720p') ? '720p' : 'Auto'),
            headers: s.behaviorHints?.proxyHeaders?.request || { "Referer": API_BASE }
        }));

    } catch (e) {
        console.error("[CineStream] Error:", e.message);
        return [];
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.getStreams = { getStreams };
}
