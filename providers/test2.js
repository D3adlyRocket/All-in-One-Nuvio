"use strict";

const PROVIDER_NAME = "OnlyKDrama";
const SITE_URL = "https://onlykdrama.top";
const TMDB_URL = "https://www.themoviedb.org";
const FILEPRESS_ORIGIN = "https://new2.filepress.wiki";

const DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  "Referer": SITE_URL + "/"
};

// --- CORE UTILS ---

async function fetchText(url) {
  const res = await fetch(url, { headers: DEFAULT_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

async function fetchJson(url, body, referer) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...DEFAULT_HEADERS,
      "Content-Type": "application/json",
      "Origin": FILEPRESS_ORIGIN,
      "Referer": referer,
      "X-Requested-With": "XMLHttpRequest"
    },
    body: JSON.stringify(body)
  });
  return await res.json();
}

// --- NUVIO BUILDER ---

function buildStream(title, url, quality) {
  return {
    name: PROVIDER_NAME,
    title: `${title}\n[FilePress - ${quality || "HD"}]`,
    url: url,
    behaviorHints: {
      notWebReady: true,
      proxyHeaders: {
        "common": {
          "Referer": FILEPRESS_ORIGIN + "/",
          "Origin": FILEPRESS_ORIGIN,
          "User-Agent": DEFAULT_HEADERS["User-Agent"]
        }
      }
    }
  };
}

// --- THE FIXES ---

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    // 1. Get Title from TMDB
    const tmdbRes = await fetch(`${TMDB_URL}/${mediaType === "movie" ? "movie" : "tv"}/${tmdbId}`);
    const tmdbHtml = await tmdbRes.text();
    const titleMatch = tmdbHtml.match(/<meta property="og:title" content="(.*?)"/i);
    let title = titleMatch ? titleMatch[1].split('(')[0].trim() : "";
    
    if (!title) return [];

    // 2. Search OnlyKDrama (Try full title, then fallback to partial)
    let searchHtml = await fetchText(`${SITE_URL}/?s=${encodeURIComponent(title)}`);
    
    // 3. Extract all possible post links
    // OnlyKDrama search results usually look like: <div class="result-item">...href="URL"...
    const postLinks = [];
    const linkRegex = /href="(https:\/\/onlykdrama\.top\/(movies|drama)\/[^"]+)"/gi;
    let match;
    while ((match = linkRegex.exec(searchHtml)) !== null) {
      postLinks.push(match[1]);
    }

    if (postLinks.length === 0) return [];

    // 4. Find the best matching link (Simple scoring)
    const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');
    const bestPostUrl = postLinks.find(link => {
        const linkSlug = link.split('/').pop().replace(/-/g, '');
        return linkSlug.includes(normalizedTitle) || normalizedTitle.includes(linkSlug);
    }) || postLinks[0];

    // 5. Fetch Post Page and find FilePress File IDs
    const postHtml = await fetchText(bestPostUrl);
    const fpRegex = /new2\.filepress\.wiki\/file\/([A-Za-z0-9]+)/gi;
    const files = [];
    let fpMatch;
    while ((fpMatch = fpRegex.exec(postHtml)) !== null) {
        files.push({ id: fpMatch[1], index: fpMatch.index });
    }

    if (files.length === 0) return [];

    // 6. Episode logic: If TV, look for "S01E01" text near the link
    let targetId = files[0].id;
    if (mediaType !== "movie") {
        const targetPattern = new RegExp(`S0?${season}E0?${episode}`, "i");
        for (const file of files) {
            // Check 150 characters around the link for the SxxExx tag
            const context = postHtml.substring(file.index - 100, file.index + 100);
            if (targetPattern.test(context)) {
                targetId = file.id;
                break;
            }
        }
    }

    // 7. Resolve FilePress Link
    const api = `${FILEPRESS_ORIGIN}/api/file/downlaod`; // Keep the typo!
    const referer = `${FILEPRESS_ORIGIN}/file/${targetId}`;

    const step1 = await fetchJson(api + "/", { id: targetId, method: "indexDownlaod", captchaValue: "" }, referer);
    if (!step1.data) return [];

    const step2 = await fetchJson(api + "2/", { id: step1.data, method: "indexDownlaod", captchaValue: "" }, referer);
    const finalUrl = step2.data || step2.url || (Array.isArray(step2.data) ? step2.data[0] : "");

    if (!finalUrl || typeof finalUrl !== "string") return [];

    return [buildStream(title, finalUrl, "1080p")];

  } catch (err) {
    console.log(`[OnlyKDrama] Error: ${err.message}`);
    return [];
  }
}

module.exports = { getStreams };
