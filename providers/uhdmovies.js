// UHDMovies Scraper (Fixed for 2026 Nuvio)
// React Native compatible

const cheerio = require("cheerio-without-node-native")

console.log("[UHDMovies] scraper loaded")

const MIRRORS = [
  "https://uhdmovies.email",
  "https://uhdmovies.fyi",
  "https://uhdmovies.zip"
]

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"

async function request(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "*/*"
    }
  })

  if (!res.ok) throw new Error("HTTP " + res.status)

  return res.text()
}

async function getWorkingDomain() {
  for (const domain of MIRRORS) {
    try {
      const r = await fetch(domain, { headers: { "User-Agent": UA } })
      if (r.ok) return domain
    } catch {}
  }

  return MIRRORS[0]
}

async function search(domain, query) {
  const url = `${domain}/?s=${encodeURIComponent(query)}`
  console.log("[UHDMovies] search:", url)

  const html = await request(url)

  const $ = cheerio.load(html)

  const results = []

  $("article, .post, .blog-item").each((i, el) => {
    const link = $(el).find("a[href*='download']").attr("href")

    if (!link) return true

    let title =
      $(el).find("h2,h3,h1").first().text().trim() ||
      $(el).find("a").first().attr("title") ||
      ""

    if (!title) return true

    const yearMatch = title.match(/\((\d{4})\)/)

    results.push({
      title: title.replace(/\(\d{4}\)/, "").trim(),
      year: yearMatch ? Number(yearMatch[1]) : null,
      url: link.startsWith("http") ? link : domain + link
    })
  })

  console.log("[UHDMovies] results:", results.length)

  return results
}

function extractQuality(text) {
  if (!text) return "Unknown"

  const t = text.toLowerCase()

  if (t.includes("2160") || t.includes("4k")) return "4K"
  if (t.includes("1080")) return "1080p"
  if (t.includes("720")) return "720p"
  if (t.includes("480")) return "480p"

  return "HD"
}

async function extractLinks(pageUrl) {
  console.log("[UHDMovies] open:", pageUrl)

  const html = await request(pageUrl)

  const $ = cheerio.load(html)

  const links = []

  $("a").each((i, el) => {
    const href = $(el).attr("href")

    if (!href) return true

    if (
      href.includes("tech.") ||
      href.includes("video-seed") ||
      href.includes("video-leech") ||
      href.includes("driveleech")
    ) {
      const text = $(el).parent().text()

      links.push({
        url: href,
        quality: extractQuality(text)
      })
    }
  })

  console.log("[UHDMovies] links:", links.length)

  return links
}

async function resolveLink(url) {
  try {
    const html = await request(url)

    const meta = html.match(/url=(https?:\/\/[^"]+)/i)

    if (meta) return meta[1]

    const direct = html.match(/https?:\/\/[^"' ]+(mkv|mp4|m3u8)/i)

    if (direct) return direct[0]

    return url
  } catch {
    return url
  }
}

module.exports = async function scraper(media) {
  try {
    const domain = await getWorkingDomain()

    const query = media.title || media.name

    const results = await search(domain, query)

    if (!results.length) return []

    const page = results[0]

    const links = await extractLinks(page.url)

    const streams = []

    for (const l of links) {
      const final = await resolveLink(l.url)

      streams.push({
        name: "UHDMovies",
        title: l.quality,
        url: final
      })
    }

    return streams
  } catch (err) {
    console.log("[UHDMovies] error:", err.message)
    return []
  }
}
