import fetch from "node-fetch";

const PROVIDER_NAME = "OneTouchTV";
const BASE_URL = "https://onetouchtv.net";

async function extractM3U8(playerUrl) {
  try {
    const url = new URL(playerUrl);
    const fileParam = url.searchParams.get("file");

    if (!fileParam) return [];

    const decoded = decodeURIComponent(fileParam);
    const json = JSON.parse(decoded);

    const streams = [];

    for (const item of json) {
      if (item.file && item.file.includes(".m3u8")) {
        streams.push({
          url: item.file,
          quality: "HD",
          provider: PROVIDER_NAME
        });
      }
    }

    return streams;
  } catch (err) {
    console.log("extract error:", err);
    return [];
  }
}

async function getEpisodePage(title, season, episode) {
  try {
    const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(title)}`;
    const res = await fetch(searchUrl);
    const html = await res.text();

    const match = html.match(/href="([^"]+)"/g);
    if (!match) return null;

    for (const link of match) {
      const url = link.replace('href="', '').replace('"', '');

      if (url.includes(BASE_URL)) {
        const page = await fetch(url);
        const pageHtml = await page.text();

        const episodeMatch = pageHtml.match(
          new RegExp(`Episode\\s*${episode}`, "i")
        );

        if (episodeMatch) {
          return url;
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

async function extractPlayer(pageUrl) {
  try {
    const res = await fetch(pageUrl);
    const html = await res.text();

    const iframe = html.match(/src="(https:\/\/[^"]*devcorp[^"]*)"/);

    if (!iframe) return [];

    const playerUrl = iframe[1];

    return await extractM3U8(playerUrl);
  } catch {
    return [];
  }
}

export async function getStreams({ title, season, episode }) {
  try {
    const episodePage = await getEpisodePage(title, season, episode);

    if (!episodePage) return [];

    const streams = await extractPlayer(episodePage);

    return streams;
  } catch (err) {
    console.log("provider error:", err);
    return [];
  }
}

export default {
  name: PROVIDER_NAME,
  getStreams
};
