// SFlix Provider for Nuvio Media Player
// Author: The-cpu-max
// Patched: April 2026
// Notes:
// - Fixed server parsing for current SFlix HTML
// - Added fallback flow for movie pages when data-id is missing
// - Added safer source/embed handling
// - Kept BASE as sflix.ps because the domain responds and AJAX endpoints are live

var BASE = 'https://sflix.ps';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function get(url, wantJson) {
  return fetch(url, {
    headers: {
      'User-Agent': UA,
      'Referer': BASE + '/',
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': wantJson
        ? 'application/json, text/plain, */*; q=0.01'
        : 'text/html,application/xhtml+xml,*/*;q=0.9',
    },
  }).then(function(r) {
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
    return wantJson ? r.json() : r.text();
  });
}

function toSlug(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-');
}

function uniqById(list) {
  var out = [];
  var seen = {};
  for (var i = 0; i < list.length; i++) {
    var item = list[i];
    if (!item || !item.id || seen[item.id]) continue;
    seen[item.id] = true;
    out.push(item);
  }
  return out;
}

function parseServers(html) {
  var servers = [];
  var m;

  function add(id, name) {
    if (!id) return;
    servers.push({ id: id, name: (name || ('Server ' + id)).trim() });
  }

  var reA = /<a[^>]*data-id="(\d+)"[^>]*>[\s\S]{0,300}?<span[^>]*>([^<]+)<\/span>[\s\S]{0,50}?<\/a>/gi;
  while ((m = reA.exec(html)) !== null) add(m[1], m[2]);

  var reB = /<(?:li|div|a)[^>]*data-linkid="(\d+)"[^>]*>([\s\S]{0,300}?)<\/(?:li|div|a)>/gi;
  while ((m = reB.exec(html)) !== null) {
    var nmB = m[2].match(/<span[^>]*>([^<]+)<\/span>/i);
    add(m[1], nmB ? nmB[1] : null);
  }

  var reC = /<(?:li|div|a)[^>]*data-id="(\d+)"[^>]*>([\s\S]{0,300}?)<\/(?:li|div|a)>/gi;
  while ((m = reC.exec(html)) !== null) {
    var nmC = m[2].match(/<span[^>]*>([^<]+)<\/span>/i);
    add(m[1], nmC ? nmC[1] : null);
  }

  var reD = /data-(?:linkid|id|server)="(\d+)"[^>]*>\s*(?:<i[^>]*><\/i>)?\s*(?:Server\s*)?(?:<span[^>]*>)?\s*([A-Za-z][A-Za-z0-9\s_-]{1,30})/gi;
  while ((m = reD.exec(html)) !== null) add(m[1], m[2]);

  servers = uniqById(servers);

  console.log('[SFlix] parseServers found=' + servers.length + ' html_len=' + (html ? html.length : 0));
  if (servers.length === 0) {
    console.log('[SFlix] server HTML preview: ' + String(html || '').substring(0, 700));
  }
  return servers;
}

function extractStream(embedUrl) {
  if (!embedUrl) return Promise.resolve(null);

  return get(embedUrl, false).then(function(html) {
    var sm = html.match(/sources\s*:\s*(\[[\s\S]{0,4000}?\])/i);
    if (sm) {
      try {
        var arr = JSON.parse(sm[1]);
        if (arr && arr.length) {
          for (var i = 0; i < arr.length; i++) {
            if (arr[i] && arr[i].file) {
              return { url: arr[i].file, fmt: arr[i].type || (arr[i].file.indexOf('.mp4') !== -1 ? 'mp4' : 'm3u8') };
            }
          }
        }
      } catch (_) {}
    }

    var fm = html.match(/"file"\s*:\s*"(https?:[^"\\]+\.m3u8[^"\\]*)"/i);
    if (fm) return { url: fm[1], fmt: 'm3u8' };

    var fm2 = html.match(/"file"\s*:\s*"(https?:[^"\\]+\.mp4[^"\\]*)"/i);
    if (fm2) return { url: fm2[1], fmt: 'mp4' };

    var src1 = html.match(/https?:[^\s"']+\.m3u8[^\s"']*/i);
    if (src1) return { url: src1[0], fmt: 'm3u8' };

    var src2 = html.match(/https?:[^\s"']+\.mp4[^\s"']*/i);
    if (src2) return { url: src2[0], fmt: 'mp4' };

    var src3 = html.match(/source\s*=\s*['"](https?:[^'"]+)['"]/i);
    if (src3) return { url: src3[1], fmt: src3[1].indexOf('.mp4') !== -1 ? 'mp4' : 'm3u8' };

    console.log('[SFlix] no stream in embed: ' + embedUrl.substring(0, 120));
    console.log('[SFlix] embed html preview: ' + html.substring(0, 700));
    return null;
  }).catch(function(e) {
    console.log('[SFlix] embed error: ' + e.message);
    return null;
  });
}

function getEmbed(serverId) {
  return get(BASE + '/ajax/sources/' + serverId, true).then(function(j) {
    console.log('[SFlix] sources/' + serverId + ' json=' + JSON.stringify(j).substring(0, 300));
    if (j && j.link) return j.link;
    if (j && j.url) return j.url;
    return null;
  }).catch(function(e) {
    console.log('[SFlix] sources error: ' + e.message);
    return null;
  });
}

function processServer(srv) {
  return getEmbed(srv.id).then(function(embedUrl) {
    if (!embedUrl) return null;
    return extractStream(embedUrl).then(function(s) {
      if (!s || !s.url) return null;
      return {
        url: s.url,
        quality: 'HD',
        format: s.fmt || 'm3u8',
        title: 'SFlix · ' + (srv.name || ('Server ' + srv.id))
      };
    });
  }).catch(function(e) {
    console.log('[SFlix] processServer error: ' + e.message);
    return null;
  });
}

function resolveAll(servers) {
  if (!servers || !servers.length) return Promise.resolve([]);
  return Promise.all(servers.map(processServer)).then(function(arr) {
    return arr.filter(function(x) { return x && x.url; });
  });
}

function getPageInfo(tmdbId, mediaType, slug) {
  var path = '/' + mediaType + '/free-' + slug + '-hd-' + tmdbId;
  return get(BASE + path, false).then(function(html) {
    var watchId = (html.match(/data-watch_id="(\d+)"/i) || [])[1] || null;
    var dataId = (html.match(/data-id="(\d+)"/i) || [])[1] || null;
    var dataType = parseInt((html.match(/data-type="(\d+)"/i) || [])[1] || (mediaType === 'movie' ? '1' : '2'), 10);

    console.log('[SFlix] page path=' + path + ' watchId=' + watchId + ' dataId=' + dataId + ' dataType=' + dataType);

    return {
      watchId: watchId,
      dataId: dataId,
      dataType: dataType,
      path: path
    };
  }).catch(function(e) {
    console.log('[SFlix] getPageInfo error: ' + e.message);
    return {
      watchId: null,
      dataId: null,
      dataType: mediaType === 'movie' ? 1 : 2,
      path: path
    };
  });
}

function movieStreams(tmdbId, info) {
  var candidateIds = [];
  if (info && info.dataId) candidateIds.push(String(info.dataId));
  candidateIds.push(String(tmdbId));

  candidateIds = candidateIds.filter(function(v, i, a) { return v && a.indexOf(v) === i; });

  function tryEpisodeList(idx) {
    if (idx >= candidateIds.length) return Promise.resolve([]);
    var dataId = candidateIds[idx];

    console.log('[SFlix] movie episode list for dataId=' + dataId);
    return get(BASE + '/ajax/episode/list/' + dataId, false).then(function(html) {
      console.log('[SFlix] movie episode list len=' + html.length + ' dataId=' + dataId);

      var epIds = [];
      var re = /data-id="(\d+)"/g;
      var m;
      while ((m = re.exec(html)) !== null) epIds.push(m[1]);

      epIds = epIds.filter(function(v, i, a) { return a.indexOf(v) === i; });
      console.log('[SFlix] movie episode ids found=' + epIds.length + ' dataId=' + dataId);

      if (!epIds.length) {
        console.log('[SFlix] movie episode list preview: ' + html.substring(0, 700));
        return tryEpisodeList(idx + 1);
      }

      var epId = epIds[0];
      console.log('[SFlix] movie using epId=' + epId);

      return get(BASE + '/ajax/episode/servers/' + epId, false).then(function(h2) {
        console.log('[SFlix] movie episode servers len=' + h2.length);
        var servers = parseServers(h2);
        if (!servers.length) return [];
        return resolveAll(servers);
      });
    }).catch(function(e) {
      console.log('[SFlix] movieStreams error for dataId=' + dataId + ': ' + e.message);
      return tryEpisodeList(idx + 1);
    });
  }

  return tryEpisodeList(0);
}

function tvStreams(dataId, wantSeason, wantEp) {
  console.log('[SFlix] tv season list for dataId=' + dataId);
  return get(BASE + '/ajax/season/list/' + dataId, false).then(function(html) {
    console.log('[SFlix] season list len=' + html.length);

    var seasons = [];
    var re = /data-id="(\d+)"[^>]*>[\s\S]{0,100}?Season\s*(\d+)/gi;
    var m;
    while ((m = re.exec(html)) !== null) {
      seasons.push({ id: m[1], num: parseInt(m[2], 10) });
    }

    if (!seasons.length) {
      var re2 = /data-id="(\d+)"/g;
      var i = 1;
      while ((m = re2.exec(html)) !== null) seasons.push({ id: m[1], num: i++ });
    }

    seasons = uniqById(seasons);
    console.log('[SFlix] seasons=' + seasons.length);
    if (!seasons.length) return [];

    var season = seasons.filter(function(s) { return s.num === wantSeason; })[0] || seasons[0];
    console.log('[SFlix] season id=' + season.id + ' season num=' + season.num);

    return get(BASE + '/ajax/season/episodes/' + season.id, false).then(function(h2) {
      console.log('[SFlix] season episodes len=' + h2.length);

      var eps = [];
      var re3 = /data-id="(\d+)"[^>]*title="Ep[^\d]*?(\d+)/gi;
      while ((m = re3.exec(h2)) !== null) {
        eps.push({ id: m[1], num: parseInt(m[2], 10) });
      }

      if (!eps.length) {
        var re4 = /data-id="(\d+)"/g;
        var j = 1;
        while ((m = re4.exec(h2)) !== null) eps.push({ id: m[1], num: j++ });
      }

      eps = uniqById(eps);
      console.log('[SFlix] episodes=' + eps.length);
      if (!eps.length) return [];

      var ep = eps.filter(function(e) { return e.num === wantEp; })[0] || eps[0];
      console.log('[SFlix] ep id=' + ep.id + ' ep num=' + ep.num);

      return get(BASE + '/ajax/episode/servers/' + ep.id, false).then(function(h3) {
        console.log('[SFlix] ep servers len=' + h3.length);
        var servers = parseServers(h3);
        if (!servers.length) return [];
        return resolveAll(servers);
      });
    });
  }).catch(function(e) {
    console.log('[SFlix] tvStreams error: ' + e.message);
    return [];
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  var type = mediaType === 'movie' ? 'movie' : 'tv';
  var wantSeason = season || 1;
  var wantEp = episode || 1;

  console.log('[SFlix] START tmdbId=' + tmdbId + ' type=' + type + ' s=' + wantSeason + ' e=' + wantEp);

  return fetch('https://api.themoviedb.org/3/' + type + '/' + tmdbId + '?api_key=8d6d91941230817f7807d643736e8a49')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var title = data.title || data.name || '';
      if (!title) throw new Error('No TMDB title');

      var slug = toSlug(title);
      console.log('[SFlix] title="' + title + '" slug=' + slug);

      return getPageInfo(tmdbId, type, slug).then(function(info) {
        var flow;

        if (type === 'movie') {
          flow = movieStreams(tmdbId, info);
        } else {
          var tvDataId = (info && info.dataId) ? info.dataId : tmdbId;
          flow = tvStreams(tvDataId, wantSeason, wantEp);
        }

        return flow.then(function(streams) {
          console.log('[SFlix] DONE streams=' + streams.length);
          return { streams: streams };
        });
      });
    })
    .catch(function(err) {
      console.error('[SFlix] Fatal: ' + err.message);
      return { streams: [] };
    });
}

module.exports = { getStreams };
