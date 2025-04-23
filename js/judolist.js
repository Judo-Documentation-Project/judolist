document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    let currentSearchMatches = new Set();
    let activeTags = new Set();

    // Initialize Fuse.js search with dataset from DOM
    const resourcesData = JSON.parse(document.getElementById('resources-data').dataset.resources);
    const fuse = new Fuse(resourcesData, {
        keys: ['name', 'description', 'comment', 'tags'],
        threshold: 0.3,
        ignoreLocation: true,
        tokenize: true
    });

    // Tag filter click handler
    document.getElementById('tag-filter').addEventListener('click', (e) => {
        const tag = e.target.dataset.tag;
        if (!tag) return;

        e.target.classList.toggle('is-active');
        if (activeTags.has(tag)) {
            activeTags.delete(tag);
        } else {
            activeTags.add(tag);
        }

        filterResources();
    });

    // Card tag click handler
    document.querySelectorAll('.card .tag-button').forEach(button => {
        button.addEventListener('click', (e) => {
            const tag = e.target.dataset.tag;
            if (!tag) return;

            // Find matching tag in top filter
            const topTag = [...document.querySelectorAll('#tag-filter .tag')]
                .find(t => t.dataset.tag === tag);
            
            if (topTag) {
                topTag.classList.toggle('is-active');
                if (activeTags.has(tag)) {
                    activeTags.delete(tag);
                } else {
                    activeTags.add(tag);
                }
                filterResources();
            }
        });
    });

    // Search input handler
    searchInput.addEventListener('input', function() {
        const query = this.value.trim().toLowerCase();
        currentSearchMatches.clear();
        
        if (query.length > 1) {
            const results = fuse.search(query);
            results.forEach(result => currentSearchMatches.add(result.item.id));
        }
        
        filterResources();
    });

    function filterResources() {
        const cards = document.querySelectorAll('.card');
        const active = Array.from(activeTags);
        
        cards.forEach(card => {
            const hasSearchMatch = currentSearchMatches.size === 0 || 
                currentSearchMatches.has(card.dataset.id);
            const hasTagMatch = active.length === 0 || 
                active.every(tag => card.dataset.tags.split(' ').includes(tag));
            
            card.style.display = hasSearchMatch && hasTagMatch ? 'block' : 'none';
        });
    }
});
