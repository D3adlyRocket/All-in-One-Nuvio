// Dahmer Movies Scraper - "First-Shot" Optimized
// Fixed: Send Help, Zootopia 2, Goat, Mercy, Peaky Blinders (2025)

console.log('[DahmerMovies] Initializing High-Speed Scraper');

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const DAHMER_MOVIES_API = 'https://a.111477.xyz';

async function makeRequest(url) {
    return fetch(url, {
        timeout: 10000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
    }).then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res;
    });
}

function parseLinks(html) {
    const links = [];
    const linkRegex = /<a[^>]*href=["']([^"']*)["'][^>]*>([^<]*)<\/a>/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
        const href = match[1];
        const text = match[2].trim();
        if (!text || href === '../' || href.includes('?C=')) continue;
        links.push({ text, href });
    }
    return links;
}

async function invokeDahmerMovies(title, year, season = null, episode = null) {
    const pathType = season === null ? 'movies' : 'tvs';
    const cleanTitle = title.replace(/:/g, '');
    
    // Based on your screenshots, the server uses "Title (Year)" almost 100% of the time.
    // We only try the two most successful variations to save time.
    const v1 = `${cleanTitle} (${year})`;
    const v2 = cleanTitle;

    const urls = [v1, v2].map(folder => {
        const enc = encodeURIComponent(folder).replace(/\(/g, '%28').replace(/\)/g, '%29');
        let u = `${DAHMER_MOVIES_API}/${pathType}/${enc}/`;
        if (season !== null) u += `Season%20${season < 10 ? '0' + season : season}/`;
        return u;
    });

    // Fire both variations at once - first one to work wins
    const results = await Promise.allSettled(urls.map(u => makeRequest(u).then(async r => ({ u, h: await r.text() }))));
    const winner = results.find(r => r.status === 'fulfilled' && r.value.h.includes('<a'));

    if (!winner) return [];

    const { u: finalBaseUrl, h: html } = winner.value;
    const paths = parseLinks(html);
    
    // Filter: Movies (All Video), TV (Specific Episode)
    const filtered = (season !== null) 
        ? paths.filter(p => {
            const s = season < 10 ? `0${season}` : `${season}`;
            const e = episode < 10 ? `0${episode}` : `${episode}`;
            return new RegExp(`(S${s}E${e}|${season}x${e}|[\\s\\.\\-_]${e}[\\s\\.\\-_]|^${e}\\s)`, 'i').test(p.text);
          })
        : paths.filter(p => /\.(mkv|mp4|avi)$/i.test(p.href));

    return filtered.map(path => {
        const resolved = new URL(path.href, finalBaseUrl).href;
        const finalUrl = decodeURIComponent(resolved).replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');

        const t = path.text.toLowerCase();
        let q = 'HD';
        if (t.includes('2160') || t.includes('4k')) q = '2160p';
        else if (t.includes('1080')) q = '1080p';
        else if (t.includes('720')) q = '720p';

        return {
            name: "DahmerMovies",
            title: `DahmerMovies ${path.text}`,
            url: finalUrl,
            quality: q,
            provider: "dahmermovies",
            filename: path.text
        };
    });
}

async function getStreams(tmdbId, mediaType = 'movie', seasonNum = null, episodeNum = null) {
    try {
        const res = await makeRequest(`https://api.themoviedb.org/3/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}?api_key=${TMDB_API_KEY}`);
        const data = await res.json();
        const title = mediaType === 'tv' ? data.name : data.title;
        const year = (mediaType === 'tv' ? data.first_air_date : data.release_date)?.substring(0, 4);
        return await invokeDahmerMovies(title, year ? parseInt(year) : null, seasonNum, episodeNum);
    } catch (e) { return []; }
}

if (typeof module !== 'undefined' && module.exports) { module.exports = { getStreams }; } 
else { global.getStreams = getStreams; }
