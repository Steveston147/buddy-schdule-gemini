/** @type {import('next').NextConfig} */
const nextConfig = {
    typescript: {
      // ⚠️警告: 本番ビルド時の型チェックエラーを無視します
      ignoreBuildErrors: true,
    },
    eslint: {
      // ⚠️警告: 本番ビルド時のESLintエラーを無視します
      ignoreDuringBuilds: true,
    },
  };
  
  module.exports = nextConfig;