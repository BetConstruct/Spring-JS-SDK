/* global angular */
/**
 * @ngdoc service
 * @name vbet5.service:Utils
 * @description
 * Utility functions
 */

angular.module('vbet5').service('Utils', ['Config', function (Config) {
    'use strict';
    var Utils = {};


    /**
     * @ngdoc method
     * @name getWeightedRandom
     * @methodOf vbet5.service:Utils
     * @description returns "weighted" random element of array
     * @param {Array} array the array
     * @param {String} weightFieldName array's objects' field name that contains it's weight
     *
     * @return {Object} random weighted array item
     */
    Utils.getWeightedRandom = function getWeightedRandom(array, weightFieldName) {
        weightFieldName = weightFieldName || 'weight';
        var variants = [], i;
        angular.forEach(array, function (item) {
            if (item.ignore) {
                return;
            }
            for (i = 0; i < (item[weightFieldName] || 1); i++) {
                variants.push(item);
            }
        });

        var index = Math.floor(Math.random() * variants.length);

        return variants[index];
    };

    /**
     * @ngdoc function
     * @name getLanguageCode
     * @methodOf vbet5.service:Utils
     * @description Returns language that should be provided to Swarm
     *              (some languages should be mapped to other if they don't exist in swarm(backend))
     * @param {String} lng 3 letter language code
     * @returns {String} language code
     */
    Utils.getLanguageCode = function getLanguageCode(lng) {
        if (Config.swarm.languageMap && Config.swarm.languageMap[lng]) {
            return Config.swarm.languageMap[lng];
        }
        return lng;
    };


    return Utils;
}]);
