/* ============================================
   MARS EXPLORER — Application Logic
   Handles views, data loading, interactions
   ============================================ */

(function () {
    'use strict';

    let featuresData = [];
    let questionsData = [];
    let currentQuestion = null;

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
        if (loader) {
            loader.innerHTML = `
                <div style="text-align:center;padding:20px;">
                    <img src="data/textures/mars_color.jpg" alt="Mars" style="width:400px;height:400px;border-radius:50%;object-fit:cover;box-shadow:0 0 60px rgba(232,93,42,0.4);"/>
                    <p style="margin-top:20px;color:var(--text-muted);font-family:var(--font-mono);font-size:12px;">2D View (WebGL not available in this browser)</p>
                </div>
            `;
            loader.classList.remove('hidden');
            loader.style.background = 'var(--space-void)';
        }
        // Still allow feature clicking from the quick list
        if (!window.MarsGlobe) {
            window.MarsGlobe = {
                flyTo: () => {},
                setFilter: () => {},
                toggleAutoRotate: () => false,
                resetView: () => {},
                TYPE_COLORS: {
                    volcano: '#ff6b35', canyon: '#f4a261', crater: '#e9c46a',
                    plain: '#a8dadc', region: '#b08968', pole: '#e0fbfc',
                },
            };
        }
    }

    function initGlobe() {
        if (!window.MarsGlobe) return;
        MarsGlobe.init('mars-globe', featuresData, onFeatureClick);

        // Controls
        document.getElementById('toggle-rotation').addEventListener('click', function () {
            const rotating = MarsGlobe.toggleAutoRotate();
            this.style.color = rotating ? '' : 'var(--mars-glow)';
        });
        document.getElementById('reset-view').addEventListener('click', () => {
            MarsGlobe.resetView();
            document.getElementById('feature-panel').classList.remove('visible');
        });

        // Legend filters
        document.querySelectorAll('.legend-item').forEach(item => {
            item.addEventListener('click', () => {
                document.querySelectorAll('.legend-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                MarsGlobe.setFilter(item.dataset.type);
                renderQuickList(item.dataset.type);
            });
        });
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

    function renderQuickList(filter = 'all') {
        const list = document.getElementById('feature-quick-list');
        list.innerHTML = '<h4>Features</h4>';
        const filtered = filter === 'all'
            ? featuresData
            : featuresData.filter(f => f.type === filter);
        filtered.forEach((f, i) => {
            const item = document.createElement('div');
            item.className = 'quick-item';
            const color = MarsGlobe.TYPE_COLORS[f.type] || '#fff';
            item.innerHTML = `<span class="quick-dot" style="background:${color}"></span><span>${f.name}</span>`;
            item.addEventListener('click', () => {
                MarsGlobe.flyTo(f.latitude, f.longitude);
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
            if (idx === 0 && currentQuestion) card.classList.add('selected');
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
            detail.innerHTML = `
                <div class="report-header">
                    <span class="report-category">${q.category || 'Science'}</span>
                    <h1 class="report-title">${q.title}</h1>
                    <div class="report-meta">
                        <span><strong>Asked:</strong> ${q.asked_date}</span>
                        <span><strong>Report:</strong> ${q.report_generated ? q.report_generated.split('T')[0] : ''}</span>
                        <span><strong>Model:</strong> GLM-4.5-Flash</span>
                    </div>
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
        html = html.replace(/^#\s+.+$/m, '');
        html = html.replace(/^\*\*Category:.+$/m, '');
        html = html.replace(/^\*\*Asked:.+$/m, '');
        html = html.replace(/^\*\*Report Generated:.+$/m, '');
        html = html.replace(/^\*\*Hypothesis:.+$/m, '');
        html = html.replace(/^---+$/m, '');

        // Escape HTML
        html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // Code blocks
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (m, lang, code) =>
            `<pre style="background:var(--space-card);padding:14px;border-radius:6px;overflow-x:auto;margin:14px 0"><code>${code.trim()}</code></pre>`);

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
