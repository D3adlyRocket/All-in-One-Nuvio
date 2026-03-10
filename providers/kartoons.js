function getStreams() {

    return new Promise(function(resolve) {

        let streams = [];

        streams.push({
            name: "Kartoons",
            description: "HLS Stream",
            url: "https://v11.m3u8flop.workers.dev/playlist/Wq1_siUIfZDY1dYXp_DyVRoAJTuHzXkupjbHZW_AzYpQY7Q6Vipjv82fmV7e4d14uVPIBezJ3wLXX-cfiaxGI7Wm7OPQ5wroOzMQzp-wfJxlX5sKjIrmieqdS2VR_CO7FBUOVS9SufsS9ZjsSlHCtRR17wCV5oStYS0cM4jqRAN5haEdbYfUZ1Vlc7t02lc71YG0dN2fvgOvPwzc-X6u_ulE56o7h60q_LO-",
            behaviorHints: {
                notWebReady: false
            }
        });

        resolve(streams);

    });

}

module.exports = { getStreams };
