const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const PROVIDER_NAME = "DomTy";

// Nuvio uses this to list the provider
exports.provider = {
  name: PROVIDER_NAME,
  id: "domty",
  languages: ["en"],
};

// Optional search (some builds require it)
exports.search = async function (query) {
  return [
    {
      title: query,
      year: "",
      id: query,
    },
  ];
};

// Main stream function
exports.getStreams = async function (id, type, season, episode) {
  return [
    {
      name: PROVIDER_NAME,
      url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
      quality: "HD",
    },
  ];
};
