#!/usr/bin/env bash
# Run development server, wait for it, then execute Lighthouse audit
npm run dev &
# Wait for the dev server to be ready (default Next.js port 3000)
# Using npx wait-on to poll the URL
npx wait-on http://localhost:3000 && 
# Run Lighthouse and output HTML and JSON reports
lighthouse http://localhost:3000 --output=html --output-path=./audit/report.html --output=json --output-path=./audit/performance.lhr.json
