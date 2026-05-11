const CryptoJS = require("crypto-js");

const AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const ALLANIME_BASE = "https://allanime.day";
const ALLANIME_API = "https://api.allanime.day/api";

// ═══════════════════════════════════════════════════
// HELPER: Similarity
// ═══════════════════════════════════════════════════
function getSimilarity(s1, s2) {
    if (!s1 || !s2) return 0;
    const n1 = s1.toLowerCase().replace(/[^a-z0-9]/g, '');
    const n2 = s2.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (n1 === n2) return 1.0;
    if (n1.length < 2 || n2.length < 2) return 0;

    const getBigrams = (str) => {
        const bigrams = new Set();
        for (let i = 0; i < str.length - 1; i++) {
            bigrams.add(str.substring(i, i + 2));
        }
        return bigrams;
    };

    const b1 = getBigrams(n1);
    const b2 = getBigrams(n2);
    let intersect = 0;
    for (const bi of b1) {
        if (b2.has(bi)) intersect++;
    }
    return (2 * intersect) / (b1.size + b2.size);
}

// ═══════════════════════════════════════════════════
// HELPER: Decryption
// ═══════════════════════════════════════════════════
function decryptProviderId(encodedId) {
    const map = {
        '79': 'A', '7a': 'B', '7b': 'C', '7c': 'D', '7d': 'E', '7e': 'F', '7f': 'G', '70': 'H',
        '71': 'I', '72': 'J', '73': 'K', '74': 'L', '75': 'M', '76': 'N', '77': 'O', '68': 'P',
        '69': 'Q', '6a': 'R', '6b': 'S', '6c': 'T', '6d': 'U', '6e': 'V', '6f': 'W', '60': 'X',
        '61': 'Y', '62': 'Z',
        '59': 'a', '5a': 'b', '5b': 'c', '5c': 'd', '5d': 'e', '5e': 'f', '5f': 'g', '50': 'h',
        '51': 'i', '52': 'j', '53': 'k', '54': 'l', '55': 'm', '56': 'n', '57': 'o', '48': 'p',
        '49': 'q', '4a': 'r', '4b': 's', '4c': 't', '4d': 'u', '4e': 'v', '4f': 'w', '40': 'x',
        '41': 'y', '42': 'z',
        '08': '0', '09': '1', '0a': '2', '0b': '3', '0c': '4', '0d': '5', '0e': '6', '0f': '7',
        '00': '8', '01': '9',
        '15': '-', '16': '.', '67': '_', '46': '~', '02': ':', '17': '/', '07': '?', '1b': '#',
        '63': '[', '65': ']', '78': '@', '19': '!', '1c': '$', '1e': '&', '10': '(', '11': ')',
        '12': '*', '13': '+', '14': ',', '03': ';', '05': '=', '1d': '%'
    };
    let decrypted = '';
    for (let i = 0; i < encodedId.length; i += 2) {
        const hex = encodedId.substring(i, i + 2);
        decrypted += map[hex] || hex;
    }
    // Clean double slashes, fix /clock -> /clock.json
    return decrypted.replace(/([^:])\/\//g, '$1/').replace('/clock', '/clock.json');
}


// AES-256-CTR key = SHA256('Xot36i3lK3:v1') — matches upstream ani-cli
const AES_KEY = CryptoJS.SHA256('Xot36i3lK3:v1');

function decryptToBeParsed(blob) {
    // Format: 1 byte tag | 12 bytes IV | ciphertext | 16 bytes GCM tag
    // crypto-js can't do GCM, but CTR mode works without auth verification
    const raw = CryptoJS.enc.Base64.parse(blob);
    const rawBytes = raw.toString(CryptoJS.enc.Hex);
    
    // raw bytes layout: [tag(1)] [iv(12)] [ciphertext(n)] [gcm_tag(16)]
    // hex: each byte = 2 hex chars
    const ivHex = rawBytes.substring(2, 2 + 24);     // 12 bytes IV = 24 hex chars, skip 1 byte tag
    const ctHex = rawBytes.substring(2 + 24, rawBytes.length - 32); // skip tag+IV, drop last 16 bytes GCM tag
    
    if (!ctHex || ctHex.length === 0) return null;
    
    // AES-256-CTR: IV is 12-byte nonce + 4-byte counter (starting at 2)
    const ctrIvHex = ivHex + '00000002';
    const iv = CryptoJS.enc.Hex.parse(ctrIvHex);
    const ciphertext = CryptoJS.enc.Hex.parse(ctHex);
    const cipherParams = CryptoJS.lib.CipherParams.create({ ciphertext });
    
    const decrypted = CryptoJS.AES.decrypt(cipherParams, AES_KEY, {
        iv,
        mode: CryptoJS.mode.CTR,
        padding: CryptoJS.pad.NoPadding
    });
    
    return decrypted.toString(CryptoJS.enc.Utf8);
}

// ═══════════════════════════════════════════════════
// API: AllAnime
// ═══════════════════════════════════════════════════
async function searchAnime(query, mode) {
    const translationType = mode === "dub" ? "dub" : "sub";
    const searchGql = `query( $search: SearchInput $limit: Int $page: Int $translationType: VaildTranslationTypeEnumType $countryOrigin: VaildCountryOriginEnumType ) { shows( search: $search limit: $limit page: $page translationType: $translationType countryOrigin: $countryOrigin ) { edges { _id name availableEpisodes __typename } }}`;

    const body = JSON.stringify({
        variables: {
            search: { allowAdult: false, allowUnknown: false, query: query },
            limit: 40,
            page: 1,
            translationType: translationType,
            countryOrigin: "ALL"
        },
        query: searchGql
    });

    const headers = {
        'User-Agent': AGENT,
        'Content-Type': 'application/json',
        'Referer': 'https://allmanga.to',
        'Origin': 'https://allmanga.to'
    };

    try {
        const res = await fetch(ALLANIME_API, { method: 'POST', headers, body });
        if (!res.ok) return [];
        const data = await res.json();
        const edges = data?.data?.shows?.edges || [];

        return edges.map(edge => ({
            id: edge._id,
            name: edge.name,
            episodes: (edge.availableEpisodes && edge.availableEpisodes[translationType]) || 0
        }));
    } catch (e) {
        console.error("AllAnime Search Error:", e);
        return [];
    }
}


async function getRawStreamSources(showId, episodeString, mode) {
    const translationType = mode === "dub" ? "dub" : "sub";
    const variables = {
        showId: showId,
        translationType: translationType,
        episodeString: String(episodeString)
    };

    // Use persisted query hash from upstream ani-cli (different from search hash)
    const EPISODE_HASH = "d405d0edd690624b66baba3068e0edc3ac90f1597d898a1ec8db4e5c43c00fec";
    const url = `${ALLANIME_API}?variables=${encodeURIComponent(JSON.stringify(variables))}&extensions=${encodeURIComponent(JSON.stringify({ persistedQuery: { version: 1, sha256Hash: EPISODE_HASH } }))}`;

    const headers = {
        'User-Agent': AGENT,
        'Accept': '*/*',
        'Referer': 'https://youtu-chan.com',
        'Origin': ALLANIME_BASE
    };

    try {
        const res = await fetch(url, { headers });
        if (!res.ok) { console.error("getRawStreamSources HTTP", res.status); return []; }
        const data = await res.json();

        // New encrypted format: data.data.tobeparsed
        if (data?.data?.tobeparsed) {
            const plain = decryptToBeParsed(data.data.tobeparsed);
            if (plain) {
                try {
                    const parsed = JSON.parse(plain);
                    if (parsed?.episode?.sourceUrls) return parsed.episode.sourceUrls;
                } catch (jsonErr) {
                    console.error("tobeparsed JSON parse error:", jsonErr, plain.substring(0, 100));
                }
            }
            return [];
        }

        // Legacy direct JSON
        return data?.data?.episode?.sourceUrls || [];
    } catch (e) {
        console.error("AllAnime Raw Stream Error:", e);
        return [];
    }
}

async function fetchLinksFromProvider(url) {
    try {
        // Only prepend base URL if url is a relative path (starts with /)
        const apiUrl = url.startsWith('http') ? url : (ALLANIME_BASE + url);
        const res = await fetch(apiUrl, {
            headers: {
                'User-Agent': AGENT,
                'Referer': ALLANIME_BASE + '/'
            }
        });
        if (!res.ok) return [];
        const data = await res.json();

        const links = [];
        if (data.links && Array.isArray(data.links)) {
            links.push(...data.links.map(l => ({
                url: l.link,
                quality: l.resolutionStr || 'Unknown',
                headers: { 'User-Agent': AGENT }
            })));
        } else if (data.data) {
            // New encrypted format (tobeparsed)
            const decryptedJson = decryptToBeParsed(data.data);
            try {
                const parsed = JSON.parse(decryptedJson);
                const directLinks = Array.isArray(parsed) ? parsed : (parsed.links || []);
                links.push(...directLinks.map(l => ({
                    url: l.link,
                    quality: l.resolutionStr || 'Unknown',
                    headers: { 'User-Agent': AGENT }
                })));
            } catch (jsonErr) {
                console.error("Failed to parse decrypted tobeparsed:", jsonErr);
            }
        }
        return links;
    } catch (e) {
        console.error("Fetch provider links error:", e);
        return [];
    }
}

// ═══════════════════════════════════════════════════
// ID MAPPING (TMDB -> Anilist)
// ═══════════════════════════════════════════════════
async function getAnilistId(tmdbId, type) {
    try {
        // ARM API: /api/v2/themoviedb?id={tmdbId} -> returns [{anilist, imdb, ...}]
        const url = `https://arm.haglund.dev/api/v2/themoviedb?id=${tmdbId}`;
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0 && data[0].anilist) {
                return data[0].anilist;
            }
        }
    } catch (e) {
        console.error("Mapping Error:", e);
    }
    return null;
}

// ═══════════════════════════════════════════════════
// ANILIST RESOLVER
// ═══════════════════════════════════════════════════
async function getAnilistMeta(anilistId) {
    const query = `
        query ($id: Int) {
            Media (id: $id) {
                id
                format
                episodes
                title { romaji english native }
                relations {
                    edges { relationType }
                    nodes { id format episodes type }
                }
            }
        }
    `;
    try {
        const res = await fetch("https://graphql.anilist.co", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ query, variables: { id: parseInt(anilistId) } })
        });
        if (res.ok) {
            const data = await res.json();
            return data.data?.Media;
        }
    } catch (e) { }
    return null;
}

async function resolveAnilistEpisode(anilistId, targetSeason, targetEp, type) {
    // Basic implementation: if it's movie, season 1 = absolute 1.
    // If it's TV, we follow PREQUEL relations back to the root to calculate the absolute episode if needed.
    // However, AllAnime uses absolute episodes or split names.
    const meta = await getAnilistMeta(anilistId);
    if (!meta) return { title: null, ep: targetEp };

    const title = meta.title.romaji || meta.title.english || "";
    
    // In Nuvio, since we pass TMDB, we usually get the EXACT Anilist ID for that season.
    // So the relative episode in TMDB might exactly match the relative episode in that Anilist entry.
    // E.g. TMDB Season 2, Ep 1 -> Anilist Season 2 (ID: xyz), Ep 1.
    return { title, ep: targetEp };
}

// ═══════════════════════════════════════════════════
// MAIN PROVIDER FUNCTION
// ═══════════════════════════════════════════════════
async function getStreams(id, type, season, episode) {
    // id in Nuvio is typically the TMDB ID or IMDb ID.
    // Assume Nuvio passes TMDB ID for 'id'. Let's find Anilist ID.
    const tmdbId = id;
    const anilistId = await getAnilistId(tmdbId, type);
    console.log("Anilist ID:", anilistId);

    let searchTitle = "Anime";
    let subEp = String(episode);
    let dubEp = String(episode);

    if (anilistId) {
        const resolved = await resolveAnilistEpisode(anilistId, season, episode, type);
        console.log("Resolved:", resolved);
        searchTitle = resolved.title || searchTitle;
        subEp = String(resolved.ep);
        dubEp = String(resolved.ep);
    } else {
        // Fallback title fetch from TMDB
        try {
            const res = await fetch(`https://api.themoviedb.org/3/${type === 'movie' ? 'movie' : 'tv'}/${tmdbId}?api_key=94fc7b2a9e6af14b1c78465d64e9e0d1`);
            if (res.ok) {
                const data = await res.json();
                searchTitle = data.name || data.title || searchTitle;
            }
        } catch (e) {}
    }

    console.log("Search title:", searchTitle);
    const uniqueQueries = [searchTitle];

    const [subResults, dubResults] = await Promise.all([
        searchAnime(uniqueQueries[0], "sub").catch(() => []),
        searchAnime(uniqueQueries[0], "dub").catch(() => [])
    ]);

    console.log(`Sub results: ${subResults.length}, Dub results: ${dubResults.length}`);

    const pickBestMatch = (results, targetTitle) => {
        if (!results || results.length === 0) return null;
        let bestSimScore = 0;
        let bestSim = null;
        for (const r of results) {
            const sim = getSimilarity(r.name, targetTitle);
            if (sim > bestSimScore) {
                bestSimScore = sim;
                bestSim = r;
            }
        }
        if (bestSim && bestSimScore > 0.4) return bestSim;
        return results[0]; // fallback
    };

    let matchSub = pickBestMatch(subResults, searchTitle);
    let matchDub = pickBestMatch(dubResults, searchTitle);

    const streams = [];

    const fetchSources = async (match, lang, ep) => {
        if (!match) return;
        const sourceUrls = await getRawStreamSources(match.id, ep, lang.toLowerCase());
        console.log(`[${lang}] Got ${sourceUrls.length} raw sources`);

        // Only try providers we can extract direct video from
        const SUPPORTED_PROVIDERS = ['Yt-mp4', 'Default', 'S-mp4', 'Uv-mp4', 'Luf-Mp4', 'Sl-mp4'];

        for (const source of sourceUrls) {
            const sourceName = source.sourceName || '';
            let resolvedUrl = source.sourceUrl;

            // Decrypt --encoded URLs
            if (resolvedUrl.startsWith('--')) {
                resolvedUrl = decryptProviderId(resolvedUrl.substring(2));
                if (!resolvedUrl) {
                    console.log(`[${lang}] Failed to decrypt ${sourceName}`);
                    continue;
                }
            }

            console.log(`[${lang}] ${sourceName}: ${resolvedUrl.substring(0, 80)}`);

            // fast4speed is a direct mp4 stream
            if (resolvedUrl.includes('fast4speed')) {
                streams.push({
                    url: resolvedUrl,
                    quality: '1080p',
                    provider: `AllAnime ${sourceName} (${lang})`,
                    headers: { 'Referer': 'https://allanime.day', 'User-Agent': AGENT }
                });
                continue;
            }

            // For /apivtwo/clock.json endpoints (Default, S-mp4, Uv-mp4, Luf-Mp4)
            if (resolvedUrl.includes('/clock.json') || resolvedUrl.includes('/apivtwo/')) {
                const fullUrl = resolvedUrl.startsWith('http') ? resolvedUrl : (ALLANIME_BASE + resolvedUrl);
                const fetchedLinks = await fetchLinksFromProvider(fullUrl);
                for (const l of fetchedLinks) {
                    const linkUrl = l.url || '';
                    if (!linkUrl) continue;

                    // Handle wixmp repackager URLs with multiple quality variants
                    const wixmpMatch = linkUrl.match(/repackager\.wixmp\.com\/([^,]+)\/((?:,[^,]+)+,?)\/mp4\/file\.mp4/);
                    if (wixmpMatch) {
                        const videoBase = wixmpMatch[1];
                        const qualList = wixmpMatch[2].split(',').filter(q => q.length > 0);
                        for (const q of qualList) {
                            streams.push({
                                url: `https://${videoBase}/${q}/mp4/file.mp4`,
                                quality: q,
                                provider: `AllAnime ${sourceName} (${lang})`,
                                headers: { 'User-Agent': AGENT }
                            });
                        }
                    } else {
                        streams.push({
                            url: linkUrl,
                            quality: l.quality || l.resolutionStr || 'Auto',
                            provider: `AllAnime ${sourceName} (${lang})`,
                            headers: Object.assign({ 'Referer': 'https://allanime.day' }, l.headers || {})
                        });
                    }
                }
                continue;
            }

            // Skip pure iframes (ok.ru, streamsb, mp4upload, etc.) — can't extract direct video
            if (source.type === 'iframe') {
                console.log(`[${lang}] Skipping iframe: ${sourceName}`);
                continue;
            }
        }
    };

    await Promise.all([
        fetchSources(matchSub, "Sub", subEp),
        fetchSources(matchDub, "Dub", dubEp)
    ]);

    // Format streams for Nuvio
    return streams.map(s => {
        let res = "Unknown";
        if (s.quality) {
            const m = s.quality.match(/\d+p/i);
            if (m) res = m[0];
            else if (s.quality.toLowerCase() === 'best') res = "1080p";
        }
        return {
            name: s.provider,
            title: `${s.provider} | ${s.quality}`,
            url: s.url,
            quality: res,
            headers: s.headers
        };
    });
}

module.exports = {
    name: "AllAnime",
    getStreams
};
