// uhdmovies.js
import cheerio from "cheerio";

const BASE = "https://uhdmovies.email";

// Minimal HTTP request helper
async function makeRequest(url) {
  return fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "text/html"
    }
  });
}

// Search UHDMovies for a query
async function search(query, year) {
  try {
    const url = `${BASE}/?s=${encodeURIComponent(query)}`;
    const res = await makeRequest(url);
    const html = await res.text();
    const $ = cheerio.load(html);

    const results = [];

    $("article").each((i, el) => {
      const title = $(el).find("h2").text().trim();
      const link = $(el).find("a").attr("href");
      if (!link) return;

      // Optional year filtering
      if (year && title.includes(year)) {
        results.push({ title, url: link });
      } else if (!year) {
        results.push({ title, url: link });
      }
    });

    return results;
  } catch (err) {
    console.error("[UHDMovies] Search failed:", err.message);
    return [];
  }
}

// Extract download links from movie page
async function extractDownloadLinks(movieUrl) {
  try {
    const res = await makeRequest(movieUrl);
    const html = await res.text();
    const $ = cheerio.load(html);
    const movieTitle = $("h1").first().text().trim();

    const links = [];

    $("a").each((i, el) => {
      const href = $(el).attr("href");
      if (!href) return;

      const lower = href.toLowerCase();
      if (
        lower.includes("drive") ||
        lower.includes("gdtot") ||
        lower.includes("hubcloud") ||
        lower.includes("pixeldrain") ||
        lower.includes("tech") ||
        lower.includes("download") ||
        lower.includes("video-seed") ||
        lower.includes("video-leech")
      ) {
        const blockText = $(el).closest("p, li, div").text();

        let quality = "Unknown";
        let size = "Unknown";

        const q = blockText.match(/\b(2160p|1080p|720p|480p|4K)\b/i);
        if (q) quality = q[1];

        const s = blockText.match(/\b([0-9.]+\s?(GB|MB))\b/i);
        if (s) size = s[1];

        links.push({
          title: movieTitle,
          url: href.startsWith("http") ? href : new URL(href, movieUrl).href,
          quality,
          size
        });
      }
    });

    return links;
  } catch (err) {
    console.error("[UHDMovies] Extract links failed:", err.message);
    return [];
  }
}

// Get streams for Nuvio
async function getStreams(movie) {
  try {
    const results = await search(movie.title, movie.year);
    if (!results.length) return [];

    const pageUrl = results[0].url;
    const downloads = await extractDownloadLinks(pageUrl);

    return downloads.map(d => ({
      url: d.url,
      quality: d.quality,
      size: d.size,
      type: "torrent" // can be "direct" or "torrent"
    }));
  } catch (err) {
    console.error("[UHDMovies] getStreams failed:", err.message);
    return [];
  }
}

// Export for Nuvio
export default {
  id: "uhdmovies",
  name: "UHDMovies",
  search,
  getStreams
};
