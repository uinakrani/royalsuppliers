const disableTraceFileWriter = () => {
  try {
    const traceReporter = require('next/dist/trace/report/to-json')
    if (traceReporter?.default) {
      traceReporter.default.report = () => {}
      traceReporter.default.flushAll = async () => {}
    }
  } catch (error) {
    // Ignore failures – tracing is best-effort and should never block the build
  }
}

disableTraceFileWriter()

const withPWA = require('next-pwa')({
  dest: 'public',
  register: false,
  skipWaiting: true,
  // Force-disable PWA/service worker to avoid any offline caching or IndexedDB.
  disable: true,
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['lh3.googleusercontent.com'],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Exclude server-only modules from client bundle
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      }
    }
    return config
  },
}

module.exports = withPWA(nextConfig)

