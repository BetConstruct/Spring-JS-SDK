# Spring-JS-SDK

Swarm API library for AngularJS 1 
=================================
This library makes it easy to connect to Swarm, query and subscribe to data sets using JSON based query language (similar to MongoDB)
Swarm is a middleware which provides JSON based API to [Betconstruct](http://www.betconstruct.com) data services via WebSockets or AJAX long-poll requests.



Dependencies
============
Dependencies include [AngularJS cookies module](https://docs.angularjs.org/api/ngCookies/service/$cookies) and [amplify.store](http://amplifyjs.com/api/store/) local storage library
Both of them are used for storing authenticated user credentials in browser.


Usage
=====
Include the scripts on your page (required libraries - Angular and Amplify.store and dist/bc.js), add "vbet5" module as dependency to your angular application, and you are ready to use the provided "Zergling" service.
See examples directory for usage examples.