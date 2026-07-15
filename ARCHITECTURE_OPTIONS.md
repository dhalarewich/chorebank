# Architecture options

Chorebank supports PostgreSQL for the self-hosted and Node.js installation paths.

SQLite is deferred: it needs a separate migration, concurrent-access, and backup design. A truly offline IndexedDB/PWA edition is also deferred because synchronization, authentication, conflict handling, and recovery need their own design. Android tablets are supported as browser or home-screen clients to a LAN-hosted Chorebank, not as native or offline apps.
