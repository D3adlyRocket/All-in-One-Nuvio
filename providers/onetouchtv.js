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

const normalized = normalize(input);

let base64 = normalized;
const pad = base64.length % 4;
if(pad !== 0){
base64 += "=".repeat(4-pad);
}

const encrypted = Buffer.from(base64,"base64");

const decipher = crypto.createDecipheriv("aes-256-cbc",key,iv);

let decrypted = decipher.update(encrypted);
decrypted = Buffer.concat([decrypted,decipher.final()]);

const text = decrypted.toString();

const json = JSON.parse(text);

return json.result;
}

async function search(query){

try{

const url = `${API}/vod/search?page=1&keyword=${encodeURIComponent(query)}`;

const res = await axios.get(url,{
headers:{referer:`${API}/`}
});

const decrypted = decryptString(res.data);

const results = JSON.parse(decrypted);

return results.map(r => ({
title: r.title,
tmdb: r.id,
year: r.year,
poster: r.image,
type: r.type
}));

}catch(e){

return [];

}

}

async function getMediaInfo(id){

try{

const url = `${API}/vod/${id}/detail`;

const res = await axios.get(url);

const decrypted = decryptString(res.data);

const data = JSON.parse(decrypted);

const episodes = [];

if(data.episodes){

for(const ep of data.episodes){

episodes.push({
season:1,
episode:parseInt(ep.episode) || 1,
id:ep.identifier,
play:ep.playId
});

}

}

return {
title:data.title,
poster:data.image,
description:data.description,
episodes
};

}catch(e){

return null;

}

}

async function getStreams(tmdbId,type,season,episode){

try{

const info = await getMediaInfo(tmdbId);

if(!info || !info.episodes) return [];

const ep = info.episodes.find(e=>e.episode===episode);

if(!ep) return [];

const url = `${API}/vod/${ep.id}/episode/${ep.play}`;

const res = await axios.get(url);

const decrypted = decryptString(res.data);

const data = JSON.parse(decrypted);

const streams = [];

if(data.sources){

for(const src of data.sources){

streams.push({
url:src.url,
quality:src.quality || "auto",
name:src.name || "Server",
headers:src.headers || {}
});

}

}

return streams;

}catch(e){

return [];

}

}

module.exports = {
name:"OneTouchTV",
domains:["api3.devcorp.me"],
search,
getMediaInfo,
getStreams
};
