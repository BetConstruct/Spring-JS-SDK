/* global angular */
angular.module("vbet5").constant("Config", {

    "main": {
        site_id: "175", //est id
        source: "1",
        useAuthCookies: false,  //use cookies for storing auth data. if false, local storage will be used
        authSessionLifetime: 600000 // in milliseconds,
    },
    "env": {
      lang: "eng"
    },
    "swarm": {
        debugging: false, //enable websocket debugging
        languageMap: { "pol" : "eng", "por": "por_2", "pt-br" : "por", "fre": "fra", "chi": "zho", "mac": "mkd", "bgr": "bul", "lat": "lav", "fas": "far", "rum": "ron"}, //mapping of iso language codes to the ones defined in backend
        sendSourceInRequestSession: false,
        sendTerminalIdlInRequestSession: false,
        webSocketTimeout: 5000,
        url: [{ url: "http://swarm-demo-spring.betcoswarm.com/", weight: 10}],      // long-poll URL
        websocket: [{ url: "ws://swarm-demo-spring.betcoswarm.com/", weight: 10}],  // websocket URL
        useWebSocket: true, // otherwise long-poll ajax calls will be used
        maxWebsocketRetries: 5,  // maximum number of websocket reconnect attempts after which it will give up
        webSocketRetryInterval: 2000 // retry interval, in milliseconds (will be increased after each unsuccessful retry by itself)
    }
});
