"use strict";
// Staging: no offline transaction caching. Every page and API request uses the network.
// The installed app remains usable only while the server is reachable.
self.addEventListener("install",event=>{self.skipWaiting()});
self.addEventListener("activate",event=>{event.waitUntil(self.clients.claim())});
