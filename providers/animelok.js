const cheerio = require('cheerio-without-node-native');

const BASE_URL = 'https://Animelok.site';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchWithTimeout(url, options = {}, timeout = 10000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

async function search(query) {
    console.log(`[Animelok] Searching for: ${query}`);
    try {
        const searchUrl = `${BASE_URL}/search?keyword=${encodeURIComponent(query)}`;
        const response = await fetchWithTimeout(searchUrl, {
            headers: { 'User-Agent': USER_AGENT }
        });
        const html = await response.text();
        const $ = cheerio.load(html);
        const results = [];

        $('a.group.relative').each((i, el) => {
            const title = $(el).find('h3').text().trim();
            const href = $(el).attr('href');
            const poster = $(el).find('img').attr('src');
            if (href && title) {
                // Robust slug extraction
                const slug = href.includes('/anime/') ? href.split('/anime/')[1].split('?')[0].split('/')[0] : href.split('/').pop();
                results.push({
                    title,
                    id: slug,
                    poster,
                    type: 'tv'
                });
            }
        });

        return results;
    } catch (error) {
        console.error('[Animelok] Search error:', error.message);
        return [];
    }
}

const TMDB_API_KEY = '1b3113663c9004682ed61086cf967c44';

async function getTMDBDetails(id, type, retries = 3) {
    const url = `https://api.themoviedb.org/3/${type}/${id}?api_key=${TMDB_API_KEY}`;
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetchWithTimeout(url, {}, 8000);
            if (!res.ok) throw new Error(`Status ${res.status}`);
            const data = await res.json();
            return {
                title: data.name || data.title,
                year: (data.release_date || data.first_air_date || '').split('-')[0]
            };
        } catch (e) {
            console.error(`[Animelok] TMDB fetch attempt ${i + 1} failed:`, e.message);
            if (i === retries - 1) return null;
            // Wait before retry: 1s, 2s, 3s
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
    }
    return null;
}

async function getStreams(id, type, season, episode) {
    // For Animelok, 'id' can be the anime slug (e.g., 'naruto-20') or a TMDB ID
    let animeSlug = id;

    if (/^\d+$/.test(id)) {
        console.log(`[Animelok] numeric ID detected (${id}), fetching TMDB details...`);
        const details = await getTMDBDetails(id, type);
        if (details) {
            console.log(`[Animelok] TMDB Title trace: ${details.title}. Searching on Animelok...`);
            const searchResults = await search(details.title);
            if (searchResults.length > 0) {
                // Try to find a season-specific result if season > 1
                let match = searchResults[0];
                if (season > 1) {
                    const seasonSearch = searchResults.find(r =>
                        r.title.toLowerCase().includes(`season ${season}`) ||
                        r.title.toLowerCase().includes(` s${season}`)
                    );
                    if (seasonSearch) match = seasonSearch;
                }
                animeSlug = match.id;
                console.log(`[Animelok] Found matching slug: ${animeSlug} for season ${season}`);
            } else {
                console.warn(`[Animelok] No search results found for: ${details.title}`);
                return [];
            }
        } else {
            return [];
        }
    }

    const apiUrl = `${BASE_URL}/anime/${animeSlug}/episodes/${episode}`;

    console.log(`Fetching streams for ${animeSlug} episode ${episode} from ${apiUrl}...`);

    try {
        const response = await fetchWithTimeout(apiUrl, {
            headers: {
                'Referer': `${BASE_URL}/watch/${animeSlug}?ep=${episode}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json'
            }
        });

        const data = await response.json();
        const episodeData = data.episode;

        if (!episodeData || !episodeData.servers) {
            return [];
        }

        const streams = [];
        const subtitles = (episodeData.subtitles || []).map(sub => ({
            url: sub.url,
            label: sub.name,
            lang: sub.name,
            language: sub.name,
            format: sub.url.endsWith('.vtt') ? 'vtt' : 'srt'
        }));

        for (const server of episodeData.servers) {
            const serverName = server.name || 'Unknown';
            const languages = server.languages || [];
            const hasSubtitles = subtitles.length > 0;

            const commonHeaders = {
                'Referer': `${BASE_URL}/watch/${animeSlug}?ep=${episode}`,
                'User-Agent': USER_AGENT
            };

            // Handle Multi server (as-cdn)
            if (server.url.includes('zephyrflick.top') || server.url.includes('as-cdn')) {
                const videoIdMatch = server.url.match(/\/video\/([a-f0-9]{32})/);
                if (videoIdMatch) {
                    const videoId = videoIdMatch[1];
                    const stream = await extractAsCdnStream(videoId, serverName, data.anime || data.movie, season, episode, languages, hasSubtitles);
                    if (stream) {
                        const quality = stream.quality || 'Auto';
                        stream.quality = quality;
                        stream.name = `AnimeLok - ${serverName} - ${quality}`;
                        stream.subtitles = subtitles;
                        stream.headers = {
                            ...commonHeaders,
                            'Referer': `https://as-cdn21.top/video/${videoId}`
                        };
                        streams.push(stream);
                    }
                }
            }
            // Handle direct HLS servers (often as JSON string)
            else if (server.url.startsWith('[') && server.url.includes('.m3u8')) {
                try {
                    const sources = JSON.parse(server.url);
                    for (const source of sources) {
                        let url = source.url;
                        const quality = source.quality || 'Auto';
                        streams.push({
                            name: `AnimeLok - ${serverName} - ${quality}`,
                            quality: quality,
                            title: formatTitle(data.anime || data.movie, quality, season, episode, languages, hasSubtitles),
                            url: url,
                            type: 'hls',
                            headers: commonHeaders,
                            subtitles
                        });
                    }
                } catch (e) {
                    console.error('Failed to parse direct HLS sources:', e.message);
                }
            }
            // Handle other direct m3u8 links (often master playlists)
            else if (server.url.includes('.m3u8')) {
                let masterUrl = server.url;
                streams.push({
                    name: `AnimeLok - ${serverName} - Auto`,
                    quality: 'Auto',
                    title: formatTitle(data.anime || data.movie, 'Auto', season, episode, languages, hasSubtitles),
                    url: masterUrl,
                    type: 'hls',
                    headers: commonHeaders,
                    subtitles
                });

                // Resolve individual qualities
                try {
                    const resolved = await resolveHlsPlaylist(server.url, commonHeaders);
                    if (resolved && resolved.variants && resolved.variants.length > 0) {
                        for (const variant of resolved.variants) {
                            let vUrl = variant.url;
                            const extraInfo = variant.extraInfo ? ` | ${variant.extraInfo}` : '';
                            streams.push({
                                name: `AnimeLok - ${serverName} - ${variant.quality}`,
                                quality: variant.quality,
                                title: formatTitle(data.anime || data.movie, variant.quality, season, episode, languages, hasSubtitles, extraInfo),
                                url: vUrl,
                                type: 'hls',
                                headers: commonHeaders,
                                subtitles
                            });
                        }
                    }
                } catch (e) {
                    console.error('HLS resolution failed:', e.message);
                }
            }
        }
        return streams;
    } catch (e) {
        console.error('getStreams failed:', e.message);
        return [];
    }
}

async function extractAsCdnStream(videoId, serverName, animeInfo, season, episode, languages, hasSubtitles) {
    const embedUrl = `https://as-cdn21.top/video/${videoId}`;
    const apiUrl = `https://as-cdn21.top/player/index.php?data=${videoId}&do=getVideo`;

    try {
        const response = await fetchWithTimeout(apiUrl, {
            method: 'POST',
            body: `hash=${videoId}&r=${encodeURIComponent(BASE_URL)}/`,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': embedUrl,
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const data = await response.json();
        if (data && data.videoSource) {
            return {
                name: `AnimeLok - ${serverName} - Auto`,
                quality: 'Auto',
                title: formatTitle(animeInfo, 'Auto', season, episode, languages, hasSubtitles),
                url: data.videoSource,
                type: 'hls'
            };
        }
    } catch (e) {
        console.error(`Failed to extract from as-cdn (${videoId}):`, e.message);
    }
    return null;
}

function formatTitle(animeInfo, quality, season, episode, languages, hasSubtitles, extraInfo = '') {
    const title = (animeInfo && animeInfo.title) ? animeInfo.title : 'Unknown';
    const s = String(season || 1).padStart(2, '0');
    const e = String(episode || 1).padStart(2, '0');
    const epLabel = ` - S${s} E${e}`;

    let langStr = languages.join('/') || 'Unknown';
    if (hasSubtitles) langStr += ' + ESub';

    // ToonHub style format:
    // Animelok (Quality)
    // 📹: Title - S01 E01
    // 🎧: Languages [| ExtraInfo]
    return `Animelok (${quality})
\u{1F4F9}: ${title}${epLabel}
\u{1F3A7}: ${langStr}${extraInfo}`;
}

function parseCodecs(codecString) {
    if (!codecString) return "";
    const codecs = codecString.split(',').map(c => c.trim().toLowerCase());
    const info = [];

    for (const codec of codecs) {
        if (codec.startsWith('avc')) info.push('H.264');
        else if (codec.startsWith('hev') || codec.startsWith('hvc')) info.push('H.265');
        else if (codec.startsWith('mp4a')) info.push('AAC');
        else if (codec.startsWith('ec-3')) info.push('E-AC3');
        else if (codec.startsWith('ac-3')) info.push('AC3');
    }

    return info.join('/');
}

async function resolveHlsPlaylist(masterUrl, headers = {}) {
    try {
        const response = await fetchWithTimeout(masterUrl, { headers }, 5000);
        if (!response.ok) return null;

        const content = await response.text();
        if (!content.includes('#EXTM3U') || !content.includes('#EXT-X-STREAM-INF')) return null;

        const variants = [];
        const lines = content.split('\n');

        // Extract audio info
        const audioInfo = {};
        const audioMatches = content.matchAll(/#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="([^"]+)",NAME="([^"]+)"/g);
        for (const match of audioMatches) {
            audioInfo[match[1]] = match[2];
        }

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

                // Extract codecs
                const codecMatch = line.match(/CODECS="([^"]+)"/i);
                const codecStr = codecMatch ? parseCodecs(codecMatch[1]) : "";

                // Extract audio group
                const audioMatch = line.match(/AUDIO="([^"]+)"/i);
                const audioName = audioMatch ? audioInfo[audioMatch[1]] : "";

                let extraInfo = codecStr;
                if (audioName) extraInfo += (extraInfo ? ` | ${audioName}` : audioName);

                let j = i + 1;
                while (j < lines.length && (lines[j].trim().startsWith('#') || !lines[j].trim())) {
                    j++;
                }

                if (j < lines.length) {
                    let variantPath = lines[j].trim();
                    if (variantPath) {
                        let variantUrl = variantPath;
                        if (!variantUrl.startsWith('http')) {
                            const lastSlash = masterUrl.lastIndexOf('/');
                            const baseUrl = masterUrl.substring(0, lastSlash + 1);
                            variantUrl = baseUrl + variantUrl;
                        }
                        if (!variants.some(v => v.url === variantUrl)) {
                            variants.push({ url: variantUrl, quality, extraInfo });
                        }
                    }
                }
                i = j;
            }
        }
        return { variants };
    } catch (e) {
        return null;
    }
}

module.exports = {
    search,
    getStreams
};
