# Install SweetAlert2

If npm install failed, try one of these methods:

## Method 1: Manual Install
```bash
npm install sweetalert2@11.10.0
```

## Method 2: Using yarn (if available)
```bash
yarn add sweetalert2@11.10.0
```

## Method 3: Check npm version
```bash
npm --version
node --version
```

If versions are very old, update Node.js and npm.

## Method 4: Clear npm cache
```bash
npm cache clean --force
npm install sweetalert2@11.10.0
```

## Already Added to package.json
The package is already in `package.json`, so you can try:
```bash
npm install
```

## Verify Installation
After installation, check:
- `node_modules/sweetalert2` folder exists
- No TypeScript errors in `lib/sweetalert.ts`

The CSS is loaded from CDN, so the styles will work even if npm install fails temporarily.

