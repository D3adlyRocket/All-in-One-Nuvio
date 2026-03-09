const axios = require("axios");
const crypto = require("crypto");

const API = "https://api3.devcorp.me";

const keyHex = Buffer.from(
  "Njk2ZDM3MzI2MzY4NjE3MjUwNjE3MzczNzc2ZjcyNjQ2ZjY2NjQ0OTZlNjk3NDU2NjU2Mzc0NmY3MjUzNzQ2ZA==",
  "base64"
).toString();

const ivHex = Buffer.from(
  "Njk2ZDM3MzI2MzY4NjE3MjUwNjE3MzczNzc2ZjcyNjQ=",
  "base64"
).toString();

function hexToBytes(hex){
  return Buffer.from(hex.match(/.{1,2}/g).map(b=>parseInt(b,16)));
}

const key = hexToBytes(keyHex);
const iv = hexToBytes(ivHex);

function normalize(input){
  return input
    .replace(/-\_\./g,"/")
    .replace(/@/g,"+")
    .replace(/\s+/g,"");
}

function decryptString(input){
  try{
    const normalized = normalize(input);
    let base64 = normalized;
    const pad = base64.length % 4;
    if(pad !== 0) base64 += "=".repeat(4-pad);
    const encrypted = Buffer.from(base64,"base64");
    const decipher = crypto.createDecipheriv("aes-256-cbc",key,iv);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted,decipher.final()]);
    const json = JSON.parse(decrypted.toString());
    return json.result;
  } catch(e){
    console.error("Decrypt error:", e);
    return null;
  }
}

function getStreams(tmdbId, mediaType, seasonNum, episodeNum){
  return new Promise(async(resolve)=>{
    try{
      // 1️⃣ Search series by TMDB title
      const tmdbUrl = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=b030404650f279792a8d3287232358e3`;
      const tmdbRes = await axios.get(tmdbUrl);
      const title = tmdbRes.data.title || tmdbRes.data.name || tmdbRes.data.original_title;

      // 2️⃣ Search OneTouchTV API
      const searchUrl = `${API}/vod/search?page=1&keyword=${encodeURIComponent(title)}`;
      const searchRes = await axios.get(searchUrl,{ headers:{referer:API} });
      const searchData = decryptString(searchRes.data);

      if(!searchData || searchData.length === 0) return resolve([]);

      // Try to find exact match
      let series = searchData.find(item => item.title.toLowerCase() === title.toLowerCase());
      if(!series) series = searchData[0];

      if(!series) return resolve([]);

      // 3️⃣ Fetch series detail to get episode list
      const detailUrl = `${API}/vod/${series.id}/detail`;
      const detailRes = await axios.get(detailUrl,{ headers:{referer:API} });
      const detailData = decryptString(detailRes.data);

      if(!detailData || !detailData.episodes) return resolve([]);

      // 4️⃣ Find target episode
      let ep;
      if(mediaType==="movie"){
        ep = detailData.episodes[detailData.episodes.length-1];
      } else {
        ep = detailData.episodes.find(e=>parseInt(e.episode)===parseInt(episodeNum));
      }
      if(!ep) return resolve([]);

      // 5️⃣ Fetch episode sources
      const episodeUrl = `${API}/vod/${ep.identifier}/episode/${ep.playId}`;
      const epRes = await axios.get(episodeUrl,{ headers:{referer:API} });
      const epData = decryptString(epRes.data);

      if(!epData || !epData.sources) return resolve([]);

      // 6️⃣ Map sources to Nuvio streams
      const streams = [];
      for(const src of epData.sources){
        if(!src.url) continue;
        streams.push({
          name: src.name || "Server",
          title: series.title,
          url: src.url,
          quality: src.quality || "Auto",
          headers: src.headers || { referer:API },
          provider:"OneTouchTV"
        });
      }

      resolve(streams);

    } catch(e){
      console.error("OneTouchTV Error:", e);
      resolve([]);
    }
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
