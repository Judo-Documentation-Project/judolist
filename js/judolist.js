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

    // Search toggle setup
    const searchContainer = document.getElementById('search-container');
    const searchToggle = document.getElementById('search-toggle');
    const toggleIcon = document.getElementById('toggle-icon');

    // Set initial state based on screen size
    if (window.innerWidth < 1024) {
      searchContainer.classList.add('collapsed');
      searchToggle.classList.add('collapsed');
      toggleIcon.classList.remove('fa-chevron-down');
      toggleIcon.classList.add('fa-chevron-up');
    } else {
      searchContainer.classList.remove('collapsed');
      searchToggle.classList.remove('collapsed');
      toggleIcon.classList.remove('fa-chevron-up');
      toggleIcon.classList.add('fa-chevron-down');
    }

    // Toggle handler
    searchToggle.addEventListener('click', () => {
      searchContainer.classList.toggle('collapsed');
      searchToggle.classList.toggle('collapsed');
      toggleIcon.classList.toggle('fa-chevron-down');
      toggleIcon.classList.toggle('fa-chevron-up');
    });

    // Update on resize
    window.addEventListener('resize', () => {
      if (window.innerWidth >= 1024) {
        searchContainer.classList.remove('collapsed');
        searchToggle.classList.remove('collapsed');
        toggleIcon.classList.remove('fa-chevron-up');
        toggleIcon.classList.add('fa-chevron-down');
      }
    });
    
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

    function sortCards(cards, sortBy) {
      const [criteria, direction] = sortBy.split('-');
  
      return [...cards].sort((a, b) => {
        const aVal = a.dataset[`sort${criteria.charAt(0).toUpperCase() + criteria.slice(1)}`];
        const bVal = b.dataset[`sort${criteria.charAt(0).toUpperCase() + criteria.slice(1)}`];

        switch(criteria) {
          case 'id':
            return direction === 'asc' ? aVal - bVal : bVal - aVal;
          case 'name':
            return direction === 'asc' 
              ? aVal.localeCompare(bVal) 
              : bVal.localeCompare(aVal);
          case 'date':
            // Prefer RSS date but fall back to manual date
            const dateAStr = a.dataset.sortDateRss || a.dataset.sortDateManual;
            const dateBStr = b.dataset.sortDateRss || b.dataset.sortDateManual;
            
            const dateA = dateAStr ? new Date(dateAStr) : new Date(0);
            const dateB = dateBStr ? new Date(dateBStr) : new Date(0);
            
            const result = direction === 'asc' ? dateA - dateB : dateB - dateA;
            return result;
          default:
            return 0;
        }
      });
    }

    function filterResources() {
        const cards = Array.from(document.querySelectorAll('.card'));
        const active = Array.from(activeTags);
        
        cards.forEach(card => {
            const hasSearchMatch = (searchInput.value.trim() === '' && currentSearchMatches.size === 0) || 
                (searchInput.value.trim() !== '' && currentSearchMatches.has(card.dataset.id));
            const hasTagMatch = active.length === 0 || 
                active.every(tag => card.dataset.tags.split(' ').includes(tag));
            
            card.style.display = hasSearchMatch && hasTagMatch ? 'block' : 'none';
        });

        // Sort and reorder visible cards
        const visibleCards = cards.filter(card => card.style.display !== 'none');
        const sortBy = currentSort;
        const sortedCards = sortCards(visibleCards, sortBy);
        const container = document.querySelector('#cards-container');
    
        sortedCards.forEach(card => container.appendChild(card));
    }

    // Sorting button handlers
    let currentSort = 'name-asc';
    // Apply initial sort
    updateSortButtons();
    filterResources();
    
    document.querySelectorAll('[data-sort]').forEach(button => {
      button.addEventListener('click', (e) => {
        const clickedSort = e.currentTarget.dataset.sort;
        const [clickedField, clickedDir] = clickedSort.split('-');
        const [currentField, currentDir] = currentSort.split('-');
        
        if (clickedField === currentField) {
          // Toggle direction if clicking same field
          currentSort = `${currentField}-${currentDir === 'asc' ? 'desc' : 'asc'}`;
        } else {
          // Switch to new field with default direction
          currentSort = clickedSort;
        }
        
        updateSortButtons();
        filterResources();
      });
    });

    function updateSortButtons() {
      const [field, direction] = currentSort.split('-');
      
      document.querySelectorAll('[data-sort]').forEach(btn => {
        const btnField = btn.dataset.sort.split('-')[0];
        const isActive = btnField === field;
        
        // Update active state
        btn.classList.toggle('is-primary', isActive);
        
        // Update direction arrows
        const arrows = btn.querySelectorAll('.fa-arrow-up, .fa-arrow-down');
        arrows.forEach(arrow => {
          arrow.classList.toggle('is-hidden', !isActive);
          if (isActive) {
            arrow.classList.toggle('fa-arrow-up', direction === 'desc');
            arrow.classList.toggle('fa-arrow-down', direction === 'asc');
          }
        });
        
        // Update aria-label
        const label = `Sort by ${btnField} ${direction === 'asc' ? 'ascending' : 'descending'}`;
        btn.setAttribute('aria-label', label);
      });
    }
});
