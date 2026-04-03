"use strict";

// src/uhdmovies/index.js
var DOMAIN = "https://uhdmovies.rip";
var TMDB_API = "https://api.themoviedb.org/3";
var TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
function getBaseUrl(url) {
  if (!url) return DOMAIN;
  var match = url.match(/^(https?:\/\/[^\/]+)/);
  return match ? match[1] : DOMAIN;
}
function fixUrl(url, domain) {
  if (!url) return "";
  if (url.indexOf("http") === 0) return url;
  if (url.indexOf("//") === 0) return "https:" + url;
  if (url.indexOf("/") === 0) return domain + url;
  return domain + "/" + url;
}
function toFormEncoded(obj) {
  return Object.keys(obj).map(function(k) {
    return encodeURIComponent(k) + "=" + encodeURIComponent(obj[k] || "");
  }).join("&");
}
function stripTags(html) {
  return (html || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").trim();
}
function extractFormAction(html) {
  var m = html.match(/<form[^>]*id="landing"[^>]*action="([^"]+)"/i) || html.match(/<form[^>]*action="([^"]+)"[^>]*id="landing"/i);
  return m ? m[1] : null;
}
function extractFormInputs(html) {
  var obj = {};
  var formMatch = html.match(/<form[^>]*id="landing"[^>]*>([\s\S]*?)<\/form>/i) || html.match(/<form[^>]*>([\s\S]*?)<\/form>/i);
  var formHtml = formMatch ? formMatch[1] : html;
  var re = /<input[^>]+>/gi;
  var m;
  while ((m = re.exec(formHtml)) !== null) {
    var nameM = m[0].match(/name="([^"]+)"/i);
    var valueM = m[0].match(/value="([^"]*)"/i);
    if (nameM) obj[nameM[1]] = valueM ? valueM[1] : "";
  }
  return obj;
}
function extractScriptContaining(html, needle) {
  var re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  var m;
  while ((m = re.exec(html)) !== null) {
    if (m[1].indexOf(needle) !== -1) return m[1];
  }
  return "";
}
function extractMetaRefresh(html) {
  var m = html.match(/<meta[^>]*http-equiv="refresh"[^>]*content="([^"]+)"/i) || html.match(/<meta[^>]*content="([^"]+)"[^>]*http-equiv="refresh"/i);
  if (!m) return null;
  var urlM = m[1].match(/url=(.+)/i);
  return urlM ? urlM[1].trim() : null;
}
function extractBtnSuccessLinks(html) {
  var links = [];
  var seen = {};
  var patterns = [
    /<a[^>]*class="[^"]*btn-success[^"]*"[^>]*href="([^"]+)"/gi,
    /<a[^>]*href="([^"]+)"[^>]*class="[^"]*btn-success[^"]*"/gi
  ];
  for (var pi = 0; pi < patterns.length; pi++) {
    var re = patterns[pi];
    var m;
    while ((m = re.exec(html)) !== null) {
      if (m[1].indexOf("http") === 0 && !seen[m[1]]) {
        seen[m[1]] = true;
        links.push(m[1]);
      }
    }
  }
  return links;
}
function extractTextCenterLinks(html) {
  var links = [];
  var divRe = /<div[^>]*class="[^"]*text-center[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  var divM;
  while ((divM = divRe.exec(html)) !== null) {
    var divHtml = divM[1];
    var aRe = /<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    var aM;
    while ((aM = aRe.exec(divHtml)) !== null) {
      links.push({ href: aM[1], text: stripTags(aM[2]) });
    }
  }
  return links;
}
function extractFirstListGroupItem(html) {
  var m = html.match(/<li[^>]*class="[^"]*list-group-item[^"]*"[^>]*>([\s\S]*?)<\/li>/i);
  return m ? stripTags(m[1]) : "";
}
function extractThirdListItem(html) {
  var re = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  var count = 0;
  var m;
  while ((m = re.exec(html)) !== null) {
    count++;
    if (count === 3) return stripTags(m[1]);
  }
  return "";
}
function getIndexQuality(str) {
  if (!str) return "Unknown";
  if (/4k|uhd/i.test(str)) return "2160p";
  var m = str.match(/(\d{3,4})[pP]/);
  return m ? m[1] + "p" : "Unknown";
}
function cleanTitle(title) {
  var qualityTags = ["WEBRip", "WEB-DL", "WEB", "BluRay", "HDRip", "DVDRip", "HDTV", "CAM", "TS", "R5", "DVDScr", "BRRip", "BDRip", "DVD", "PDTV", "HD"];
  var audioTags = ["AAC", "AC3", "DTS", "MP3", "FLAC", "DD5", "EAC3", "Atmos"];
  var subTags = ["ESub", "ESubs", "Subs", "MultiSub", "NoSub", "EnglishSub", "HindiSub"];
  var codecTags = ["x264", "x265", "H264", "HEVC", "AVC"];
  var parts = title.split(/[.\-_]/);
  var startIndex = -1;
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].toLowerCase();
    for (var q = 0; q < qualityTags.length; q++) {
      if (p.indexOf(qualityTags[q].toLowerCase()) !== -1) {
        startIndex = i;
        break;
      }
    }
    if (startIndex !== -1) break;
  }
  var endIndex = -1;
  for (var j = parts.length - 1; j >= 0; j--) {
    var pp = parts[j].toLowerCase();
    var found = false;
    var allTags = subTags.concat(audioTags).concat(codecTags);
    for (var t = 0; t < allTags.length; t++) {
      if (pp.indexOf(allTags[t].toLowerCase()) !== -1) {
        found = true;
        break;
      }
    }
    if (found) {
      endIndex = j;
      break;
    }
  }
  if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
    return parts.slice(startIndex, endIndex + 1).join(".");
  } else if (startIndex !== -1) {
    return parts.slice(startIndex).join(".");
  }
  return parts.slice(-3).join(".");
}
function fetchText(url, extraHeaders) {
  var headers = Object.assign({ "User-Agent": USER_AGENT }, extraHeaders || {});
  return fetch(url, { headers, redirect: "follow" }).then(function(res) {
    return res.text();
  });
}
function fetchJson(url) {
  return fetch(url, { headers: { "User-Agent": USER_AGENT } }).then(function(res) {
    return res.json();
  });
}
function getTmdbDetails(tmdbId, mediaType) {
  var isSeries = mediaType === "series" || mediaType === "tv";
  var endpoint = isSeries ? "tv" : "movie";
  var url = TMDB_API + "/" + endpoint + "/" + tmdbId + "?api_key=" + TMDB_API_KEY;
  console.log("[UHDMovies] TMDB: " + url);
  return fetchJson(url).then(function(data) {
    if (isSeries) {
      return {
        title: data.name,
        year: data.first_air_date ? data.first_air_date.slice(0, 4) : null
      };
    }
    return {
      title: data.title,
      year: data.release_date ? data.release_date.slice(0, 4) : null
    };
  }).catch(function(err) {
    console.error("[UHDMovies] TMDB error: " + err.message);
    return null;
  });
}
function searchByTitle(title, year) {
  var query = encodeURIComponent((title + " " + (year || "")).trim());
  var url = DOMAIN + "/?s=" + query;
  console.log("[UHDMovies] Search: " + url);
  return fetchText(url).then(function(html) {
    return parseSearchResults(html);
  }).catch(function(err) {
    console.error("[UHDMovies] Search error: " + err.message);
    return [];
  });
}
function parseSearchResults(html) {
  var results = [];
  var chunks = html.split(/<article\b/i);
  for (var i = 1; i < chunks.length; i++) {
    var chunk = "<article" + chunks[i];
    var classM = chunk.match(/<article[^>]*class="([^"]*)"/i);
    if (!classM || classM[1].indexOf("gridlove-post") === -1) continue;
    var h1M = chunk.match(/<h1[^>]*class="[^"]*sanket[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
    var titleRaw = h1M ? stripTags(h1M[1]).replace(/^Download\s+/i, "") : "";
    var titleM = titleRaw.match(/^(.*\)\d*)/);
    var title = titleM ? titleM[1] : titleRaw;
    var imgDivM = chunk.match(/<div[^>]*class="[^"]*entry-image[^"]*"[^>]*>[\s\S]*?<a\s[^>]*href="([^"]+)"/i);
    var href = imgDivM ? imgDivM[1] : null;
    if (href && title) {
      results.push({ title, url: href, rawTitle: titleRaw });
    }
  }
  console.log("[UHDMovies] Results: " + results.length);
  return results;
}
function bypassHrefli(url) {
  var host = getBaseUrl(url);
  console.log("[UHDMovies] bypassHrefli: " + url);
  return fetchText(url).then(function(html) {
    var formUrl = extractFormAction(html);
    var formData = extractFormInputs(html);
    if (!formUrl) return Promise.resolve(null);
    return fetch(formUrl, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: toFormEncoded(formData)
    }).then(function(res) {
      return res.text();
    });
  }).then(function(html) {
    if (!html) return null;
    var formUrl = extractFormAction(html);
    var formData = extractFormInputs(html);
    if (!formUrl) return null;
    return fetch(formUrl, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: toFormEncoded(formData)
    }).then(function(res) {
      return res.text().then(function(t) {
        return { html: t, formData };
      });
    });
  }).then(function(result) {
    if (!result) return null;
    var script = extractScriptContaining(result.html, "?go=");
    var skTokenM = script.match(/\?go=([^"]+)/);
    if (!skTokenM) return null;
    var skToken = skTokenM[1];
    var wpHttp2 = result.formData["_wp_http2"] || "";
    return fetchText(host + "?go=" + skToken, {
      "Cookie": skToken + "=" + wpHttp2
    });
  }).then(function(html) {
    if (!html) return null;
    var driveUrl = extractMetaRefresh(html);
    return driveUrl || null;
  }).then(function(driveUrl) {
    if (!driveUrl) return null;
    return fetchText(driveUrl).then(function(html) {
      var pathM = html.match(/replace\("([^"]+)"\)/);
      if (!pathM || pathM[1] === "/404") return null;
      return fixUrl(pathM[1], getBaseUrl(driveUrl));
    });
  }).catch(function(err) {
    console.error("[UHDMovies] bypassHrefli error: " + err.message);
    return null;
  });
}
function extractVideoSeed(finallink) {
  console.log("[UHDMovies] VideoSeed: " + finallink);
  var hostM = finallink.match(/^https?:\/\/([^\/]+)/);
  var host = hostM ? hostM[1] : "video-seed.xyz";
  var tokenParts = finallink.split("?url=");
  if (tokenParts.length < 2) return Promise.resolve(null);
  var token = tokenParts[1];
  return fetch("https://" + host + "/api", {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
      "x-token": host,
      "Referer": finallink
    },
    body: "keys=" + encodeURIComponent(token)
  }).then(function(res) {
    return res.text();
  }).then(function(text) {
    var m = text.match(/url":"([^"]+)"/);
    return m ? m[1].replace(/\\\//g, "/") : null;
  }).catch(function(err) {
    console.error("[UHDMovies] VideoSeed error: " + err.message);
    return null;
  });
}
function extractInstantLink(finallink) {
  console.log("[UHDMovies] InstantLink: " + finallink);
  var hostM = finallink.match(/^https?:\/\/([^\/]+)/);
  var host = hostM ? hostM[1] : finallink.indexOf("video-leech") !== -1 ? "video-leech.pro" : "video-seed.pro";
  var tokenParts = finallink.split("url=");
  if (tokenParts.length < 2) return Promise.resolve(null);
  var token = tokenParts[1];
  return fetch("https://" + host + "/api", {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
      "x-token": host,
      "Referer": finallink
    },
    body: "keys=" + encodeURIComponent(token)
  }).then(function(res) {
    return res.text();
  }).then(function(text) {
    var m = text.match(/url":"([^"]+)"/);
    return m ? m[1].replace(/\\\//g, "/") : null;
  }).catch(function(err) {
    console.error("[UHDMovies] InstantLink error: " + err.message);
    return null;
  });
}
function extractResumeBot(url) {
  console.log("[UHDMovies] ResumeBot: " + url);
  return fetchText(url).then(function(html) {
    var tokenM = html.match(/formData\.append\('token', '([a-f0-9]+)'\)/);
    var pathM = html.match(/fetch\('\/download\?id=([a-zA-Z0-9\/+]+)'/);
    if (!tokenM || !pathM) return null;
    var token = tokenM[1];
    var path = pathM[1];
    var baseUrl = url.split("/download")[0];
    return fetch(baseUrl + "/download?id=" + path, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "*/*",
        "Origin": baseUrl,
        "Referer": url
      },
      body: "token=" + encodeURIComponent(token)
    });
  }).then(function(res) {
    if (!res) return null;
    return res.text();
  }).then(function(text) {
    if (!text) return null;
    try {
      var json = JSON.parse(text);
      return json.url && json.url.indexOf("http") === 0 ? json.url : null;
    } catch (e) {
      return null;
    }
  }).catch(function(err) {
    console.error("[UHDMovies] ResumeBot error: " + err.message);
    return null;
  });
}
function extractCFType1(url) {
  console.log("[UHDMovies] CFType1: " + url);
  return fetchText(url + "?type=1").then(function(html) {
    return extractBtnSuccessLinks(html);
  }).catch(function(err) {
    console.error("[UHDMovies] CFType1 error: " + err.message);
    return [];
  });
}
function extractResumeCloudLink(baseUrl, path) {
  console.log("[UHDMovies] ResumeCloud: " + baseUrl + path);
  return fetchText(baseUrl + path).then(function(html) {
    var links = extractBtnSuccessLinks(html);
    return links.length ? links[0] : null;
  }).catch(function(err) {
    console.error("[UHDMovies] ResumeCloud error: " + err.message);
    return null;
  });
}
function extractDriveseedPage(url) {
  console.log("[UHDMovies] Driveseed: " + url);
  var streams = [];
  return Promise.resolve().then(function() {
    if (url.indexOf("r?key=") !== -1) {
      return fetchText(url).then(function(html) {
        var redirectM = html.match(/replace\("([^"]+)"\)/);
        if (!redirectM) return html;
        var base = getBaseUrl(url);
        return fetchText(base + redirectM[1]);
      });
    }
    return fetchText(url);
  }).then(function(html) {
    var baseDomain = getBaseUrl(url);
    var qualityText = extractFirstListGroupItem(html);
    var rawFileName = qualityText.replace("Name : ", "").trim();
    var fileName = cleanTitle(rawFileName);
    var size = extractThirdListItem(html).replace("Size : ", "").trim();
    var quality = getIndexQuality(qualityText);
    var labelExtras = "";
    if (fileName) labelExtras += "[" + fileName + "]";
    if (size) labelExtras += "[" + size + "]";
    var textCenterLinks = extractTextCenterLinks(html);
    var promises = [];
    textCenterLinks.forEach(function(item) {
      var text = (item.text || "").toLowerCase();
      var href = item.href;
      if (!href) return;
      if (text.indexOf("instant download") !== -1) {
        promises.push(
          extractInstantLink(href).then(function(link) {
            if (link) streams.push({ name: "UHDMovies", title: "Driveseed Instant " + labelExtras, url: link, quality });
          })
        );
      } else if (text.indexOf("resume worker bot") !== -1) {
        promises.push(
          extractResumeBot(href).then(function(link) {
            if (link) streams.push({ name: "UHDMovies", title: "Driveseed ResumeBot " + labelExtras, url: link, quality });
          })
        );
      } else if (text.indexOf("direct links") !== -1) {
        promises.push(
          extractCFType1(baseDomain + href).then(function(links) {
            links.forEach(function(link) {
              streams.push({ name: "UHDMovies", title: "Driveseed Direct " + labelExtras, url: link, quality });
            });
          })
        );
      } else if (text.indexOf("resume cloud") !== -1) {
        promises.push(
          extractResumeCloudLink(baseDomain, href).then(function(link) {
            if (link) streams.push({ name: "UHDMovies", title: "Driveseed ResumeCloud " + labelExtras, url: link, quality });
          })
        );
      } else if (text.indexOf("cloud download") !== -1) {
        streams.push({ name: "UHDMovies", title: "Driveseed Cloud " + labelExtras, url: href, quality });
      }
    });
    return Promise.all(promises).then(function() {
      return streams;
    });
  }).catch(function(err) {
    console.error("[UHDMovies] Driveseed error: " + err.message);
    return [];
  });
}
function getMovieLinks(pageUrl) {
  console.log("[UHDMovies] Movie links: " + pageUrl);
  return fetchText(pageUrl).then(function(html) {
    var links = [];
    var entryM = html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*)/i);
    var entryHtml = entryM ? entryM[1] : html;
    var parts = entryHtml.split(/<\/?p(?:\s[^>]*)?\s*>/i);
    for (var i = 0; i < parts.length; i++) {
      if (!/\[.*\]/.test(parts[i])) continue;
      var sourceName = stripTags(parts[i]).split("Download")[0].trim();
      for (var j = i + 1; j < Math.min(i + 6, parts.length); j++) {
        var btnM = parts[j].match(/<a[^>]*class="[^"]*maxbutton-1[^"]*"[^>]*href="([^"]+)"/i) || parts[j].match(/<a[^>]*href="([^"]+)"[^>]*class="[^"]*maxbutton-1[^"]*"/i);
        if (btnM) {
          links.push({ sourceName, sourceLink: btnM[1] });
          break;
        }
      }
    }
    console.log("[UHDMovies] Movie links found: " + links.length);
    return links;
  }).catch(function(err) {
    console.error("[UHDMovies] getMovieLinks error: " + err.message);
    return [];
  });
}
function getTvEpisodeLink(pageUrl, targetSeason, targetEpisode) {
  console.log("[UHDMovies] TV S" + targetSeason + "E" + targetEpisode + ": " + pageUrl);
  return fetchText(pageUrl).then(function(html) {
    var links = [];
    var blockRe = /<(p|div)(\s[^>]*)?>[\s\S]*?<\/\1>/gi;
    var prevDetails = "";
    var currentSeason = 1;
    var m;
    while ((m = blockRe.exec(html)) !== null) {
      var blockHtml = m[0];
      var blockText = stripTags(blockHtml);
      var hasEpisodeLink = /episode/i.test(blockHtml) && /<a\b/i.test(blockHtml);
      if (hasEpisodeLink) {
        var seasonM = prevDetails.match(/(?:Season\s+|S0?)(\d+)/i);
        if (seasonM) currentSeason = parseInt(seasonM[1]);
        if (currentSeason === targetSeason) {
          var episodeLinks = [];
          var aRe = /<a\b[^>]*href="([^"]+)"[^>]*>[\s\S]*?<\/a>/gi;
          var aM;
          while ((aM = aRe.exec(blockHtml)) !== null) {
            if (/episode/i.test(aM[0])) episodeLinks.push(aM[1]);
          }
          if (targetEpisode <= episodeLinks.length && targetEpisode >= 1) {
            var link = episodeLinks[targetEpisode - 1];
            var qualityM = prevDetails.match(/(1080p|720p|480p|2160p|4K|\d+0p)/i);
            var sizeM = prevDetails.match(/(\d+(?:\.\d+)?\s*(?:MB|GB))/i);
            links.push({
              sourceLink: link,
              quality: qualityM ? qualityM[1] : "Unknown",
              size: sizeM ? sizeM[1] : null,
              details: prevDetails
            });
          }
        }
        currentSeason++;
      }
      prevDetails = blockText;
    }
    console.log("[UHDMovies] Episode links found: " + links.length);
    return links;
  }).catch(function(err) {
    console.error("[UHDMovies] getTvEpisodeLink error: " + err.message);
    return [];
  });
}
function getStreams(tmdbId, mediaType, season, episode) {
  console.log("[UHDMovies] getStreams " + mediaType + " " + tmdbId);
  var allStreams = [];
  return getTmdbDetails(tmdbId, mediaType).then(function(tmdbDetails) {
    if (!tmdbDetails) return [];
    console.log("[UHDMovies] Title: " + tmdbDetails.title + " (" + tmdbDetails.year + ")");
    return searchByTitle(tmdbDetails.title, tmdbDetails.year);
  }).then(function(searchResults) {
    if (!searchResults || searchResults.length === 0) {
      console.log("[UHDMovies] No search results");
      return [];
    }
    var isSeries = mediaType === "series" || mediaType === "tv";
    function processResult(index) {
      if (index >= searchResults.length) return Promise.resolve(allStreams);
      var result = searchResults[index];
      console.log("[UHDMovies] Processing: " + result.title);
      var linksPromise = isSeries && season && episode ? getTvEpisodeLink(result.url, season, episode) : getMovieLinks(result.url);
      return linksPromise.then(function(links) {
        var extractPromises = links.map(function(linkData) {
          var sourceLink = linkData.sourceLink;
          if (!sourceLink) return Promise.resolve([]);
          var finalLinkPromise = sourceLink.indexOf("unblockedgames") !== -1 ? bypassHrefli(sourceLink) : Promise.resolve(sourceLink);
          return finalLinkPromise.then(function(finalLink) {
            if (!finalLink) return [];
            if (finalLink.indexOf("driveseed") !== -1 || finalLink.indexOf("driveleech") !== -1) {
              return extractDriveseedPage(finalLink);
            }
            if (finalLink.indexOf("video-seed") !== -1) {
              return extractVideoSeed(finalLink).then(function(url) {
                if (!url) return [];
                return [{ name: "UHDMovies", title: "UHDMovies " + (linkData.quality || "Unknown"), url, quality: linkData.quality || "Unknown" }];
              });
            }
            return [{
              name: "UHDMovies",
              title: "UHDMovies " + (linkData.sourceName || linkData.quality || ""),
              url: finalLink,
              quality: linkData.quality || "Unknown"
            }];
          });
        });
        return Promise.all(extractPromises).then(function(results) {
          results.forEach(function(streams) {
            allStreams = allStreams.concat(streams);
          });
          return processResult(index + 1);
        });
      });
    }
    return processResult(0);
  }).catch(function(err) {
    console.error("[UHDMovies] Error: " + err.message);
    return [];
  });
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
