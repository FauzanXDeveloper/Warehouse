/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // Prevent bundling of native Node.js modules used in server routes
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3'],
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      'react-native-fetch-blob': false,
      'react-native-fs': false,
      'react-native': false,
    }
    return config
  },
}

module.exports = nextConfig
