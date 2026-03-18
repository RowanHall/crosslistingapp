import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'mphwmgpbtdewuedrfdtl.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'media.depop.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'media-photos.depop.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'd2h1pu9tdskfs9.cloudfront.net', // Common Depop image host
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'media-assets.grailed.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.fbcdn.net',
        port: '',
        pathname: '/**',
      }
    ],
  },
};

export default nextConfig;
