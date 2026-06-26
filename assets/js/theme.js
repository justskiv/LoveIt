class Util {
    static forEach(elements, handler) {
        elements = elements || [];
        for (let i = 0; i < elements.length; i++) handler(elements[i]);
    }

    static getScrollTop() {
        return (document.documentElement && document.documentElement.scrollTop) || document.body.scrollTop;
    }

    static isMobile() {
        return window.matchMedia('only screen and (max-width: 680px)').matches;
    }

    static isTocStatic() {
        return window.matchMedia('only screen and (max-width: 960px)').matches;
    }

    static animateCSS(element, animation, reserved, callback) {
        if (!Array.isArray(animation)) animation = [animation];
        element.classList.add('animate__animated', ...animation);
        const handler = () => {
            element.classList.remove('animate__animated', ...animation);
            element.removeEventListener('animationend', handler);
            if (typeof callback === 'function') callback();
        };
        if (!reserved) element.addEventListener('animationend', handler, false);
    }
}

class Theme {
    constructor() {
        this.config = window.config || {};
        this.data = this.config.data || {};
        this.isDark = document.body.getAttribute('theme') === 'dark';
        this.newScrollTop = Util.getScrollTop();
        this.oldScrollTop = this.newScrollTop;
        this.scrollEventSet = new Set();
        this.resizeEventSet = new Set();
        this.switchThemeEventSet = new Set();
        this.clickMaskEventSet = new Set();
        if (window.objectFitImages) objectFitImages();
    }

    initRaw() {
        // innerHTML is intentional here: the source is the `raw` shortcode,
        // i.e. trusted author HTML by design. Never route search/index or
        // front-matter data through this path — escape that instead.
        Util.forEach(document.querySelectorAll('[data-raw]'), $raw => {
            $raw.innerHTML = this.data[$raw.id];
        });
    }

    initSVGIcon() {
        Util.forEach(document.querySelectorAll('[data-svg-src]'), $icon => {
            fetch($icon.getAttribute('data-svg-src'))
                .then(response => response.text())
                .then(svg => {
                    const $temp = document.createElement('div');
                    $temp.insertAdjacentHTML('afterbegin', svg);
                    const $svg = $temp.firstChild;
                    $svg.setAttribute('data-svg-src', $icon.getAttribute('data-svg-src'));
                    $svg.classList.add('icon');
                    const $titleElements = $svg.getElementsByTagName('title');
                    if ($titleElements.length) $svg.removeChild($titleElements[0]);
                    $icon.parentElement.replaceChild($svg, $icon);
                })
                .catch(err => { console.error(err); });
        });
    }

    initTwemoji() {
        if (this.config.twemoji) twemoji.parse(document.body);
    }

    initMenuMobile() {
        const $menuToggleMobile = document.getElementById('menu-toggle-mobile');
        const $menuMobile = document.getElementById('menu-mobile');
        $menuToggleMobile.addEventListener('click', () => {
            document.body.classList.toggle('blur');
            $menuToggleMobile.classList.toggle('active');
            $menuMobile.classList.toggle('active');
        }, false);
        this._menuMobileOnClickMask = this._menuMobileOnClickMask || (() => {
            $menuToggleMobile.classList.remove('active');
            $menuMobile.classList.remove('active');
        });
        this.clickMaskEventSet.add(this._menuMobileOnClickMask);
    }

    initSwitchTheme() {
        Util.forEach(document.getElementsByClassName('theme-switch'), $themeSwitch => {
            $themeSwitch.addEventListener('click', () => {
                const cfgTheme = document.body.getAttribute('cfg-theme');

                const themes = ['dark', 'light'];
                const newTheme = themes[(themes.indexOf(cfgTheme) + 1) % themes.length];

                this.isDark = newTheme === 'dark';
                document.body.setAttribute('theme', this.isDark ? 'dark' : 'light');
                document.body.setAttribute('cfg-theme', newTheme);
                window.localStorage?.setItem('theme', newTheme);
                for (let event of this.switchThemeEventSet) event();
            }, false);
        });
    }

    initSearch() {
        const searchConfig = this.config.search;
        const isMobile = Util.isMobile();
        if (!searchConfig || isMobile && this._searchMobileOnce || !isMobile && this._searchDesktopOnce) return;

        const maxResultLength = searchConfig.maxResultLength ? searchConfig.maxResultLength : 10;
        const snippetLength = searchConfig.snippetLength ? searchConfig.snippetLength : 50;
        // Restrict the highlight tag to a bare tag name so it can never carry
        // attributes or extra markup into the DOM, whatever the config holds.
        const rawHighlightTag = searchConfig.highlightTag ? searchConfig.highlightTag : 'em';
        const highlightTag = /^[a-zA-Z0-9]+$/.test(rawHighlightTag) ? rawHighlightTag : 'em';
        // --- Faceted filtering (Pagefind only). Driven entirely by config:
        // searchConfig.pagefindFilters is the list of data-pagefind-filter
        // names to expose; empty/absent => feature off. ---
        const filterNames = Array.isArray(searchConfig.pagefindFilters)
            ? searchConfig.pagefindFilters : [];
        const filtersEnabled = searchConfig.type === 'pagefind' && filterNames.length > 0;
        // Neutral sentinels for the Algolia path (no markup in the request).
        const ALGOLIA_HL_PRE = '__LOVEIT_HL__';
        const ALGOLIA_HL_POST = '__/LOVEIT_HL__';

        // Escape index fields and the visitor query before they reach the DOM:
        // escape first, then wrap matches in highlightTag, so the only markup
        // emitted is the highlight tag itself (no raw HTML from data or input).
        const escapeHTML = (s) => String(s).replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));

        const suffix = isMobile ? 'mobile' : 'desktop';
        const $header = document.getElementById(`header-${suffix}`);
        const $searchInput = document.getElementById(`search-input-${suffix}`);
        const $searchToggle = document.getElementById(`search-toggle-${suffix}`);
        const $searchLoading = document.getElementById(`search-loading-${suffix}`);
        const $searchClear = document.getElementById(`search-clear-${suffix}`);
        if (isMobile) {
            this._searchMobileOnce = true;
            $searchInput.addEventListener('focus', () => {
                document.body.classList.add('blur');
                $header.classList.add('open');
            }, false);
            document.getElementById('search-cancel-mobile').addEventListener('click', () => {
                $header.classList.remove('open');
                document.body.classList.remove('blur');
                document.getElementById('menu-toggle-mobile').classList.remove('active');
                document.getElementById('menu-mobile').classList.remove('active');
                $searchLoading.style.display = 'none';
                $searchClear.style.display = 'none';
                this._searchMobile && this._searchMobile.autocomplete.setVal('');
            }, false);
            $searchClear.addEventListener('click', () => {
                $searchClear.style.display = 'none';
                this._searchMobile && this._searchMobile.autocomplete.setVal('');
            }, false);
            this._searchMobileOnClickMask = this._searchMobileOnClickMask || (() => {
                $header.classList.remove('open');
                $searchLoading.style.display = 'none';
                $searchClear.style.display = 'none';
                this._searchMobile && this._searchMobile.autocomplete.setVal('');
            });
            this.clickMaskEventSet.add(this._searchMobileOnClickMask);
        } else {
            this._searchDesktopOnce = true;
            $searchToggle.addEventListener('click', () => {
                document.body.classList.add('blur');
                $header.classList.add('open');
                $searchInput.focus();
            }, false);
            $searchClear.addEventListener('click', () => {
                $searchClear.style.display = 'none';
                this._searchDesktop && this._searchDesktop.autocomplete.setVal('');
            }, false);
            this._searchDesktopOnClickMask = this._searchDesktopOnClickMask || (() => {
                $header.classList.remove('open');
                $searchLoading.style.display = 'none';
                $searchClear.style.display = 'none';
                this._searchDesktop && this._searchDesktop.autocomplete.setVal('');
            });
            this.clickMaskEventSet.add(this._searchDesktopOnClickMask);
        }
        $searchInput.addEventListener('input', () => {
            if ($searchInput.value === '') $searchClear.style.display = 'none';
            else $searchClear.style.display = 'inline';
        }, false);
        // Esc closes the search like clicking the backdrop: drop focus,
        // collapse the field and clear the query.
        $searchInput.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape' && e.key !== 'Esc') return;
            const autosearch = isMobile ? this._searchMobile : this._searchDesktop;
            autosearch && autosearch.autocomplete.setVal('');
            $searchClear.style.display = 'none';
            $searchLoading.style.display = 'none';
            $header.classList.remove('open');
            document.body.classList.remove('blur');
            $searchInput.blur();
        }, false);

        const initAutosearch = () => {
            // Per-instance facet state (desktop and mobile are independent).
            const facetSelected = {};
            filterNames.forEach((name) => { facetSelected[name] = new Set(); });
            const facetLabels = searchConfig.pagefindFilterLabels || {};
            const facetMinValues = 2;                 // hide groups that can't narrow
            let lastFacetCounts = { filters: {}, total: {} };
            let facetRerun = null;                    // set by source(); re-runs search

            // Same key + many values => OR (any); different keys => AND.
            const buildPagefindFilters = () => {
                const out = {};
                filterNames.forEach((name) => {
                    const vals = Array.from(facetSelected[name] || []);
                    if (vals.length === 1) out[name] = vals[0];
                    else if (vals.length > 1) out[name] = { any: vals };
                });
                return Object.keys(out).length ? out : undefined;
            };

            // Rebuild the facet UI from the latest search counts. Collapsed by
            // default: a thin bar with a "Filters" toggle + active-count badge.
            // When collapsed but filters are active, the selected chips + reset
            // stay visible; the full (dense) group panel appears only on toggle.
            // All values reach the DOM via textContent / setAttribute only.
            const renderFacets = (filters, totalFilters) => {
                if (!filtersEnabled) return;
                const $facets = document.getElementById(`search-facets-${suffix}`);
                if (!$facets) return;
                filters = filters || {};
                totalFilters = totalFilters || {};
                while ($facets.firstChild) $facets.removeChild($facets.firstChild);

                // Collect the groups worth showing, keeping the original
                // value-picking logic (selected, or still narrowing results).
                const groups = [];
                let selectedCount = 0;
                filterNames.forEach((name) => {
                    const universe = totalFilters[name] || filters[name] || {};
                    const counts = filters[name] || {};
                    const sel = facetSelected[name] || new Set();
                    selectedCount += sel.size;
                    const values = new Set(Object.keys(universe));
                    sel.forEach((v) => values.add(v));
                    let list = Array.from(values).filter(
                        (v) => sel.has(v) || (counts[v] || universe[v] || 0) > 0);
                    if (!list.length) return;
                    if (list.length < facetMinValues && sel.size === 0) return;
                    list.sort((a, b) => {
                        const sa = sel.has(a) ? 1 : 0, sb = sel.has(b) ? 1 : 0;
                        if (sa !== sb) return sb - sa;
                        const ca = counts[a] || 0, cb = counts[b] || 0;
                        if (ca !== cb) return cb - ca;
                        return a.localeCompare(b);
                    });
                    groups.push({ name, list, counts, sel });
                });

                if (!groups.length) { $facets.hidden = true; return; }
                $facets.hidden = false;

                const makeChip = (name, value, count, isOn) => {
                    const $chip = document.createElement('button');
                    $chip.type = 'button';
                    $chip.className = 'search-facet-chip';
                    $chip.setAttribute('aria-pressed', isOn ? 'true' : 'false');
                    $chip.dataset.facetName = name;
                    $chip.dataset.facetValue = value;
                    if (!isOn && count === 0) $chip.disabled = true;
                    const $text = document.createElement('span');
                    $text.className = 'search-facet-chip-text';
                    $text.textContent = value;
                    $chip.appendChild($text);
                    const $count = document.createElement('span');
                    $count.className = 'search-facet-chip-count';
                    $count.textContent = String(count);
                    $chip.appendChild($count);
                    return $chip;
                };
                const makeReset = () => {
                    const $reset = document.createElement('button');
                    $reset.type = 'button';
                    $reset.className = 'search-facet-reset';
                    $reset.dataset.facetReset = '1';
                    $reset.textContent =
                        searchConfig.pagefindFilterResetLabel || 'Reset';
                    return $reset;
                };

                // Aligned grid: every group is a [label | chips] row, so the
                // category and tag labels share a column and chips line up.
                // All values are shown; chips wrap within their cell.
                groups.forEach(({ name, list, counts, sel }) => {
                    const $group = document.createElement('div');
                    $group.className = 'search-facet-group';
                    const $label = document.createElement('span');
                    $label.className = 'search-facet-label';
                    $label.textContent = facetLabels[name] || name;
                    $group.appendChild($label);
                    const $chips = document.createElement('div');
                    $chips.className = 'search-facet-chips';
                    list.forEach((value) => {
                        $chips.appendChild(
                            makeChip(name, value, counts[value] || 0, sel.has(value)));
                    });
                    $group.appendChild($chips);
                    $facets.appendChild($group);
                });

                if (selectedCount) $facets.appendChild(makeReset());
            };

            const acOptions = {
                hint: false,
                autoselect: true,
                dropdownMenuContainer: `#search-dropdown-${suffix}`,
                clearOnSelected: true,
                cssClasses: { noPrefix: true },
                debug: true,
            };
            if (filtersEnabled) {
                // Menu-level header is rendered ONCE into the dropdown $menu
                // (not per keystroke): a stable mount point for the facet chips.
                acOptions.templates = {
                    header: () => `<div class="search-facets" id="search-facets-${suffix}" hidden></div>`,
                };
            }
            const autosearch = autocomplete(`#search-input-${suffix}`, acOptions, {
                name: 'search',
                source: (query, callback) => {
                    $searchLoading.style.display = 'inline';
                    $searchClear.style.display = 'none';
                    const finish = (results) => {
                        $searchLoading.style.display = 'none';
                        $searchClear.style.display = 'inline';
                        callback(results);
                    };
                    if (searchConfig.type === 'lunr') {
                        const search = () => {
                            if (lunr.queryHandler) query = lunr.queryHandler(query);
                            const results = {};
                            this._index.search(query).forEach(({ ref, matchData: { metadata } }) => {
                                const matchData = this._indexData[ref];
                                let { uri, title, content: context } = matchData;
                                if (results[uri]) return;
                                let position = 0;
                                Object.values(metadata).forEach(({ content }) => {
                                    if (content) {
                                        const matchPosition = content.position[0][0];
                                        if (matchPosition < position || position === 0) position = matchPosition;
                                    }
                                });
                                position -= snippetLength / 5;
                                if (position > 0) {
                                    position += context.slice(position, position + 20).lastIndexOf(' ') + 1;
                                    context = '...' + context.slice(position, position + snippetLength);
                                } else {
                                    context = context.slice(0, snippetLength);
                                }
                                title = escapeHTML(title);
                                context = escapeHTML(context);
                                Object.keys(metadata).forEach(key => {
                                    title = title.replace(new RegExp(`(${key})`, 'gi'), `<${highlightTag}>$1</${highlightTag}>`);
                                    context = context.replace(new RegExp(`(${key})`, 'gi'), `<${highlightTag}>$1</${highlightTag}>`);
                                });
                                results[uri] = {
                                    'uri': uri,
                                    'title' : title,
                                    'date' : matchData.date,
                                    'context' : context,
                                };
                            });
                            return Object.values(results).slice(0, maxResultLength);
                        }
                        if (!this._index) {
                            fetch(searchConfig.lunrIndexURL)
                                .then(response => response.json())
                                .then(data => {
                                    const indexData = {};
                                    this._index = lunr(function () {
                                        if (searchConfig.lunrLanguageCode) this.use(lunr[searchConfig.lunrLanguageCode]);
                                        this.ref('objectID');
                                        this.field('title', { boost: 50 });
                                        this.field('tags', { boost: 20 });
                                        this.field('categories', { boost: 20 });
                                        this.field('content', { boost: 10 });
                                        this.metadataWhitelist = ['position'];
                                        data.forEach((record) => {
                                            indexData[record.objectID] = record;
                                            this.add(record);
                                        });
                                    });
                                    this._indexData = indexData;
                                    finish(search());
                                }).catch(err => {
                                    console.error(err);
                                    finish([]);
                                });
                        } else finish(search());
                    } else if (searchConfig.type === 'algolia') {
                        const { liteClient: algoliasearch } = window['algoliasearch/lite'];
                        this._algoliaIndex = this._algoliaIndex || algoliasearch(searchConfig.algoliaAppID, searchConfig.algoliaSearchKey);
                        this._algoliaIndex
                            .search({
                                requests: [
                                    {
                                        indexName: searchConfig.algoliaIndex,
                                        query: query,
                                        offset: 0,
                                        length: maxResultLength * 8,
                                        attributesToHighlight: ['title'],
                                        attributesToSnippet: [`content:${snippetLength}`],
                                        // Ask Algolia for neutral sentinels instead of real tags, so
                                        // no markup is embedded in the request. Algolia HTML-escapes
                                        // the attribute value and only wraps matches in these tokens;
                                        // we then swap the sentinels for the sanitized highlight tag.
                                        // (Re-escaping here would double-escape Algolia's output.)
                                        highlightPreTag: ALGOLIA_HL_PRE,
                                        highlightPostTag: ALGOLIA_HL_POST,
                                    }
                                ]
                            })
                            .then(({ results: [{ hits }] }) => {
                                const results = {};
                                const renderHighlight = (v) => String(v)
                                    .split(ALGOLIA_HL_PRE).join(`<${highlightTag}>`)
                                    .split(ALGOLIA_HL_POST).join(`</${highlightTag}>`);
                                hits.forEach(({ uri, date, _highlightResult: { title }, _snippetResult: { content } }) => {
                                    if (results[uri] && results[uri].context.length > content.value) return;
                                    results[uri] = {
                                        uri: uri,
                                        title: renderHighlight(title.value),
                                        date: date,
                                        context: renderHighlight(content.value),
                                    };
                                });
                                finish(Object.values(results).slice(0, maxResultLength));
                            })
                            .catch(err => {
                                console.error(err);
                                finish([]);
                            });
                    } else if (searchConfig.type === 'fuse') {
                        const search = () => {
                            const results = {};
                            this._fuse.search(query).forEach(({ item, matches }) => {
                                let { uri, title, content: context, date } = item;
                                if (results[uri]) return;
                                let position = 0;
                                if (matches) {
                                    for (const match of matches) {
                                        if (match.key === 'content' && match.indices.length > 0) {
                                            position = match.indices[0][0];
                                            break;
                                        }
                                    }
                                }
                                position -= snippetLength / 5;
                                if (position > 0) {
                                    position += context.slice(position, position + 20).lastIndexOf(' ') + 1;
                                    context = '...' + context.slice(position, position + snippetLength);
                                } else {
                                    context = context.slice(0, snippetLength);
                                }
                                title = escapeHTML(title);
                                context = escapeHTML(context);
                                const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                title = title.replace(new RegExp(`(${escapedQuery})`, 'gi'), `<${highlightTag}>$1</${highlightTag}>`);
                                context = context.replace(new RegExp(`(${escapedQuery})`, 'gi'), `<${highlightTag}>$1</${highlightTag}>`);
                                results[uri] = { uri, title, date, context };
                            });
                            return Object.values(results).slice(0, maxResultLength);
                        };
                        if (!this._fuse) {
                            fetch(searchConfig.fuseIndexURL)
                                .then(response => response.json())
                                .then(data => {
                                    const fuseOpts = Object.assign({
                                        isCaseSensitive: false,
                                        findAllMatches: false,
                                        minMatchCharLength: 2,
                                        location: 0,
                                        threshold: 0.3,
                                        distance: 100,
                                        ignoreLocation: false,
                                        includeMatches: true,
                                        keys: [
                                            { name: 'title', weight: 5 },
                                            { name: 'tags', weight: 2 },
                                            { name: 'categories', weight: 2 },
                                            { name: 'content', weight: 1 },
                                        ],
                                    }, searchConfig.fuseOpts || {}, { includeMatches: true });
                                    this._fuse = new Fuse(data, fuseOpts);
                                    finish(search());
                                }).catch(err => {
                                    console.error(err);
                                    finish([]);
                                });
                        } else finish(search());
                    } else if (searchConfig.type === 'pagefind') {
                        // Pagefind excerpts arrive as plain text with <mark> tags
                        // around matches. Escape everything, then convert Pagefind's
                        // <mark> into the configured highlightTag, so the only markup
                        // emitted is the highlight tag (never raw HTML from data).
                        const renderExcerpt = (raw) => String(raw || '')
                            .split(/(<\/?mark>)/)
                            .map(part => part === '<mark>' ? `<${highlightTag}>`
                                : part === '</mark>' ? `</${highlightTag}>`
                                : escapeHTML(part))
                            .join('');
                        // Pagefind excerpts open at the section/page start, so the
                        // matched <mark> can fall past the dropdown's 2-line clamp.
                        // Slide the window to begin just before the first match so
                        // the highlighted term is always visible.
                        const focusExcerpt = (raw) => {
                            const s = String(raw || '');
                            const i = s.indexOf('<mark>');
                            const lead = 24;
                            if (i <= lead) return s;
                            let cut = s.lastIndexOf(' ', i - lead);
                            if (cut < 0) cut = i - lead;
                            return '…' + s.slice(cut + 1);
                        };
                        const search = async () => {
                            try {
                                if (!this._pagefind) {
                                    const basePath = searchConfig.pagefindBasePath || '/_pagefind/';
                                    this._pagefind = await import(`${basePath}pagefind.js`);
                                    await this._pagefind.init();
                                    // Load the filter universe once so every search
                                    // response carries per-filter counts.
                                    if (filtersEnabled && this._pagefind.filters) {
                                        try { await this._pagefind.filters(); }
                                        catch (e) { console.error(e); }
                                    }
                                }
                                const opts = {};
                                if (filtersEnabled) {
                                    const f = buildPagefindFilters();
                                    if (f) opts.filters = f;
                                }
                                const searchResult = await this._pagefind.search(query, opts);
                                if (filtersEnabled) {
                                    lastFacetCounts = {
                                        filters: searchResult.filters || {},
                                        total: searchResult.totalFilters || {},
                                    };
                                    renderFacets(lastFacetCounts.filters, lastFacetCounts.total);
                                }
                                const loaded = await Promise.all(
                                    searchResult.results.slice(0, maxResultLength).map(r => r.data())
                                );
                                // Carry the visitor's query into the result URL as
                                // `?highlight=`, keeping any section anchor after it
                                // (`/posts/x/?highlight=...#section`) so the landing
                                // page can highlight matches and still scroll to the
                                // heading. The query is URL-encoded, never injected
                                // as markup.
                                const withHighlight = (url, term) => {
                                    term = term || query;
                                    if (!term) return url;
                                    const hashIndex = url.indexOf('#');
                                    const hash = hashIndex >= 0 ? url.slice(hashIndex) : '';
                                    const base = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
                                    const sep = base.indexOf('?') >= 0 ? '&' : '?';
                                    return `${base}${sep}highlight=${encodeURIComponent(term)}${hash}`;
                                };
                                // Pagefind matches by RU stem, but pagefind-highlight
                                // on the landing page is literal — so highlight the
                                // actual matched word from the excerpt (e.g. the
                                // variant "объяснением"), not the raw stem query, or
                                // the variant won't get marked. Tiny prefixes fall
                                // back to the query to avoid page-wide noise.
                                const matchedTerm = (raw) => {
                                    const m = String(raw || '').match(/<mark>(.*?)<\/mark>/);
                                    if (!m) return '';
                                    const word = m[1].replace(
                                        /^[^0-9A-Za-zА-Яа-яЁё]+|[^0-9A-Za-zА-Яа-яЁё]+$/g, '');
                                    return word.length >= 4 ? word : '';
                                };
                                // One entry per page. Pick the section whose excerpt
                                // actually contains the match (has a <mark>): show
                                // that section's snippet and link to its heading, so
                                // the dropdown shows the matched term and a click
                                // lands on the relevant section. Fall back to the
                                // page-level excerpt/URL when the match isn't under a
                                // heading (e.g. the intro).
                                const results = loaded.map(item => {
                                    const subs = item.sub_results || [];
                                    const hit = subs.find(s => /<mark>/.test(s.excerpt || ''));
                                    const raw = hit ? hit.excerpt : item.excerpt;
                                    return {
                                        uri: withHighlight(hit ? hit.url : item.url, matchedTerm(raw)),
                                        title: escapeHTML(item.meta?.title || ''),
                                        date: item.meta?.date || '',
                                        context: renderExcerpt(focusExcerpt(raw)),
                                    };
                                });
                                finish(results);
                            } catch (err) {
                                console.error(err);
                                finish([]);
                            }
                        };
                        // Expose a re-run bound to this query+callback so a facet
                        // toggle refreshes results AND counts without a keystroke
                        // (autocomplete dedupes identical queries).
                        facetRerun = () => { $searchLoading.style.display = 'inline'; search(); };
                        search();
                    }
                },
                templates: {
                    suggestion: ({ title, date, context }) => `<div><span class="suggestion-title">${title}</span><span class="suggestion-date">${escapeHTML(date)}</span></div><div class="suggestion-context">${context}</div>`,
                    empty: ({ query }) => `<div class="search-empty">${searchConfig.noResultsFound}: <span class="search-query">"${escapeHTML(query)}"</span></div>`,
                },
            });
            if (filtersEnabled) {
                const $facets = document.getElementById(`search-facets-${suffix}`);
                if ($facets) {
                    $facets.setAttribute('role', 'group');
                    $facets.setAttribute('aria-label',
                        searchConfig.pagefindFiltersLabel || 'Filters');
                    // One delegated listener on the persistent header survives
                    // the per-search re-render of its chip children.
                    $facets.addEventListener('click', (e) => {
                        const chip = e.target.closest('[data-facet-value]');
                        if (chip && !chip.disabled) {
                            const name = chip.dataset.facetName;
                            const value = chip.dataset.facetValue;
                            const set = facetSelected[name] || (facetSelected[name] = new Set());
                            if (set.has(value)) set.delete(value); else set.add(value);
                            if (facetRerun) facetRerun();
                            return;
                        }
                        if (e.target.closest('[data-facet-reset]')) {
                            filterNames.forEach((n) => facetSelected[n] && facetSelected[n].clear());
                            if (facetRerun) facetRerun();
                        }
                    }, false);
                }
            }
            autosearch.on('autocomplete:selected', (_event, suggestion, _dataset, _context) => {
                window.location.assign(suggestion.uri);
            });
            if (isMobile) this._searchMobile = autosearch;
            else this._searchDesktop = autosearch;
        };
        if (searchConfig.lunrSegmentitURL && !document.getElementById('lunr-segmentit')) {
            const script = document.createElement('script');
            script.id = 'lunr-segmentit';
            script.src = searchConfig.lunrSegmentitURL;
            script.async = true;
            if (script.readyState) {
                script.onreadystatechange = () => {
                    if (script.readyState === 'loaded' || script.readyState === 'complete'){
                        script.onreadystatechange = null;
                        initAutosearch();
                    }
                };
            } else {
                script.onload = () => {
                    initAutosearch();
                };
            }
            document.body.appendChild(script);
        } else initAutosearch();
    }

    // Highlight-on-landing: when the visitor arrives from a Pagefind search
    // result (URL carries `?highlight=`), load the official pagefind-highlight
    // bundle, wrap matches in <mark class="pagefind-highlight">, and show a
    // dismissible banner to clear the highlighting again.
    initSearchHighlight() {
        const searchConfig = this.config.search;
        if (!searchConfig || searchConfig.type !== 'pagefind') return;
        let terms;
        try {
            terms = new URLSearchParams(window.location.search).getAll('highlight');
        } catch (err) {
            console.error(err);
            return;
        }
        if (!terms.some(t => t)) return; // nothing to highlight: skip the script

        const basePath = searchConfig.pagefindBasePath || '/_pagefind/';
        import(`${basePath}pagefind-highlight.js`)
            .then(({ default: PagefindHighlight }) => {
                // Marks get our own class so the SCSS theme (incl. dark mode)
                // styles them; addStyles:false suppresses the bundle's inline
                // yellow default.
                new PagefindHighlight({ highlightParam: 'highlight', addStyles: false });
                const marks = document.querySelectorAll('mark.pagefind-highlight');
                if (marks.length === 0) {
                    // Query matched the page in the index but not in the rendered
                    // body (e.g. only in a heading already scrolled to): drop the
                    // stale param so a refresh stays clean.
                    this._clearHighlightParam();
                    return;
                }
                this._mountHighlightBanner();
                this._scrollToFirstMatch(marks[0]);
            })
            .catch(err => { console.error(err); });
    }

    _clearHighlightParam() {
        try {
            const url = new URL(window.location.href);
            url.searchParams.delete('highlight');
            window.history.replaceState(null, '', url.pathname + url.search + url.hash);
        } catch (err) { console.error(err); }
    }

    // The browser lands on the in-page anchor (#section) at load; a match can
    // sit far below that heading, off-screen. Once pagefind-highlight has
    // wrapped the marks, glide the first one to the viewport centre so the
    // visitor ends up on the actual word, not the section title. The `#section`
    // anchor is kept in the URL for semantics — only the visual position moves.
    _scrollToFirstMatch($mark) {
        if (!$mark) return;
        let reduce = false;
        try {
            reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        } catch (err) { /* matchMedia unsupported: keep the smooth default */ }
        // Two rAFs: run after the freshly inserted marks are laid out and after
        // the load-time anchor scroll has settled, so this overrides the anchor
        // landing in one continuous motion (no jump back and forth). 'instant'
        // is explicit because the global `scroll-behavior: smooth` would
        // otherwise animate even with behavior:'auto'.
        requestAnimationFrame(() => requestAnimationFrame(() => {
            try {
                $mark.scrollIntoView({
                    block: 'center',
                    behavior: reduce ? 'instant' : 'smooth',
                });
            } catch (err) {
                // Engines without ScrollIntoViewOptions: plain scroll.
                $mark.scrollIntoView();
            }
        }));
    }

    _mountHighlightBanner() {
        const searchConfig = this.config.search || {};
        // i18n strings arrive pre-localized via window.config; insert them only
        // through textContent / setAttribute, never innerHTML.
        const labelText = searchConfig.highlightLabel || 'Search highlights';
        const clearText = searchConfig.highlightClear || 'Clear highlights';

        const $banner = document.createElement('div');
        $banner.className = 'search-highlight-banner';
        $banner.setAttribute('role', 'status');

        const $swatch = document.createElement('span');
        $swatch.className = 'search-highlight-banner-swatch';
        $swatch.setAttribute('aria-hidden', 'true');

        const $label = document.createElement('span');
        $label.className = 'search-highlight-banner-label';
        $label.textContent = labelText;

        const $button = document.createElement('button');
        $button.type = 'button';
        $button.className = 'search-highlight-banner-clear';
        $button.setAttribute('aria-label', clearText);
        $button.title = clearText;
        $button.textContent = '✕'; // ✕

        $banner.appendChild($swatch);
        $banner.appendChild($label);
        $banner.appendChild($button);
        document.body.appendChild($banner);

        const onKeydown = (e) => {
            if (e.key === 'Escape' || e.key === 'Esc') dismiss();
        };
        const dismiss = () => {
            // Unwrap each highlight mark back into its original text nodes.
            Util.forEach(document.querySelectorAll('mark.pagefind-highlight'), $mark => {
                const parent = $mark.parentNode;
                if (!parent) return;
                while ($mark.firstChild) parent.insertBefore($mark.firstChild, $mark);
                parent.removeChild($mark);
                parent.normalize();
            });
            document.removeEventListener('keydown', onKeydown);
            $banner.remove();
            this._clearHighlightParam();
        };

        $button.addEventListener('click', dismiss);
        document.addEventListener('keydown', onKeydown);
    }

    initDetails() {
        Util.forEach(document.getElementsByClassName('details'), $details => {
            const $summary = $details.getElementsByClassName('details-summary')[0];
            $summary.addEventListener('click', () => {
                $details.classList.toggle('open');
            }, false);
        });
    }

    initLightGallery() {
        if (this.config.lightgallery) lightGallery(document.getElementById('content'), {
            plugins: [lgThumbnail, lgZoom],
            selector: '.lightgallery',
            speed: 400,
            hideBarsDelay: 2000,
            allowMediaOverlap: true,
            exThumbImage: 'data-thumbnail',
            toggleThumb: true,
            thumbWidth: 80,
            thumbHeight: '60px',
            actualSize: false,
            showZoomInOutIcons: true,
        });
    }

    initHighlight() {
        Util.forEach(document.querySelectorAll('.code-block'), $codeBlock => {
            const $codeTitle = $codeBlock.querySelector('.code-header > .code-title');
            if ($codeTitle) {
                $codeTitle.addEventListener('click', () => {
                    $codeBlock.classList.toggle('open');
                }, false);
            }
            const $ellipses = $codeBlock.querySelector('.code-header .ellipses');
            if ($ellipses) {
                $ellipses.addEventListener('click', () => {
                    $codeBlock.classList.toggle('open');
                }, false);
            }
            const $copy = $codeBlock.querySelector('.code-header .copy');
            if ($copy) {
                const $code = $codeBlock.querySelector('code');
                $copy.setAttribute('data-clipboard-text', $code.innerText);
                const clipboard = new ClipboardJS($copy);
                const $codeLines = $code.querySelectorAll('span.cl');
                clipboard.on('success', _e => {
                    if ($codeLines) {
                        Util.forEach($codeLines, $codeLine => Util.animateCSS($codeLine, 'animate__flash'))
                    }
                });
            }
        });
    }

    initHeaderLink() {
        for (let num = 1; num <= 6; num++) {
            Util.forEach(document.querySelectorAll('.single .content > h' + num), $header => {
                $header.classList.add('headerLink');
                $header.insertAdjacentHTML('afterbegin', `<a href="#${$header.id}" class="header-mark"></a>`);
            });
        }
    }

    initToc() {
        const $tocCore = document.getElementById('TableOfContents');
        if ($tocCore === null) return;
        if (document.getElementById('toc-static').getAttribute('data-kept') || Util.isTocStatic()) {
            const $tocContentStatic = document.getElementById('toc-content-static');
            if ($tocCore.parentElement !== $tocContentStatic) {
                $tocCore.parentElement.removeChild($tocCore);
                $tocContentStatic.appendChild($tocCore);
            }
            if (this._tocOnScroll) this.scrollEventSet.delete(this._tocOnScroll);
        } else {
            const $tocContentAuto = document.getElementById('toc-content-auto');
            if ($tocCore.parentElement !== $tocContentAuto) {
                $tocCore.parentElement.removeChild($tocCore);
                $tocContentAuto.appendChild($tocCore);
            }
            const $toc = document.getElementById('toc-auto');
            const $page = document.getElementsByClassName('page')[0];
            const rect = $page.getBoundingClientRect();
            $toc.style.left = `${rect.left + rect.width + 20}px`;
            $toc.style.maxWidth = `${$page.getBoundingClientRect().left - 20}px`;
            $toc.style.visibility = 'visible';
            const $tocLinkElements = $tocCore.querySelectorAll('a:first-child');
            const $tocLiElements = $tocCore.getElementsByTagName('li');
            const $headerLinkElements = document.getElementsByClassName('headerLink');
            const headerIsFixed = document.body.getAttribute('data-header-desktop') !== 'normal';
            const headerHeight = document.getElementById('header-desktop').offsetHeight;
            const TOP_SPACING = 20 + (headerIsFixed ? headerHeight : 0);
            const minTocTop = $toc.offsetTop;
            const minScrollTop = minTocTop - TOP_SPACING + (headerIsFixed ? 0 : headerHeight);
            this._tocOnScroll = this._tocOnScroll || (() => {
                const footerTop = document.getElementById('post-footer').offsetTop;
                const maxTocTop = footerTop - $toc.getBoundingClientRect().height;
                const maxScrollTop = maxTocTop - TOP_SPACING + (headerIsFixed ? 0 : headerHeight);
                if (this.newScrollTop < minScrollTop) {
                    $toc.style.position = 'absolute';
                    $toc.style.top = `${minTocTop}px`;
                } else if (this.newScrollTop > maxScrollTop) {
                    $toc.style.position = 'absolute';
                    $toc.style.top = `${maxTocTop}px`;
                } else {
                    $toc.style.position = 'fixed';
                    $toc.style.top = `${TOP_SPACING}px`;
                }

                Util.forEach($tocLinkElements, $tocLink => { $tocLink.classList.remove('active'); });
                Util.forEach($tocLiElements, $tocLi => { $tocLi.classList.remove('has-active'); });
                const INDEX_SPACING = 20 + (headerIsFixed ? headerHeight : 0);
                let activeTocIndex = $headerLinkElements.length - 1;
                for (let i = 0; i < $headerLinkElements.length - 1; i++) {
                    const thisTop = $headerLinkElements[i].getBoundingClientRect().top;
                    const nextTop = $headerLinkElements[i + 1].getBoundingClientRect().top;
                    if ((i === 0 && thisTop > INDEX_SPACING)
                     || (thisTop <= INDEX_SPACING && nextTop > INDEX_SPACING)) {
                        activeTocIndex = i;
                        break;
                    }
                }
                if (activeTocIndex !== -1) {
                    $tocLinkElements[activeTocIndex].classList.add('active');
                    let $parent = $tocLinkElements[activeTocIndex].parentElement;
                    while ($parent !== $tocCore) {
                        $parent.classList.add('has-active');
                        $parent = $parent.parentElement.parentElement;
                    }
                }
            });
            this._tocOnScroll();
            this.scrollEventSet.add(this._tocOnScroll);
        }
    }

    initMath() {
        if (this.config.math) renderMathInElement(document.body, this.config.math);
    }

    getMermaidDefinition(element) {
        if (!element) return null;

        const id = element.id;
        if (id && this.data && typeof this.data[id] === 'string') {
            const fromConfig = this.data[id].trim();
            if (fromConfig.length > 0) return fromConfig;
        }

        const fromText = element.textContent;
        if (fromText && fromText.trim().length > 0) {
            return fromText.trim();
        }

        return null;
    }

    initMermaid() {
        this._mermaidOnSwitchTheme = this._mermaidOnSwitchTheme || (() => {
            const $mermaidElements = document.getElementsByClassName('mermaid');
            if (!$mermaidElements.length) return;

            mermaid.initialize({startOnLoad: false, theme: this.isDark ? 'dark' : 'neutral', securityLevel: 'loose'});
            Util.forEach($mermaidElements, $mermaid => {
                const definition = this.getMermaidDefinition($mermaid);
                if (!definition) return;

                mermaid
                    .render('mermaid-svg-' + $mermaid.id, definition)
                    .then(({ svg }) => {
                        // innerHTML is safe here: `svg` is markup generated by
                        // mermaid from the author's diagram, not external data.
                        $mermaid.innerHTML = svg;
                    })
                    .catch(err => {
                        console.error(err);
                    });
            });
        });
        this.switchThemeEventSet.add(this._mermaidOnSwitchTheme);
        this._mermaidOnSwitchTheme();
    }

    initEcharts() {
        if (this.config.echarts) {
            echarts.registerTheme('light', this.config.echarts.lightTheme);
            echarts.registerTheme('dark', this.config.echarts.darkTheme);
            this._echartsOnSwitchTheme = this._echartsOnSwitchTheme || (() => {
                this._echartsArr = this._echartsArr || [];
                for (let i = 0; i < this._echartsArr.length; i++) {
                    this._echartsArr[i].dispose();
                }
                this._echartsArr = [];
                Util.forEach(document.getElementsByClassName('echarts'), $echarts => {
                    const chart = echarts.init($echarts, this.isDark ? 'dark' : 'light', {renderer: 'svg'});
                    chart.setOption(JSON.parse(this.data[$echarts.id]));
                    this._echartsArr.push(chart);
                });
            });
            this.switchThemeEventSet.add(this._echartsOnSwitchTheme);
            this._echartsOnSwitchTheme();
            this._echartsOnResize = this._echartsOnResize || (() => {
                for (let i = 0; i < this._echartsArr.length; i++) {
                    this._echartsArr[i].resize();
                }
            });
            this.resizeEventSet.add(this._echartsOnResize);
        }
    }

    initMapbox() {
        if (this.config.mapbox) {
            mapboxgl.accessToken = this.config.mapbox.accessToken;
            mapboxgl.setRTLTextPlugin(this.config.mapbox.RTLTextPlugin);
            this._mapboxArr = this._mapboxArr || [];
            Util.forEach(document.getElementsByClassName('mapbox'), $mapbox => {
                const { lng, lat, zoom, lightStyle, darkStyle, marked, navigation, geolocate, scale, fullscreen } = this.data[$mapbox.id];
                const mapbox = new mapboxgl.Map({
                    container: $mapbox,
                    center: [lng, lat],
                    zoom: zoom,
                    minZoom: .2,
                    style: this.isDark ? darkStyle : lightStyle,
                    attributionControl: false,
                });
                if (marked) {
                    new mapboxgl.Marker().setLngLat([lng, lat]).addTo(mapbox);
                }
                if (navigation) {
                    mapbox.addControl(new mapboxgl.NavigationControl(), 'bottom-right');
                }
                if (geolocate) {
                    mapbox.addControl(new mapboxgl.GeolocateControl({
                        positionOptions: {
                            enableHighAccuracy: true,
                        },
                        showUserLocation: true,
                        trackUserLocation: true,
                    }), 'bottom-right');
                }
                if (scale) {
                    mapbox.addControl(new mapboxgl.ScaleControl());
                }
                if (fullscreen) {
                    mapbox.addControl(new mapboxgl.FullscreenControl());
                }
                mapbox.addControl(new MapboxLanguage());
                this._mapboxArr.push(mapbox);
            });
            this._mapboxOnSwitchTheme = this._mapboxOnSwitchTheme || (() => {
                Util.forEach(this._mapboxArr, mapbox => {
                    const $mapbox = mapbox.getContainer();
                    const { lightStyle, darkStyle } = this.data[$mapbox.id];
                    mapbox.setStyle(this.isDark ? darkStyle : lightStyle);
                    mapbox.addControl(new MapboxLanguage());
                });
            });
            this.switchThemeEventSet.add(this._mapboxOnSwitchTheme);
        }
    }

    initTypeit() {
        if (this.config.typeit) {
            const typeitConfig = this.config.typeit;
            const speed = typeitConfig.speed ? typeitConfig.speed : 100;
            const cursorSpeed = typeitConfig.cursorSpeed ? typeitConfig.cursorSpeed : 1000;
            const cursorChar = typeitConfig.cursorChar ? typeitConfig.cursorChar : '|';
            Object.values(typeitConfig.data).forEach(group => {
                const typeone = (i) => {
                    const id = group[i];
                    new TypeIt(`#${id}`, {
                        strings: this.data[id],
                        speed: speed,
                        lifeLike: true,
                        cursorSpeed: cursorSpeed,
                        cursorChar: cursorChar,
                        waitUntilVisible: true,
                        afterComplete: () => {
                            if (i === group.length - 1) {
                                if (typeitConfig.duration >= 0) window.setTimeout(() => {
                                    instance.destroy();
                                }, typeitConfig.duration);
                                return;
                            }
                            instance.destroy();
                            typeone(i + 1);
                        },
                    }).go();
                };
                typeone(0);
            });
        }
    }

    initComment() {
        if (this.config.comment) {
            if (this.config.comment.gitalk) {
                this.config.comment.gitalk.body = decodeURI(window.location.href);
                const gitalk = new Gitalk(this.config.comment.gitalk);
                gitalk.render('gitalk');
            }
            if (this.config.comment.valine) new Valine(this.config.comment.valine);
            if (this.config.comment.utterances) {
                const utterancesConfig = this.config.comment.utterances;
                const script = document.createElement('script');
                script.src = 'https://utteranc.es/client.js';
                script.setAttribute('repo', utterancesConfig.repo);
                script.setAttribute('issue-term', utterancesConfig.issueTerm);
                if (utterancesConfig.label) script.setAttribute('label', utterancesConfig.label);
                script.setAttribute('theme', this.isDark ? utterancesConfig.darkTheme : utterancesConfig.lightTheme);
                script.crossOrigin = 'anonymous';
                script.async = true;
                document.getElementById('utterances').appendChild(script);
                this._utterancesOnSwitchTheme = this._utterancesOnSwitchTheme || (() => {
                    const message = {
                        type: 'set-theme',
                        theme: this.isDark ? utterancesConfig.darkTheme : utterancesConfig.lightTheme,
                    };
                    const iframe = document.querySelector('.utterances-frame');
                    iframe.contentWindow.postMessage(message, 'https://utteranc.es');
                });
                this.switchThemeEventSet.add(this._utterancesOnSwitchTheme);
            }

            if (this.config.comment.giscus) {
                const giscusConfig = this.config.comment.giscus;
                const giscusScript = document.createElement('script');
                giscusScript.src = 'https://giscus.app/client.js';
                giscusScript.setAttribute('data-repo', giscusConfig.repo);
                giscusScript.setAttribute('data-repo-id', giscusConfig.repoId);
                giscusScript.setAttribute('data-category', giscusConfig.category);
                giscusScript.setAttribute('data-category-id', giscusConfig.categoryId);
                giscusScript.setAttribute('data-lang', giscusConfig.lang);
                giscusScript.setAttribute('data-mapping', giscusConfig.mapping);
                giscusScript.setAttribute('data-reactions-enabled', giscusConfig.reactionsEnabled);
                giscusScript.setAttribute('data-emit-metadata', giscusConfig.emitMetadata);
                giscusScript.setAttribute('data-input-position', giscusConfig.inputPosition);
                if (giscusConfig.lazyLoading) giscusScript.setAttribute('data-loading', 'lazy');
                giscusScript.setAttribute('data-theme', this.isDark ? giscusConfig.darkTheme : giscusConfig.lightTheme);
                giscusScript.crossOrigin = 'anonymous';
                giscusScript.async = true;
                document.getElementById('giscus').appendChild(giscusScript);
                this._giscusOnSwitchTheme = this._giscusOnSwitchTheme || (() => {
                    const message = {
                        setConfig: {
                            theme: this.isDark ? giscusConfig.darkTheme : giscusConfig.lightTheme,
                            reactionsEnabled: false,
                        }
                    };
                    const iframe = document.querySelector('iframe.giscus-frame');
                    if (!iframe) return;
                    iframe.contentWindow.postMessage({ giscus: message }, 'https://giscus.app');
                });
                this.switchThemeEventSet.add(this._giscusOnSwitchTheme);
            }
            if (this.config.comment.waline) Waline.init(this.config.comment.waline);

            if (this.config.comment.remark42) {
                this._remark42OnSwitchTheme = this._remark42OnSwitchTheme || (() => {
                    // embed.js is deferred and may be blocked; bail if the API
                    // is not ready instead of throwing on an early theme toggle.
                    if (typeof window.REMARK42?.changeTheme !== 'function') return;
                    window.REMARK42.changeTheme(this.isDark ? 'dark' : 'light');
                });
                this.switchThemeEventSet.add(this._remark42OnSwitchTheme);
            }
        }
    }

    initCookieconsent() {
        if (this.config.cookieconsent) cookieconsent.initialise(this.config.cookieconsent);
    }

    onScroll() {
        const $headers = [];
        if (document.body.getAttribute('data-header-desktop') === 'auto') $headers.push(document.getElementById('header-desktop'));
        if (document.body.getAttribute('data-header-mobile') === 'auto') $headers.push(document.getElementById('header-mobile'));
        if (document.getElementById('comments')) {
            const $viewComments = document.getElementById('view-comments');
            $viewComments.href = `#comments`;
            $viewComments.parentElement.removeChild($viewComments);
            document.getElementById('fixed-buttons').appendChild($viewComments);
        }
        const $fixedButtons = document.getElementById('fixed-buttons');
        const ACCURACY = 20, MINIMUM = 100;
        window.addEventListener('scroll', () => {
            this.newScrollTop = Util.getScrollTop();
            const scroll = this.newScrollTop - this.oldScrollTop;
            const isMobile = Util.isMobile();
            Util.forEach($headers, $header => {
                if (scroll > ACCURACY) {
                    $header.classList.remove('animate__fadeInDown');
                    Util.animateCSS($header, ['animate__fadeOutUp', 'animate__faster'], true);
                } else if (scroll < - ACCURACY) {
                    $header.classList.remove('animate__fadeOutUp');
                    Util.animateCSS($header, ['animate__fadeInDown', 'animate__faster'], true);
                }
            });
            if (this.newScrollTop > MINIMUM) {
                if (isMobile && scroll > ACCURACY) {
                    $fixedButtons.classList.remove('animate__fadeIn');
                    Util.animateCSS($fixedButtons, ['animate__fadeOut', 'animate__faster'], true);
                } else if (!isMobile || scroll < - ACCURACY) {
                    $fixedButtons.style.display = 'block';
                    $fixedButtons.classList.remove('animate__fadeOut');
                    Util.animateCSS($fixedButtons, ['animate__FadeIn', 'animate__faster'], true);
                }
            } else {
                if (!isMobile) {
                    $fixedButtons.classList.remove('animate__fadeIn');
                    Util.animateCSS($fixedButtons, ['animate__fadeOut', 'animate__faster'], true);
                }
                $fixedButtons.style.display = 'none';
            }
            for (let event of this.scrollEventSet) event();
            this.oldScrollTop = this.newScrollTop;
        }, { passive: true });
    }

    onResize() {
        window.addEventListener('resize', () => {
            if (!this._resizeTimeout) {
                this._resizeTimeout = window.setTimeout(() => {
                    this._resizeTimeout = null;
                    for (let event of this.resizeEventSet) event();
                    this.initToc();
                    this.initMermaid();
                    this.initSearch();
                }, 100);
            }
        }, false);
    }

    initScrollToggle() {
        const btn = document.getElementById('scroll-toggle');
        if (!btn) return;

        const SHOW_THRESHOLD = 300;
        const RESET_FALLBACK = 800;
        let savedPosition = 0;
        let isBack = false;
        let programmaticScroll = false;
        let resetTimer = null;

        const updateVisibility = () => {
            btn.classList.toggle('visible',
                Util.getScrollTop() > SHOW_THRESHOLD || isBack);
        };

        // Release the guard once the smooth scroll settles. scrollend is
        // unsupported on older Safari/iOS and does not fire when scrollTo()
        // does not move the page, so a timer backs it up. Without this the
        // guard could latch on forever and freeze the scroll callback.
        const endProgrammaticScroll = () => {
            if (!programmaticScroll) return;
            programmaticScroll = false;
            if (resetTimer) { clearTimeout(resetTimer); resetTimer = null; }
            updateVisibility();
        };

        // Registered once: user-driven scrollend is a no-op (guard is false).
        window.addEventListener('scrollend', endProgrammaticScroll);

        btn.addEventListener('click', () => {
            programmaticScroll = true;
            if (resetTimer) clearTimeout(resetTimer);
            resetTimer = window.setTimeout(endProgrammaticScroll, RESET_FALLBACK);

            if (isBack) {
                window.scrollTo({ top: savedPosition, behavior: 'smooth' });
                isBack = false;
                btn.classList.remove('is-back');
            } else {
                savedPosition = Util.getScrollTop();
                window.scrollTo({ top: 0, behavior: 'smooth' });
                isBack = true;
                btn.classList.add('is-back');
            }
        });

        this.scrollEventSet.add(() => {
            if (programmaticScroll) return;
            if (isBack) {
                isBack = false;
                btn.classList.remove('is-back');
            }
            updateVisibility();
        });

        updateVisibility();
    }

    onClickMask() {
        document.getElementById('mask').addEventListener('click', () => {
            for (let event of this.clickMaskEventSet) event();
            document.body.classList.remove('blur');
        }, false);
    }

    init() {
        try {
            this.initRaw();
            this.initSVGIcon();
            this.initTwemoji();
            this.initMenuMobile();
            this.initSwitchTheme();
            this.initSearch();
            this.initSearchHighlight();
            this.initDetails();
            this.initLightGallery();
            this.initHighlight();
            this.initHeaderLink();
            this.initMath();
            this.initMermaid();
            this.initEcharts();
            this.initTypeit();
            this.initMapbox();
            this.initCookieconsent();
            this.initScrollToggle();
        } catch (err) {
            console.error(err);
        }

        window.setTimeout(() => {
            this.initToc();
            this.initComment();

            this.onScroll();
            this.onResize();
            this.onClickMask();
        }, 100);
    }
}

const themeInit = () => {
    const theme = new Theme();
    theme.init();
};

if (document.readyState !== 'loading') {
    themeInit();
} else {
    document.addEventListener('DOMContentLoaded', themeInit, false);
}
