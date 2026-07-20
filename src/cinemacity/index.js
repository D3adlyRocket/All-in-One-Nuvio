// src/cinemacity/index.js
import cheerio from 'cheerio-without-node-native';
import { atobPolyfill, fetchText, extractQuality } from './utils.js';
import { MAIN_URL, HEADERS, TMDB_API_KEY } from './constants.js';

async function searchMedia(searchQuery) {
    const searchUrl = `${MAIN_URL}/?do=search&subaction=search&search_start=0&full_search=0&story=${encodeURIComponent(searchQuery)}`;
    const searchHtml = await fetchText(searchUrl);
    const $search = cheerio.load(searchHtml);
    let mediaUrl = null;

    $search('div.dar-short_item').each((i, el) => {
        if (mediaUrl) return;
        const anchor = $search(el).find('a').filter((idx, a) => ($search(a).attr('href') || "").includes('.html')).first();
        if (anchor.length) {
            mediaUrl = anchor.attr('href');
        }
    });

    if (!mediaUrl) {
        console.log(`[CinemaCity] Standard search returned no results, trying Ajax fallback search...`);
        let dleHash = null;
        const hashMatch = searchHtml.match(/dle_login_hash\s*=\s*'([^']+)'/);
        if (hashMatch) {
            dleHash = hashMatch[1];
        } else {
            const inputMatch = searchHtml.match(/name=["']dle_hash["']\s+value=["']([^"']+)["']/i) || searchHtml.match(/value=["']([^"']+)["']\s+name=["']dle_hash["']/i);
            if (inputMatch) dleHash = inputMatch[1];
        }

        if (!dleHash) {
            try {
                const homeHtml = await fetchText(MAIN_URL);
                const homeHashMatch = homeHtml.match(/dle_login_hash\s*=\s*'([^']+)'/);
                if (homeHashMatch) dleHash = homeHashMatch[1];
            } catch (err) {}
        }

        if (dleHash) {
            try {
                const res = await fetch(`${MAIN_URL}/engine/mods/dle_search/ajax.php`, {
                    method: 'POST',
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest',
                        'Origin': MAIN_URL,
                        'Referer': `${MAIN_URL}/`,
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    },
                    body: `story=${encodeURIComponent(searchQuery)}&dle_hash=${dleHash}&thisUrl=1`
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.content) {
                        const $ajax = cheerio.load(data.content);
                        $ajax('div.dle-fast_item').each((i, el) => {
                            if (mediaUrl) return;
                            const anchor = $ajax(el).find('a').filter((idx, a) => ($ajax(a).attr('href') || "").includes('.html')).first();
                            if (anchor.length) {
                                mediaUrl = anchor.attr('href');
                            }
                        });
                    }
                }
            } catch (e) {
                console.error(`[CinemaCity] Ajax search error: ${e.message}`);
            }
        }
    }
    return mediaUrl;
}

function cleanTitle(title) {
    return title
        .replace(/[^0-9A-Za-z\s._-]/g, '')
        .replace(/[\s_]+/g, '.')
        .replace(/\.+/g, '.')
        .replace(/^\.|\.$/g, '');
}

function filterSubs(subtitlesRaw, video) {
    if (!subtitlesRaw || typeof subtitlesRaw !== 'string') return '';
    const lastSlashIdx = video.lastIndexOf('/');
    const videoFilename = lastSlashIdx !== -1 ? video.substring(lastSlashIdx + 1) : video;
    const baseName = videoFilename.split('_web-dl')[0].split('_202')[0];

    const subsList = subtitlesRaw.split(',');
    const matchingSubs = [];
    subsList.forEach(s => {
        const match = s.trim().match(/\[(.+?)\](.+)/);
        if (match) {
            const subUrl = match[2];
            if (subUrl.includes(baseName)) {
                const pfIdx = subUrl.indexOf('/public_files/');
                if (pfIdx !== -1) {
                    matchingSubs.push(subUrl.substring(pfIdx + '/public_files/'.length()));
                } else {
                    matchingSubs.push(subUrl);
                }
            }
        }
    });
    return matchingSubs.join(',');
}

function makeDownloadHref(base, videoPath, audioPath, subtitlePaths, name) {
    let url = base;
    url += `?action=download`;
    url += `&video=${encodeURIComponent(videoPath)}`;
    url += `&audio=${encodeURIComponent(audioPath)}`;
    if (subtitlePaths && subtitlePaths.length > 0) {
        url += `&subtitle=${encodeURIComponent(subtitlePaths)}`;
    }
    url += `&name=${encodeURIComponent(name)}`;
    return url;
}

async function getStreams(tmdbId, mediaType, season, episode) {
    const streams = [];
    try {
        // 1. Get IMDB ID and Title from TMDB
        const tmdbUrl = `https://api.themoviedb.org/3/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;
        const tmdbRes = await fetch(tmdbUrl, { skipSizeCheck: true });
        const tmdbData = await tmdbRes.json();
        
        const imdbId = tmdbData.external_ids?.imdb_id || tmdbData.imdb_id;
        const animeTitle = mediaType === 'movie' ? tmdbData.title : tmdbData.name;
        
        if (!animeTitle && !imdbId) return [];

        // 2. Search on CinemaCity (Prefer IMDB ID for accuracy)
        const searchQuery = imdbId || animeTitle;
        console.log(`[CinemaCity] Searching for: ${searchQuery}`);
        let mediaUrl = await searchMedia(searchQuery);

        // Fallback to title search if IMDB search returned nothing or we only had animeTitle
        if (!mediaUrl && imdbId && searchQuery !== animeTitle) {
            console.log(`[CinemaCity] IMDB search failed, falling back to title search: ${animeTitle}`);
            mediaUrl = await searchMedia(animeTitle);
        }

        if (!mediaUrl) {
            console.log(`[CinemaCity] No media found for ${animeTitle}`);
            return [];
        }

        // 3. Load Media Page
        console.log(`[CinemaCity] Loading media page: ${mediaUrl}`);
        const pageHtml = await fetchText(mediaUrl);
        const $page = cheerio.load(pageHtml);
        
        // 4. Extract PlayerJS Data from scripts containing atob
        let playerConfig = null;
        $page('script').each((i, el) => {
            if (playerConfig) return;
            const html = $page(el).html() || '';
            if (html.includes('atob')) {
                const regex = /atob\s*\(\s*(['"])(.*?)\1\s*\)/g;
                let match;
                while ((match = regex.exec(html)) !== null) {
                    try {
                        const decoded = atobPolyfill(match[2]);
                        if (decoded.includes('new Playerjs(')) {
                            const configStr = decoded.split('new Playerjs(')[1].split(');')[0].trim();
                            playerConfig = JSON.parse(configStr);
                            break;
                        }
                    } catch (e) {}
                }
            }
        });

        if (!playerConfig || !playerConfig.file) {
            console.log(`[CinemaCity] Failed to extract player config`);
            return [];
        }

        let fileStr = '';
        let subtitlesStr = '';

        if (mediaType === 'tv') {
            if (Array.isArray(playerConfig.file)) {
                const seasonRegex = new RegExp(`season\\s*${season}\\b`, 'i');
                const sObj = playerConfig.file.find(f => {
                    const title = f.title || '';
                    return seasonRegex.test(title) || title.includes(`Сезон ${season}`) || title.includes(`S${season}`);
                }) || playerConfig.file[0];

                if (sObj) {
                    const episodes = sObj.folder || [];
                    if (Array.isArray(episodes)) {
                        const episodeRegex = new RegExp(`episode\\s*${episode}\\b`, 'i');
                        const eObj = episodes.find(e => {
                            const title = e.title || '';
                            return episodeRegex.test(title) || title.includes(`Серия ${episode}`) || title.includes(`E${episode}`);
                        }) || episodes[0];

                        if (eObj) {
                            fileStr = eObj.file || '';
                            subtitlesStr = eObj.subtitle || sObj.subtitle || playerConfig.subtitle || '';
                        }
                    }
                }
            }
        } else {
            // Movie
            if (Array.isArray(playerConfig.file)) {
                const fileObj = playerConfig.file.find(f => !f.folder && f.file) || playerConfig.file[0];
                if (fileObj) {
                    fileStr = fileObj.file || '';
                    subtitlesStr = fileObj.subtitle || playerConfig.subtitle || '';
                }
            } else if (typeof playerConfig.file === 'string') {
                fileStr = playerConfig.file;
                subtitlesStr = playerConfig.subtitle || '';
            }
        }

        if (!fileStr) {
            console.log(`[CinemaCity] No file string found for selection`);
            return [];
        }

        // 5. Parse subtitles
        const parsedSubtitles = [];
        if (subtitlesStr && typeof subtitlesStr === 'string') {
            subtitlesStr.split(',').forEach(entry => {
                const match = entry.trim().match(/\[(.+?)\](https?:\/\/.+)/) || 
                              entry.trim().match(/\[(.+?)\](\/.+)/);
                if (match) {
                    let subUrl = match[2];
                    if (subUrl.startsWith('/')) {
                        subUrl = `${MAIN_URL}${subUrl}`;
                    }
                    parsedSubtitles.push({
                        url: subUrl,
                        language: match[1],
                        name: match[1],
                        headers: { Referer: "https://cinemacity.cc/" }
                    });
                }
            });
        }

        // Helper to add streams
        const addStream = (url, title, quality, subtitles) => {
            if (!url || !url.startsWith('http') || url.length < 15) return;
            streams.push({
                name: "CinemaCity",
                title: title,
                url: url,
                quality: quality || extractQuality(url),
                headers: { 
                    ...HEADERS,
                    Referer: "https://cinemacity.cc/" 
                },
                subtitles: subtitles || []
            });
        };

        // 6. Process files and audio/video muxing
        if (fileStr.includes(',')) {
            const parts = fileStr.split(',').map(p => p.trim());
            const videoFiles = parts.filter(p => p.endsWith('.mp4'));
            const audioFiles = parts.filter(p => p.endsWith('.m4a'));

            if (audioFiles.length > 0) {
                const cleanedTitle = cleanTitle(animeTitle);
                
                audioFiles.forEach((audio, audioIndex) => {
                    // Extract language
                    const lastUnderAudio = audio.lastIndexOf('_');
                    const filenamePartAudio = lastUnderAudio !== -1 ? audio.substring(lastUnderAudio + 1) : audio;
                    const langRaw = filenamePartAudio.split('.m4a')[0];
                    let lang = langRaw.replace(/-/g, ' ');
                    if (lang.length > 0) {
                        lang = lang.charAt(0).toUpperCase() + lang.slice(1);
                    }

                    videoFiles.forEach(video => {
                        const lastUnderVideo = video.lastIndexOf('_');
                        const filenamePartVideo = lastUnderVideo !== -1 ? video.substring(lastUnderVideo + 1) : video;
                        const res = filenamePartVideo.split('.mp4')[0];
                        const quality = extractQuality(video);

                        let dlName = '';
                        if (mediaType === 'tv') {
                            const s = String(season).padStart(2, '0');
                            const e = String(episode).padStart(2, '0');
                            dlName = `${cleanedTitle}.S${s}E${e}.${res}.${lang.replace(/\s+/g, '.')}`;
                        } else {
                            dlName = `${cleanedTitle}.WEB-DL.${res}.${lang.replace(/\s+/g, '.')}`;
                        }

                        const subs = filterSubs(subtitlesStr, video);
                        const muxedUrl = makeDownloadHref(fileStr, video, audio, subs, dlName);
                        
                        addStream(muxedUrl, `${animeTitle} (${lang})`, quality, parsedSubtitles);
                    });
                });
            } else {
                // If there are no separate audio files, just add individual video files
                videoFiles.forEach(video => {
                    addStream(video, animeTitle, extractQuality(video), parsedSubtitles);
                });
            }
        } else {
            // Single URL (HLS master playlist or raw mp4)
            if (fileStr.includes('.urlset/master.m3u8')) {
                addStream(fileStr, animeTitle, "Auto", parsedSubtitles);
            } else {
                addStream(fileStr, animeTitle, extractQuality(fileStr), parsedSubtitles);
            }
        }

        console.log(`[CinemaCity] Successfully processed ${streams.length} streams`);
        return streams;
    } catch (error) {
        console.error(`[CinemaCity] Error in getStreams: ${error.message}`);
        return [];
    }
}

module.exports = { getStreams };
