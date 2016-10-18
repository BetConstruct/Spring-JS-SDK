/* global angular */
/**
 * @ngdoc service
 * @name vbet5.service:Zergling
 * @description <img src=http://www.starcraft-replay.com/img/avatars/zergling8.png>
 *
 *
 *
 * A service used to get data from Swarm
 * uses {@link vbet5.service:Websocket Websocket} or {@link /documentation/angular/api/ng.$http ng.$http} for communication, depending on config and browser capabilities
 */
angular.module('vbet5').service('Zergling', ['Config', 'WS', '$http', '$q', '$timeout', '$rootScope', 'AuthData', 'Utils', function (Config, WS, $http, $q, $timeout, $rootScope, AuthData, Utils) {
    'use strict';

    var Zergling = {};

    var session;

    var subscriptions = {};

    var useWebSocket = false;

    var sessionRequestIsInProgress = false;

    var connectionAvailable;

    var isLoggedIn;

    var longPollUrl;

    /**
     * Swarm response codes
     */
    Zergling.codes = {
        OK: 0,
        SESSION_LOST: 5,
        NEED_TO_LOGIN: 12
    };


    /**
     * @ngdoc function
     * @name getLongPollUrl
     * @methodOf vbet5.service:Zergling
     * @description returns randomly selected(taking weight into consideration) long poll url
     * @returns {String} long polling URL
     */
    function getLongPollUrl() {
        if (!longPollUrl) {
            longPollUrl = Utils.getWeightedRandom(Config.swarm.url).url;
            console.log('long Polling URL selected:', longPollUrl);
        }
        return longPollUrl;
    }

    /**
     * @ngdoc function
     * @name destructivelyUpdateObject
     * @methodOf vbet5.service:Zergling
     * @description
     * Applies the diff on object
     * properties having null values in diff are removed from  object, others' values are replaced.
     *
     * Also checks the 'price' field for changes and adds new field 'price_change' as sibling
     * which indicates the change direction (1 - up, -1 down, null - unchanged)
     *
     * @param {Object} current current object
     * @param {Object} diff    received diff
     */
    function destructivelyUpdateObject(current, diff) {
        if (current === undefined || !(current instanceof  Object)) {
            throw new Error('wrong call');
        }

        angular.forEach(diff, function (val, key) {
            if (val === null) {
                delete current[key];
            } else if (typeof val !== 'object') {
                current[key] = val;
            } else { // diff[key] is Object
                if (typeof current[key] !== 'object' || current[key] === null) {
                    current[key] = val;
                } else {
                    var hasPrice = (current[key].price !== undefined);
                    var oldPrice;
                    if (hasPrice) {
                        oldPrice = current[key].price;
                    }
                    destructivelyUpdateObject(current[key], val);
                    if (hasPrice) {
                               current[key].price_change = (val.price === oldPrice) ? null : (oldPrice < val.price) * 2 - 1;
                    }
                }
            }
        });
    }

    /**
     * @ngdoc function
     * @name resubscribe
     * @methodOf vbet5.service:Zergling
     * @description
     *  Restore subscriptions
     */
    function resubscribe() {
        console.log('resubscribing', useWebSocket, subscriptions);
        angular.forEach(subscriptions, function (subData, subId) {
            delete subscriptions[subId];   //clear previous data because we'll receive full data when resubscribing
            Zergling.subscribe(subData.request, subData.callback);
        });
    }

    /**
     * @ngdoc method
     * @name updateSubscribers
     * @methodOf vbet5.service:Zergling
     * @description
     * Extracts diffs from data and applies to subscribers data
     * then passes updated data to callback func, specified by subscriber
     *
     * @param {Object} data received subscription data
     */
    function updateSubscribers(data) {

        angular.forEach(data.data, function (subDataDiff, subId) {
            var subscription = subscriptions[subId];
            if (undefined !== subscription && undefined !== subscription.callback) {
                destructivelyUpdateObject(subscription.data, {data: subDataDiff}); //
                subscription.callback(subscription.data.data);
            } else if (subscriptions[subId] === undefined) {
                console.log('got update for unknown subscription', subId, 'trying to unsubscribe');
                Zergling.unsubscribe(subId);
            }
        });
    }
    /**
     * @ngdoc function
     * @name handleSubscriptionResponse
     * @methodOf vbet5.service:Zergling
     * @description
     * Handle subscription data
     *
     * @param {Object} response response
     */
    function handleSubscriptionResponse(response) {
        var code = response.data.code;
        code = code === undefined ? response.data.data.code : code;
        if (code === Zergling.codes.OK) {        //everything is ok
            updateSubscribers(response.data);
        } else if (code === Zergling.codes.SESSION_LOST && !sessionRequestIsInProgress) {
            Config.env.authorized = false;
            session = null;
            resubscribe();
        } else {                              // unknown error
            console.log(response);
        }
    }

    /**
     * @ngdoc function
     * @name getSession
     * @methodOf vbet5.service:Zergling
     * @description
     * Get or create session
     * @returns {Object} session promise
     */
    function getSession() {
        var result;
        if (!session) {
            session = $q.defer();
            result = session.promise;


            var sessionRequestCmd = { 'command': "request_session", 'params': { 'language': Utils.getLanguageCode(Config.env.lang), 'site_id': Config.main.site_id} };
            if (Config.swarm.sendSourceInRequestSession && Config.main.source !== undefined) {
                sessionRequestCmd.params.source = Config.main.source;
            }
            if (Config.swarm.sendTerminalIdlInRequestSession && Config.main.terminalId !== undefined) {
                sessionRequestCmd.params.terminal = Config.main.terminalId;
            }
            sessionRequestIsInProgress = true;

            var processSessionResponse = function (response) {
                sessionRequestIsInProgress = false;
                if (response.data.data && response.data.data.sid) {
                    session.resolve(response.data.data.sid);
//                    Storage.set('sessionid', response.data.data.sid, Config.swarm.sessionLifetime);
                    $rootScope.$broadcast('zergling.gotSession');
                    if (isLoggedIn) {
                        isLoggedIn = false;
                        Zergling.login(null).then(resubscribe);
                    } else {
                        resubscribe();
                    }
                    result = session.promise;
                } else {
                    session = null;
                    console.warn('got invalid response to request_session , sid not present', JSON.stringify(response));
                    result = $q.reject(response);
                }
                return result;
            };

            if (useWebSocket) {
                console.log('requesting new session (WS)');
                result = WS.sendRequest(sessionRequestCmd).then(processSessionResponse);
            } else {
                console.log('requesting new session (LP)');
                $http.post(getLongPollUrl(), JSON.stringify(sessionRequestCmd))
                    .success(function (data) { // extra 'data' is used to make structure same as when using data returned by $http.post promise resolve
                        result = processSessionResponse({data: data});
                    })['catch'](function (reason) {
                        session = null;
                        result = $q.reject(reason);
                    });
            }
            return result;


        } else {
            result = session.promise;
        }

        return result;
    }
    /**
     * @ngdoc function
     * @name whatsUp
     * @methodOf vbet5.service:Zergling
     * @description
     * Used only in long-polling mode to get subscription data
     */
    function whatsUp() {

        if (session) {
            getSession()
                .then(function (session_id) {
                    var data = { 'command': 'whats_up' };
                    var headers = { 'swarm-session': session_id };

                    return $http.post(getLongPollUrl(), JSON.stringify(data), { 'headers': headers });
                })
                .then(function (response) {
                    handleSubscriptionResponse(response);
                    $timeout(whatsUp, 500);
                })['catch'](function (reason) {
                    console.log(reason);
                    if (reason.status === 404) {
                        session = null
                    }
                    $timeout(whatsUp, 5000);
                });
        } else {
            $timeout(whatsUp, 1000);
        }

    }
    /**
     * @ngdoc function
     * @name init
     * @methodOf vbet5.service:Zergling
     * @description
     * Initializes connection(determines if Zergling will use Websocket or long-polling)
     */
    Zergling.init = function init() {
        console.log("%c     .\"\".    .\"\",\n     |  |   /  / \n     |  |  /  /  \n     |  | /  /   \n     |  |/  ;-._ \n     }  ` _/  / ;\n     |  /` ) / /\n     | /  /_/\_/\\\n     |/  /      |\n     (  ' \\ '-  |\n      \\    `.  / \n       |      |  \n       |      |  \n       init", "color: red; font-weight: bold; font-family:monospace;", WS.isAvailable)
        if (Config.swarm.useWebSocket && WS.isAvailable) {
            console.log("Config.swarm.useWebSocket",Config.swarm.useWebSocket, Config);
            WS.addSubscriptionListener(handleSubscriptionResponse);
            WS.onNotAvailable(function () { // socket has gone away and won't reconnect (WS.isAvailable is already false)
                Zergling.init();
                resubscribe();
            });

            WS.setOnCloseCallback(function () { //connection lost, but there's still hope to reconnect
               // if (!sessionRequestIsInProgress) {
                    session = null;
                    $rootScope.$broadcast('zergling.lostWSConnection');
               // }
                WS.onConnect(getSession);
            });

            useWebSocket = true;
        } else {
            useWebSocket = false;
            whatsUp();
        }
    };

    /**
     * @ngdoc function
     * @name ensureWebsocketIsAvailable
     * @methodOf vbet5.service:Zergling
     * @description
     * Will check if Websocket connection is available, if not, will switch to long polling mode
     * @returns {promise|*|Function} promise
     */
    function ensureWebsocketIsAvailable() {
        connectionAvailable = $q.defer();
        var result = connectionAvailable.promise;
        if (!useWebSocket) {
            connectionAvailable.resolve(true);
        } else {
            result = WS.connect().then(
                function () {
//                    console.log('websocket available');
                    connectionAvailable.resolve(true);
                },
                function () {
                    useWebSocket = false;
                    console.log('Websocket not available', useWebSocket);
                    resubscribe();
                    connectionAvailable.reject(false);
                    return connectionAvailable.promise;
                }
            );
        }
        return result;

    }

    /**
     * @ngdoc function
     * @name sendRequest
     * @methodOf vbet5.service:Zergling
     * @description Sends request to swarm using websocket or long-polling
     * @param {Object} data request data
     * @returns {Object} promise
     */
    function sendRequest(data) {
        if (useWebSocket && WS.isAvailable) {

            return ensureWebsocketIsAvailable().then(
                function () {
                    return getSession().then(
                        function (session_id) {
                            //console.log('sending request (WS) ', session_id, JSON.stringify(data));
                            return WS.sendRequest(data);
                        },
                        function (reason) {
                            console.error("cannot get session and don't know what to do now :(", reason);
                            return $q.reject(reason);
                        }
                    );
                },
                function () {
                    //send request again if connection wasn't available (it'll be switched to long poll already)
                    return sendRequest(data);
                }
            );
        } else {
            console.log('sending request (LP)');
            if (useWebSocket) {
                Zergling.init();
            }
            return getSession()
                .then(function (session_id) {
                    var headers = { 'swarm-session': session_id };
                    return $http.post(getLongPollUrl(), JSON.stringify(data), { 'headers': headers });
                });
        }
    }

    /**
     * @ngdoc method
     * @name login
     * @methodOf vbet5.service:Zergling
     * @description
     * logs user in and stores received auth token in local storage or restores login using saved auth  token
     *
     * @param {Object|null} user user object or null.
     *                            If null login will be restored using saved auth session.
     *                            Otherwise user object must have 'username' and 'password' fields
     * @param {Boolean} remember whether to remember auth data for a long time(default is off)
     * @param {Object} additionalParams additional parameters to pass to command (key-value map), e.g. {foo: "bar"}
     * @returns {promise} promise
     */
    Zergling.login = function login(user, remember, additionalParams) {
        var data;
        var loginAuthData = AuthData.get();
        if (user === null) {
            if (!loginAuthData) {
                console.warn("cannot login, no saved credentials");
                return $q.reject(null);
            }
            data = {'command': 'restore_login', 'params':  {'user_id': loginAuthData.user_id, 'auth_token': loginAuthData.auth_token} };
        } else if (user.facebook) {
            data = {'command': 'facebook_login', 'params': {'access_token': user.access_token}};
        } else if (user.odnoklassniki) {
            data = {'command': 'ok_login', 'params': {'access_token': user.accessToken, session_secret_key: user.sessionSecretKey }};
        } else {
            data = {'command': 'login', 'params': {'username': user.username, 'password': user.password}};
        }

        $rootScope.loginInProgress = true;

        if (additionalParams) {
            angular.forEach(additionalParams, function (paramValue, paramName) {
                data.params[paramName] = paramValue;
            });
        }

        return sendRequest(data)
            .then(function (response) {
                if (response.data.code === Zergling.codes.OK) {
                    console.log('zergling got login response', response);
                    isLoggedIn = true;

                    Config.env.authorized = true;

                    if (user && response.data.data.auth_token) {
                        var authData = {auth_token: response.data.data.auth_token, user_id: response.data.data.user_id, never_expires: remember || undefined};
                        if (user && user.username) {
                            authData.login = user.username;
                        }
                        AuthData.set(authData);
                    }
                    return response.data;
                } else {

                    Config.env.authorized = false;

                    return $q.reject(response.data);
                }
            })['catch'](function (reason) {
                if (reason.code === Zergling.codes.SESSION_LOST) { //session lost
                    $rootScope.$broadcast('zergling.sessionLost');
                    if (!sessionRequestIsInProgress) {
                        session = null; // this will make next statement request new session
                    }
                    return Zergling.login(user);
                }

                Config.env.authorized = false;

                console.log('login fail, code:', reason);
                return $q.reject(reason);
            })['finally'](function() {
                $rootScope.loginInProgress = false;
            });
    };

    /**
     * @ngdoc method
     * @name logout
     * @methodOf vbet5.service:Zergling
     * @description logs out user
     *
     * @returns {promise} promise
     */
    Zergling.logout = function logout() {
        var data = {'command': 'logout', 'params': {}};
        return sendRequest(data)
            .then(function (response) {
                AuthData.clear();
                if (response.data.code === Zergling.codes.OK) {
                    isLoggedIn = false;
                    return response.data;
                } else {
                    return $q.reject(response.data.code);
                }
            })['catch'](function (reason) {
                if (reason === Zergling.codes.SESSION_LOST) { //session lost
                    $rootScope.$broadcast('zergling.sessionLost');
                    if (!sessionRequestIsInProgress) {
                        session = null; // this will make next statement request new session
                    }
                    return Zergling.logout();
                }
                AuthData.clear(); //clear anyway
                console.log('logout fail, code:', reason);
                return $q.reject(reason);
            });

    };

    /**
     * @ngdoc method
     * @name get
     * @methodOf vbet5.service:Zergling
     * @description
     * Just get data without subscribing
     * @param {Object} request request object
     * @param {String} [command] optional.  default is 'get'
     * @returns {Promise} promise that will be resolved with data from swarm
     */
    Zergling.get = function get(request, command) {
        command = command || 'get';
        var data = { 'command': command, 'params': request };
        return sendRequest(data)
            .then(function (response) {
                if (response.data.code === Zergling.codes.OK) {
                    return response.data.data;
                } else {
                    return $q.reject(response.data);
                }
            })['catch'](function (reason) {
                if (reason.code === Zergling.codes.SESSION_LOST) { //session lost
                    Config.env.authorized = false;
                    $rootScope.$broadcast('zergling.sessionLost');
                    if (!sessionRequestIsInProgress) {
                        session = null; // this will make next statement request new session
                    }
                    return Zergling.get(request, command);
                }
                if (reason === Zergling.codes.NEED_TO_LOGIN) {
                    Config.env.authorized = false;

                    return Zergling.login(null).then(function () {
                        return Zergling.get(request, command);
                    });
                }
                console.log('get fail:', reason);
                return $q.reject(reason);
            });
    };

    /**
     * @ngdoc method
     * @name subscribe
     * @methodOf vbet5.service:Zergling
     * @description  Subscribes to request
     * @param {Object}   request  request to subscribe to
     * @param {function} onupdate callback function will receive full data(not the diff)
     * @returns {promise} promise that will be resolved with received data
     */
    Zergling.subscribe = function subscribe(request, onupdate) {
        request.subscribe = true;
        var data = { 'command': 'get', 'params': request };
        console.log('subscribing', JSON.stringify(request));
        return sendRequest(data)
            .then(function (response) {
                if (response.data.code === Zergling.codes.OK && response.data.data.subid) {
                    subscriptions[response.data.data.subid] = {
                        'request': request,
                        'callback': onupdate,
                        'data': response.data.data || {}
                    };
                } else {
                    return $q.reject(response.data.code);
                }

                return response.data.data;
            })['catch'](function (reason) {
                if (reason === Zergling.codes.SESSION_LOST) { //session lost
                    $rootScope.$broadcast('zergling.sessionLost');
                    if (!sessionRequestIsInProgress) {
                        session = null; // this will make next statement request new session
                    }
                    return Zergling.subscribe(request, onupdate);
                }
                if (reason === Zergling.codes.NEED_TO_LOGIN) {
                    Config.env.authorized = false;

                    return Zergling.login(null).then(function () {
                        return Zergling.subscribe(request, onupdate);
                    });
                }
                console.log('subscribe fail, code:', reason);
                return $q.reject(reason);
            });
    };

    /**
     * @ngdoc method
     * @name unsubscribe
     * @methodOf vbet5.service:Zergling
     * @description Unsubscribe from subscription specified by subId
     * @param {string} subId to unsubscribe from subscription id
     * @returns {promise} promise
     */
    Zergling.unsubscribe = function unsubscribe(subId) {
        console.log('unsubscribing', subId);
        if (subId === undefined) {
            console.warn("zergling unsubscribe got undefined subscription id");
            return;
        }
        var data,
            successFn,
            errorFn,
            responses = [];

        successFn = function (response) {
            if (response.data.code === Zergling.codes.OK) {
                //delete subscriptions[subId];
                console.log(subId, ' unsubscribe ok');
            } else {
                return $q.reject(response.data.code);
            }

        };
        errorFn = function (reason) {
            if (reason === Zergling.codes.SESSION_LOST) { //session lost
                $rootScope.$broadcast('zergling.sessionLost');
                if (!sessionRequestIsInProgress) {
                    session = null; // this will make next statement request new session
                }
                return Zergling.unsubscribe(subId);
            }
            console.log('unsubscribe fail, code:', reason);
            delete subscriptions[subId]; //delete subscription array entry(incl. callback) anyway
            return $q.reject(reason);
        };

        if (angular.isArray(subId)) {
            angular.forEach(subId, function (id) {
                delete subscriptions[id];
                data = {'command': 'unsubscribe', 'params': {subid: id.toString()}};
                responses.push(sendRequest(data).then(successFn)['catch'](errorFn));
            });
        } else {
            delete subscriptions[subId];
            data = {'command': 'unsubscribe', 'params': {subid: subId.toString()}};
            responses.push(sendRequest(data).then(successFn)['catch'](errorFn));
        }

        return $q.all(responses);
    };

    return Zergling;

}]);