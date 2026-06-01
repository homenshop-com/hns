/**
 * PM2 process config — TRUE blue-green deployment.
 *
 * Two independent apps, each its own port AND its own Next.js dist dir so a
 * build into the inactive colour never touches the live colour's files:
 *
 *   hns-blue   → PORT 3000, NEXT_DIST_DIR=.next-blue
 *   hns-green  → PORT 3001, NEXT_DIST_DIR=.next-green
 *
 * Steady state runs ONLY the active colour (2 cluster workers, ~1GB). The
 * deploy script (scripts/deploy-blue-green.sh) builds + boots the inactive
 * colour, health-checks it on its own port, flips the nginx upstream
 * (conf.d/00-nextjs-upstream.conf) and reloads nginx, then deletes the old
 * colour. Traffic moves atomically on `nginx -s reload`.
 *
 * Never `pm2 start ecosystem.config.cjs` with no --only: that boots BOTH
 * colours at once (~2GB, RAM-tight). Always target one: `--only hns-blue|hns-green`.
 */

const base = {
  // Invoke Next.js directly (not via npm) so pm2 cluster mode can fork the
  // Node process cleanly — npm as a wrapper blocks cluster port sharing.
  script: "./node_modules/next/dist/bin/next",
  args: "start",
  cwd: "/var/www/homenshop-next",
  instances: 2,
  exec_mode: "cluster",
  wait_ready: false, // Next.js doesn't emit 'ready'; use listen-ready detection
  listen_timeout: 20000, // 20s max wait for a worker to accept TCP
  kill_timeout: 8000, // 8s SIGTERM grace so in-flight requests finish
  max_memory_restart: "900M",
  merge_logs: true,
  node_args: "--max-old-space-size=1024",
};

module.exports = {
  apps: [
    {
      ...base,
      name: "hns-blue",
      env: { NODE_ENV: "production", PORT: 3000, NEXT_DIST_DIR: ".next-blue" },
    },
    {
      ...base,
      name: "hns-green",
      env: { NODE_ENV: "production", PORT: 3001, NEXT_DIST_DIR: ".next-green" },
    },
  ],
};
