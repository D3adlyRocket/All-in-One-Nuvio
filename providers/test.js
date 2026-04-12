// Dahmer Movies Scraper for Nuvio Local Scrapers
// React Native compatible version

console.log('[DahmerMovies] Initializing Dahmer Movies scraper');

// Constants
const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const DAHMER_MOVIES_API = 'https://a.111477.xyz';
const TIMEOUT = 60000;

const Qualities = {
    Unknown: 0, P144: 144, P240: 240, P360: 360, P480: 480, P720: 720, P1080: 1080, P1440: 1440, P2160: 2160
};

function makeRequest(url, options = {}) {
    return fetch(url, {
        timeout: TIMEOUT,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            ...options.headers
        },
        ...options
    }).then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res;
    });
}

function getEpisodeSlug(season = null, episode = null) {
    if (season === null) return ['', ''];
    return [season < 10 ? `0${season}` : `${season}`, episode < 10 ? `0${episode}` : `${episode}`];
}

function getQualityWithCodecs(str) {
    if (!str) return 'Unknown';
    const qualityMatch = str.match(/(\d{3,4})[pP]/);
    const baseQuality = qualityMatch ? `${qualityMatch[1]}p` : 'Unknown';
    const codecs = [];
    const lowerStr = str.toLowerCase();
    if (lowerStr.includes('dv')) codecs.push('DV');
    if (lowerStr.includes('hdr10')) codecs.push('HDR10');
    else if (lowerStr.includes('hdr')) codecs.push('HDR');
    if (lowerStr.includes('remux')) codecs.push('REMUX');
    return codecs.length > 0 ? `${baseQuality} | ${codecs.join(' | ')}` : baseQuality;
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
        if (!text || href === '../' || text === '../') continue;
        let size = null;
        const sizeMatch = rowMatch[1].match(/<td[^>]*data-sort=["']?(\d+)["']?[^>]*>(\d+)<\/td>/i);
        if (sizeMatch) size = sizeMatch[2];
        links.push({ text, href, size });
    }
    return links;
}

function invokeDahmerMovies(title, year, season = null, episode = null) {
    // Clean and encode the folder name correctly
    const folderName = season === null 
        ? `${title.replace(/:/g, '')} (${year})`
        : `${title.replace(/:/g, ' -')}`;

    // Ensure base folder has encoded parens
    const encodedFolder = encodeURIComponent(folderName)
        .replace(/\(/g, '%28')
        .replace(/\)/g, '%29');

    const pathType = season === null ? 'movies' : 'tvs';
    const baseUrl = `${DAHMER_MOVIES_API}/${pathType}/${encodedFolder}/`;
    
    return makeRequest(baseUrl).then(res => res.text()).then(html => {
        const paths = parseLinks(html);
        let filteredPaths;
        
        if (season === null) {
            filteredPaths = paths.filter(path => /(1080p|2160p)/i.test(path.text));
        } else {
            const [s, e] = getEpisodeSlug(season, episode);
            const epPattern = new RegExp(`S${s}E${e}`, 'i');
            filteredPaths = paths.filter(path => epPattern.test(path.text));
        }
        
        return filteredPaths.map(path => {
            // If the scraped href is relative (just the filename), join it to baseUrl
            // If it's already a partial path like /movies/Title/file.mkv, we just use the domain
            let finalUrl;
            let fileName = path.href;

            if (fileName.startsWith('http')) {
                finalUrl = fileName.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
            } else {
                // Encode the filename and fix parens
                const encodedFile = encodeURIComponent(decodeURIComponent(fileName))
                    .replace(/\(/g, '%28')
                    .replace(/\)/g, '%29');
                
                // If the href already contains the full path from the root, don't double up
                if (fileName.startsWith('/')) {
                    finalUrl = DAHMER_MOVIES_API + encodedFile;
                } else {
                    finalUrl = baseUrl + encodedFile;
                }
            }
            
            return {
                name: "DahmerMovies",
                title: `DahmerMovies ${path.text}`,
                url: finalUrl,
                quality: getQualityWithCodecs(path.text),
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
