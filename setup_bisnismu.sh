#!/bin/bash
# setup_bisnismu.sh
# Script otomatis setup folder proyek BisnisMu dari documentation files

set -e  # Exit jika ada error

echo "🚀 BisnisMu Setup Script"
echo "========================"

# 1. Tentukan lokasi proyek
BISNISMU_HOME="${1:-.}"
DOCS_DIR="$BISNISMU_HOME/docs"

echo ""
echo "📁 Setup directory: $BISNISMU_HOME"
echo "📄 Docs directory: $DOCS_DIR"

# 2. Buat folder struktur
echo ""
echo "📂 Membuat folder struktur..."
mkdir -p "$BISNISMU_HOME/docs"
mkdir -p "$BISNISMU_HOME/.claude/skills"
mkdir -p "$BISNISMU_HOME/.claude/agents"
mkdir -p "$BISNISMU_HOME/apps/{api,web}"
mkdir -p "$BISNISMU_HOME/packages/{db,types,ui,sdk}"
echo "✅ Folder struktur selesai"

# 3. Copy documentation files
echo ""
echo "📋 Copy documentation files..."

# Lokasi source file (dari /mnt/user-data/outputs/)
SOURCE_DIR="/mnt/user-data/outputs"

# Daftar file yang perlu di-copy
declare -a DOCS_FILES=(
    "INDEX_BISNISMU.md"
    "BISNISMU_START_HERE.md"
    "BRAND_GUIDELINES_bisnismu.md"
    "PRD_bisnismu.md"
    "setup_claude_code_bisnismu.md"
    "skema_database_bisnismu_v2.sql"
    "BISNISMU_FINAL_CHECKLIST.md"
)

for file in "${DOCS_FILES[@]}"; do
    if [ -f "$SOURCE_DIR/$file" ]; then
        cp "$SOURCE_DIR/$file" "$DOCS_DIR/"
        echo "  ✅ $file"
    else
        echo "  ⚠️  $file not found (download manually dari chat)"
    fi
done

# 4. Buat README.md
echo ""
echo "📝 Membuat README.md..."
cat > "$BISNISMU_HOME/README.md" << 'READMEEOF'
# BisnisMu — Sistem Bisnis Lengkap untuk UMKM

Aplikasi kasir universal untuk warung makan, toko kelontong, salon, laundry, dan berbagai jenis usaha lainnya.

## 📚 Dokumentasi

**MULAI DI SINI:** [docs/INDEX_BISNISMU.md](docs/INDEX_BISNISMU.md)

### File Penting
- [Panduan Startup Fase 0](docs/BISNISMU_START_HERE.md)
- [Product Requirement Document](docs/PRD_bisnismu.md)
- [Brand Guidelines](docs/BRAND_GUIDELINES_bisnismu.md)
- [Claude Code Setup](docs/setup_claude_code_bisnismu.md)
- [Database Schema](docs/skema_database_bisnismu_v2.sql)
- [Final Checklist](docs/BISNISMU_FINAL_CHECKLIST.md)

## 🏗️ Tech Stack

- Backend: NestJS + Prisma + PostgreSQL 16
- Frontend: Next.js 15 + TypeScript + Tailwind CSS
- Development: Claude Code + MCP servers
- Deploy: Docker Compose

## 🚀 Quick Start

1. Baca [docs/INDEX_BISNISMU.md](docs/INDEX_BISNISMU.md)
2. Ikuti [docs/BISNISMU_START_HERE.md](docs/BISNISMU_START_HERE.md)
3. Setup Claude Code dengan [docs/setup_claude_code_bisnismu.md](docs/setup_claude_code_bisnismu.md)

---

**Open-source POS untuk UMKM Indonesia 🇮🇩**
READMEEOF
echo "✅ README.md created"

# 5. Buat .gitignore
echo ""
echo "🔒 Membuat .gitignore..."
cat > "$BISNISMU_HOME/.gitignore" << 'GITIGNOREEOF'
# Dependencies
node_modules/
pnpm-lock.yaml
package-lock.json
yarn.lock

# Environment variables
.env
.env.local
.env.*.local
.env.production

# Build outputs
dist/
build/
.next/

# Database
prisma/migrations/
.prisma/

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# Logs
*.log
logs/
npm-debug.log*

# OS
.DS_Store
Thumbs.db

# Testing
coverage/
.nyc_output/

# Temporary
tmp/
temp/
GITIGNOREEOF
echo "✅ .gitignore created"

# 6. Setup pnpm workspace
echo ""
echo "📦 Setup pnpm workspace..."
cat > "$BISNISMU_HOME/pnpm-workspace.yaml" << 'PNPMEOF'
packages:
  - "apps/*"
  - "packages/*"
PNPMEOF
echo "✅ pnpm-workspace.yaml created"

# 7. Setup package.json root
echo ""
echo "📦 Setup root package.json..."
cat > "$BISNISMU_HOME/package.json" << 'PACKAGEEOF'
{
  "name": "bisnismu",
  "version": "0.0.1",
  "description": "Sistem bisnis lengkap untuk UMKM Indonesia",
  "private": true,
  "scripts": {
    "dev": "pnpm -r --parallel run dev",
    "build": "pnpm -r run build",
    "test": "pnpm -r run test",
    "lint": "pnpm -r run lint",
    "typecheck": "pnpm -r run typecheck",
    "db:migrate": "pnpm -w --filter @bisnismu/db exec prisma migrate dev",
    "db:seed": "pnpm -w --filter @bisnismu/db exec prisma db seed",
    "format": "prettier --write \"**/*.{ts,tsx,md,json}\"",
    "clean": "rm -rf node_modules .next dist build coverage"
  },
  "devDependencies": {
    "prettier": "^3.0.0",
    "typescript": "^5.0.0"
  }
}
PACKAGEEOF
echo "✅ package.json created"

# 8. Init git
echo ""
echo "🔧 Initialize git..."
cd "$BISNISMU_HOME"

if [ ! -d ".git" ]; then
    git init
    echo "✅ Git initialized"
else
    echo "ℹ️  Git sudah initialized"
fi

# 9. First commit
echo ""
echo "📝 First commit..."
git add .
git commit -m "docs(init): BisnisMu documentation foundation — setup otomatis" 2>/dev/null || \
    echo "⚠️  Git commit failed (kemungkinan ada perubahan belum di-stage)"

# 10. Summary
echo ""
echo "🎉 Setup selesai!"
echo ""
echo "📋 Checklist berikutnya:"
echo "   1. cd $BISNISMU_HOME"
echo "   2. Baca: cat docs/INDEX_BISNISMU.md"
echo "   3. Setup Docker PostgreSQL"
echo "   4. Setup pnpm: pnpm install"
echo "   5. Setup Claude Code: claude init"
echo ""
echo "👉 Langkah pertama: baca docs/INDEX_BISNISMU.md"
echo ""
