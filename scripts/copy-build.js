const fs = require('fs');
const path = require('path');

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

// Copy .next to dist
if (fs.existsSync('.next')) {
  console.log('Copying .next to dist...');
  copyDir('.next', 'dist');
  console.log('Build files copied to dist/');
} else {
  console.error('.next directory not found!');
  process.exit(1);
}
