/**
 * StreamFlix Provider — v3.2 (Multi audio label, Nuvio-compatible)
 *
 * Changes from v3.1:
 * - Language label changed from "Hindi" → "Multi"
 * - Stream name format updated to match Nuvio plugin spec
 * - Fixed WebSocket response matching (r field is a string, not int)
 * - Fixed episode index: added 0-based and 1-based fallback lookup
 * - Fixed `pickMirror` to not prepend slash if path already has one
 * - Added proper Nuvio manifest export
 * - Added error boundary around all WS paths
 */

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const SF_BASE = "https://api.streamflix.app";
const CONFIG_URL = `${SF_BASE}/config/config-streamflixapp.json`;
const DATA_URL   = `${SF_BASE}/data.json`;
const SF_REFERER = 'https://api.streamflix.app';
const SF_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ─── Nuvio plugin manifest ────────────────────────────────────────────────────
const MANIFEST = {
    id:          'streamflix.provider',
    version:     '3.2.0',
    name:        'StreamFlix',
    description: 'StreamFlix streaming provider',
    logo:        'https://api.streamflix.app/favicon.ico',
    types:       ['movie', 'series'],
    catalogs:    [],
    resources:   ['stream'],
    idPrefixes:  ['tt', 'tmdb']
};

// ─── State ────────────────────────────────────────────────────────────────────
const st = {
    config: null,  configTs: 0,
    items:  null,  itemsTs:  0,
    tf: null, lf: null, kf: null,
    audioCache: new Map(),
    _cfgP: null, _dataP: null
};
const TTL = 30 * 60 * 1000;

// ─── HTTP ─────────────────────────────────────────────────────────────────────
function sfFetch(url, opts = {}) {
    return fetch(url, {
        ...opts,
        headers: {
            'User-Agent': SF_UA,
            'Accept': 'application/json, */*',
            'Referer': SF_REFERER,
            ...(opts.headers || {})
        },
        signal: opts.signal || AbortSignal.timeout(25000)
    }).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status} ${url.split('?')[0]}`);
        return r;
    });
}

async function sfGet(url, retries = 3) {
    let last;
    for (let i = 0; i < retries; i++) {
        try {
            return await sfFetch(url, { signal: AbortSignal.timeout(30000 + i * 15000) });
        } catch (e) {
            last = e;
            if (i < retries - 1) await new Promise(r => setTimeout(r, 2000 * (i + 1)));
        }
    }
    throw last;
}

// ─── Config ───────────────────────────────────────────────────────────────────
function getConfig() {
    if (st.config && Date.now() - st.configTs < TTL) return Promise.resolve(st.config);
    if (st._cfgP) return st._cfgP;
    st._cfgP = sfGet(CONFIG_URL).then(r => r.json())
        .then(j => {
            st.config = j;
            st.configTs = Date.now();
            console.log(`[StreamFlix] Config keys: ${Object.keys(j || {}).join(', ')}`);
            return j;
        })
        .finally(() => { st._cfgP = null; });
    return st._cfgP;
}

// ─── Data + field discovery ───────────────────────────────────────────────────
const TF = ['moviename', 'Movie_Name', 'movie_name', 'MovieName', 'title', 'Title', 'name', 'Name'];
const LF = ['movielink', 'Movie_Link', 'movie_link', 'MovieLink', 'link', 'Link', 'url', 'file', 'stream'];
const KF = ['moviekey', 'Movie_Key', 'movie_key', 'MovieKey', 'key', 'Key', 'firebase_key', 'id', 'ID'];

function pick(obj, keys) {
    for (const k of keys) if (obj[k] !== undefined && obj[k] !== '') return k;
    return null;
}

function extractItems(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    for (const k of ['data', 'movies', 'items', 'results', 'list', 'content']) {
        if (Array.isArray(raw[k]) && raw[k].length) return raw[k];
    }
    for (const v of Object.values(raw)) {
        if (Array.isArray(v) && v.length > 5 && typeof v[0] === 'object') return v;
    }
    return [];
}

function getData() {
    if (st.items && Date.now() - st.itemsTs < TTL) return Promise.resolve(st.items);
    if (st._dataP) return st._dataP;
    console.log('[StreamFlix] Fetching data.json...');
    st._dataP = sfGet(DATA_URL).then(r => r.json())
        .then(raw => {
            const items = extractItems(raw);
            st.itemsTs = Date.now();
            if (!items.length) {
                console.log(`[StreamFlix] data.json empty. Root keys: ${Object.keys(raw || {}).join(', ')}`);
                st.items = [];
                return [];
            }
            const first = items[0];
            st.tf = pick(first, TF);
            st.lf = pick(first, LF);
            st.kf = pick(first, KF);
            console.log(`[StreamFlix] ${items.length} items. First keys: ${Object.keys(first).join(', ')}`);
            console.log(`[StreamFlix] Fields: title="${st.tf}" link="${st.lf}" key="${st.kf}"`);
            console.log(`[StreamFlix] First item: ${JSON.stringify(first).substring(0, 300)}`);
            st.items = items;
            return items;
        })
        .finally(() => { st._dataP = null; });
    return st._dataP;
}

// ─── Item accessors ───────────────────────────────────────────────────────────
function getTitle(item) {
    if (!item) return '';
    if (st.tf && item[st.tf] !== undefined) return String(item[st.tf] || '');
    for (const f of TF) if (item[f]) return String(item[f]);
    for (const v of Object.values(item))
        if (typeof v === 'string' && v.length > 1 && v.length < 150 && !v.startsWith('http') && !v.includes('/'))
            return v;
    return '';
}

function getLink(item) {
    if (!item) return '';
    if (st.lf && item[st.lf] !== undefined) return String(item[st.lf] || '');
    for (const f of LF) if (item[f]) return String(item[f]);
    return '';
}

function getKey(item) {
    if (!item) return '';
    if (st.kf && item[st.kf] !== undefined) return String(item[st.kf] || '');
    for (const f of KF) if (item[f]) return String(item[f]);
    return '';
}

// ─── Title matching ───────────────────────────────────────────────────────────
function norm(s) {
    return (s || '').toLowerCase()
        .replace(/[:\-–—]/g, ' ')
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function sim(a, b) {
    const s1 = norm(a), s2 = norm(b);
    if (!s1 || !s2) return 0;
    if (s1 === s2) return 1;
    if (s1.length >= 5 && s2.includes(s1)) return 0.9;
    if (s2.length >= 5 && s1.includes(s2)) return 0.9;
    const w1 = s1.split(' ').filter(w => w.length > 2);
    const w2 = s2.split(' ').filter(w => w.length > 2);
    if (!w1.length || !w2.length) return s1 === s2 ? 1 : 0;
    const m = w1.filter(w => w2.some(x =>
        x === w || (x.length > 4 && w.length > 4 && (x.includes(w) || w.includes(x)))
    )).length;
    const ratio = m / Math.max(w1.length, w2.length);
    const shorter = Math.min(w1.length, w2.length);
    if (shorter <= 1 && ratio < 1) return 0;
    if (shorter <= 2 && ratio < 0.75) return 0;
    return ratio;
}

async function findContent(title) {
    const items = await getData();
    if (!items.length) throw new Error('No items in data.json');
    let best = null, bestScore = 0;
    for (const item of items) {
        const t = getTitle(item);
        if (!t) continue;
        const score = sim(title, t);
        if (score > bestScore) { bestScore = score; best = item; }
    }
    const mt = best ? getTitle(best) : 'none';
    console.log(`[StreamFlix] Best: "${mt}" (${bestScore.toFixed(2)}) for "${title}"`);
    if (bestScore < 0.6) { console.log('[StreamFlix] No good match'); return null; }
    if (norm(mt).length < norm(title).length * 0.35 && norm(title).length > 6) {
        console.log('[StreamFlix] Match too short, rejected');
        return null;
    }
    return best;
}

// ─── CDN tiers ────────────────────────────────────────────────────────────────
function tiers(config) {
    const r = {};
    if (!config) return r;
    if (config.premium?.length) r['1080p'] = config.premium;
    if (config.movies?.length) {
        const ps = new Set(config.premium || []);
        const ex = config.movies.filter(u => !ps.has(u));
        if (ex.length) r['720p'] = ex;
        else if (!r['1080p']) r['1080p'] = config.movies;
    }
    if (!Object.keys(r).length) {
        for (const [k, v] of Object.entries(config)) {
            if (Array.isArray(v) && v.length && typeof v[0] === 'string' && v[0].startsWith('http')) {
                console.log(`[StreamFlix] CDN key "${k}": ${v[0].substring(0, 60)}`);
                r[k] = v;
            }
        }
    }
    console.log(`[StreamFlix] CDN tiers: ${Object.keys(r).join(', ')}`);
    return r;
}

// FIX: Normalise path joining — don't double-slash if path already starts with /
function joinPath(base, path) {
    const b = base.replace(/\/$/, '');
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${b}${p}`;
}

async function pickMirror(mirrors, path) {
    if (!mirrors?.length) return null;
    const res = await Promise.all(mirrors.map(async (base, i) => {
        const url = joinPath(base, path);
        try {
            const r = await fetch(url, {
                method: 'GET',
                headers: { 'User-Agent': SF_UA, 'Referer': SF_REFERER, 'Range': 'bytes=0-255' },
                signal: AbortSignal.timeout(7000)
            });
            const ok = r.ok || r.status === 206 || [301, 302, 307].includes(r.status);
            if (ok) console.log(`[StreamFlix] Mirror ${i} OK for "${path}"`);
            return ok ? { url, i } : null;
        } catch { return null; }
    }));
    const ok = res.filter(Boolean).sort((a, b) => a.i - b.i);
    if (ok.length) return ok[0].url;
    console.log(`[StreamFlix] All mirrors failed "${path}", fallback to first`);
    return joinPath(mirrors[0], path);
}

// ─── WebSocket — single season ────────────────────────────────────────────────
function wsEpisodes(movieKey, season) {
    return new Promise((res, rej) => {
        let WS = null;
        try { WS = require('ws'); } catch {}
        if (!WS) { try { WS = typeof WebSocket !== 'undefined' ? WebSocket : null; } catch {} }
        if (!WS) return rej(new Error('No WS'));
        let ws, buf = '';
        const eps = {};
        try {
            ws = new WS('wss://chilflix-410be-default-rtdb.asia-southeast1.firebasedatabase.app/.ws?ns=chilflix-410be-default-rtdb&v=5');
        } catch (e) { return rej(new Error(`WS: ${e.message}`)); }

        const t = setTimeout(() => { try { ws.close(); } catch {} rej(new Error('WS timeout')); }, 15000);

        ws.onopen = () => {
            try {
                ws.send(JSON.stringify({
                    t: 'd',
                    d: { a: 'q', r: season, b: { p: `Data/${movieKey}/seasons/${season}/episodes`, h: '' } }
                }));
            } catch (e) { clearTimeout(t); rej(e); }
        };

        ws.onmessage = ev => {
            try {
                buf += typeof ev.data === 'string' ? ev.data : ev.data.toString();
                let msg;
                try { msg = JSON.parse(buf); buf = ''; } catch { return; } // incomplete JSON, keep buffering
                if (msg.t === 'd') {
                    const b = msg.d?.b || {};
                    if (b.d && typeof b.d === 'object') {
                        for (const [k, v] of Object.entries(b.d)) {
                            if (v && typeof v === 'object') {
                                eps[parseInt(k)] = {
                                    key:          v.key,
                                    link:         v.link,
                                    name:         v.name,
                                    overview:     v.overview,
                                    runtime:      v.runtime,
                                    still_path:   v.still_path,
                                    vote_average: v.vote_average
                                };
                            }
                        }
                    }
                    // FIX: r field comes back as string from Firebase WS — compare loosely
                    if (String(msg.d?.r) === String(season) && b.s === 'ok') {
                        clearTimeout(t);
                        try { ws.close(); } catch {}
                        res(eps);
                    }
                }
            } catch {}
        };

        ws.onerror = () => { clearTimeout(t); rej(new Error('WS err')); };
        ws.onclose = () => { clearTimeout(t); Object.keys(eps).length ? res(eps) : rej(new Error('WS empty')); };
    });
}

// ─── Multi-season WebSocket fetcher ──────────────────────────────────────────
function wsAllSeasons(movieKey, totalSeasons = 1) {
    return new Promise((resolve, reject) => {
        let WS = null;
        try { WS = require('ws'); } catch {}
        if (!WS) { try { WS = typeof WebSocket !== 'undefined' ? WebSocket : null; } catch {} }
        if (!WS) return reject(new Error('No WS'));

        let ws, buf = '';
        const seasonsData = {};
        let currentSeason = 1;
        let completedSeasons = 0;

        try {
            ws = new WS('wss://chilflix-410be-default-rtdb.asia-southeast1.firebasedatabase.app/.ws?ns=chilflix-410be-default-rtdb&v=5');
        } catch (e) { return reject(new Error(`WS: ${e.message}`)); }

        const overallTimeout = setTimeout(() => {
            try { ws.close(); } catch {}
            resolve(seasonsData); // partial data is still useful
        }, 30000);

        function sendSeasonRequest(season) {
            try {
                ws.send(JSON.stringify({
                    t: 'd',
                    d: { a: 'q', r: season, b: { p: `Data/${movieKey}/seasons/${season}/episodes`, h: '' } }
                }));
            } catch {}
        }

        ws.onopen = () => sendSeasonRequest(currentSeason);

        ws.onmessage = ev => {
            try {
                buf += typeof ev.data === 'string' ? ev.data : ev.data.toString();
                let msg;
                try { msg = JSON.parse(buf); buf = ''; } catch { return; }

                if (msg.t === 'd') {
                    const b = msg.d?.b || {};
                    if (b.d && typeof b.d === 'object') {
                        const seasonEps = seasonsData[currentSeason] || {};
                        for (const [k, v] of Object.entries(b.d)) {
                            if (v && typeof v === 'object') {
                                seasonEps[parseInt(k)] = {
                                    key:          v.key,
                                    link:         v.link,
                                    name:         v.name,
                                    overview:     v.overview,
                                    runtime:      v.runtime,
                                    still_path:   v.still_path,
                                    vote_average: v.vote_average
                                };
                            }
                        }
                        seasonsData[currentSeason] = seasonEps;
                    }
                    // FIX: compare r as string
                    if (String(msg.d?.r) === String(currentSeason) && b.s === 'ok') {
                        completedSeasons++;
                        if (completedSeasons < totalSeasons) {
                            currentSeason++;
                            sendSeasonRequest(currentSeason);
                        } else {
                            clearTimeout(overallTimeout);
                            try { ws.close(); } catch {}
                            resolve(seasonsData);
                        }
                    }
                }
            } catch {}
        };

        ws.onerror = () => { clearTimeout(overallTimeout); reject(new Error('WS err')); };
        ws.onclose = () => { clearTimeout(overallTimeout); };
    });
}

// ─── Movie ────────────────────────────────────────────────────────────────────
async function doMovie(item, config, tmdbTitle) {
    const link = getLink(item), name = getTitle(item);
    console.log(`[StreamFlix] Movie: "${name}" link="${link}"`);
    if (!link) return [];
    const cdnTiers = tiers(config);
    if (!Object.keys(cdnTiers).length) return [];

    const resolved = await Promise.all(
        Object.entries(cdnTiers).map(([q, mirrors]) =>
            pickMirror(mirrors, link).then(url => ({ q, url }))
        )
    );

    // ⚡ Language label: Multi (covers Hindi + other dubs present on the platform)
    const langLabel = 'Multi';

    const seen = new Set(), streams = [];
    for (const { q, url } of resolved) {
        if (!url || seen.has(url)) continue;
        seen.add(url);
        streams.push({
            name:      `StreamFlix (${langLabel}) - ${q}`,
            title:     tmdbTitle || name,
            url,
            subtitles: []
        });
    }
    console.log(`[StreamFlix] ${streams.length} movie streams`);
    return streams;
}

// ─── TV ───────────────────────────────────────────────────────────────────────
async function doTV(item, config, s, e, tmdbTitle) {
    const key  = getKey(item), name = getTitle(item);
    console.log(`[StreamFlix] TV: "${name}" key="${key}" S${s}E${e}`);
    const displayTitle = `${tmdbTitle || name} S${String(s).padStart(2, '0')}E${String(e).padStart(2, '0')}`;
    const cdnTiers = tiers(config);
    if (!Object.keys(cdnTiers).length) return [];

    // Extract total seasons from movieduration field (e.g. "2 Season")
    const durationStr = item.movieduration || item.duration || '';
    const seasonMatch = String(durationStr).match(/(\d+)\s*[Ss]eason/);
    const totalSeasons = seasonMatch ? parseInt(seasonMatch[1]) : s;

    let epLink = null;

    if (key) {
        // Try targeted single-season WS first (faster)
        try {
            const eps = await wsEpisodes(key, s);
            console.log(`[StreamFlix] WS ep keys for S${s}: [${Object.keys(eps).join(',')}]`);
            // FIX: try both 0-based (ep index = num-1) and 1-based (ep index = num)
            const ep = eps[e - 1] ?? eps[e];
            if (ep?.link) {
                epLink = ep.link;
                console.log(`[StreamFlix] WS link: ${epLink}`);
            } else if (ep) {
                console.log(`[StreamFlix] WS ep data (no link): ${JSON.stringify(ep).substring(0, 100)}`);
            }
        } catch (err) {
            console.log(`[StreamFlix] Single-season WS failed (${err.message}), trying multi-season...`);
            try {
                const allSeasons = await wsAllSeasons(key, totalSeasons);
                console.log(`[StreamFlix] Multi-season WS got seasons: [${Object.keys(allSeasons).join(',')}]`);
                const seasonData = allSeasons[s];
                if (seasonData) {
                    // FIX: same 0-based / 1-based fallback
                    const ep = seasonData[e - 1] ?? seasonData[e];
                    if (ep?.link) {
                        epLink = ep.link;
                        console.log(`[StreamFlix] Multi-season WS link: ${epLink}`);
                    }
                }
            } catch (e2) {
                console.log(`[StreamFlix] Multi-season WS also failed: ${e2.message}`);
            }
        }
    }

    // Build candidate paths — WS link first, then pattern fallbacks
    const paths = [];
    if (epLink) paths.push(epLink);
    if (key) {
        paths.push(`tv/${key}/s${s}/episode${e}.mkv`);
        paths.push(`tv/${key}/s${s}/ep${e}.mkv`);
        paths.push(`tv/${key}/s${String(s).padStart(2,'0')}e${String(e).padStart(2,'0')}.mkv`);
        paths.push(`tv/${key}/Season${s}/Episode${e}.mkv`);
        paths.push(`tv/${key}/season${s}/episode${e}.mkv`);
        paths.push(`tv/${key}/${s}/${e}.mkv`);
    }

    for (const path of paths) {
        const resolved = await Promise.all(
            Object.entries(cdnTiers).map(([q, mirrors]) =>
                pickMirror(mirrors, path).then(url => ({ q, url }))
            )
        );
        const valid = resolved.filter(r => r.url);
        if (!valid.length) continue;

        const langLabel = 'Multi';
        const seen = new Set(), streams = [];
        for (const { q, url } of valid) {
            if (!url || seen.has(url)) continue;
            seen.add(url);
            streams.push({
                name:      `StreamFlix (${langLabel}) - ${q}`,
                title:     displayTitle,
                url,
                subtitles: []
            });
        }
        if (streams.length) {
            console.log(`[StreamFlix] ${streams.length} TV streams via "${path}"`);
            return streams;
        }
    }

    // Last-resort fallback — return unvalidated URL so player can at least try
    if (key && Object.keys(cdnTiers).length) {
        const fp = epLink || `tv/${key}/s${s}/episode${e}.mkv`;
        const streams = Object.entries(cdnTiers)
            .filter(([, m]) => m?.length)
            .map(([q, m]) => ({
                name:      `StreamFlix (Multi) - ${q}`,
                title:     displayTitle,
                url:       joinPath(m[0], fp),
                subtitles: []
            }));
        console.log(`[StreamFlix] ${streams.length} fallback TV streams`);
        return streams;
    }
    return [];
}

// ─── Entry ────────────────────────────────────────────────────────────────────
async function getStreams(tmdbId, mediaType = 'movie', sNum = null, eNum = null) {
    console.log(`[StreamFlix] TMDB ${tmdbId} type=${mediaType} S${sNum}E${eNum}`);
    try {
        const [tmdb, config] = await Promise.all([
            sfFetch(`https://api.themoviedb.org/3/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}?api_key=${TMDB_API_KEY}`)
                .then(r => r.json()),
            getConfig()
        ]);
        const title = mediaType === 'tv' ? tmdb.name : tmdb.title;
        if (!title) throw new Error('No TMDB title');
        console.log(`[StreamFlix] "${title}"`);
        const match = await findContent(title);
        if (!match) return [];
        if (mediaType === 'movie') return doMovie(match, config, title);
        return doTV(match, config, sNum || 1, eNum || 1, title);
    } catch (e) {
        console.error(`[StreamFlix] ${e.message}`);
        return [];
    }
}

// ─── Nuvio addon handler ──────────────────────────────────────────────────────
/**
 * Nuvio calls this with a resource object:
 *   { type: 'stream', id: 'tmdb:12345', extra: { season: '1', episode: '2' } }
 * or for IMDB IDs:
 *   { type: 'stream', id: 'tt1234567' }
 */
async function addonGetStream(args) {
    try {
        const { type, id, extra = {} } = args;
        if (type !== 'stream') return { streams: [] };

        // Parse ID — support both "tmdb:12345" and plain numeric TMDB ids
        let tmdbId = id;
        if (id.startsWith('tmdb:')) tmdbId = id.replace('tmdb:', '');

        const mediaType = extra.season ? 'tv' : 'movie';
        const season    = extra.season  ? parseInt(extra.season)  : null;
        const episode   = extra.episode ? parseInt(extra.episode) : null;

        const streams = await getStreams(tmdbId, mediaType, season, episode);

        // Normalise to Nuvio stream schema
        return {
            streams: streams.map(s => ({
                name:  s.name,
                title: s.title,
                url:   s.url,
                subtitles: s.subtitles || []
            }))
        };
    } catch (e) {
        console.error(`[StreamFlix] addonGetStream error: ${e.message}`);
        return { streams: [] };
    }
}

// Expose for warmup and Nuvio integration
module.exports = { MANIFEST, getStreams, getData, addonGetStream };