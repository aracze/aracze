import { withPayload } from '@payloadcms/next/withPayload'

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // jsdom (isomorphic-dompurify) nesmi byt zabaleny bundlerem: (1) cte sve
  // soubory relativne k __dirname (ENOENT na default-stylesheet.css),
  // (2) zabaleny v dev rezimu je extremne pomaly - stranky s rich textem
  // pak trvaji desitky sekund. Externalizovany bezi nativne z node_modules.
  serverExternalPackages: ['jsdom', 'isomorphic-dompurify'],
  images: {
    // Zmenšování obrázků dělá Cloudinary (viz loader), ne Next server —
    // funguje to tak i se standalone outputem bez další zátěže.
    loader: 'custom',
    loaderFile: './src/lib/cloudinary-loader.ts',
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
