/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  ...(process.env.NODE_ENV === 'production' ? {
    basePath: '/jade-diy-web-installer',
    assetPrefix: '/jade-diy-web-installer',
  } : {}),
  images: {
    unoptimized: true,
  },
}

module.exports = nextConfig
