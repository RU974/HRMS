# HRMS CI/CD Build Configuration

This document provides CI/CD pipeline configuration examples for building, testing, and deploying the HRMS application.

---

## Overview

HRMS consists of two independent build pipelines:

| Component | Language | Build Tool | Output | Test Command |
| --- | --- | --- | --- | --- |
| **Backend** | PHP | Composer | `.env` ready for deployment | `php artisan test` |
| **Frontend** | TypeScript/React | npm/Vite | `frontend/dist/` static bundle | `npm run build` (validates) |

Both must pass tests before deployment.

---

## GitHub Actions

### Option 1: Combined Workflow (Recommended)

Create `.github/workflows/ci.yml`:

```yaml
name: CI - Build & Test

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

jobs:
  backend-test:
    name: Backend (PHP Tests)
    runs-on: ubuntu-latest
    
    services:
      mysql:
        image: mysql:8.0
        env:
          MYSQL_ROOT_PASSWORD: root
          MYSQL_DATABASE: hrms_test
        options: >-
          --health-cmd="mysqladmin ping"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=3
        ports:
          - 3306:3306
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup PHP
        uses: shivammathur/setup-php@v2
        with:
          php-version: '8.2'
          extensions: mbstring, bcmath, pdo, pdo_mysql, pdo_sqlite
          coverage: pcov
      
      - name: Install Composer Dependencies
        run: |
          cd backend
          composer install --no-progress --prefer-dist --optimize-autoloader
      
      - name: Setup Environment
        run: |
          cd backend
          cp .env.example .env.testing
          php artisan key:generate --env=testing
      
      - name: Run Database Migrations
        run: |
          cd backend
          php artisan migrate --env=testing --force
      
      - name: Seed Database
        run: |
          cd backend
          php artisan db:seed --env=testing --force
      
      - name: Run PHPUnit Tests
        run: |
          cd backend
          php artisan test
      
      - name: Upload Coverage (Optional)
        uses: codecov/codecov-action@v3
        with:
          files: ./backend/coverage.xml
          flags: backend
          fail_ci_if_error: false

  frontend-build:
    name: Frontend (Build & Lint)
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json
      
      - name: Install Dependencies
        run: |
          cd frontend
          npm ci  # Use ci instead of install for CI environments
      
      - name: Run Linting
        run: |
          cd frontend
          npm run lint || true  # Continue even if lint fails
      
      - name: Type Check
        run: |
          cd frontend
          npx tsc --noEmit
      
      - name: Build Production Bundle
        run: |
          cd frontend
          npm run build
        env:
          VITE_API_BASE_URL: /api/v1
      
      - name: Upload Build Artifacts
        uses: actions/upload-artifact@v3
        with:
          name: frontend-dist
          path: frontend/dist/
          retention-days: 5

  deploy-staging:
    name: Deploy to Staging
    if: github.ref == 'refs/heads/develop'
    needs: [backend-test, frontend-build]
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Download Frontend Artifacts
        uses: actions/download-artifact@v3
        with:
          name: frontend-dist
          path: ./frontend-dist
      
      - name: Deploy Backend
        run: |
          echo "Deploying backend to staging..."
          # Add your backend deployment script here
          # e.g., SSH to server, git pull, composer install, migrate
      
      - name: Deploy Frontend
        run: |
          echo "Deploying frontend to staging..."
          # Add your frontend deployment script here
          # e.g., upload frontend-dist to CDN or web server
```

### Option 2: Separate Workflows

If you prefer separate CI pipelines for backend and frontend:

**`.github/workflows/backend-ci.yml`:**

```yaml
name: Backend CI

on:
  push:
    branches: [ main, develop ]
    paths:
      - 'backend/**'
      - '.github/workflows/backend-ci.yml'
  pull_request:
    branches: [ main, develop ]
    paths:
      - 'backend/**'

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup PHP
        uses: shivammathur/setup-php@v2
        with:
          php-version: '8.2'
          extensions: mbstring, bcmath, pdo, pdo_sqlite
      
      - name: Install Dependencies
        run: |
          cd backend
          composer install
      
      - name: Setup Testing Environment
        run: |
          cd backend
          cp .env.example .env.testing
          php artisan key:generate --env=testing
      
      - name: Run Tests
        run: |
          cd backend
          php artisan test
```

**`.github/workflows/frontend-ci.yml`:**

```yaml
name: Frontend CI

on:
  push:
    branches: [ main, develop ]
    paths:
      - 'frontend/**'
      - '.github/workflows/frontend-ci.yml'
  pull_request:
    branches: [ main, develop ]
    paths:
      - 'frontend/**'

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json
      
      - name: Install Dependencies
        run: |
          cd frontend
          npm ci
      
      - name: Lint
        run: |
          cd frontend
          npm run lint || true
      
      - name: Type Check
        run: |
          cd frontend
          npx tsc --noEmit
      
      - name: Build
        run: |
          cd frontend
          npm run build
```

---

## GitLab CI

Create `.gitlab-ci.yml` in the project root:

```yaml
stages:
  - build
  - test
  - deploy

variables:
  COMPOSER_VERSION: 2
  NODE_VERSION: 18

backend:build:
  stage: build
  image: php:8.2
  before_script:
    - cd backend
    - apt-get update && apt-get install -y git unzip
    - curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer
  script:
    - composer install --no-progress --prefer-dist --optimize-autoloader
  artifacts:
    paths:
      - backend/vendor/
    expire_in: 1 hour

backend:test:
  stage: test
  image: php:8.2
  services:
    - mysql:8.0
  variables:
    MYSQL_DATABASE: hrms_test
    MYSQL_ROOT_PASSWORD: root
    DB_CONNECTION: mysql
    DB_HOST: mysql
  dependencies:
    - backend:build
  before_script:
    - cd backend
    - apt-get update && apt-get install -y default-mysql-client
    - cp .env.example .env.testing
    - php artisan key:generate --env=testing
  script:
    - php artisan migrate --env=testing --force
    - php artisan test

frontend:build:
  stage: build
  image: node:18
  before_script:
    - cd frontend
  script:
    - npm ci
    - npm run build
  artifacts:
    paths:
      - frontend/dist/
    expire_in: 1 hour

frontend:lint:
  stage: test
  image: node:18
  before_script:
    - cd frontend
  script:
    - npm ci
    - npm run lint || true
    - npx tsc --noEmit

deploy:staging:
  stage: deploy
  image: alpine:latest
  environment:
    name: staging
    url: https://staging.example.com
  dependencies:
    - backend:build
    - frontend:build
  only:
    - develop
  before_script:
    - apk add --no-cache git openssh-client
  script:
    - echo "Deploying to staging..."
    # Add deployment commands
```

---

## Local Pre-Commit Checks

To catch issues before pushing, create a pre-commit hook:

**`.husky/pre-commit`** (requires [husky](https://typicode.github.io/husky/)):

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

echo "Running pre-commit checks..."

# Backend checks
if git diff --cached --name-only | grep -q "backend/"; then
    echo "🔍 Checking backend..."
    cd backend
    php -l app/Http/Controllers/*.php  # Syntax check
    if ! php artisan test --quick; then
        echo "❌ Backend tests failed"
        exit 1
    fi
    cd ..
fi

# Frontend checks
if git diff --cached --name-only | grep -q "frontend/"; then
    echo "🔍 Checking frontend..."
    cd frontend
    if ! npm run build; then
        echo "❌ Frontend build failed"
        exit 1
    fi
    cd ..
fi

echo "✅ All checks passed"
```

---

## Environment Variables in CI

### Backend (`.env.ci` or `testing`)

```ini
APP_NAME=HRMS
APP_ENV=testing
APP_DEBUG=false

DB_CONNECTION=sqlite
DB_DATABASE=:memory:

FRONTEND_URL=http://localhost:5173
CORS_ALLOWED_ORIGINS=http://localhost:5173
```

### Frontend (during build)

```bash
npm run build
# Vite uses VITE_API_BASE_URL=/api/v1 by default
```

---

## Docker Support

### Backend Dockerfile

```dockerfile
FROM php:8.2-fpm

RUN apt-get update && apt-get install -y \
    git curl unzip \
    default-mysql-client \
    && docker-php-ext-install pdo pdo_mysql bcmath

WORKDIR /app

COPY backend/ /app/

RUN curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer
RUN composer install --no-dev --optimize-autoloader

RUN php artisan cache:clear && php artisan config:clear

EXPOSE 8000

CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=8000"]
```

### Frontend Dockerfile

```dockerfile
FROM node:18 AS builder

WORKDIR /app

COPY frontend/package*.json /app/

RUN npm ci

COPY frontend/ /app/

RUN npm run build

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  backend:
    build:
      context: .
      dockerfile: Dockerfile.backend
    ports:
      - "8000:8000"
    environment:
      DB_CONNECTION: mysql
      DB_HOST: mysql
      DB_DATABASE: hrms
      DB_USERNAME: root
      DB_PASSWORD: rootpassword
    depends_on:
      - mysql

  frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
    ports:
      - "80:80"

  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_DATABASE: hrms
    volumes:
      - mysql_data:/var/lib/mysql

volumes:
  mysql_data:
```

Run with:
```bash
docker-compose up --build
```

---

## Build Checklist

Before deploying to production:

- [ ] All backend tests pass (`php artisan test`)
- [ ] No PHP syntax errors (`php -l app/**/*.php`)
- [ ] Frontend builds without errors (`npm run build`)
- [ ] TypeScript strict mode passes (`npx tsc --noEmit`)
- [ ] Linting checks pass (`npm run lint`)
- [ ] Environment variables set correctly
- [ ] Database migrations tested locally
- [ ] Seed data runs without errors
- [ ] Frontend and backend URLs configured correctly in `.env`

---

## Deployment Pipeline Example

**Stage 1: Build**
- Compile backend (composer install)
- Compile frontend (npm run build)
- Run linting and type checks

**Stage 2: Test**
- Run backend unit and feature tests
- Validate frontend build output

**Stage 3: Artifact**
- Backend: ready for deployment (vendor/ included or installed at runtime)
- Frontend: dist/ bundle ready for CDN or web server

**Stage 4: Deploy**
- Copy backend files to server
- Run migrations: `php artisan migrate --force`
- Copy frontend dist/ to CDN or web server
- Configure web server to proxy `/api/v1` requests to backend

---

## Secrets Management

Store sensitive data in CI/CD environment variables:

### GitHub Actions Secrets
1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Add secrets:
   - `DB_PASSWORD` (database password)
   - `DEPLOY_KEY` (SSH private key)
   - `API_TOKEN` (for API calls)

3. Use in workflows:
   ```yaml
   - name: Deploy
     env:
      DB_PASSWORD: ${{ secrets.DB_PASSWORD }}
     run: ./deploy.sh
   ```

### GitLab CI Variables
1. Go to **Settings** → **CI/CD** → **Variables**
2. Add secrets (mark as **Protected** and **Masked**)
3. Use in pipeline:
   ```yaml
   deploy:
     script:
       - ./deploy.sh $DB_PASSWORD
   ```

---

## Monitoring & Logging

### Backend Health Check

Add to CI pipeline:

```yaml
- name: Health Check
  run: |
    cd backend
    php artisan migrate --env=testing --force
    php artisan serve --host=127.0.0.1 --port=8001 &
    sleep 2
    curl -f http://127.0.0.1:8001/api/v1/health || exit 1
```

### Frontend Performance

Add to CI pipeline:

```yaml
- name: Lighthouse Audit (Optional)
  uses: treosh/lighthouse-ci-action@v9
  with:
    configPath: './frontend/lighthouserc.json'
```

---

## Troubleshooting CI Failures

### Backend Tests Fail with "Table Not Found"
```yaml
- name: Run Database Migrations
  run: |
    cd backend
    php artisan migrate --env=testing --force
```

### Frontend Build Fails with "Missing Dependencies"
```yaml
- name: Clean Install
  run: |
    cd frontend
    rm -rf node_modules package-lock.json
    npm ci  # Use ci instead of install in CI
```

### Timeout Issues
Increase timeouts:
```yaml
- name: Run Tests
  timeout-minutes: 15  # GitHub Actions default is 360
  run: cd backend && php artisan test
```

---

## References

- [GitHub Actions](https://docs.github.com/en/actions)
- [GitLab CI/CD](https://docs.gitlab.com/ee/ci/)
- [Laravel Testing](https://laravel.com/docs/testing)
- [Vite Build](https://vitejs.dev/guide/build.html)
- [Docker](https://docs.docker.com/)
