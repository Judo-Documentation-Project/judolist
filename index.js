const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');
const mustache = require('mustache');

function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 70%, 40%)`;
}

async function generateHtml() {
    const resourcesDir = path.join(__dirname, 'database');
    const templateFile = path.join(__dirname, 'bulma.mustache');
    const outputFile = path.join(__dirname, 'output.html');

    // Read YAML files from the database directory
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

    // Prepare resources for template
    const preparedResources = resources.map(r => {
      const processUrl = (url) => {
        const domainMap = [
          { pattern: 'podcasts.apple.com', icon: 'fa-apple', style: 'fab', type: 'apple' },
          { pattern: 'spotify.com', icon: 'fa-spotify', style: 'fab', type: 'spotify' },
          { pattern: 'cms.megaphone.fm', icon: 'fa-podcast', style: 'fas', type: 'podcast' },
            { pattern: 'youtube.com/playlist', icon: 'fa-youtube', style: 'fab', type: 'youtube-playlist' },
          { pattern: 'youtube.com', icon: 'fa-youtube', style: 'fab', type: 'youtube' },	    
        ];

        const match = domainMap.find(m => url.includes(m.pattern));
        return {
          url,
            icon: match ? match.icon : 'fa-globe',
            style: match ? match.style : 'fas',
          type: match ? match.type : 'generic'
        };
      };

      return {
        ...r,
        urls: Array.isArray(r.url) ? 
          r.url.map(processUrl) : 
          [processUrl(r.url)]
      };
    });

    // Generate tag styles as array of objects for Mustache
    const tagStyles = allTags.map(tag => ({
        tag: tag,
        styles: {
            bgColor: stringToColor(tag),
            textColor: '#ffffff'
        }
    }));

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
    console.log('HTML file generated as output.html');
}

generateHtml().catch(console.error);
