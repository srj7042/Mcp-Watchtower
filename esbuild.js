const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const isWatch = process.argv.includes('--watch');
const isProduction = process.argv.includes('--production');

function copyStaticAssets() {
  const uiSrc = path.join(__dirname, 'src', 'ui', 'dashboard');
  const uiDist = path.join(__dirname, 'dist', 'ui');
  if (!fs.existsSync(uiDist)) {
    fs.mkdirSync(uiDist, { recursive: true });
  }

  const filesToCopy = ['index.html', 'dashboard.css', 'icon.svg'];
  for (const file of filesToCopy) {
    const srcPath = path.join(uiSrc, file);
    const distPath = path.join(uiDist, file);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, distPath);
    }
  }
}

async function build() {
  copyStaticAssets();

  const extensionConfig = {
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'dist/extension.js',
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    sourcemap: !isProduction,
    minify: isProduction,
    treeShaking: true,
    logLevel: 'info',
  };

  const dashboardConfig = {
    entryPoints: ['src/ui/dashboard/dashboard.ts'],
    bundle: true,
    outfile: 'dist/ui/dashboard.js',
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    sourcemap: !isProduction,
    minify: isProduction,
    logLevel: 'info',
  };

  if (isWatch) {
    const extCtx = await esbuild.context(extensionConfig);
    const dashCtx = await esbuild.context(dashboardConfig);
    await Promise.all([extCtx.watch(), dashCtx.watch()]);
    console.log('Watching for changes...');
  } else {
    await esbuild.build(extensionConfig);
    if (fs.existsSync('src/ui/dashboard/dashboard.ts')) {
      await esbuild.build(dashboardConfig);
    }
    console.log('Build completed successfully.');
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
