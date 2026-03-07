const cheerio = require('cheerio-without-node-native');
const axios = require('axios');

const DRAMAFULL_BASE = "https://dramafull.cc";
const TMDB_API_KEY = '1b3113663c9004682ed61086cf967c44';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': DRAMAFULL_BASE + '/'
};

/**
 * Normalizes title for comparison
 */
function normalizeTitle(title) {
    if (!title) return '';
    return title.toLowerCase()
        .replace(/[-:]/g, ' ')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Calculates similarity between two titles
 */
function calculateSimilarity(title1, title2) {
    const norm1 = normalizeTitle(title1);
    const norm2 = normalizeTitle(title2);

    if (norm1 === norm2) return 1.0;
    if (norm1.length > 5 && norm2.length > 5 && (norm2.includes(norm1) || norm1.includes(norm2))) return 0.9;

    const words1 = new Set(norm1.split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(norm2.split(/\s+/).filter(w => w.length > 2));

    if (words1.size === 0 || words2.size === 0) return 0;

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
}

/**
 * Get movie/TV show details from TMDB
 */
async function getTMDBDetails(tmdbId, mediaType) {
    const endpoint = mediaType === 'tv' ? 'tv' : 'movie';
    const url = `${TMDB_BASE_URL}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}`;

    try {
        const response = await axios.get(url, { headers: { 'User-Agent': HEADERS['User-Agent'] }, timeout: 10000 });
        const data = response.data;
        return {
            title: data.name || data.title,
            year: (data.first_air_date || data.release_date || '').split('-')[0]
        };
    } catch (e) {
        console.error('[DramaFull] TMDB fetch failed:', e.message);
        return null;
    }
}

/**
 * Formats the stream title.
 */
function formatTitle(title, quality, season, episode, metadata = '') {
    const s = String(season || 1).padStart(2, '0');
    const e = String(episode || 1).padStart(2, '0');
    const epLabel = season ? ` - S${s} E${e}` : '';

    let titleStr = `DramaFull (${quality}) [DramaFull]
📹: ${title}${epLabel}`;

    if (metadata) {
        titleStr += `\n🎧: ${metadata}`;
    }

    return titleStr;
}

/**
 * Search for a drama on DramaFull
 */
async function search(query) {
    try {
        const url = `${DRAMAFULL_BASE}/api/live-search/${encodeURIComponent(query)}`;
        const response = await axios.get(url, { headers: HEADERS, timeout: 10000 });
        if (response.data && response.data.success) {
            return response.data.data || [];
        }
        return [];
    } catch (e) {
        console.error('[DramaFull] Search failed:', e.message);
        return [];
    }
}

/**
 * Get streams for a specific episode
 */
async function getStreams(tmdbId, mediaType = 'movie', season = null, episode = null) {
    try {
        let mediaInfo;
        if (typeof tmdbId === 'string' && isNaN(tmdbId)) {
            mediaInfo = { title: tmdbId };
        } else {
            mediaInfo = await getTMDBDetails(tmdbId, mediaType);
        }

        if (!mediaInfo?.title) {
            console.error('[DramaFull] No media info found for:', tmdbId);
            // Fallback: If tmdbId is a string, use it as the title anyway
            if (typeof tmdbId === 'string') {
                console.log(`[DramaFull] Using tmdbId string "${tmdbId}" as fallback title`);
                mediaInfo = { title: tmdbId };
            } else {
                return [];
            }
        }

        console.log(`[DramaFull] Searching for: ${mediaInfo.title}`);
        let searchResults = await search(mediaInfo.title);

        // Fallback: If no results and title has special chars or is long, try a simplified version
        if (searchResults.length === 0 && mediaInfo.title.includes(':')) {
            const simplified = mediaInfo.title.split(':')[0].trim();
            console.log(`[DramaFull] No results for full title, trying: ${simplified}`);
            searchResults = await search(simplified);
        }

        if (searchResults.length === 0) {
            console.log('[DramaFull] No search results found.');
            return [];
        }

        // Find best match using TMDB ID first, then scoring
        let bestMatch = null;
        let maxScore = 0;

        // Try exact TMDB ID match first
        const tmdbIdNum = parseInt(tmdbId);
        if (!isNaN(tmdbIdNum)) {
            bestMatch = searchResults.find(r => r.themoviedb_id === tmdbIdNum);
            if (bestMatch) {
                console.log(`[DramaFull] Exact TMDB ID match found: ${bestMatch.name}`);
                maxScore = 1.0;
            }
        }

        if (!bestMatch) {
            for (const res of searchResults) {
                let score = calculateSimilarity(mediaInfo.title, res.name);

                // Boost for year match if available
                if (mediaInfo.year && res.name.includes(mediaInfo.year)) {
                    score += 0.2; // Boost for matching year
                    console.log(`[DramaFull] Year match boost for "${res.name}" (+0.2)`);
                } else if (mediaInfo.year && !res.name.includes(mediaInfo.year) && res.name.match(/\(\d{4}\)/)) {
                    // Penalize if it has a year BUT it's the wrong year
                    score -= 0.1;
                }

                console.log(`[DramaFull] Score for "${res.name}": ${score.toFixed(2)}`);

                if (score > maxScore) {
                    maxScore = score;
                    bestMatch = res;
                }
            }
        }

        if (!bestMatch || maxScore < 0.3) {
            console.warn(`[DramaFull] No good match found (Max score: ${maxScore.toFixed(2)})`);
            return [];
        }

        const filmSlug = bestMatch.slug;
        const filmTitle = bestMatch.name;
        console.log(`[DramaFull] Matched drama: ${filmTitle} (Slug: ${filmSlug}) Score: ${maxScore.toFixed(2)}`);

        // Get Film Page to find episodes
        const filmUrl = `${DRAMAFULL_BASE}/film/${filmSlug}`;
        console.log(`[DramaFull] Fetching film page: ${filmUrl}`);
        const filmPageResponse = await axios.get(filmUrl, { headers: HEADERS, timeout: 10000 });
        const $ = cheerio.load(filmPageResponse.data);

        const targetEpNumber = mediaType === 'tv' && episode ? episode : 1;
        let watchUrl = '';

        // Extract episode links
        // Extract episode links
        $('.episode-item a').each((i, el) => {
            const $el = $(el);
            const epText = $el.text().trim();
            const epTitle = $el.attr('title') || '';

            // Check text content first
            const textMatch = epText.match(/(\d+)/);
            if (textMatch && parseInt(textMatch[1]) === targetEpNumber) {
                watchUrl = $el.attr('href');
                return false;
            }

            // Check title attribute (e.g., "Episode 2")
            const titleMatch = epTitle.match(/Episode\s*(\d+)/i);
            if (titleMatch && parseInt(titleMatch[1]) === targetEpNumber) {
                watchUrl = $el.attr('href');
                return false;
            }
        });

        // Fallback for movies or single episodes: Use the "Watch now" button or "Latest" link
        if (!watchUrl) {
            watchUrl = $('.btn-play').attr('href') || $('.last-episode a').attr('href');
            // If it's a movie and we found a link, use it
            if (watchUrl && mediaType === 'movie') {
                console.log(`[DramaFull] Using movie watch link: ${watchUrl}`);
            } else if (watchUrl && targetEpNumber === 1) {
                console.log(`[DramaFull] Using fallback watch link for Ep 1: ${watchUrl}`);
            } else {
                watchUrl = '';
            }
        }

        if (!watchUrl) {
            console.warn(`[DramaFull] Episode ${targetEpNumber} not found for ${filmSlug}`);
            return [];
        }

        if (!watchUrl.startsWith('http')) {
            watchUrl = DRAMAFULL_BASE + watchUrl;
        }

        console.log(`[DramaFull] Found watch URL: ${watchUrl}`);

        // Fetch Watch Page to get signedUrl
        const watchPageResponse = await axios.get(watchUrl, { headers: HEADERS, timeout: 10000 });
        const watchHtml = watchPageResponse.data;

        // Extract signedUrl using regex
        const signedUrlMatch = watchHtml.match(/window\.signedUrl\s*=\s*"(.*?)"/);
        if (!signedUrlMatch) {
            console.error('[DramaFull] Failed to extract signedUrl from watch page');
            return [];
        }

        let signedUrl = signedUrlMatch[1].replace(/\\\//g, '/');
        console.log(`[DramaFull] Found signedUrl: ${signedUrl}`);

        // Fetch signedUrl to get video sources
        const linkResponse = await axios.get(signedUrl, { headers: HEADERS, timeout: 10000 });
        const linkData = linkResponse.data;

        if (!linkData.success || !linkData.video_source) {
            console.error('[DramaFull] Failed to get link data or no video sources');
            return [];
        }

        const streams = [];
        const sources = linkData.video_source;
        const subtitles = [];

        // Handle subtitles if present
        if (linkData.sub) {
            for (const quality in linkData.sub) {
                const subList = linkData.sub[quality];
                if (Array.isArray(subList)) {
                    subList.forEach(subPath => {
                        let subUrl = subPath;
                        if (!subUrl.startsWith('http')) {
                            subUrl = DRAMAFULL_BASE + subUrl;
                        }
                        subtitles.push({
                            url: subUrl,
                            language: 'English' // Usually English, but might need better detection
                        });
                    });
                }
            }
        }

        for (const quality in sources) {
            const videoUrl = sources[quality];
            const streamTitle = formatTitle(
                filmTitle,
                quality + 'p',
                season,
                episode,
                subtitles.length > 0 ? `${subtitles.length} Subs` : ''
            );

            streams.push({
                name: "DramaFull",
                title: streamTitle,
                url: videoUrl,
                quality: quality + 'p',
                subtitles: subtitles,
                type: videoUrl.includes('.m3u8') ? 'hls' : 'mp4',
                headers: {
                    ...HEADERS,
                    'Referer': watchUrl
                },
                provider: "DramaFull"
            });
        }

        return streams;

    } catch (e) {
        console.error('[DramaFull] getStreams failed:', e.message);
        return [];
    }
}

module.exports = { getStreams };
