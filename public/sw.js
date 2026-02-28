/// <reference lib="webworker" />

const CACHE_NAME = "citarion-v1";
const STATIC_ASSETS = [
  "/",
  "/manifest.json",
  "/offline.html",
];

// Install event
self.addEventListener("install", (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  (self as any).skipWaiting();
});

// Activate event
self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  (self as any).clients.claim();
});

// Fetch event - Network first, fallback to cache
self.addEventListener("fetch", (event: FetchEvent) => {
  // Skip non-GET requests
  if (event.request.method !== "GET") return;

  // Skip API requests - always fetch fresh
  if (event.request.url.includes("/api/")) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({ error: "Offline" }), {
          headers: { "Content-Type": "application/json" },
        });
      })
    );
    return;
  }

  // For static assets - cache first
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached and fetch new in background
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        });
        return cachedResponse;
      }

      // Not in cache - fetch from network
      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200) {
            return response;
          }
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Offline fallback
          if (event.request.mode === "navigate") {
            return caches.match("/offline.html") as Promise<Response>;
          }
          return new Response("Offline", { status: 503 });
        });
    })
  );
});

// Push notifications
self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;

  const data = event.data.json();
  const options: NotificationOptions = {
    body: data.body || "Новое уведомление",
    icon: "/icons/icon-192x192.png",
    badge: "/icons/badge-72x72.png",
    vibrate: [100, 50, 100],
    data: {
      url: data.url || "/",
    },
    actions: [
      { action: "open", title: "Открыть" },
      { action: "close", title: "Закрыть" },
    ],
  };

  event.waitUntil(
    (self as any).registration.showNotification(
      data.title || "CITARION",
      options
    )
  );
});

// Notification click
self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();

  if (event.action === "close") return;

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    (self as any).clients.matchAll({ type: "window" }).then((clients: any[]) => {
      // Check if already open
      for (const client of clients) {
        if (client.url === url && "focus" in client) {
          return client.focus();
        }
      }
      // Open new window
      return (self as any).clients.openWindow(url);
    })
  );
});

// Background sync for offline trades
self.addEventListener("sync", (event: any) => {
  if (event.tag === "sync-trades") {
    event.waitUntil(syncPendingTrades());
  }
});

async function syncPendingTrades() {
  // This would sync pending trades when back online
  console.log("Syncing pending trades...");
}

export {};
