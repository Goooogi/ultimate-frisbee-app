/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    // Fantasy V2 game-hub IA inversion (2026-08-27): the UFA landing moved
    // from /fantasy/team* to /fantasy/ufa/team*. Not permanent — the old
    // paths may get reused if URL structure shifts again during the rest of
    // the V2 rollout.
    return [
      { source: '/fantasy/team', destination: '/fantasy/ufa/team', permanent: false },
      { source: '/fantasy/team/:id', destination: '/fantasy/ufa/team/:id', permanent: false },
    ];
  },
};

export default nextConfig;
