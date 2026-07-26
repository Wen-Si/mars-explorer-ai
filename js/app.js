/* ============================================
   MARS EXPLORER — Application Logic
   Handles views, data loading, interactions
   ============================================ */

(function () {
    'use strict';

    let featuresData = [];
    let questionsData = [];
    let currentQuestion = null;
    let starmapInitialized = false;

    // ===== Data sources =====
    const SOURCES = [
        {
            num: '01',
            name: 'NASA Mars Science',
            url: 'https://science.nasa.gov/mars/',
            desc: 'NASA\'s comprehensive Mars exploration portal featuring data from rovers (Curiosity, Perseverance, Spirit, Opportunity), orbiters (MRO, MAVEN, Odyssey), and landers (InSight, Viking). The primary source for surface geology, atmospheric science, and astrobiology findings.'
        },
        {
            num: '02',
            name: 'ESA Mars Express',
            url: 'https://www.esa.int/Science_Exploration/Space_Science/Mars_Express',
            desc: 'The European Space Agency\'s Mars Express mission, orbiting since 2003. Key instruments include HRSC (high-resolution stereo camera), MARSIS (subsurface radar), and OMEGA (mineral mapping spectrometer). Major contributor to 3D terrain and subsurface water data.'
        },
        {
            num: '03',
            name: 'The Mars Society',
            url: 'https://www.marssociety.org/',
            desc: 'The world\'s largest space advocacy organization dedicated to Mars exploration and settlement. Operates analog research stations (MDRS, FMARS), maintains the Marspedia encyclopedia, and drives public engagement with Mars science and human mission planning.'
        },
        {
            num: '04',
            name: 'IGG CAS — Mars Research',
            url: 'http://www.igg.cas.cn/Mars/',
            desc: 'The Institute of Geology and Geophysics, Chinese Academy of Sciences. Publishes peer-reviewed Mars research on surface mineralogy, water activity history, crustal magnetism (Terra Cimmeria), seismic data analysis (InSight collaboration), and northern lowlands geology.'
        },
    ];

    // ===== Initialize on DOM ready =====
    document.addEventListener('DOMContentLoaded', init);

    function init() {
        initStarfield();
        initNav();
        loadFeatures();
        loadQuestions();
        renderSources();
    }

    // ===== Starfield Background =====
    function initStarfield() {
        const canvas = document.getElementById('starfield');
        if (!canvas) return; // No starfield canvas in celestial cartography design
        const ctx = canvas.getContext('2d');
        let stars = [];

        function resize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            stars = [];
            const count = Math.floor((canvas.width * canvas.height) / 6000);
            for (let i = 0; i < count; i++) {
                stars.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    r: Math.random() * 1.2,
                    o: Math.random() * 0.8 + 0.2,
                    twinkle: Math.random() * 0.02,
                    phase: Math.random() * Math.PI * 2,
                });
            }
        }
        resize();
        window.addEventListener('resize', resize);

        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const t = Date.now() * 0.001;
            stars.forEach(s => {
                const opacity = s.o * (0.5 + 0.5 * Math.sin(t * s.twinkle * 50 + s.phase));
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(220, 200, 180, ${opacity})`;
                ctx.fill();
            });
            requestAnimationFrame(draw);
        }
        draw();
    }

    // ===== Navigation =====
    function initNav() {
        const navBtns = document.querySelectorAll('.nav-btn');
        navBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.dataset.view;
                navBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
                document.getElementById(`view-${view}`).classList.add('active');
                // Resize globe when switching back to explore
                if (view === 'explore' && window.MarsGlobe) {
                    setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
                }
                // Initialize starmap on first view
                if (view === 'starmap') {
                    if (!starmapInitialized && window.MarsStarmap) {
                        starmapInitialized = true;
                        window.MarsStarmap.init('starmap-canvas');
                        setupStarmapUI();
                    }
                    setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
                }
            });
        });
    }

    // ===== Features =====
    async function loadFeatures() {
        try {
            const resp = await fetch('data/features.json');
            featuresData = await resp.json();
            renderQuickList();
            // Initialize 3D globe separately (may fail without WebGL)
            try {
                initGlobe();
            } catch (e) {
                console.warn('3D globe unavailable, using 2D fallback:', e);
                initGlobeFallback();
            }
        } catch (e) {
            console.error('Failed to load features:', e);
        }
    }

    function initGlobeFallback() {
        // 2D fallback: show Mars image if WebGL is not available
        const container = document.getElementById('mars-globe');
        const loader = document.getElementById('globe-loading');

        // Put the image inside #mars-globe (not the loading screen)
        // so the reticle frame (z-index:5) is visible on top
        if (container) {
            container.innerHTML = `
                <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;">
                    <img src="data/textures/mars_color.jpg" alt="Mars"
                         style="width:min(400px,60vw);height:min(400px,60vw);border-radius:50%;object-fit:cover;box-shadow:0 0 60px rgba(212,87,30,0.4);"/>
                    <p style="margin-top:20px;color:var(--brass-glow);font-family:var(--font-mono);font-size:12px;">2D View · WebGL not available</p>
                </div>
            `;
        }
        // Hide the loading screen so it doesn't cover the reticle frame
        if (loader) {
            loader.classList.add('hidden');
        }

        // Always override MarsGlobe with safe no-op stubs for 2D mode
        window.MarsGlobe = {
            flyTo: () => {},
            setFilter: () => {},
            toggleAutoRotate: () => false,
            resetView: () => {},
            TYPE_COLORS: {
                volcano: '#d4571e', canyon: '#c9a84c', crater: '#8c2e10',
                plain: '#7a8a4e', region: '#b08d3e', pole: '#f5ecda',
            },
        };

        // Set up globe UI controls (same as 3D mode)
        setupGlobeUI();
    }

    function initGlobe() {
        if (!window.MarsGlobe) return;
        MarsGlobe.init('mars-globe', featuresData, onFeatureClick);

        // Set up globe UI controls
        setupGlobeUI();
    }

    // Set up globe control buttons and legend filters
    // Called from both initGlobe() and initGlobeFallback()
    function setupGlobeUI() {
        // Toggle rotation button
        const toggleBtn = document.getElementById('toggle-rotation');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', function () {
                const rotating = window.MarsGlobe.toggleAutoRotate();
                this.style.color = rotating ? '' : 'var(--mars-glow)';
            });
        }

        // Reset view button
        const resetBtn = document.getElementById('reset-view');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                window.MarsGlobe.resetView();
                document.getElementById('feature-panel').classList.remove('visible');
            });
        }

        // Legend filters
        document.querySelectorAll('.legend-item').forEach(item => {
            item.addEventListener('click', () => {
                document.querySelectorAll('.legend-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                window.MarsGlobe.setFilter(item.dataset.type);
                renderQuickList(item.dataset.type);
            });
        });

        // Panel close button
        const closeBtn = document.getElementById('panel-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                document.getElementById('feature-panel').classList.remove('visible');
            });
        }
    }

    function onFeatureClick(feature, index) {
        const panel = document.getElementById('feature-panel');
        document.getElementById('panel-type').textContent = feature.type;
        document.getElementById('panel-name').textContent = feature.name;
        document.getElementById('panel-coords').textContent =
            `${feature.latitude.toFixed(2)}°N, ${feature.longitude.toFixed(2)}°E`;
        document.getElementById('panel-desc').textContent = feature.description;

        const sourcesDiv = document.getElementById('panel-sources');
        sourcesDiv.innerHTML = '';
        (feature.sources || []).forEach(src => {
            const span = document.createElement('span');
            span.textContent = src;
            sourcesDiv.appendChild(span);
        });

        panel.classList.add('visible');
    }

    // ===== Starmap UI =====
    function setupStarmapUI() {
        // Reset view button
        const resetBtn = document.getElementById('starmap-reset');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                window.MarsStarmap.resetView();
            });
        }

        // Constellation filter legend
        document.querySelectorAll('.starmap-legend-item').forEach(item => {
            item.addEventListener('click', () => {
                document.querySelectorAll('.starmap-legend-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                window.MarsStarmap.filterByConstellation(item.dataset.constellation);
            });
        });
    }

    function renderQuickList(filter = 'all') {
        const list = document.getElementById('feature-quick-list');
        list.innerHTML = '<h4>Features</h4>';
        const filtered = filter === 'all'
            ? featuresData
            : featuresData.filter(f => f.type === filter);
        const colors = (window.MarsGlobe && window.MarsGlobe.TYPE_COLORS) || {};
        filtered.forEach((f, i) => {
            const item = document.createElement('div');
            item.className = 'quick-item';
            const color = colors[f.type] || '#d4571e';
            item.innerHTML = `<span class="quick-dot" style="background:${color}"></span><span>${f.name}</span>`;
            item.addEventListener('click', () => {
                if (window.MarsGlobe) window.MarsGlobe.flyTo(f.latitude, f.longitude);
                onFeatureClick(f, i);
            });
            list.appendChild(item);
        });
    }

    // ===== Questions & Reports =====
    async function loadQuestions() {
        try {
            const resp = await fetch('data/questions.json');
            if (!resp.ok) throw new Error('Not found');
            questionsData = await resp.json();
        } catch (e) {
            // If no questions yet, show empty state
            questionsData = [];
        }
        renderQuestions();
        renderTimeline();

        // Poll for updates if there's an in-progress question
        const hasInProgress = questionsData.some(q => q.status === 'researching');
        if (hasInProgress) {
            setTimeout(loadQuestions, 30000);
        }
    }

    function renderQuestions() {
        const list = document.getElementById('question-list');
        const stats = document.getElementById('research-stats');
        const completed = questionsData.filter(q => q.status === 'completed').length;
        const researching = questionsData.filter(q => q.status === 'researching').length;

        stats.innerHTML = `
            <div class="stat-card"><div class="stat-num">${questionsData.length}</div><div class="stat-label">Questions Posed</div></div>
            <div class="stat-card"><div class="stat-num">${completed}</div><div class="stat-label">Reports Done</div></div>
            <div class="stat-card"><div class="stat-num">${researching}</div><div class="stat-label">In Progress</div></div>
        `;

        if (questionsData.length === 0) {
            list.innerHTML = '<div class="loading-inline">No questions yet. AI will pose its first question soon.</div>';
            return;
        }

        list.innerHTML = '';
        // Show most recent first
        const sorted = [...questionsData].reverse();
        sorted.forEach((q, idx) => {
            const card = document.createElement('div');
            card.className = 'question-card';
            if (currentQuestion && q.id === currentQuestion.id) card.classList.add('selected');
            const statusClass = q.status === 'completed' ? 'completed' : 'researching';
            const statusText = q.status === 'completed' ? 'Report Ready' : 'Researching';
            card.innerHTML = `
                <div class="q-status ${statusClass}">
                    <span class="q-status-dot"></span>${statusText}
                </div>
                <div class="q-category">${q.category || 'Science'}</div>
                <div class="q-title">${q.title}</div>
                <div class="q-date">${q.id} · ${q.asked_date}</div>
            `;
            card.addEventListener('click', () => selectQuestion(q));
            list.appendChild(card);
        });

        // Auto-select first completed question
        if (!currentQuestion) {
            const firstCompleted = questionsData.find(q => q.status === 'completed');
            if (firstCompleted) selectQuestion(firstCompleted);
        }
    }

    async function selectQuestion(q) {
        currentQuestion = q;
        // Update selected state
        document.querySelectorAll('.question-card').forEach(c => c.classList.remove('selected'));
        // Re-render to update selection
        renderQuestions();

        const detail = document.getElementById('research-detail');

        if (q.status !== 'completed' || !q.report_file) {
            detail.innerHTML = `
                <div class="report-header">
                    <span class="report-category">${q.category || 'Science'}</span>
                    <h1 class="report-title">${q.title}</h1>
                    <div class="report-meta">
                        <span><strong>Asked:</strong> ${q.asked_date}</span>
                        <span><strong>Status:</strong> Research in progress</span>
                        <span><strong>Expected:</strong> ${q.report_ready_date || 'TBD'}</span>
                    </div>
                </div>
                <div class="report-body">
                    <h2>Research Question</h2>
                    <p>${q.title}</p>
                    <h2>Rationale</h2>
                    <p>${q.rationale || ''}</p>
                    <h2>Hypothesis</h2>
                    <p>${q.hypothesis || ''}</p>
                    <h2>Key Data Needed</h2>
                    <p>${q.key_data_needed || ''}</p>
                    <h2>Implications</h2>
                    <p>${q.implications || ''}</p>
                    <blockquote>The AI research engine is currently investigating this question. The full research report will be available on ${q.report_ready_date || 'the scheduled date'}.</blockquote>
                </div>
            `;
            return;
        }

        // Load report
        try {
            const resp = await fetch(`data/${q.report_file}`);
            const md = await resp.text();

            // Try to load review data
            let reviewBadge = '';
            try {
                const reviewResp = await fetch(`data/reviews/${q.id}_review.json`);
                if (reviewResp.ok) {
                    const reviewData = await reviewResp.json();
                    const dims = reviewData.final_dimension_scores || {};
                    const score = reviewData.final_overall_score || 0;
                    const scoreColor = score >= 85 ? '#4a7c59' : score >= 70 ? '#b8860b' : '#8b3a3a';
                    const dimLabels = {
                        scientific_validity: 'Scientific',
                        rationality: 'Rationality',
                        standardization: 'Standard',
                        logicality: 'Logic'
                    };
                    const dimBadges = Object.entries(dims).map(([key, val]) => {
                        const label = dimLabels[key] || key;
                        const color = val >= 85 ? '#4a7c59' : val >= 70 ? '#b8860b' : '#8b3a3a';
                        return `<span class="review-dim" style="color:${color}">${label}: ${val}</span>`;
                    }).join('');
                    const iterText = reviewData.total_iterations > 0
                        ? ` · Revised ${reviewData.total_iterations}x`
                        : ' · Passed first review';
                    reviewBadge = `
                        <div class="review-badge">
                            <div class="review-score" style="color:${scoreColor}">Review Score: ${score}/100${iterText}</div>
                            <div class="review-dims">${dimBadges}</div>
                        </div>
                    `;
                }
            } catch (e) { /* review data not available */ }

            detail.innerHTML = `
                <div class="report-header">
                    <span class="report-category">${q.category || 'Science'}</span>
                    <h1 class="report-title">${q.title}</h1>
                    <div class="report-meta">
                        <span><strong>Asked:</strong> ${q.asked_date}</span>
                        <span><strong>Report:</strong> ${q.report_generated ? q.report_generated.split('T')[0] : ''}</span>
                        <span><strong>Model:</strong> MiniMax M3</span>
                    </div>
                    ${reviewBadge}
                </div>
                <div class="report-body">${parseMarkdown(md)}</div>
            `;
        } catch (e) {
            detail.innerHTML = '<div class="loading-inline">Failed to load report.</div>';
        }
    }

    // ===== Timeline =====
    function renderTimeline() {
        const container = document.getElementById('timeline-container');
        if (questionsData.length === 0) {
            container.innerHTML = '<div class="loading-inline">Timeline will appear once AI poses its first question.</div>';
            return;
        }
        container.innerHTML = '';
        const sorted = [...questionsData].sort((a, b) =>
            new Date(b.asked_date) - new Date(a.asked_date)
        );
        sorted.forEach(q => {
            const item = document.createElement('div');
            item.className = `tl-item ${q.status}`;
            const statusText = q.status === 'completed' ? 'Report Completed' : 'Research In Progress';
            item.innerHTML = `
                <div class="tl-date">${q.asked_date} → ${q.report_ready_date || 'TBD'}</div>
                <div class="tl-title">${q.title}</div>
                <span class="tl-status ${q.status}">${statusText}</span>
                <span class="q-category" style="margin-left:8px">${q.category || ''}</span>
            `;
            item.addEventListener('click', () => {
                document.querySelector('.nav-btn[data-view="research"]').click();
                selectQuestion(q);
            });
            container.appendChild(item);
        });
    }

    // ===== Sources =====
    function renderSources() {
        const grid = document.getElementById('sources-grid');
        grid.innerHTML = '';
        SOURCES.forEach(s => {
            const card = document.createElement('a');
            card.className = 'source-card';
            card.href = s.url;
            card.target = '_blank';
            card.rel = 'noopener';
            card.innerHTML = `
                <div class="source-num">SOURCE ${s.num}</div>
                <div class="source-name">${s.name}</div>
                <div class="source-url">${s.url}</div>
                <div class="source-desc">${s.desc}</div>
            `;
            grid.appendChild(card);
        });
    }

    // ===== Simple Markdown parser =====
    function parseMarkdown(md) {
        let html = md;
        // Remove the auto-generated header (already shown in report-header)
        html = html.replace(/^#\s+.+$/gm, '');
        html = html.replace(/^\*\*Category:.+$/gm, '');
        html = html.replace(/^\*\*Asked:.+$/gm, '');
        html = html.replace(/^\*\*Report Generated:.+$/gm, '');
        html = html.replace(/^\*\*Hypothesis:.+$/gm, '');
        html = html.replace(/^---+$/gm, '');

        // Escape HTML
        html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // Code blocks
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (m, lang, code) =>
            `<pre style="background:var(--paper-dark);padding:14px;border-radius:1px;overflow-x:auto;margin:14px 0;border:1px solid var(--paper-deep)"><code>${code.trim()}</code></pre>`);

        // Headers
        html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
        html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');

        // Bold and italic
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Links
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

        // Blockquotes
        html = html.replace(/^&gt;\s+(.+)$/gm, '<blockquote>$1</blockquote>');

        // Lists
        html = html.replace(/^(\d+)\.\s+(.+)$/gm, '<li>$2</li>');
        html = html.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`);

        // Paragraphs
        html = html.split(/\n\n+/).map(block => {
            block = block.trim();
            if (!block) return '';
            if (block.startsWith('<')) return block;
            return `<p>${block.replace(/\n/g, '<br>')}</p>`;
        }).join('\n');

        // Clean up
        html = html.replace(/<br><br>/g, '</p><p>');
        html = html.replace(/<p><\/p>/g, '');

        return html;
    }
})();
