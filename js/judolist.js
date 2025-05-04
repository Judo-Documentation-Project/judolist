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
    // Initialize sorting first
    let currentSort = 'name-asc';

    // Move subtitle based on initial view
    moveSubtitleForMobile();
    
    // Update on window resize
    window.addEventListener('resize', moveSubtitleForMobile);

    // Initialize from URL parameters
    let currentState = {};

    function getCurrentParams() {
        const params = new URLSearchParams();
        if (activeTags.size > 0) params.set('tags', Array.from(activeTags).join(','));
        if (searchInput.value.trim()) params.set('q', searchInput.value.trim());
        if (currentSort !== 'name-asc') params.set('sort', currentSort);
        if (currentIdMatches.size > 0) params.set('id', Array.from(currentIdMatches).join(','));
        
        currentState = {
            // Shortened property names
            t: Array.from(activeTags),
            q: searchInput.value.trim(),
            s: currentSort,
            i: Array.from(currentIdMatches)
        };

        // Filter out empty values
        Object.keys(currentState).forEach(k => {
            if (Array.isArray(currentState[k])) {
                if (currentState[k].length === 0) delete currentState[k];
            } else if (!currentState[k]) delete currentState[k];
        });
        
        return params;
    }

    function encodeState() {
        const jsonString = JSON.stringify(currentState);
        return LZString.compressToEncodedURIComponent(jsonString);
    }

    function decodeHash(hash) {
        try {
            const jsonString = LZString.decompressFromEncodedURIComponent(hash);
            return JSON.parse(jsonString);
        } catch (e) {
            console.error('Hash decoding failed:', e);
            return null;
        }
    }

    function applyDecodedParams(decoded) {
        // Handle tags
        const validTags = Array.from(document.querySelectorAll('#tag-filter .tag'))
                            .map(t => t.dataset.tag);
        
        decoded.t?.forEach(tag => {
            if (validTags.includes(tag)) {
                const tagElement = document.querySelector(`.tag[data-tag="${tag}"]`);
                if (tagElement && !activeTags.has(tag)) {
                    tagElement.classList.add('is-active');
                    activeTags.add(tag);
                }
            }
        });

        // Handle search
        if (decoded.q) {
            searchInput.value = decoded.q;
            const query = decoded.q.trim().toLowerCase();
            currentSearchMatches.clear();
            
            if (query.length > 1) {
                const results = fuse.search(query);
                results.forEach(result => currentSearchMatches.add(result.item.id));
            }
        }

        // Handle sort
        if (decoded.s && ['name-asc', 'name-desc', 'date-asc', 'date-desc', 'id-asc', 'id-desc'].includes(decoded.s)) {
            currentSort = decoded.s;
        }

        // Handle ID filtering
        currentIdMatches = new Set(decoded.i?.filter(id => id.startsWith('JDP-')));

        filterResources();
        updateSortButtons();
    }

    function initializeFromUrlParams() {
        let urlParams = new URLSearchParams(window.location.search);
        
        const urlHash = urlParams.get('hash');
        if (urlHash) {
            const decoded = decodeHash(urlHash);
            if (decoded) {
                const newParams = new URLSearchParams();
                if (decoded.t?.length > 0) newParams.set('tags', decoded.t.join(','));
                if (decoded.q) newParams.set('q', decoded.q);
                if (decoded.s) newParams.set('sort', decoded.s);
                if (decoded.i?.length > 0) newParams.set('id', decoded.i.join(','));
                
                // Update URL to show expanded params without reloading
                window.history.replaceState({}, '', 
                    newParams.toString() ? `${window.location.pathname}?${newParams}` : window.location.pathname
                );
                
                // Manually apply the decoded params to the current state
                urlParams = newParams;
                applyDecodedParams(decoded);
                return;
            }
        }

        const urlTags = urlParams.get('tags')?.split(',') || [];
        const urlQuery = urlParams.get('q') || '';
        const urlSort = urlParams.get('sort');
        if (urlSort && ['name-asc', 'name-desc', 'date-asc', 'date-desc', 'id-asc', 'id-desc'].includes(urlSort)) {
            currentSort = urlSort;
        }

        // Handle ID filtering
        const urlIds = urlParams.get('id')?.split(',') || [];
        currentIdMatches = new Set(urlIds.filter(id => id.startsWith('JDP-')));

        // Get all valid tags from the page
        const validTags = Array.from(document.querySelectorAll('#tag-filter .tag'))
                            .map(t => t.dataset.tag);
        
        urlTags.forEach(tag => {
            if (validTags.includes(tag)) {
                const tagElement = document.querySelector(`.tag[data-tag="${tag}"]`);
                if (tagElement && !activeTags.has(tag)) {
                    tagElement.classList.add('is-active');
                    activeTags.add(tag);
                }
            }
        });

        // Add search query handling
        if (urlQuery) {
            searchInput.value = urlQuery;
            const query = urlQuery.trim().toLowerCase();
            currentSearchMatches.clear();
            
            if (query.length > 1) {
                const results = fuse.search(query);
                results.forEach(result => currentSearchMatches.add(result.item.id));
            }
        }
        
        if (urlTags.length > 0 || urlQuery) filterResources();
    }

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
        
        // Clear search input and matches
        searchInput.value = '';
        currentSearchMatches.clear();
        
        // Reset to default sort and clear URL parameters
        currentSort = 'name-asc';
        const params = getCurrentParams();
        window.history.replaceState({}, '', 
            params.toString() ? `${window.location.pathname}?${params}` : window.location.pathname
        );
        
        // Reset disabled states and filtering
        document.querySelectorAll('#tag-filter .tag').forEach(t => t.classList.remove('disabled'));
        filterResources();
    });

    // Initialize Fuse.js search with dataset from DOM first
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

    // Now initialize from URL params after fuse is available
    initializeFromUrlParams();

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

        // Update URL parameters
        const params = getCurrentParams();
        window.history.replaceState({}, '', 
            params.toString() ? `${window.location.pathname}?${params}` : window.location.pathname
        );

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
        const query = this.value.trim();
        currentSearchMatches.clear();
        
        if (query.length > 1) {
            const results = fuse.search(query.toLowerCase());
            results.forEach(result => currentSearchMatches.add(result.item.id));
        }
        
        // Update URL parameters
        const params = getCurrentParams();
        window.history.replaceState({}, '', 
            params.toString() ? `${window.location.pathname}?${params}` : window.location.pathname
        );
        
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

    function updateAvailableTags() {
        const visibleIds = new Set(
            Array.from(document.querySelectorAll('.card:not([style*="display: none"])'))
                .map(card => card.dataset.id)
        );
        
        const allResources = JSON.parse(decodeURIComponent(
            document.getElementById('resources-data').dataset.resources
        ));

        document.querySelectorAll('#tag-filter .tag:not(.is-active)').forEach(tagElement => {
            const tag = tagElement.dataset.tag;
            const hasMatch = allResources.some(resource => 
                visibleIds.has(resource.id) && 
                resource.tags.includes(tag)
            );
            tagElement.classList.toggle('disabled', !hasMatch);
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
            const hasIdMatch = currentIdMatches.size === 0 || 
                currentIdMatches.has(card.dataset.id);
            
            card.style.display = hasSearchMatch && hasTagMatch && hasIdMatch ? 'block' : 'none';
        });

        // Sort and reorder visible cards
        const visibleCards = cards.filter(card => card.style.display !== 'none');
        const sortBy = currentSort;
        const sortedCards = sortCards(visibleCards, sortBy);
        const container = document.querySelector('#cards-container');
    
        sortedCards.forEach(card => container.appendChild(card));
        
        updateAvailableTags();
    }

    updateSortButtons();  // Sets initial button states
    filterResources();    // Initial filter/sort

    // Sorting button handlers
    
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
        
        // Update URL parameters
        const params = getCurrentParams();
        window.history.replaceState({}, '', 
            params.toString() ? `${window.location.pathname}?${params}` : window.location.pathname
        );
      });
    });

    // Share functionality
    document.getElementById('share-button').addEventListener('click', (e) => {
      e.preventDefault();
      // Get fresh state before encoding
      getCurrentParams();
      const baseUrl = `${window.location.origin}${window.location.pathname}`;
      const standardParams = new URLSearchParams(window.location.search);
      const hashUrl = `${baseUrl}?hash=${encodeState()}`;
      const standardUrl = `${baseUrl}${standardParams.toString() ? `?${standardParams}` : ''}`;
      
      // Populate both URL types
      const hashInput = document.getElementById('hash-url');
      const normalInput = document.getElementById('normal-url');
      hashInput.value = hashUrl;
      normalInput.value = standardUrl;
      
      // Compare compressed payload vs raw parameter content length
      const standardParamLength = Array.from(standardParams).reduce((acc, [k,v]) => acc + k.length + v.length + 1, 0);
      const useHash = (hashUrl.length - '?hash='.length) < standardParamLength;
      document.getElementById('hash-url-radio').checked = useHash;
      document.getElementById('normal-url-radio').checked = !useHash;
      
      // Show appropriate input
      hashInput.style.display = useHash ? 'block' : 'none';
      normalInput.style.display = useHash ? 'none' : 'block';
      
      const shareModal = document.getElementById('share-modal');
      shareModal.classList.add('is-active');
    });

    // Modal closing logic
    document.querySelectorAll('#share-modal .delete, #share-modal .modal-background')
      .forEach(el => {
        el.addEventListener('click', () => {
          document.getElementById('share-modal').classList.remove('is-active');
        });
      });

    // Copy functionality
    document.getElementById('copy-button').addEventListener('click', () => {
      const urlInput = document.getElementById('hash-url-radio').checked 
        ? document.getElementById('hash-url')
        : document.getElementById('normal-url');
      urlInput.select();
      document.execCommand('copy');
      
      // Visual feedback
      const copyIcon = document.querySelector('#copy-button .icon');
      copyIcon.innerHTML = '<i class="fas fa-check"></i>';
      setTimeout(() => {
        copyIcon.innerHTML = '<i class="fas fa-copy"></i>';
      }, 2000);
    });

    // Handle URL type radio changes
    document.querySelectorAll('input[name="url-type"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const showHash = document.getElementById('hash-url-radio').checked;
        document.getElementById('hash-url').style.display = showHash ? 'block' : 'none';
        document.getElementById('normal-url').style.display = showHash ? 'none' : 'block';
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
