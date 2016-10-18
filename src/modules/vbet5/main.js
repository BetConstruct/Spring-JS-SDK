/**@license
 BetConstruct Swarm API v1.0
 (c) 2013-2016 BetConstruct. http://www.betconstruct.com
 License: MIT
 */
/* global angular */
/**
 * @ngdoc module
 * @name vbet5.module:vbet5
 * @description
 *
 * Main module working with swarm
 */
angular.module('vbet5', ['ngCookies']).run(['Zergling', function (Zergling) {
    'use strict';
    Zergling.init();
}]);