import { NETMIRROR_URL, PLATFORM_MAP, BASE_HEADERS, TMDB_API_KEY } from './constants.js';
import { bypass, getUnixTime } from './utils.js';

async function getStreams(tmdbId, mediaType, season, episode) {
    console.log(`[NetMirror] Fetching streams for ${mediaType} ${tmdbId}`);
    try {
        const cookie = await bypass();
        const cookies = `t_hash_t=${cookie}; hd=on`;

        const tmdbType = mediaType === 'tv' ? 'tv' : 'movie';
        const tmdbResp = await fetch(`https://api.themoviedb.org/3/${tmdbType}/${tmdbId}?api_key=${TMDB_API_KEY}`);
        const tmdbData = await tmdbResp.json();
        const title = mediaType === 'tv' ? tmdbData.name : tmdbData.title;

        if (!title) throw new Error("Could not fetch title from TMDB");

        const platforms = ['netflix', 'primevideo', 'hotstar', 'disney'];
        for (const platformKey of platforms) {
            const platform = PLATFORM_MAP[platformKey];
            const streams = await fetchFromPlatform(platformKey, title, mediaType, season, episode, cookies);
            if (streams && streams.length > 0) return streams;
        }

        return [];
    } catch (error) {
        console.error(`[NetMirror] Error: ${error.message}`);
        return [];
    }
}

async function fetchFromPlatform(platformKey, title, mediaType, season, episode, cookies) {
    const platform = PLATFORM_MAP[platformKey];
    const searchUrl = `${NETMIRROR_URL}${platform.search}?s=${encodeURIComponent(title)}&t=${getUnixTime()}`;
    
    const searchResp = await fetch(searchUrl, {
        headers: { ...BASE_HEADERS, Cookie: `${cookies}; ott=${platform.ott}` }
    });
    const searchData = await searchResp.json();

    if (!searchData.searchResult || searchData.searchResult.length === 0) return null;

    // Simplified: first result. A more robust implementation would check year/title similarity.
    const result = searchData.searchResult[0];
    const contentId = result.id;

    const postUrl = `${NETMIRROR_URL}${platform.post}?id=${contentId}&t=${getUnixTime()}`;
    const postResp = await fetch(postUrl, {
        headers: { ...BASE_HEADERS, Cookie: `${cookies}; ott=${platform.ott}` }
    });
    const postData = await postResp.json();

    let targetId = contentId;
    if (mediaType === 'tv') {
        const episodes = await getAllEpisodes(contentId, postData, platform, cookies);
        const targetEp = episodes.find(ep => {
            if (!ep) return false;
            const s = parseInt(ep.s.replace('S', ''));
            const e = parseInt(ep.ep.replace('E', ''));
            return s === season && e === episode;
        });

        if (targetEp) {
            targetId = targetEp.id;
        } else {
            return null;
        }
    }

    const playlistUrl = `${NETMIRROR_URL}${platform.playlist}?id=${targetId}&t=${encodeURIComponent(title)}&tm=${getUnixTime()}`;
    const playlistResp = await fetch(playlistUrl, {
        headers: { ...BASE_HEADERS, Cookie: `${cookies}; ott=${platform.ott}` }
    });
    const playlist = await playlistResp.json();

    const streams = [];
    if (Array.isArray(playlist)) {
        playlist.forEach(item => {
            if (!item.sources) return;
            item.sources.forEach(source => {
                streams.push({
                    name: `NetMirror (${platformKey.charAt(0).toUpperCase() + platformKey.slice(1)})`,
                    title: `${title} ${source.label}`,
                    url: source.file.startsWith('http') ? source.file : `${NETMIRROR_URL}${source.file.startsWith('/') ? '' : '/'}${source.file}`,
                    quality: source.label,
                    headers: { Referer: `${NETMIRROR_URL}/home`, Cookie: "hd=on" }
                });
            });
        });
    }

    return streams;
}

async function getAllEpisodes(contentId, postData, platform, cookies) {
    const episodes = [...(postData.episodes || [])].filter(e => e !== null);
    
    if (postData.nextPageShow === 1 && postData.nextPageSeason) {
        const more = await fetchEpisodesPage(contentId, postData.nextPageSeason, 2, platform, cookies);
        episodes.push(...more);
    }

    if (postData.season && postData.season.length > 1) {
        // Handle multiple seasons
        for (let i = 0; i < postData.season.length - 1; i++) {
            const season = postData.season[i];
            const more = await fetchEpisodesPage(contentId, season.id, 1, platform, cookies);
            episodes.push(...more);
        }
    }

    return episodes;
}

async function fetchEpisodesPage(contentId, seasonId, page, platform, cookies) {
    const episodes = [];
    let pg = page;
    while (true) {
        const url = `${NETMIRROR_URL}${platform.episodes}?s=${seasonId}&series=${contentId}&t=${getUnixTime()}&page=${pg}`;
        const resp = await fetch(url, {
            headers: { ...BASE_HEADERS, Cookie: `${cookies}; ott=${platform.ott}` }
        });
        const data = await resp.json();
        if (data.episodes) {
            episodes.push(...data.episodes.filter(e => e !== null));
        }
        if (data.nextPageShow === 0) break;
        pg++;
    }
    return episodes;
}

module.exports = { getStreams };
