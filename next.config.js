/** @type {import('next').NextConfig} */
const nextConfig = {
  // 移除 output: 'standalone' 以启用 Serverless Functions
  reactStrictMode: true,
  images: {
    domains: [
      // NextJS <Image> component needs to whitelist domains for src={}
      "lh3.googleusercontent.com",
      "pbs.twimg.com",
      "images.unsplash.com",
      "logos-world.net",
      "suna-1.learnwise.app", // Suna AI images
    ],
  },
};

module.exports = nextConfig;
