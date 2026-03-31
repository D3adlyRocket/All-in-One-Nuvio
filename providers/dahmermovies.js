// Dahmer Movies Scraper for Nuvio Local Scrapers
// React Native compatible version

console.log('[DahmerMovies] Initializing Dahmer Movies scraper');

// Constants
const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const DAHMER_MOVIES_API = 'https://a.111477.xyz';
const TIMEOUT = 60000; // 60 seconds

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

// Helper function to make HTTP requests
function makeRequest(url, options = {}) {
    const requestOptions = {
        timeout: TIMEOUT,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Connection': 'keep-alive',
            ...options.headers
        },
        ...options
    };

    return fetch(url, requestOptions).then(function (response) {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response;
    });
}

// Utility functions
function getEpisodeSlug(season = null, episode = null) {
    if (season === null && episode === null) {
        return ['', ''];
    }
    const seasonSlug = season < 10 ? `0${season}` : `${season}`;
    const episodeSlug = episode < 10 ? `0${episode}` : `${episode}`;
    return [seasonSlug, episodeSlug];
}

function getIndexQuality(str) {
    if (!str) return Qualities.Unknown;
    const match = str.match(/(\d{3,4})[pP]/);
    return match ? parseInt(match[1]) : Qualities.Unknown;
}

// Extract quality with codec information
function getQualityWithCodecs(str) {
    if (!str) return 'Unknown';

    // Extract base quality (resolution)
    const qualityMatch = str.match(/(\d{3,4})[pP]/);
    const baseQuality = qualityMatch ? `${qualityMatch[1]}p` : 'Unknown';

    // Extract codec information (excluding HEVC and bit depth)
    const codecs = [];
    const lowerStr = str.toLowerCase();

    // HDR formats
    if (lowerStr.includes('dv') || lowerStr.includes('dolby vision')) codecs.push('DV');
    if (lowerStr.includes('hdr10+')) codecs.push('HDR10+');
    else if (lowerStr.includes('hdr10') || lowerStr.includes('hdr')) codecs.push('HDR');

    // Special formats
    if (lowerStr.includes('remux')) codecs.push('REMUX');
    if (lowerStr.includes('imax')) codecs.push('IMAX');

    // Combine quality with codecs using pipeline separator
    if (codecs.length > 0) {
        return `${baseQuality} | ${codecs.join(' | ')}`;
    }

    return baseQuality;
}

function getIndexQualityTags(str, fullTag = false) {
    if (!str) return '';

    if (fullTag) {
        const match = str.match(/(.*)\.(?:mkv|mp4|avi)/i);
        return match ? match[1].trim() : str;
    } else {
        const match = str.match(/\d{3,4}[pP]\.?(.*?)\.(mkv|mp4|avi)/i);
        return match ? match[1].replace(/\./g, ' ').trim() : str;
    }
}

function encodeUrl(url) {
    try {
        return encodeURI(url);
    } catch (e) {
        return url;
    }
}

function decode(input) {
    try {
        return decodeURIComponent(input);
    } catch (e) {
        return input;
    }
}

// Function to resolve redirects and get the final direct URL
function resolveFinalUrl(startUrl) {
    const maxRedirects = 5;
    const referer = 'https://a.111477.xyz/';
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

    function attemptResolve(url, count, retryCount = 0) {
        if (count >= maxRedirects) {
            return Promise.resolve(url.includes('111477.xyz') ? null : url);
        }

        return fetch(url, {
            method: 'HEAD',
            redirect: 'manual',
            headers: {
                'User-Agent': userAgent,
                'Referer': referer
            }
        }).then(function (response) {
            // Handle rate limiting
            if (response.status === 429 && retryCount < 3) {
                const waitTime = (retryCount + 1) * 3000;
                return new Promise(resolve => setTimeout(resolve, waitTime))
                    .then(() => attemptResolve(url, count, retryCount + 1));
            }

            if (response.status >= 300 && response.status < 400) {
                const location = response.headers.get('location');
                if (location) {
                    const nextUrl = location.startsWith('http') 
                        ? location 
                        : new URL(location, url).href;
                    return attemptResolve(nextUrl, count + 1);
                }
            }
            
            // If we are at a 200 OK but still on the redirector domain, it's a failure
            if (url.includes('111477.xyz')) {
                return null;
            }

            return url;
        }).catch(function (error) {
            return null;
        });
    }

    return attemptResolve(startUrl, 0);
}

// Format file size from bytes to human readable format
function formatFileSize(sizeText) {
    if (!sizeText) return null;

    // If it's already formatted (contains GB, MB, etc.), return as is
    if (/\d+(\.\d+)?\s*(GB|MB|KB|TB)/i.test(sizeText)) {
        return sizeText;
    }

    // If it's a number (bytes), convert to human readable
    const bytes = parseInt(sizeText);
    if (isNaN(bytes)) return sizeText;

    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';

    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = (bytes / Math.pow(1024, i)).toFixed(2);

    return `${size} ${sizes[i]}`;
}

// Parse HTML using basic string manipulation (React Native compatible)
function parseLinks(html) {
    const links = [];

    // Parse table rows to get both links and file sizes
    const rowRegex = /<tr[^>]*>(.*?)<\/tr>/gis;
    let rowMatch;

    while ((rowMatch = rowRegex.exec(html)) !== null) {
        const rowContent = rowMatch[1];

        // Extract link from the row
        const linkMatch = rowContent.match(/<a[^>]*href=["']([^"']*)["'][^>]*>([^<]*)<\/a>/i);
        if (!linkMatch) continue;

        const href = linkMatch[1];
        const text = linkMatch[2].trim();

        // Skip parent directory and empty links
        if (!text || href === '../' || text === '../') continue;

        // Extract file size from the same row - try multiple patterns
        let size = null;

        // Pattern 1: DahmerMovies specific - data-sort attribute with byte size
        const sizeMatch1 = rowContent.match(/<td[^>]*data-sort=["']?(\d+)["']?[^>]*>/i);
        if (sizeMatch1) {
            size = sizeMatch1[1]; // Use the data-sort value (bytes)
        }

        // Pattern 2: Standard Apache directory listing with filesize class
        if (!size) {
            const sizeMatch2 = rowContent.match(/<td[^>]*class=["']filesize["'][^>]*[^>]*>([^<]+)<\/td>/i);
            if (sizeMatch2) {
                size = sizeMatch2[1].trim();
            }
        }

        // Pattern 3: Look for size in any td element after the link (formatted sizes)
        if (!size) {
            const sizeMatch3 = rowContent.match(/<\/a><\/td>\s*<td[^>]*>([^<]+(?:GB|MB|KB|B|\d+\s*(?:GB|MB|KB|B)))<\/td>/i);
            if (sizeMatch3) {
                size = sizeMatch3[1].trim();
            }
        }

        // Pattern 4: Look for size anywhere in the row (more permissive)
        if (!size) {
            const sizeMatch4 = rowContent.match(/(\d+(?:\.\d+)?\s*(?:GB|MB|KB|B|bytes?))/i);
            if (sizeMatch4) {
                size = sizeMatch4[1].trim();
            }
        }

        links.push({ text, href, size });
    }

    // Fallback to simple link parsing if table parsing fails
    if (links.length === 0) {
        const linkRegex = /<a[^>]*href=["']([^"']*)["'][^>]*>([^<]*)<\/a>/gi;
        let match;

        while ((match = linkRegex.exec(html)) !== null) {
            const href = match[1];
            const text = match[2].trim();
            if (text && href && href !== '../' && text !== '../') {
                links.push({ text, href, size: null });
            }
        }
    }

    return links;
}

// Main Dahmer Movies fetcher function
function invokeDahmerMovies(title, year, season = null, episode = null) {
    console.log(`[DahmerMovies] Searching for: ${title} (${year})${season ? ` Season ${season}` : ''}${episode ? ` Episode ${episode}` : ''}`);

    // Construct URL based on content type (with proper encoding)
    const encodedUrl = season === null
        ? `${DAHMER_MOVIES_API}/movies/${encodeURIComponent(title.replace(/:/g, '') + ' (' + year + ')')}/`
        : `${DAHMER_MOVIES_API}/tvs/${encodeURIComponent(title.replace(/:/g, ' -'))}/${encodeURIComponent('Season ' + season)}/`;

    console.log(`[DahmerMovies] Fetching from: ${encodedUrl}`);

    return makeRequest(encodedUrl).then(function (response) {
        return response.text();
    }).then(function (html) {
        console.log(`[DahmerMovies] Response length: ${html.length}`);

        // Parse HTML to extract links
        const paths = parseLinks(html);
        console.log(`[DahmerMovies] Found ${paths.length} total links`);

        // Filter based on content type
        let filteredPaths;
        if (season === null) {
            // For movies, filter by quality (1080p or 2160p)
            filteredPaths = paths.filter(path =>
                /(1080p|2160p)/i.test(path.text)
            );
            console.log(`[DahmerMovies] Filtered to ${filteredPaths.length} movie links (1080p/2160p only)`);
        } else {
            // For TV shows, filter by season and episode
            const [seasonSlug, episodeSlug] = getEpisodeSlug(season, episode);
            const episodePattern = new RegExp(`S${seasonSlug}E${episodeSlug}`, 'i');
            filteredPaths = paths.filter(path =>
                episodePattern.test(path.text)
            );
            console.log(`[DahmerMovies] Filtered to ${filteredPaths.length} TV episode links (S${seasonSlug}E${episodeSlug})`);
        }

        if (filteredPaths.length === 0) {
            console.log('[DahmerMovies] No matching content found');
            return [];
        }

        // Function to sleep/delay
        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

        // Process results sequentially to avoid 429 rate limiting
        const results = [];
        const maxLinks = 10; // Increased to 10 links
        const pathsToProcess = filteredPaths.slice(0, maxLinks);
        
        async function processPaths() {
            for (const path of pathsToProcess) {
                const quality = getIndexQuality(path.text);
                const qualityWithCodecs = getQualityWithCodecs(path.text);
                const tags = getIndexQualityTags(path.text);

                // Construct proper URL
                let fullUrl;
                if (path.href.startsWith('http')) {
                    try {
                        const url = new URL(path.href);
                        fullUrl = `${url.protocol}//${url.host}${url.pathname}`;
                    } catch (error) {
                        fullUrl = path.href.replace(/ /g, '%20');
                    }
                } else if (path.href.startsWith('/')) {
                    const urlObj = new URL(DAHMER_MOVIES_API);
                    const encodedPath = path.href.split('/').map(p => encodeURIComponent(decode(p))).join('/');
                    fullUrl = `${urlObj.protocol}//${urlObj.host}${encodedPath}`;
                } else {
                    const baseUrl = encodedUrl.endsWith('/') ? encodedUrl : encodedUrl + '/';
                    const encodedPath = path.href.split('/').map(p => encodeURIComponent(decode(p))).join('/');
                    fullUrl = baseUrl + encodedPath;
                }

                try {
                    const finalUrl = await resolveFinalUrl(fullUrl);
                    if (finalUrl) {
                        results.push({
                            name: "DahmerMovies",
                            title: path.text,
                            url: finalUrl,
                            quality: qualityWithCodecs,
                            size: formatFileSize(path.size),
                            type: "direct",
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer',
                                'Referer': DAHMER_MOVIES_API + '/'
                            },
                            provider: "dahmermovies",
                            filename: path.text
                        });
                    }
                    
                    // 1.5 second delay to balance speed and safety
                    await sleep(1500);
                } catch (e) {
                    console.log(`[DahmerMovies] Failed to resolve ${fullUrl}`);
                }
            }
            
            // Sort by quality (highest first)
            results.sort((a, b) => {
                const qualityA = getIndexQuality(a.filename);
                const qualityB = getIndexQuality(b.filename);
                return qualityB - qualityA;
            });

            console.log(`[DahmerMovies] Successfully processed ${results.length} streams`);
            return results;
        }

        return processPaths();

    }).catch(function (error) {
        if (error.name === 'AbortError') {
            console.log('[DahmerMovies] Request timeout - server took too long to respond');
        } else {
            console.log(`[DahmerMovies] Error: ${error.message}`);
        }
        return [];
    });
}

// Main function to get streams for TMDB content
function getStreams(tmdbId, mediaType = 'movie', seasonNum = null, episodeNum = null) {
    console.log(`[DahmerMovies] Fetching streams for TMDB ID: ${tmdbId}, Type: ${mediaType}${seasonNum ? `, S${seasonNum}E${episodeNum}` : ''}`);

    // Get TMDB info
    const tmdbUrl = `https://api.themoviedb.org/3/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}?api_key=${TMDB_API_KEY}`;
    return makeRequest(tmdbUrl).then(function (tmdbResponse) {
        return tmdbResponse.json();
    }).then(function (tmdbData) {
        const title = mediaType === 'tv' ? tmdbData.name : tmdbData.title;
        const year = mediaType === 'tv' ? tmdbData.first_air_date?.substring(0, 4) : tmdbData.release_date?.substring(0, 4);

        if (!title) {
            throw new Error('Could not extract title from TMDB response');
        }

        console.log(`[DahmerMovies] TMDB Info: "${title}" (${year})`);

        // Call the main scraper function
        return invokeDahmerMovies(
            title,
            year ? parseInt(year) : null,
            seasonNum,
            episodeNum
        );

    }).catch(function (error) {
        console.error(`[DahmerMovies] Error in getStreams: ${error.message}`);
        return [];
    });
}

// Export the main function
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    // For React Native environment
    global.getStreams = getStreams;
}
