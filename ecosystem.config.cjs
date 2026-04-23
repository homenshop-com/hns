/**
 * PM2 process config for zero-downtime deploys.
 *
 * Before this file:
 *   pm2 start npm --name homenshop-next -- start    (fork mode, 1 worker)
 *   pm2 restart  → full outage ~5–15s while process respawns + JIT-
 *   compiles the first request → users see 502 Bad Gateway.
 *
 * After:
 *   · 2 workers in cluster mode, sharing port 3000 via Node's built-in
 *     net-cluster (SO_REUSEPORT style)
 *   · pm2 reload ripple-restarts workers ONE AT A TIME. While worker A
 *     is rebuilding its state, worker B keeps serving requests → no 502s
 *   · Worker takes ~6–10s to be warm after start; listen_timeout + the
 *     other live worker covers that window
 *
 * Deploy workflow (see scripts/deploy-zero-downtime.sh):
 *   cd /var/www/homenshop-next
 *   git pull && npm install
 *   npm run build
 *   pm2 reload homenshop-next --update-env
 */

module.exports = {
  apps: [
    {
      name: "homenshop-next",
      // Invoke Next.js directly (not via npm) so pm2 cluster mode can
      // fork the Node process cleanly — npm as an intermediary wrapper
      // blocks cluster port sharing.
      script: "./node_modules/next/dist/bin/next",
      args: "start",
      cwd: "/var/www/homenshop-next",
      instances: 2,
      exec_mode: "cluster",
      // When PM2 reloads, give each worker time to warm up before moving
      // on to the next. Next.js needs ~3–6s to bind and respond.
      wait_ready: false,      // Next.js doesn't emit the 'ready' signal;
                              // fall back to listen-ready detection
      listen_timeout: 20000,   // 20s max wait for a worker to accept TCP
      kill_timeout: 8000,      // 8s SIGTERM grace before SIGKILL — lets
                              // in-flight requests finish cleanly
      max_memory_restart: "900M",
      merge_logs: true,
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      // Source maps / Sentry require the extra heap headroom
      node_args: "--max-old-space-size=1024",
    },
  ],
};
