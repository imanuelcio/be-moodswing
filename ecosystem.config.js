module.exports = {
  apps: [
    {
      name: "be-moodswing",
      script: "dist/index.js",
      cwd: "/var/www/be-moodswing", // ganti ke path project-mu
      instances: "1", // atau 1 kalau masih kecil
      exec_mode: "cluster", // manfaatkan multi-core
      env: {
        NODE_ENV: "production",
        PORT: "5000", // sesuaikan
      },
      watch: false, // production: false (lebih stabil)
      max_memory_restart: "300M",
      out_file: "./logs/out.log",
      error_file: "./logs/error.log",
      time: true, // timestamp di log
      wait_ready: false, // set true kalau kamu kirim process.send('ready')
      kill_timeout: 5000,
    },
  ],
};
