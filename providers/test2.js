const axios = require("axios")

const BASE = "https://kdiflix.xyz"

// ----------------------
// Generic helpers
// ----------------------

function extractM3U8(text) {
    return [...text.matchAll(/https?:\/\/[^"' ]+\.m3u8[^"' ]*/g)].map(m => m[0])
}

function getQuality(url) {
    if (url.includes("2160")) return "4K"
    if (url.includes("1440")) return "1440p"
    if (url.includes("1080")) return "1080p"
    if (url.includes("720")) return "720p"
    return "auto"
}

async function fetch(url, referer = BASE) {
    try {
        const res = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0",
                "Referer": referer
            },
            timeout: 10000
        })
        return res.data
    } catch {
        return null
    }
}

// ----------------------
// HOST EXTRACTORS
// ----------------------

// 🎯 VIDSRC
async function extractVidsrc(url) {
    const html = await fetch(url, url)
    if (!html) return []

    let streams = extractM3U8(html)

    // sometimes nested
    const inner = html.match(/src:\s*"(https:[^"]+)"/)
    if (inner) {
        const nested = await fetch(inner[1], url)
        if (nested) streams.push(...extractM3U8(nested))
    }

    return streams
}

// 🎯 VIDROCK
async function extractVidrock(url) {
    const html = await fetch(url, url)
    if (!html) return []

    let streams = extractM3U8(html)

    // vidrock often hides sources in eval-packed JS
    const packed = html.match(/eval\(function\(p,a,c,k,e,d\).*?\)\)/s)
    if (packed) {
        const unpacked = packed[0] // (basic fallback, real unpack optional)
        streams.push(...extractM3U8(unpacked))
    }

    return streams
}

// 🎯 GENERIC (fallback)
async function extractGeneric(url) {
    const html = await fetch(url, url)
    if (!html) return []

    return extractM3U8(html)
}

// ----------------------
// ROUTER
// ----------------------

async function routeExtractor(url) {
    if (url.includes("vidsrc")) return await extractVidsrc(url)
    if (url.includes("vidrock")) return await extractVidrock(url)

    return await extractGeneric(url)
}

// ----------------------
// MAIN PAGE SCRAPER
// ----------------------

async function extractFromKDIFlix(url) {
    const html = await fetch(url)
    if (!html) return []

    let streams = []

    // Direct m3u8
    streams.push(...extractM3U8(html))

    // Find iframes
    const iframes = [...html.matchAll(/<iframe[^>]+src="([^"]+)"/g)]
        .map(m => m[1])

    // Process all iframes in parallel
    const results = await Promise.all(
        iframes.map(link => routeExtractor(link))
    )

    results.forEach(arr => streams.push(...arr))

    return streams
}

// ----------------------
// NUVIO ENTRY
// ----------------------

async function getStreams({ id, type, season, episode }) {
    try {
        let url

        if (id.startsWith("http")) {
            url = id
        } else {
            if (type === "movie") {
                url = `${BASE}/movies/${id}`
            } else {
                url = `${BASE}/episodes/${id}-season-${season}-episode-${episode}`
            }
        }

        let raw = await extractFromKDIFlix(url)

        // fallback known working hosts
        if (raw.length === 0) {
            raw.push(
                "https://flickfox.p2pstream.vip/hls/.../master.m3u8",
                "https://tmstr2.neonhorizonworkshops.com/.../master.m3u8"
            )
        }

        // dedupe
        const unique = [...new Set(raw)]

        return unique.map(u => ({
            url: u,
            type: "hls",
            quality: getQuality(u)
        }))

    } catch (err) {
        console.log(err)
        return []
    }
}

module.exports = {
    name: "KDIFlix PRO",
    getStreams
}
