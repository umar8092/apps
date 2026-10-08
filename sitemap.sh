#!/bin/sh
# Regenerates sitemap.xml + robots.txt. Run from repo root after adding/changing an app.
# Lists the hub and every folder whose index.html has a meta description (redirect stubs have none).
B=https://umar8092.github.io/apps
{
echo '<?xml version="1.0" encoding="UTF-8"?>'
echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
echo "<url><loc>$B/</loc><lastmod>$(date +%F)</lastmod></url>"
for d in */; do
  d=${d%/}
  grep -qi 'name="description"' "$d/index.html" 2>/dev/null || continue
  m=$(git log -1 --format=%cs -- "$d" 2>/dev/null); m=${m:-$(date +%F)}
  echo "<url><loc>$B/$d/</loc><lastmod>$m</lastmod></url>"
done
echo '</urlset>'
} > sitemap.xml
printf 'User-agent: *\nAllow: /\n\nSitemap: %s/sitemap.xml\n' "$B" > robots.txt
