// ShowBox Scraper for Nuvio - Android TV Optimized
// Version: 1.1 (React Native / Promise-based)

const TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const SHOWBOX_API_BASE = 'https://febapi.nuvioapp.space/api/media';

const WORKING_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36',
    'Accept': 'application/json',
    'Content-Type': 'application/json'
};

// Helper: Safely retrieve injected settings
function getSettingsValue(key) {
    try {
        const source = (typeof global !== 'undefined' ? global : (typeof window !== 'undefined' ? window : {}));
        if (source.SCRAPER_SETTINGS && source.SCRAPER_SETTINGS[key]) {
            return String(source.SCRAPER_SETTINGS[key]);
        }
    } catch (e) {
        console.error(`[ShowBox] Settings error: ${e.message}`);
    }
    return null;
}

// Helper: HTTP request with a 10-second timeout for TV stability
function makeRequest(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    return fetch(url, {
        method: options.method || 'GET',
        headers: { ...WORKING_HEADERS, ...options.headers },
        signal: controller.signal,
        ...options
    }).then(function(response) {
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response;
    }).catch(function(error) {
        clearTimeout(timeoutId);
        throw error;
    });
}

function getQualityFromName(qualityStr) {
    if (!qualityStr) return 'Unknown';
    const quality = qualityStr.toUpperCase();
    if (quality.includes('4K') || quality.includes('2160')) return '4K';
    if (quality.includes('1080')) return '1080p';
    if (quality.includes('720')) return '720p';
    if (quality.includes('480')) return '480p';
    return qualityStr;
}

function formatFileSize(sizeStr) {
    if (typeof sizeStr === 'number') {
        const gb = sizeStr / (1024 * 1024 * 1024);
        return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(sizeStr / (1024 * 1024)).toFixed(2)} MB`;
    }
    return sizeStr || 'Unknown';
}

function getTMDBDetails(tmdbId, mediaType) {
    const endpoint = mediaType === 'tv' ? 'tv' : 'movie';
    const url = `${TMDB_BASE_URL}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}`;
    
    return makeRequest(url)
        .then(res => res.json())
        .then(data => ({
            title: mediaType === 'tv' ? data.name : data.title,
            year: (mediaType === 'tv' ? data.first_air_date : data.release_date)?.split('-')[0] || null
        }))
        .catch(() => ({ title: 'Unknown', year: null }));
}

function processShowBoxResponse(data, mediaInfo, mediaType, season, episode) {
    const streams = [];
    if (!data?.success || !data.versions) return streams;

    let baseTitle = mediaInfo.title;
    if (mediaType === 'tv') baseTitle += ` S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
    if (mediaInfo.year) baseTitle += ` (${mediaInfo.year})`;

    data.versions.forEach((version, vIdx) => {
        if (!version.links) return;
        version.links.forEach(link => {
            if (!link.url) return;
            const quality = getQualityFromName(link.quality);
            streams.push({
                name: `ShowBox ${quality} [V${vIdx + 1}]`,
                title: baseTitle,
                url: link.url,
                quality: quality,
                size: formatFileSize(link.size || version.size),
                provider: 'showbox'
            });
        });
    });
    return streams;
}

// Main function required by Nuvio
function getStreams(tmdbId, mediaType = 'movie', seasonNum = null, episodeNum = null) {
    const cookie = getSettingsValue('uiToken');
    const ossGroup = getSettingsValue('ossGroup');

    if (!cookie) {
        console.log('[ShowBox] Missing uiToken in settings');
        return Promise.resolve([]);
    }

    return getTMDBDetails(tmdbId, mediaType).then(mediaInfo => {
        let apiUrl = (mediaType === 'tv') 
            ? `${SHOWBOX_API_BASE}/tv/${tmdbId}${ossGroup ? '/oss='+ossGroup : ''}/${seasonNum}/${episodeNum}?cookie=${encodeURIComponent(cookie)}`
            : `${SHOWBOX_API_BASE}/movie/${tmdbId}?cookie=${encodeURIComponent(cookie)}`;

        return makeRequest(apiUrl)
            .then(res => res.json())
            .then(data => {
                const results = processShowBoxResponse(data, mediaInfo, mediaType, seasonNum, episodeNum);
                return results.sort((a, b) => {
                    const q = { '4K': 5, '1080p': 4, '720p': 3, '480p': 2 };
                    return (q[b.quality] || 0) - (q[a.quality] || 0);
                });
            })
            .catch(err => {
                console.error(`[ShowBox] API Error: ${err.message}`);
                return [];
            });
    });
}

// Export for Nuvio Environment
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
}
global.getStreams = getStreams;
global.ShowBoxScraperModule = { getStreams };
