// Dahmer Movies Scraper for Nuvio Local Scrapers
// React Native compatible version

console.log('[DahmerMovies] Initializing Dahmer Movies scraper');

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const DAHMER_MOVIES_API = 'https://a.111477.xyz';
const TIMEOUT = 60000;

function makeRequest(url, options = {}) {
    return fetch(url, {
        timeout: TIMEOUT,
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
    const rowRegex = /<tr[^>]*>(.*?)<\/tr>/gis;
    let rowMatch;
    while ((rowMatch = rowRegex.exec(html)) !== null) {
        const linkMatch = rowMatch[1].match(/<a[^>]*href=["']([^"']*)["'][^>]*>([^<]*)<\/a>/i);
        if (!linkMatch) continue;
        const href = linkMatch[1];
        const text = linkMatch[2].trim();
        // Ignore parent directory or empty links
        if (!text || href === '../' || text === '../' || href.includes('?C=')) continue;
        links.push({ text, href });
    }
    return links;
}

function invokeDahmerMovies(title, year, season = null, episode = null) {
    const folderName = season === null 
        ? `${title.replace(/:/g, '')} (${year})`
        : `${title.replace(/:/g, ' -')}`;

    const pathType = season === null ? 'movies' : 'tvs';
    // The request URL used to browse the directory
    const requestUrl = `${DAHMER_MOVIES_API}/${pathType}/${encodeURIComponent(folderName)}/`;
    
    return makeRequest(requestUrl).then(res => res.text()).then(html => {
        const paths = parseLinks(html);
        let filteredPaths;
        
        if (season === null) {
            filteredPaths = paths.filter(path => /(1080p|2160p)/i.test(path.text));
        } else {
            const s = season < 10 ? `0${season}` : `${season}`;
            const e = episode < 10 ? `0${episode}` : `${episode}`;
            const epPattern = new RegExp(`S${s}E${e}`, 'i');
            filteredPaths = paths.filter(path => epPattern.test(path.text));
        }
        
        return filteredPaths.map(path => {
            // Use the built-in URL constructor to resolve the link.
            // If path.href is "/movies/...", it automatically ignores the folder part of requestUrl.
            // If path.href is "filename.mkv", it correctly appends it.
            let resolvedUrl = new URL(path.href, requestUrl).href;

            // Final step: Apply your specific encoding requirements for ( ) and spaces
            // We decode first to ensure we aren't double-encoding % characters
            const finalUrl = decodeURIComponent(resolvedUrl)
                .replace(/ /g, '%20')
                .replace(/\(/g, '%28')
                .replace(/\)/g, '%29');
            
            return {
                name: "DahmerMovies",
                title: `DahmerMovies ${path.text}`,
                url: finalUrl,
                quality: path.text.includes('2160p') ? '2160p' : '1080p',
                provider: "dahmermovies",
                filename: path.text
            };
        });
    }).catch(() => []);
}

function getStreams(tmdbId, mediaType = 'movie', seasonNum = null, episodeNum = null) {
    const tmdbUrl = `https://api.themoviedb.org/3/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}?api_key=${TMDB_API_KEY}`;
    return makeRequest(tmdbUrl).then(res => res.json()).then(data => {
        const title = mediaType === 'tv' ? data.name : data.title;
        const year = (mediaType === 'tv' ? data.first_air_date : data.release_date)?.substring(0, 4);
        return invokeDahmerMovies(title, year ? parseInt(year) : null, seasonNum, episodeNum);
    }).catch(() => []);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.getStreams = getStreams;
}
