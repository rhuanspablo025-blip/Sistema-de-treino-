export default function robots() {
  return {
    rules: {
      userAgent: '*',
      allow: ['/login', '/privacy'],
      disallow: ['/api/', '/billing', '/forgot-password'],
    },
    sitemap: 'https://www.atlasfit.com.br/sitemap.xml',
  };
}
