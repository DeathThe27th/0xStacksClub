// pm2 process file. Run from this folder: pm2 start ecosystem.config.cjs
// One instance only: a second one would receive and answer the same messages.
module.exports = {
  apps: [
    {
      name: "imessage-bot",
      cwd: __dirname,
      script: "dist/index.js",
      node_args: "--env-file=.env",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 30,
      // Lets in-flight replies finish before pm2 kills the process.
      kill_timeout: 10000,
      time: true,
    },
  ],
};
