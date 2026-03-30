
// HiAnime Scraper for Nuvio Local Scrapers

const cheerio = require('cheerio-without-node-native');

const HIANIME_APIS = [
    "https://hianime.io",
    "https://hianime.dk",
    "https://hianime.nz",
    "https://hianime.ro",
    "https://hianime.lc"
];

const AJAX_HEADERS = {
    'X-Requested-With': 'XMLHttpRequest',
    'Referer': 'https://hianime.io/',
    'User-Agent': 'Mozilla/5.0'
};

const megaHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.5',
    'Origin': 'https://megacloud.blog',
    'Referer': 'https://megacloud.blog/',
    'Connection': 'keep-alive'
};


// ================= MEGACLOUD =================

function extractMegacloud(embedUrl, effectiveType) {
    const mainUrl = 'https://megacloud.blog';

    const headers = { 'Accept': '*/*', 
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': mainUrl, 
        'User-Agent': 'Mozilla/5.0' 
    };


    return fetch(embedUrl, { headers })
        .then(r => r.ok ? r.text() : null)
        .then(page => {
            if (!page) return [];

            let nonce =
                page.match(/\b[a-zA-Z0-9]{48}\b/)?.[0] ??
                (() => {
                    const m = page.match(/\b([a-zA-Z0-9]{16})\b.*?\b([a-zA-Z0-9]{16})\b.*?\b([a-zA-Z0-9]{16})\b/);
                    return m ? m[1] + m[2] + m[3] : null;
                })();

            if (!nonce) return [];

            const id = embedUrl.split('/').pop().split('?')[0];
            const apiUrl = `${mainUrl}/embed-2/v3/e-1/getSources?id=${id}&_k=${nonce}`;

            return fetch(apiUrl, { headers })
                .then(r => r.ok ? r.json() : null)
                .then(json => {
                    if (!json?.sources?.length) return [];

                    const build = url => [{
                        url,
                        type: effectiveType,
                        subtitles: (json.tracks || [])
                            .filter(t => t.kind === 'captions' || t.kind === 'subtitles')
                            .map(t => ({ label: t.label, url: t.file }))
                    }];

                    const encoded = json.sources[0].file;
                    if (encoded.includes('.m3u8')) return build(encoded);

                    return fetch(
                        'https://raw.githubusercontent.com/yogesh-hacker/MegacloudKeys/refs/heads/main/keys.json'
                    )
                        .then(r => r.ok ? r.json() : null)
                        .then(keys => {
                            const secret = keys?.mega;
                            if (!secret) return [];

                            const decodeUrl =
                                'https://script.google.com/macros/s/AKfycbxHbYHbrGMXYD2-bC-C43D3njIbU-wGiYQuJL61H4vyy6YVXkybMNNEPJNPPuZrD1gRVA/exec';

                            const fullUrl =
                                `${decodeUrl}?encrypted_data=${encodeURIComponent(encoded)}` +
                                `&nonce=${encodeURIComponent(nonce)}` +
                                `&secret=${encodeURIComponent(secret)}`;

                            return fetch(fullUrl)
                                .then(r => r.ok ? r.text() : null)
                                .then(txt => {
                                    const m3u8 = txt?.match(/"file":"(.*?)"/)?.[1];
                                    return m3u8 ? build(m3u8) : [];
                                });
                        });
                });
        })
        .catch(() => []);
}

// ================= TMDB =================

const TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

function tmdbFetch(path) {
    return fetch(`${TMDB_BASE_URL}${path}?api_key=${TMDB_API_KEY}`)
        .then(r => r.ok ? r.json() : null);
}

function getTMDBDetails(tmdbId, type) {
    return tmdbFetch(`/${type}/${tmdbId}`).then(d => {
        if (!d) return null;
        return type === 'movie'
            ? {
                title: d.title,
                releaseDate: d.release_date,
                firstAirDate: null
            }
            : {
                title: d.name,
                releaseDate: d.first_air_date,
                firstAirDate: d.first_air_date
            };
    });
}

function getTMDBSeasonAirDate(tmdbId, season) {
    return tmdbFetch(`/tv/${tmdbId}/season/${season}`)
        .then(d => d?.air_date ?? null);
}

// ================= ANILIST / MAL =================

const ANILIST_API = 'https://graphql.anilist.co';

function tmdbToAnimeId(title, year) {
    if (!title || !year) return Promise.resolve({ idMal: null });

    return fetch(ANILIST_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query: `
            query ($search: String, $seasonYear: Int) {
              Page(perPage: 5) {
                media(search: $search, seasonYear: $seasonYear, type: ANIME) {
                  idMal
                }
              }
            }`,
            variables: { search: title, seasonYear: year }
        })
    })
        .then(r => r.ok ? r.json() : null)
        .then(j => ({ idMal: j?.data?.Page?.media?.[0]?.idMal ?? null }))
        .catch(() => ({ idMal: null }));
}

function getHiAnimeIdFromMalSync(malId) {
    return fetch(`https://api.malsync.moe/mal/anime/${malId}`)
        .then(r => r.ok ? r.json() : null)
        .then(j => {
            const z = j?.Sites?.Zoro;
            return z ? Object.values(z)[0]?.identifier ?? null : null;
        })
        .catch(() => null);
}

// ================= MAIN =================

function getStreams(tmdbId, mediaType = 'movie', season = null, episode = null) {
    return getTMDBDetails(tmdbId, mediaType)
        .then(info => {
            if (!info) return [];

            const aired =
                mediaType === 'tv' && season > 1
                    ? getTMDBSeasonAirDate(tmdbId, season)
                    : Promise.resolve(info.firstAirDate);

            return aired.then(airedDate => ({ info, airedDate }));
        })
        .then(({ info, airedDate }) => {
            const year = (airedDate || info.releaseDate)?.split('-')?.[0];
            return tmdbToAnimeId(info.title, Number(year))
                .then(ids => ({ info, ids }));
        })
        .then(({ info, ids }) => {
            if (!ids.idMal) return [];

            return getHiAnimeIdFromMalSync(ids.idMal).then(hiId => {
                if (!hiId) return [];

                const epNum = String(episode ?? 1);
                const apis = [...HIANIME_APIS].sort(() => Math.random() - 0.5);
                let chain = Promise.resolve([]);

                apis.forEach(api => {
                    chain = chain.then(res => {
                        if (res.length) return res;

                        return fetch(`${api}/ajax/v2/episode/list/${hiId}`, { headers: AJAX_HEADERS })
                            .then(r => r.ok ? r.json() : null)
                            .then(list => {
                                if (!list?.html) return [];

                                const $ = cheerio.load(list.html);
                                const epId = $('a[data-number]')
                                    .filter((_, e) => $(e).attr('data-number') === epNum)
                                    .attr('data-id');

                                if (!epId) return [];

                                return fetch(`${api}/ajax/v2/episode/servers?episodeId=${epId}`, { headers: AJAX_HEADERS })
                                    .then(r => r.ok ? r.json() : null)
                                    .then(srv => {
                                        if (!srv?.html) return [];

                                        const $$ = cheerio.load(srv.html);
                                        const servers = $$('div.server-item').map((_, e) => {
                                            const t = $$(e).attr('data-type');

                                            let effectiveType;
                                            if (t === 'raw') effectiveType = 'RAW';
                                            else if (t === 'sub') effectiveType = 'SUB';
                                            else if (t === 'dub') effectiveType = 'DUB';
                                            else effectiveType = 'UNKNOWN';

                                            return {
                                                label: $$(e).text().trim(),
                                                id: $$(e).attr('data-id'),
                                                type: effectiveType
                                            };
                                        }).get();

                                        let out = [];
                                        let sChain = Promise.resolve();

                                        servers.forEach(s => {
                                            sChain = sChain.then(() => {
                                                console.log('[HiAnime] Server:', {
                                                    label: s.label,
                                                    id: s.id,
                                                    type: s.type
                                                });

                                                return fetch(`${api}/ajax/v2/episode/sources?id=${s.id}`, {
                                                    headers: AJAX_HEADERS
                                                })
                                                    .then(r => r.ok ? r.json() : null)
                                                    .then(src => {

                                                        if (!src?.link) {
                                                            console.log('[HiAnime] No embed link for server', s.label);
                                                            return;
                                                        }

                                                        if (!src.link.includes('megacloud')) {
                                                            console.log('[HiAnime] Skipping non-megacloud server:', src.link);
                                                            return;
                                                        }

                                                        return extractMegacloud(src.link, s.type)
                                                            .then(xs => {
                                                                xs.forEach(x => {
                                                                    out.push({
                                                                        name: `⌜ HiAnime ⌟ | ${s.label} | ${s.type}`,
                                                                        title: info.title,
                                                                        url: x.url,
                                                                        quality: '1080p',
                                                                        provider: 'HiAnime',
                                                                        headers: megaHeaders,
                                                                        subtitles: x.subtitles
                                                                    });
                                                                });
                                                            });
                                                    });
                                            });
                                        });


                                        return sChain.then(() => out);
                                    });
                            });
                    });
                });

                return chain;
            });
        })
        .catch(() => []);
}

// ================= EXPORT =================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.getStreams = { getStreams };
      }
