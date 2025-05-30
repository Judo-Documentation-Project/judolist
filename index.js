const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');
const mustache = require('mustache');
const Parser = require('rss-parser');
const RdfaParser = require('rdfa-streaming-parser').RdfaParser;
const N3 = require('n3');
const dataFactory = N3.DataFactory;

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
    //const outputDir = path.join(__dirname, 'dist');
    const outputDir = __dirname;
    const templateFile = path.join(__dirname, 'bulma.mustache');
    const outputFile = path.join(outputDir, 'index.html');

    console.log('Starting site generation...');
    console.log(`Reading YAML files from ${resourcesDir}`);
    const resources = [];
    const files = await fs.readdir(resourcesDir);
    for (const file of files) {
        if (file.endsWith('.yaml')) {
            const filePath = path.join(resourcesDir, file);
            const data = yaml.load(await fs.readFile(filePath, 'utf8'));
            if (data && data.resource) {
                data.resource.filename = file; // Store filename with resource
                resources.push(data.resource);
            }
        }
    }


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
                    date: latest.isoDate ? latest.isoDate.split('T')[0] : 'Unknown date', 
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
    const marked = require('marked');

    async function getBudoTreeData(jdpId) {
        try {
            //console.log(`Fetching BudoTree data for ${jdpId}`);
            const url = `https://budotree.judoc.org/${jdpId}.html`;
            const response = await fetch(url);
            const html = await response.text();

            const parser = new RdfaParser({
                baseIRI: url,
                contentType: 'text/html'
            });

            const quads = [];
            const htmlStream = require('stream').Readable.from(html);
            
            // First pass: collect all quads
            await new Promise((resolve, reject) => {
                htmlStream.pipe(parser)
                    .on('data', quad => quads.push(quad))
                    .on('end', resolve)
                    .on('error', reject);
            });

            // Second pass: find person subject and name
            let personSubject;
            let name = jdpId; // Default fallback

            // Find the Person resource first
            for (const quad of quads) {
                if (quad.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' &&
                    quad.object.value === 'https://schema.org/Person' &&
                    quad.subject.value.endsWith(`${jdpId}.html`)) {
                    personSubject = quad.subject.value;
                    break;
                }
            }

            // Now look for name associated with this subject
            if (personSubject) {
                for (const quad of quads) {
                    if (quad.predicate.value === 'https://schema.org/name' &&
                        quad.subject.value === personSubject) {
                        name = quad.object.value;
                        break;
                    }
                }
            }

            console.log(name !== jdpId 
              ? `✅ Successfully resolved name for ${jdpId}: ${name}` 
              : `⚠️ Using fallback ID for ${jdpId}`);
        
            return {
                name: name,
                profileUrl: url,
                treeUrl: `https://budotree.judoc.org/tree.html?id=${jdpId}&infobox=visible`
            };
        } catch (error) {
            console.error(`Error fetching BudoTree data for ${jdpId}:`, error);
            throw error;
        }
    }

    const preparedResources = await Promise.all(resources.map(async r => {
      const treeLinks = r.tree ? await Promise.all(r.tree.map(async id => ({
        ...await getBudoTreeData(id),
        id
      }))) : [];
      return {
        ...r,
        treeLinks,
        commentHtml: r.comment ? marked.parse(String(r.comment)) : '',
        descriptionHtml: r.description ? marked.parse(String(r.description)) : '',
        idNumber: parseInt(r.id.split('-')[2]),
        episodeInfo: r.rss ? {
            ...(await getLastEpisode(r.rss)),
            isPodcast: (r.tags || []).includes('podcast'),
            isChannel: (r.tags || []).includes('channel')
        } : null,
        urls: (() => {
            const processUrl = (url) => {
                const domainMap = [
                    { pattern: 'podcasts.apple.com', icon: 'fa-apple', style: 'fab' },
                    { pattern: 'spotify.com', icon: 'fa-spotify', style: 'fab' },
                    { pattern: 'tiktok.com', icon: 'fa-tiktok', style: 'fab' },
                    { pattern: 'facebook.com', icon: 'fa-facebook', style: 'fab' },
                    { pattern: 'instagram.com', icon: 'fa-instagram', style: 'fab' },
                    { pattern: 'archive.org', icon: 'fa-landmark-flag', style: 'fas' },
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
      resourcesJson: encodeURIComponent(JSON.stringify(preparedResources)),
      tagStyles
    });
    
    // Write the output HTML file
    await fs.writeFile(outputFile, html);
    console.log('\nSite generation completed');
    
    // Calculate totals from all resources
    const totals = preparedResources.reduce((acc, r) => {
        if (r.episodeInfo) {
            if (r.episodeInfo.date !== 'NA') acc.success++;
            if (r.episodeInfo.date === 'NA') acc.failed++;
        } else {
            acc.skipped++;
        }
        return acc;
    }, {success: 0, failed: 0, skipped: 0});

    console.log(`Processed ${totals.success + totals.failed} RSS feeds`);
    console.log(`Successfully fetched ${totals.success} updates`);
    console.log(`Failed to fetch ${totals.failed} updates`);
    console.log(`Skipped ${totals.skipped} non-RSS resources`);
    console.log('HTML file generated as ' + outputFile);
}

generateHtml()
  .catch(console.error)
  .finally(() => {
    process.exitCode = 0;
    process.exit(0);
  });
