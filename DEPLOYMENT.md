# 🚀 Docify — Deployment & Publishing Guide

A step-by-step guide to publish Docify as a public npm package so any developer can `npm install docify` and use it.

---

## Table of Contents

1. [Pre-Publish Checklist](#1-pre-publish-checklist)
2. [Setting Up Your npm Account](#2-setting-up-your-npm-account)
3. [Preparing the Package](#3-preparing-the-package)
4. [Publishing to npm](#4-publishing-to-npm)
5. [Scoped Package (Alternative)](#5-scoped-package-alternative)
6. [Versioning & Updates](#6-versioning--updates)
7. [Setting Up GitHub Repository](#7-setting-up-github-repository)
8. [CI/CD with GitHub Actions](#8-cicd-with-github-actions)
9. [Post-Publish Verification](#9-post-publish-verification)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Pre-Publish Checklist

Before publishing, make sure everything is ready:

```bash
# Run tests — all 42 should pass
npm test

# Verify what files will be included in the package
npm pack --dry-run
```

The `npm pack --dry-run` output should show ONLY these files:

```
src/index.js
src/core/logger.js
src/core/routeRegistry.js
src/core/sanitizer.js
src/docs/generator.js
src/docs/uiServer.js
src/middleware/captureMiddleware.js
package.json
README.md
```

> ⚠️ **Important**: The `test/` and `example/` directories should NOT appear — they are excluded via `.npmignore`.

---

## 2. Setting Up Your npm Account

### Create an npm Account

If you don't already have one:

1. Go to [https://www.npmjs.com/signup](https://www.npmjs.com/signup)
2. Create an account with your email
3. **Verify your email** (required for publishing)

### Login via CLI

```bash
npm login
```

You'll be prompted for:
- **Username**: your npm username
- **Password**: your npm password
- **Email**: your registered email
- **OTP**: if you have 2FA enabled (recommended)

Verify you're logged in:

```bash
npm whoami
```

---

## 3. Preparing the Package

### 3.1 Update Author & Repository Info

Edit `package.json` and fill in your details:

```json
{
  "author": "Your Name <your.email@example.com>",
  "repository": {
    "type": "git",
    "url": "https://github.com/YOUR_USERNAME/docify.git"
  },
  "homepage": "https://github.com/YOUR_USERNAME/docify#readme",
  "bugs": {
    "url": "https://github.com/YOUR_USERNAME/docify/issues"
  }
}
```

### 3.2 Check Package Name Availability

The name `docify` may already be taken on npm. Check first:

```bash
npm search docify
# or visit https://www.npmjs.com/package/docify
```

**If the name is taken**, you have two options:

| Option | Package Name | Install Command |
|---|---|---|
| Use a different name | `docify-express` or `express-docify` | `npm install docify-express` |
| Use a scoped name | `@yourname/docify` | `npm install @yourname/docify` |

To change the name, edit the `"name"` field in `package.json`:

```json
{
  "name": "docify-express"
}
```

Or for a scoped package:

```json
{
  "name": "@yourname/docify"
}
```

### 3.3 Add a LICENSE File

```bash
# Create MIT license file (already declared in package.json)
```

Create a `LICENSE` file in the project root:

```
MIT License

Copyright (c) 2026 Your Name

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### 3.4 Final package.json Review

Your `package.json` should have these key fields:

| Field | Purpose | Status |
|---|---|---|
| `name` | Package name on npm | ✅ Set |
| `version` | Semantic version | ✅ `1.0.0` |
| `description` | Shows in npm search | ✅ Set |
| `main` | Entry point for `require('docify')` | ✅ `src/index.js` |
| `keywords` | npm search discoverability | ✅ 8 keywords |
| `license` | Legal terms | ✅ MIT |
| `files` | What gets published | ✅ `["src/"]` |
| `engines` | Node version requirement | ✅ `>=16.0.0` |
| `peerDependencies` | Express as peer dep | ✅ `>=4.0.0` |

---

## 4. Publishing to npm

### First-Time Publish

```bash
# Navigate to project root
cd c:\Users\alikh\Desktop\Projects\Docify

# Publish to npm (public package)
npm publish
```

For scoped packages (e.g., `@yourname/docify`), you must add `--access public`:

```bash
npm publish --access public
```

### Successful Output

You should see something like:

```
npm notice
npm notice 📦  docify@1.0.0
npm notice === Tarball Contents ===
npm notice 736B  package.json
npm notice 4.9kB README.md
npm notice 1.2kB src/index.js
npm notice ...
npm notice === Tarball Details ===
npm notice name:          docify
npm notice version:       1.0.0
npm notice package size:  8.5 kB
npm notice unpacked size: 28.3 kB
npm notice total files:   8
+ docify@1.0.0
```

### Verify It's Live

```bash
# Check on npm
npm info docify

# Or visit in browser
# https://www.npmjs.com/package/docify
```

---

## 5. Scoped Package (Alternative)

If you prefer to publish under your own scope (e.g., `@ali/docify`):

### 5.1 Create an npm Organization (Optional)

1. Go to [https://www.npmjs.com/org/create](https://www.npmjs.com/org/create)
2. Create a free organization

### 5.2 Update package.json

```json
{
  "name": "@yourscope/docify"
}
```

### 5.3 Publish

```bash
npm publish --access public
```

### 5.4 Users Install With

```bash
npm install @yourscope/docify
```

```js
const docify = require('@yourscope/docify');
app.use(docify());
```

---

## 6. Versioning & Updates

Docify follows [Semantic Versioning](https://semver.org/):

| Version Bump | When | Command |
|---|---|---|
| **Patch** (1.0.0 → 1.0.1) | Bug fixes, minor tweaks | `npm version patch` |
| **Minor** (1.0.0 → 1.1.0) | New features, backward-compatible | `npm version minor` |
| **Major** (1.0.0 → 2.0.0) | Breaking changes | `npm version major` |

### Publish an Update

```bash
# 1. Make your changes
# 2. Run tests
npm test

# 3. Bump version (automatically updates package.json & creates git tag)
npm version patch   # or minor, or major

# 4. Publish
npm publish

# 5. Push to GitHub with tags
git push origin main --tags
```

---

## 7. Setting Up GitHub Repository

### 7.1 Initialize Git

```bash
cd c:\Users\alikh\Desktop\Projects\Docify

git init
git add .
git commit -m "feat: initial release of Docify v1.0.0"
```

### 7.2 Create GitHub Repository

1. Go to [https://github.com/new](https://github.com/new)
2. Repository name: `docify`
3. Description: `Zero-config Express.js middleware that auto-generates API documentation`
4. Set to **Public**
5. Don't initialize with README (we already have one)

### 7.3 Push to GitHub

```bash
git remote add origin https://github.com/YOUR_USERNAME/docify.git
git branch -M main
git push -u origin main
```

### 7.4 Add GitHub Topics

On your GitHub repo page, click the gear icon near "About" and add topics:
`express`, `middleware`, `api-documentation`, `developer-tools`, `nodejs`, `auto-docs`

---

## 8. CI/CD with GitHub Actions

Create `.github/workflows/ci.yml` to automatically test on every push and publish on tags:

```yaml
name: CI & Publish

on:
  push:
    branches: [main]
    tags: ['v*']
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [16, 18, 20, 22]

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}

      - run: npm ci
      - run: npm test

  publish:
    needs: test
    runs-on: ubuntu-latest
    if: startsWith(github.ref, 'refs/tags/v')

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: 'https://registry.npmjs.org'

      - run: npm ci
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### Set Up NPM_TOKEN Secret

1. Go to [https://www.npmjs.com/settings/YOUR_USERNAME/tokens](https://www.npmjs.com/settings/YOUR_USERNAME/tokens)
2. Click **Generate New Token** → **Automation** token
3. Copy the token
4. Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions**
5. Click **New repository secret**
   - Name: `NPM_TOKEN`
   - Value: paste the token

Now every time you push a version tag, it auto-publishes:

```bash
npm version patch
git push origin main --tags
# → GitHub Actions runs tests → publishes to npm
```

---

## 9. Post-Publish Verification

After publishing, verify everything works from a consumer's perspective:

```bash
# Create a temp test project
mkdir /tmp/test-docify
cd /tmp/test-docify
npm init -y
npm install docify express   # or your scoped name

# Create a quick test file
cat > test.js << 'EOF'
const express = require('express');
const docify = require('docify');

const app = express();
app.use(express.json());
app.use(docify());

app.get('/api/test', (req, res) => res.json({ hello: 'world' }));

app.listen(4000, () => {
  console.log('Test server on http://localhost:4000');
  console.log('Docs at http://localhost:4000/docs');
});
EOF

node test.js
# Visit http://localhost:4000/api/test  (trigger capture)
# Visit http://localhost:4000/docs       (see the docs)
```

---

## 10. Troubleshooting

### "Package name already taken"

```bash
# Check if name is available
npm search docify

# Options:
# 1. Choose a different name: docify-express, express-docify, docify-sdk
# 2. Use scoped: @yourname/docify (always available)
```

### "You must verify your email"

```bash
# npm requires email verification before first publish
# Check your inbox for the verification email from npm
```

### "Permission denied" / "403 Forbidden"

```bash
# Make sure you're logged in
npm whoami

# Re-login if needed
npm login

# If using 2FA, make sure you provide the OTP
npm publish --otp=123456
```

### "Missing README"

The `README.md` is already in the project root and will be included automatically.

### Package Size Too Large

```bash
# Check what's being included
npm pack --dry-run

# Make sure .npmignore excludes test/, example/, node_modules/
cat .npmignore
```

---

## Quick Reference: Complete Publish Flow

```bash
# One-time setup
npm login

# Publish for the first time
cd c:\Users\alikh\Desktop\Projects\Docify
npm test                    # Verify tests pass
npm pack --dry-run          # Verify package contents
npm publish                 # Publish! (add --access public for scoped)

# For updates
npm test
npm version patch           # Bumps 1.0.0 → 1.0.1
npm publish
git push origin main --tags
```

**Your package will be live at: `https://www.npmjs.com/package/docify`** 🎉
