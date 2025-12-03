const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting custom build process...');

// Run the Next.js build
try {
  console.log('📦 Building Next.js application...');
  execSync('npx next build', { stdio: 'inherit' });
  console.log('✅ Next.js build completed');
} catch (error) {
  console.error('❌ Next.js build failed:', error.message);
  process.exit(1);
}

// Copy build files to dist
try {
  console.log('📋 Copying build files to dist...');

  function copyDir(src, dest) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src);

    for (const entry of entries) {
      const srcPath = path.join(src, entry);
      const destPath = path.join(dest, entry);

      if (fs.statSync(srcPath).isDirectory()) {
        copyDir(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  if (fs.existsSync('.next')) {
    copyDir('.next', 'dist');
    console.log('✅ Build files copied to dist/');
  } else {
    console.error('❌ .next directory not found!');
    process.exit(1);
  }

  // Copy public files to dist
  if (fs.existsSync('public')) {
    copyDir('public', 'dist');
    console.log('✅ Public files copied to dist/');
  }

  console.log('🎉 Custom build process completed successfully!');
} catch (error) {
  console.error('❌ Build file copy failed:', error.message);
  process.exit(1);
}
