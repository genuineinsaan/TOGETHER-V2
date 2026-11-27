
const CACHE_NAME = "together-app-v1";

const APP_FILES = [
    "./",
    "./index.html",
    "./style.css",
    "./script.js",
    "./manifest.json",
    "./assets/icons/icon.svg"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_FILES))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", event => {
    if (event.request.method !== "GET") return;

    const requestURL = new URL(event.request.url);

    if (requestURL.origin !== self.location.origin) return;

    if (event.request.mode === "navigate") {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put("./index.html", copy);
                    });
                    return response;
                })
                .catch(() => caches.match("./index.html"))
        );
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(cached => {
                if (cached) return cached;

                return fetch(event.request).then(response => {
                    if (response && response.ok) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, copy);
                        });
                    }

                    return response;
                });
            })
    );
});

self.addEventListener("notificationclick", event => {
    event.notification.close();

    event.waitUntil(
        clients.matchAll({
            type: "window",
            includeUncontrolled: true
        }).then(clientList => {
            for (const client of clientList) {
                if ("focus" in client) {
                    return client.focus();
                }
            }

            return clients.openWindow("./");
        })
    );
});
