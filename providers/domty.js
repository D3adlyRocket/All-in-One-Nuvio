// domty.js

const provider = {
  id: "domty",
  name: "Domty Test Provider",

  async getStreams(tmdbId, mediaType, season, episode) {
    console.log("DOMTY PROVIDER CALLED:", tmdbId, mediaType, season, episode);

    return [
      {
        name: "Domty",
        title: "Test Stream",
        quality: "1080p",
        url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
      }
    ];
  }
};

module.exports = provider;
