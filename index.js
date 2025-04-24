const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');
const mustache = require('mustache');
const Parser = require('rss-parser');

function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // Generate more varied HSL values
    const h = Math.abs(hash % 360);
    const s = 50 + (hash % 51);  // 50-100%
    const l = 30 + (hash % 41);  // 30-70%
    
    // Convert HSL to RGB for accurate luminance calculation
    const lNorm = l / 100;
    const a = s * Math.min(lNorm, 1 - lNorm) / 100;
    const f = n => {
        const k = (n + h/30) % 12;
        return lNorm - a * Math.max(Math.min(k-3, 9-k, 1), -1);
    };
    
    const r = f(0);
    const g = f(8);
    const b = f(4);
    
    // Calculate relative luminance (WCAG 2.1 formula)
    const luminance = 0.2126 * Math.pow(r, 2.2) + 
                     0.7152 * Math.pow(g, 2.2) + 
                     0.0722 * Math.pow(b, 2.2);
    
    return {
        bg: `hsl(${h}, ${s}%, ${l}%)`,
        text: luminance > 0.179 ? '#333' : '#fff' // Use WCAG contrast threshold
    };
}

async function generateHtml() {
    const resourcesDir = path.join(__dirname, 'database');
    const templateFile = path.join(__dirname, 'bulma.mustache');
    const outputFile = path.join(__dirname, 'output.html');

    console.log('Starting site generation...');
    console.log(`Reading YAML files from ${resourcesDir}`);
    const resources = [];
    const files = await fs.readdir(resourcesDir);
    for (const file of files) {
        if (file.endsWith('.yaml')) {
            const filePath = path.join(resourcesDir, file);
            const data = yaml.load(await fs.readFile(filePath, 'utf8'));
            if (data && data.resource) {
                resources.push(data.resource);
            }
        }
    }

    // Sort resources by `id`
    resources.sort((a, b) => {
        const idA = parseInt(a.id.split('-')[2]);
        const idB = parseInt(b.id.split('-')[2]);
        return idA - idB;
    });

    // Get all unique tags
    const allTags = [...new Set(resources.flatMap(r => r.tags || []))].sort();

    // Podcast episode fetching
    const parser = new Parser();
    
    const getLastEpisode = async (rssUrl) => {
        try {
            console.log(`Fetching RSS feed: ${rssUrl}`);
            const response = await fetch(rssUrl);
            const xml = await response.text();
            const feed = await parser.parseString(xml);
            
            if (feed.items?.length > 0) {
                const latest = feed.items[0];
                return {
                    date: latest.isoDate ? new Date(latest.isoDate).toLocaleDateString() : 'Unknown date',
                    title: latest.title || 'Untitled episode',
                    link: latest.link || (latest.enclosure?.url || '')
                };
            }
            return {date: 'NA', title: 'No episodes found'};
        } catch (error) {
            console.error(`❌ Error fetching RSS feed: ${error.message}`);
            return {date: 'NA', title: 'Error fetching episodes'};
        }
    };

    // Prepare resources for template and process podcast episodes
    const preparedResources = await Promise.all(resources.map(async r => {
      return {
        ...r,
        episodeInfo: r.rss ? await getLastEpisode(r.rss) : {date: 'NA', title: 'No RSS feed'},
        urls: (() => {
            const processUrl = (url) => {
                const domainMap = [
                    { pattern: 'podcasts.apple.com', icon: 'fa-apple', style: 'fab' },
                    { pattern: 'spotify.com', icon: 'fa-spotify', style: 'fab' },
                    { pattern: 'youtube.com/playlist', icon: 'fa-youtube', style: 'fab' },
                    { pattern: 'youtube.com', icon: 'fa-youtube', style: 'fab' },
                    { pattern: 'megaphone.fm', icon: 'fa-podcast', style: 'fas' },
                    { pattern: 'podbean.com', icon: 'fa-podcast', style: 'fas' },
                    { pattern: 'anchor.fm', icon: 'fa-podcast', style: 'fas' }
                ];

                const match = domainMap.find(m => url.includes(m.pattern));
                return {
                    url,
                    icon: match ? match.icon : 'fa-globe',
                    style: match ? match.style : 'fas'
                };
            };
            
            return Array.isArray(r.url) ? 
                r.url.map(processUrl) : 
                [processUrl(r.url)];
        })()
      };
    }));

    // Generate tag styles as array of objects for Mustache
    const tagStyles = allTags.map(tag => {
        const colors = stringToColor(tag);
        return {
            tag: tag,
            styles: {
                bgColor: colors.bg,
                textColor: colors.text
            }
        };
    });

    // Load and render the Mustache template
    const template = await fs.readFile(templateFile, 'utf8');
    const html = mustache.render(template, { 
      resources: preparedResources,
      allTags,
      resourcesJson: JSON.stringify(preparedResources).replace(/"/g, '&quot;'),
      tagStyles
    });

    // Write the output HTML file
    await fs.writeFile(outputFile, html);
    console.log('\nSite generation completed');
    
    // Calculate totals from all resources
    const totals = preparedResources.reduce((acc, r) => {
        if (r.episodeInfo.date !== 'NA') acc.success++;
        if (r.episodeInfo.date === 'NA') acc.failed++;
        return acc;
    }, {success: 0, failed: 0});

    console.log(`Processed ${totals.success + totals.failed} podcast resources`);
    console.log(`Successfully fetched ${totals.success} episodes`);
    console.log(`Failed to fetch ${totals.failed} episodes`);
    console.log('HTML file generated as output.html');
}

generateHtml()
  .catch(console.error)
  .finally(() => {
    process.exitCode = 0;
    process.exit(0);
  });
