// Dahmer Movies Scraper - Format Column Added (MKV/MP4/M3U8)
console.log('[DahmerMovies] Initializing Scraper');

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const DAHMER_MOVIES_API = 'https://a.111477.xyz';
const DAHMER_WORKER_API = 'https://p.111477.xyz/bulk?u=';

async function makeRequest(url) {
    try {
        return await fetch(url, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': DAHMER_MOVIES_API + '/'
            }
        });
    } catch (e) { return { ok: false }; }
}

function parseLinks(html) {
    const links = [];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let match;
    while ((match = rowRegex.exec(html)) !== null) {
        const rowContent = match[1];
        const linkMatch = rowContent.match(/<a[^>]*href=["']([^"']*)["'][^>]*>([^<]*)<\/a>/i);
        const sizeMatch = rowContent.match(/<td[^>]*>(\d+(?:\.\d+)?\s?[KMGT]B)<\/td>/i);

        if (linkMatch) {
            const href = linkMatch[1];
            const text = linkMatch[2].trim();
            const size = sizeMatch ? sizeMatch[1].trim() : 'N/A';

            if (text && href !== '../' && /\.(mkv|mp4|avi|webm|m3u8)$/i.test(text)) {
                links.push({ text, href, size });
            }
        }
    }
    return links;
}

async function invokeDahmerMovies(title, year, season = null, episode = null) {
    const cleanTitle = title.replace(/:/g, '');
    const folderVariants = season !== null ? [
        `/tvs/${encodeURIComponent(cleanTitle)}/Season%20${season < 10 ? '0' + season : season}/`,
        `/tvs/${encodeURIComponent(cleanTitle)}/Season%20${season}/`
    ] : [`/movies/${encodeURIComponent(cleanTitle + ' (' + year + ')')}/`];

    let html = '';
    let activeDirUrl = '';

    for (const path of folderVariants) {
        const fullDirUrl = DAHMER_MOVIES_API + path;
        const response = await makeRequest(fullDirUrl);
        if (response.ok) {
            html = await response.text();
            activeDirUrl = fullDirUrl;
            break; 
        }
    }

    if (!html) return [];
    const paths = parseLinks(html);

    const sortedPaths = paths.sort((a, b) => {
        const a4k = /2160p|4k/i.test(a.text);
        const b4k = /2160p|4k/i.test(b.text);
        return b4k - a4k;
    });

    const results = [];
    for (const path of sortedPaths.slice(0, 5)) {
        let directUrl;
        if (path.href.startsWith('http')) {
            directUrl = path.href;
        } else if (path.href.includes('/movies/') || path.href.includes('/tvs/')) {
            directUrl = DAHMER_MOVIES_API + (path.href.startsWith('/') ? '' : '/') + path.href;
        } else {
            directUrl = activeDirUrl + path.href;
        }

        directUrl = directUrl.replace(/([^:]\/)\/+/g, "$1");
        directUrl = decodeURI(directUrl);
        let streamUrl = DAHMER_WORKER_API + encodeURI(directUrl);

        const fileName = path.text;
        
        // 1. Language Logic
        let language = "Original"; 
        const isMulti = /\b(HIN|TAM|TEL|Multi|Dual|DUB|Multi-Audio|MULTI)\b/i.test(fileName);
        const hasEngTag = /\b(Eng|English)\b/i.test(fileName);
        const isEnglishTitle = /^[a-zA-Z0-9\s?!\-:]+$/.test(title);

        if (isMulti) language = "Multi Audio";
        else if (isEnglishTitle && hasEngTag) language = "English";

        // 2. Format Logic (New Column)
        const formatMatch = fileName.match(/\.(mkv|mp4|m3u8|avi|webm)$/i);
        const fileFormat = formatMatch ? formatMatch[1].toUpperCase() : 'LINK';

        // 3. Technical Info
        const resolution = fileName.match(/\b(2160p|1080p|720p|4k)\b/i)?.[0] || '1080p';
        const fileSize = path.size !== 'N/A' ? path.size : 'N/A';
        
        let info = fileName
            .replace(/\.(mkv|mp4|avi|webm|m3u8)$/i, '')
            .replace(/[\[\]()._-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        results.push({
            name: "DahmerMovies",
            title: `📺 ${resolution}  |  🌐 ${language}  |  💾 ${fileSize}  |  🎞️ ${fileFormat}  |  ℹ️ ${info}`,
            url: streamUrl,
            quality: resolution.toLowerCase(),
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': DAHMER_MOVIES_API + '/',
                'Connection': 'keep-alive',
                'Accept': '*/*',
                'Range': 'bytes=0-'
            },
            provider: "dahmermovies"
        });
    }
    return results;
}

async function getStreams(tmdbId, mediaType = 'movie', seasonNum = null, episodeNum = null) {
    try {
        const type = mediaType === 'tv' ? 'tv' : 'movie';
        const tmdbUrl = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_API_KEY}`;
        const res = await makeRequest(tmdbUrl);
        const data = await res.json();
        const title = mediaType === 'tv' ? data.name : data.title;
        const year = (mediaType === 'tv' ? data.first_air_date : data.release_date)?.substring(0, 4);
        if (!title) return [];
        return await invokeDahmerMovies(title, year, seasonNum, episodeNum);
    } catch (e) { return []; }
}

if (typeof module !== 'undefined') module.exports = { getStreams };
else global.getStreams = getStreams;
