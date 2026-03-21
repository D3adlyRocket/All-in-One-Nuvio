// providers/multisource.js
// Multi-Source Provider (Warez + SuperFlix fallback)

const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36';

// ------------------ HLS PARSER ------------------

async function extractHlsVariants(url) {
    try {
        const res = await fetch(url);
        const text = await res.text();

        const lines = text.split('\n');
        const variants = [];

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('RESOLUTION=')) {
                const match = lines[i].match(/RESOLUTION=\d+x(\d+)/);
                const nextLine = lines[i + 1];

                if (match && nextLine && !nextLine.startsWith('#')) {
                    variants.push({
                        quality: parseInt(match[1]),
                        url: new URL(nextLine, url).href
                    });
                }
            }
        }

        return variants.sort((a, b) => b.quality - a.quality);

    } catch {
        return [];
    }
}

// ------------------ QUALITY DETECTOR ------------------

function detectQuality(url) {
    if (!url) return 720;
    if (url.includes('2160') || url.includes('4k')) return 2160;
    if (url.includes('1440')) return 1440;
    if (url.includes('1080')) return 1080;
    if (url.includes('720')) return 720;
    return 720;
}

// ------------------ WAREZ / EMBED SCRAPER ------------------

async function getWarezStreams(tmdbId, mediaType, season, episode) {
    const results = [];

    try {
        // 🔥 Try vidsrc new embed (better than old chain)
        let embedUrl;

        if (mediaType === 'movie') {
            embedUrl = `https://vidsrc.xyz/embed/movie/${tmdbId}`;
        } else {
            embedUrl = `https://vidsrc.xyz/embed/tv/${tmdbId}/${season}/${episode}`;
        }

        const res = await fetch(embedUrl, { headers: { 'User-Agent': UA } });
        const html = await res.text();

        // Extract ALL iframe sources (important)
        const matches = [...html.matchAll(/<iframe[^>]+src=["']([^"']+)/g)];

        for (const m of matches) {
            let src = m[1];

            if (src.startsWith('//')) src = 'https:' + src;

            try {
                const iframeRes = await fetch(src, { headers: { 'User-Agent': UA } });
                const iframeHtml = await iframeRes.text();

                // Look for m3u8 directly
                const m3u8Match = iframeHtml.match(/https?:\/\/[^"']+\.m3u8[^"']*/);

                if (m3u8Match) {
                    const masterUrl = m3u8Match[0];

                    const variants = await extractHlsVariants(masterUrl);

                    if (variants.length > 0) {
                        variants.forEach(v => {
                            results.push({
                                name: `Warez ${v.quality}p`,
                                url: v.url,
                                quality: v.quality,
                                headers: { 'User-Agent': UA }
                            });
                        });
                    } else {
                        results.push({
                            name: `Warez ${detectQuality(masterUrl)}p`,
                            url: masterUrl,
                            quality: detectQuality(masterUrl),
                            headers: { 'User-Agent': UA }
                        });
                    }
                }

            } catch {}
        }

    } catch {}

    return results;
}

// ------------------ SUPERFLIX (FALLBACK) ------------------

async function getSuperflixFallback(tmdbId, mediaType, season, episode) {
    try {
        const { getStreams } = require('./superflix');
        return await getStreams(tmdbId, mediaType, season, episode);
    } catch {
        return [];
    }
}

// ------------------ MAIN ------------------

async function getStreams(tmdbId, mediaType, season = 1, episode = 1) {
    let results = [];

    // 🔥 1. Try Warez-style sources FIRST
    const warez = await getWarezStreams(tmdbId, mediaType, season, episode);
    results.push(...warez);

    // 🔁 2. Fallback to SuperFlix if needed
    if (results.length === 0) {
        const fallback = await getSuperflixFallback(tmdbId, mediaType, season, episode);
        results.push(...fallback);
    }

    // 🎯 Sort best quality first
    results.sort((a, b) => b.quality - a.quality);

    return results;
}

module.exports = { getStreams };
