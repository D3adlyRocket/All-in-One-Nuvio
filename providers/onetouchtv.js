const axios = require("axios");
const cheerio = require("cheerio");

const BASE_URL = "https://atishmkv3.bond";

async function search(query) {
  try {
    const res = await axios.get(`${BASE_URL}/?s=${encodeURIComponent(query)}`);
    const $ = cheerio.load(res.data);

    const results = [];

    $("article").each((i, el) => {
      const title = $(el).find("h2.entry-title a").text().trim();
      const url = $(el).find("h2.entry-title a").attr("href");
      const image = $(el).find("img").attr("src");

      if (title && url) {
        results.push({
          title,
          url,
          image
        });
      }
    });

    return results;

  } catch (e) {
    return [];
  }
}

async function getStreams(url) {
  try {
    const res = await axios.get(url);
    const html = res.data;
    const $ = cheerio.load(html);

    let streams = [];

    // STEP 1: find iframe player
    let iframe = $("iframe").attr("src");

    if (!iframe) {
      const match = html.match(/https?:\/\/[^'"]+\/player[^'"]+/);
      if (match) iframe = match[0];
    }

    if (!iframe) return [];

    // STEP 2: request player page
    const playerRes = await axios.get(iframe, {
      headers: {
        Referer: url
      }
    });

    const playerHTML = playerRes.data;

    // STEP 3: extract master.m3u8
    const m3u8Match = playerHTML.match(/https?:\/\/[0-9.]+\/v4\/.*?master\.m3u8[^\s'"]*/);

    if (m3u8Match) {
      streams.push({
        name: "AtishMKV",
        url: m3u8Match[0],
        type: "hls"
      });
    }

    return streams;

  } catch (e) {
    return [];
  }
}

module.exports = {
  name: "AtishMKV",
  version: "1.0.1",
  search,
  getStreams
};
