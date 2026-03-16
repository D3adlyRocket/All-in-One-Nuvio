/**
 * Animelok - Full Proof 2026 Edition
 * Strategy: Session Persistence + Token Extraction + CDN Header Spoofing
 */
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => { try { step(generator.next(value)); } catch (e) { reject(e); } };
    var rejected = (value) => { try { step(generator.throw(value)); } catch (e) { reject(e); } };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

var cheerio = require("cheerio-without-node-native");
var BASE_URL = "https://animelok.site";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function search(query) {
  try {
    const res = await fetch(`${BASE_URL}/search?keyword=${encodeURIComponent(query)}`, { 
      headers: { "User-Agent": USER_AGENT } 
    });
    const html = await res.text();
    const $ = cheerio.load(html);
    const results = [];
    $("a[href*='/anime/']").each((i, el) => {
      const title = $(el).find("h3, .title, .font-bold").first().text().trim();
      const href = $(el).attr("href");
      if (href && title) results.push({ title, id: href.split("/").pop().split("?")[0], type: "tv" });
    });
    return results;
  } catch (e) { return []; }
}

async function getStreams(id, type, season, episode) {
  return __async(this, null, function* () {
    let slug = id;
    if (/^\d+$/.test(id)) {
      const results = yield search(id);
      if (results.length > 0) slug = results[0].id;
    }

    try {
      const watchUrl = `${BASE_URL}/watch/${slug}?ep=${episode}`;
      
      // 1. Visit the Watch Page to get the Session and the CSRF Token
      const pageRes = yield fetch(watchUrl, { 
        headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL } 
      });
      const html = yield pageRes.text();
      
      // Extract CSRF Token - Mandatory for the API to return valid data
      const csrfToken = html.match(/"csrf-token"\s*content="([^"]+)"/)?.[1] || 
                        html.match(/token\s*:\s*"([^"]+)"/)?.[1] || "";

      // Extract the internal "Data ID" - Animelok often uses this for their source API
      const internalId = html.match(/data-id="(\d+)"/)?.[1];

      // 2. Fetch from the specific AJAX endpoint the site uses
      const apiUrl = internalId 
        ? `${BASE_URL}/api/source/${internalId}`
        : `${BASE_URL}/api/anime/${slug}/episodes/${episode}`;

      const response = yield fetch(apiUrl, {
        headers: {
          "User-Agent": USER_AGENT,
          "Referer": watchUrl,
          "X-CSRF-TOKEN": csrfToken,
          "X-Requested-With": "XMLHttpRequest",
          "Accept": "application/json"
        }
      });

      const data = yield response.json();
      const servers = data.servers || data.episode?.servers || [];
      const streams = [];

      for (const s of servers) {
        let streamUrl = s.url || s.link;
        if (!streamUrl) continue;

        // Apply specialized headers for the CDN domains you identified
        let headers = { 
            "User-Agent": USER_AGENT, 
            "Referer": BASE_URL,
            "Origin": BASE_URL 
        };

        // Kwik links require their own domain as referer or they return 403
        if (streamUrl.includes("kwik.cx")) {
            headers["Referer"] = "https://kwik.cx/";
        }

        streams.push({
          name: `Animelok - ${s.name || "Server"}`,
          url: streamUrl,
          type: streamUrl.includes(".m3u8") ? "hls" : "mp4",
          quality: "Auto",
          headers: headers
        });
      }

      return streams;
    } catch (e) {
      return [];
    }
  });
}

module.exports = { search, getStreams };
