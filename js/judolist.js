function moveSubtitleForMobile() {
    const subtitle = document.getElementById('nav-subtitle');
    const placeholder = document.getElementById('subtitle-placeholder');
    if (window.innerWidth < 1024) { // Bulma's desktop breakpoint
        placeholder.appendChild(subtitle);
        subtitle.classList.add('is-hidden-desktop-mobile');
    } else {
        const navbarBrand = document.querySelector('.navbar-brand');
        navbarBrand.insertBefore(subtitle, document.querySelector('.navbar-burger'));
        subtitle.classList.remove('is-hidden-desktop-mobile');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Move subtitle based on initial view
    moveSubtitleForMobile();
    
    // Update on window resize
    window.addEventListener('resize', moveSubtitleForMobile);
    
    const searchInput = document.getElementById('searchInput');
    let currentSearchMatches = new Set();
    let activeTags = new Set();

    // Clear all filters handler
    document.querySelector('.clear-all').addEventListener('click', () => {
        // Remove active classes from all tags (filter and card)
        document.querySelectorAll('#tag-filter .is-active, .tag-button.is-active').forEach(tag => {
            tag.classList.remove('is-active');
        });
        
        // Clear active tags and reset set
        activeTags = new Set();
        
        // Clear search input
        searchInput.value = '';
        
        // Reset filtering
        filterResources();
    });

    // Initialize Fuse.js search with dataset from DOM
    let dd = 1
    const encodedData = document.getElementById('resources-data').dataset.resources;
    const resourcesData = JSON.parse(decodeURIComponent(encodedData));
    const fuse = new Fuse(resourcesData, {
        keys: ['name', 'description', 'comment', 'tags'],
        threshold: 0.1,  // More strict matching
        ignoreLocation: true,
        ignoreDiacritics: true,
        includeScore: true,
        minMatchCharLength: 3  // Require at least 2 characters to match
    });

    // Tag filter click handler
    document.getElementById('tag-filter').addEventListener('click', (e) => {
        const tag = e.target.dataset.tag;
        if (!tag) return;

        const isNowActive = e.target.classList.toggle('is-active');
        activeTags[isNowActive ? 'add' : 'delete'](tag);
        
        // Update all tags with same value
        document.querySelectorAll(`.tag-button[data-tag="${tag}"], #tag-filter .tag[data-tag="${tag}"]`).forEach(t => {
            t.classList.toggle('is-active', isNowActive);
        });

        filterResources();
    });

    // Card tag click handler
    document.querySelectorAll('.card .tag-button').forEach(button => {
        button.addEventListener('click', (e) => {
            const tag = e.target.dataset.tag;
            if (!tag) return;

            // Toggle active class on clicked tag and track state
            const isNowActive = e.target.classList.toggle('is-active');
            activeTags[isNowActive ? 'add' : 'delete'](tag);
            
            // Update filter tag
            const topTag = document.querySelector(`#tag-filter .tag[data-tag="${tag}"]`);
            if (topTag) {
                topTag.classList.toggle('is-active', isNowActive);
            }
            
            // Update all other card tags with same value
            document.querySelectorAll(`.tag-button[data-tag="${tag}"]`).forEach(t => {
                t.classList.toggle('is-active', isNowActive);
            });

            filterResources();
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
            const hasSearchMatch = (searchInput.value.trim() === '' && currentSearchMatches.size === 0) || 
                (searchInput.value.trim() !== '' && currentSearchMatches.has(card.dataset.id));
            const hasTagMatch = active.length === 0 || 
                active.every(tag => card.dataset.tags.split(' ').includes(tag));
            
            card.style.display = hasSearchMatch && hasTagMatch ? 'block' : 'none';
        });
    }
});
