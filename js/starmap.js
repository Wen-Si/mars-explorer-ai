/* ============================================
   STELLARIUM MARTIANA — Star Map Knowledge Graph
   Canvas-based force-directed graph rendered as
   a celestial star chart with twinkling stars,
   constellation lines, and nebula background.
   ============================================ */

const MarsStarmap = (function () {
    'use strict';

    let canvas, ctx, overlay, octx;
    let graphData = null;
    let nodes = [], edges = [];
    let nodeMap = {};
    let constellations = {};
    let width = 0, height = 0;
    let dpr = window.devicePixelRatio || 1;

    // View transform
    let viewX = 0, viewY = 0, viewScale = 1;
    let isDragging = false, dragStartX = 0, dragStartY = 0;

    // Interaction
    let hoveredNode = null;
    let selectedNode = null;
    let mouseX = 0, mouseY = 0;

    // Simulation
    let simulation = null;
    let animFrame = null;
    let simAlpha = 1;
    let twinkles = [];

    // Background stars (decorative)
    let bgStars = [];

    // ===== Magnitude to visual properties =====
    const MAG_SIZES = {
        1: { radius: 7, glow: 24, spikeLen: 14 },
        2: { radius: 5, glow: 16, spikeLen: 9 },
        3: { radius: 3.5, glow: 10, spikeLen: 0 },
        4: { radius: 2.5, glow: 6, spikeLen: 0 }
    };

    function getStarProps(magnitude) {
        return MAG_SIZES[magnitude] || MAG_SIZES[4];
    }

    // ===== Initialization =====
    function init(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        canvas = document.createElement('canvas');
        canvas.style.position = 'absolute';
        canvas.style.inset = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.cursor = 'grab';

        overlay = document.createElement('canvas');
        overlay.style.position = 'absolute';
        overlay.style.inset = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.pointerEvents = 'none';

        container.appendChild(canvas);
        container.appendChild(overlay);

        ctx = canvas.getContext('2d');
        octx = overlay.getContext('2d');

        resize();
        window.addEventListener('resize', resize);

        // Mouse events
        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mouseup', onMouseUp);
        canvas.addEventListener('mouseleave', onMouseUp);
        canvas.addEventListener('wheel', onWheel, { passive: false });
        canvas.addEventListener('click', onClick);
        canvas.addEventListener('dblclick', onDblClick);

        // Touch events
        canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        canvas.addEventListener('touchmove', onTouchMove, { passive: false });
        canvas.addEventListener('touchend', onTouchEnd);

        generateBgStars();
        loadGraph();
    }

    function resize() {
        const container = canvas.parentElement;
        width = container.clientWidth;
        height = container.clientHeight;
        dpr = window.devicePixelRatio || 1;

        [canvas, overlay].forEach(c => {
            c.width = width * dpr;
            c.height = height * dpr;
        });
        ctx.scale(dpr, dpr);
        octx.scale(dpr, dpr);
    }

    function generateBgStars() {
        bgStars = [];
        const count = 300;
        for (let i = 0; i < count; i++) {
            bgStars.push({
                x: Math.random(),
                y: Math.random(),
                size: Math.random() * 1.2 + 0.3,
                brightness: Math.random() * 0.5 + 0.15,
                twinklePhase: Math.random() * Math.PI * 2,
                twinkleSpeed: Math.random() * 0.02 + 0.005
            });
        }
    }

    // ===== Load graph data =====
    async function loadGraph() {
        try {
            const resp = await fetch('data/knowledge_graph.json');
            graphData = await resp.json();
            buildGraph();
            initSimulation();
            startAnimation();
        } catch (e) {
            console.error('Failed to load knowledge graph:', e);
        }
    }

    function buildGraph() {
        // Build constellation lookup
        graphData.constellations.forEach(c => {
            constellations[c.id] = c;
        });

        // Build nodes
        nodes = graphData.nodes.map((n, i) => ({
            ...n,
            x: width / 2 + (Math.random() - 0.5) * 400,
            y: height / 2 + (Math.random() - 0.5) * 400,
            vx: 0,
            vy: 0,
            index: i,
            degree: 0,
            twinklePhase: Math.random() * Math.PI * 2,
            twinkleSpeed: Math.random() * 0.015 + 0.008,
            color: constellations[n.constellation]?.color || '#ffffff'
        }));

        nodeMap = {};
        nodes.forEach(n => { nodeMap[n.id] = n; });

        // Build edges
        edges = graphData.edges.map(e => ({
            source: nodeMap[e.source],
            target: nodeMap[e.target],
            type: e.type
        })).filter(e => e.source && e.target);

        // Calculate degrees
        edges.forEach(e => {
            e.source.degree++;
            e.target.degree++;
        });
    }

    // ===== Force Simulation =====
    function initSimulation() {
        simAlpha = 1;

        // Constellation cluster centers (arranged in a circle)
        const clusterCenters = {};
        const numClusters = graphData.constellations.length;
        graphData.constellations.forEach((c, i) => {
            const angle = (i / numClusters) * Math.PI * 2 - Math.PI / 2;
            const radius = Math.min(width, height) * 0.28;
            clusterCenters[c.id] = {
                x: width / 2 + Math.cos(angle) * radius,
                y: height / 2 + Math.sin(angle) * radius
            };
        });

        simulation = {
            clusterCenters,
            centerStrength: 0.04,
            repulsion: 1800,
            linkDistance: 70,
            linkStrength: 0.3,
            damping: 0.82
        };
    }

    function tickSimulation() {
        if (!simulation || simAlpha < 0.005) return;

        const { clusterCenters, centerStrength, repulsion, linkDistance, linkStrength, damping } = simulation;

        // Apply cluster center attraction
        nodes.forEach(n => {
            const center = clusterCenters[n.constellation];
            if (center) {
                n.vx += (center.x - n.x) * centerStrength * simAlpha;
                n.vy += (center.y - n.y) * centerStrength * simAlpha;
            }
        });

        // Repulsion between all nodes
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const a = nodes[i], b = nodes[j];
                let dx = b.x - a.x;
                let dy = b.y - a.y;
                let dist2 = dx * dx + dy * dy;
                if (dist2 < 1) dist2 = 1;
                const dist = Math.sqrt(dist2);
                const force = repulsion * simAlpha / dist2;
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                a.vx -= fx;
                a.vy -= fy;
                b.vx += fx;
                b.vy += fy;
            }
        }

        // Link attraction
        edges.forEach(e => {
            const dx = e.target.x - e.source.x;
            const dy = e.target.y - e.source.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const diff = dist - linkDistance;
            const force = diff * linkStrength * simAlpha;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            e.source.vx += fx;
            e.source.vy += fy;
            e.target.vx -= fx;
            e.target.vy -= fy;
        });

        // Update positions
        nodes.forEach(n => {
            n.vx *= damping;
            n.vy *= damping;
            n.x += n.vx;
            n.y += n.vy;

            // Keep within bounds (soft)
            const margin = 50;
            if (n.x < margin) n.vx += 0.5;
            if (n.x > width - margin) n.vx -= 0.5;
            if (n.y < margin) n.vy += 0.5;
            if (n.y > height - margin) n.vy -= 0.5;
        });

        simAlpha *= 0.995;
    }

    // ===== Rendering =====
    function startAnimation() {
        if (animFrame) cancelAnimationFrame(animFrame);
        function frame() {
            tickSimulation();
            render();
            animFrame = requestAnimationFrame(frame);
        }
        frame();
    }

    function render() {
        // Clear
        ctx.clearRect(0, 0, width, height);
        octx.clearRect(0, 0, width, height);

        // Deep space background
        drawNebula();

        // Background stars
        drawBgStars();

        // Transform
        ctx.save();
        ctx.translate(viewX, viewY);
        ctx.scale(viewScale, viewScale);

        // Constellation lines (edges)
        drawEdges();

        // Stars (nodes)
        drawNodes();

        ctx.restore();

        // Labels on overlay (no transform needed, we convert coords)
        drawLabels();
    }

    function drawNebula() {
        // Subtle nebula clouds
        const grad1 = ctx.createRadialGradient(width * 0.3, height * 0.4, 0, width * 0.3, height * 0.4, width * 0.5);
        grad1.addColorStop(0, 'rgba(60, 30, 15, 0.15)');
        grad1.addColorStop(0.5, 'rgba(30, 20, 40, 0.05)');
        grad1.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad1;
        ctx.fillRect(0, 0, width, height);

        const grad2 = ctx.createRadialGradient(width * 0.7, height * 0.6, 0, width * 0.7, height * 0.6, width * 0.4);
        grad2.addColorStop(0, 'rgba(20, 30, 60, 0.12)');
        grad2.addColorStop(0.5, 'rgba(15, 20, 40, 0.04)');
        grad2.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad2;
        ctx.fillRect(0, 0, width, height);
    }

    function drawBgStars() {
        const time = Date.now() * 0.001;
        bgStars.forEach(s => {
            const twinkle = Math.sin(time * s.twinkleSpeed * 50 + s.twinklePhase) * 0.3 + 0.7;
            const alpha = s.brightness * twinkle;
            ctx.fillStyle = `rgba(255, 245, 220, ${alpha})`;
            ctx.beginPath();
            ctx.arc(s.x * width, s.y * height, s.size, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    function drawEdges() {
        edges.forEach(e => {
            // Skip edges where either node is filtered out
            if (e.source._visible === false || e.target._visible === false) return;

            const isHighlighted = (hoveredNode && (e.source === hoveredNode || e.target === hoveredNode)) ||
                                  (selectedNode && (e.source === selectedNode || e.target === selectedNode));

            if (isHighlighted) {
                ctx.strokeStyle = 'rgba(201, 168, 76, 0.6)';
                ctx.lineWidth = 1.2;
            } else {
                ctx.strokeStyle = 'rgba(138, 109, 47, 0.22)';
                ctx.lineWidth = 0.7;
            }

            ctx.beginPath();
            ctx.moveTo(e.source.x, e.source.y);
            ctx.lineTo(e.target.x, e.target.y);
            ctx.stroke();
        });
    }

    function drawNodes() {
        const time = Date.now() * 0.001;

        nodes.forEach(n => {
            // Skip filtered-out nodes
            if (n._visible === false) return;

            const props = getStarProps(n.magnitude);
            const twinkle = Math.sin(time * n.twinkleSpeed * 50 + n.twinklePhase) * 0.15 + 0.85;

            const isHovered = (n === hoveredNode);
            const isSelected = (n === selectedNode);
            const isDimmed = (hoveredNode || selectedNode) && !isHovered && !isSelected &&
                             !isConnected(hoveredNode || selectedNode, n);

            let alpha = isDimmed ? 0.25 : 1.0;
            if (isHovered || isSelected) alpha = 1.0;

            const r = props.radius * (isHovered || isSelected ? 1.4 : 1) * twinkle;
            const glow = props.glow * (isHovered || isSelected ? 1.5 : 1);

            // Glow halo
            const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, glow);
            grad.addColorStop(0, hexToRgba(n.color, 0.8 * alpha));
            grad.addColorStop(0.3, hexToRgba(n.color, 0.3 * alpha));
            grad.addColorStop(1, hexToRgba(n.color, 0));
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(n.x, n.y, glow, 0, Math.PI * 2);
            ctx.fill();

            // Diffraction spikes for bright stars
            if (props.spikeLen > 0) {
                ctx.strokeStyle = hexToRgba(n.color, 0.4 * alpha * twinkle);
                ctx.lineWidth = 0.8;
                const sl = props.spikeLen * (isHovered || isSelected ? 1.3 : 1);
                ctx.beginPath();
                ctx.moveTo(n.x - sl, n.y);
                ctx.lineTo(n.x + sl, n.y);
                ctx.moveTo(n.x, n.y - sl);
                ctx.lineTo(n.x, n.y + sl);
                ctx.stroke();
            }

            // Star core
            ctx.fillStyle = `rgba(255, 250, 235, ${alpha * twinkle})`;
            ctx.beginPath();
            ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
            ctx.fill();

            // Inner bright core
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha * twinkle * 0.8})`;
            ctx.beginPath();
            ctx.arc(n.x, n.y, r * 0.4, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    function drawLabels() {
        octx.clearRect(0, 0, width, height);

        nodes.forEach(n => {
            // Skip filtered-out nodes
            if (n._visible === false) return;

            const sx = n.x * viewScale + viewX;
            const sy = n.y * viewScale + viewY;

            const isHovered = (n === hoveredNode);
            const isSelected = (n === selectedNode);
            const showLabel = isHovered || isSelected || n.magnitude <= 2;

            if (!showLabel) return;

            const isDimmed = (hoveredNode || selectedNode) && !isHovered && !isSelected &&
                             !isConnected(hoveredNode || selectedNode, n);
            if (isDimmed) return;

            const props = getStarProps(n.magnitude);
            const labelY = sy + props.radius * viewScale + 6;

            octx.font = `${isHovered || isSelected ? '600' : '400'} 11px 'JetBrains Mono', monospace`;
            octx.textAlign = 'center';
            octx.textBaseline = 'top';

            // Label background for readability
            if (isHovered || isSelected) {
                const metrics = octx.measureText(n.label);
                const padX = 6, padY = 3;
                octx.fillStyle = 'rgba(21, 17, 11, 0.85)';
                octx.fillRect(
                    sx - metrics.width / 2 - padX,
                    labelY - padY,
                    metrics.width + padX * 2,
                    16
                );
                octx.strokeStyle = hexToRgba(n.color, 0.5);
                octx.lineWidth = 0.8;
                octx.strokeRect(
                    sx - metrics.width / 2 - padX,
                    labelY - padY,
                    metrics.width + padX * 2,
                    16
                );
            }

            octx.fillStyle = isHovered || isSelected
                ? hexToRgba(n.color, 1)
                : 'rgba(201, 168, 76, 0.6)';
            octx.fillText(n.label, sx, labelY);
        });
    }

    function isConnected(nodeA, nodeB) {
        if (!nodeA || !nodeB) return false;
        return edges.some(e =>
            (e.source === nodeA && e.target === nodeB) ||
            (e.source === nodeB && e.target === nodeA)
        );
    }

    function hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    // ===== Interaction =====
    function screenToWorld(sx, sy) {
        return {
            x: (sx - viewX) / viewScale,
            y: (sy - viewY) / viewScale
        };
    }

    function findNodeAt(sx, sy) {
        const world = screenToWorld(sx, sy);
        let closest = null;
        let closestDist = Infinity;
        nodes.forEach(n => {
            if (n._visible === false) return;
            const props = getStarProps(n.magnitude);
            const dx = n.x - world.x;
            const dy = n.y - world.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const hitRadius = Math.max(props.radius + 5, 8) / viewScale;
            if (dist < hitRadius && dist < closestDist) {
                closest = n;
                closestDist = dist;
            }
        });
        return closest;
    }

    function onMouseDown(e) {
        const rect = canvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;

        const node = findNodeAt(mouseX, mouseY);
        if (!node) {
            isDragging = true;
            dragStartX = mouseX - viewX;
            dragStartY = mouseY - viewY;
            canvas.style.cursor = 'grabbing';
        }
    }

    function onMouseMove(e) {
        const rect = canvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;

        if (isDragging) {
            viewX = mouseX - dragStartX;
            viewY = mouseY - dragStartY;
        } else {
            const node = findNodeAt(mouseX, mouseY);
            if (node !== hoveredNode) {
                hoveredNode = node;
                canvas.style.cursor = node ? 'pointer' : 'grab';
            }
        }
    }

    function onMouseUp() {
        isDragging = false;
        canvas.style.cursor = hoveredNode ? 'pointer' : 'grab';
    }

    function onClick(e) {
        if (isDragging) return;
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const node = findNodeAt(sx, sy);

        if (node) {
            selectedNode = node;
            showDetailPanel(node);
        } else {
            selectedNode = null;
            hideDetailPanel();
        }
    }

    function onDblClick(e) {
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const node = findNodeAt(sx, sy);
        if (node) {
            // Center on node
            viewX = width / 2 - node.x * viewScale;
            viewY = height / 2 - node.y * viewScale;
        }
    }

    function onWheel(e) {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;

        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(0.3, Math.min(3, viewScale * delta));

        // Zoom toward mouse position
        const worldX = (sx - viewX) / viewScale;
        const worldY = (sy - viewY) / viewScale;
        viewScale = newScale;
        viewX = sx - worldX * viewScale;
        viewY = sy - worldY * viewScale;
    }

    // Touch support
    let touchDist = 0;
    function onTouchStart(e) {
        e.preventDefault();
        if (e.touches.length === 1) {
            const rect = canvas.getBoundingClientRect();
            mouseX = e.touches[0].clientX - rect.left;
            mouseY = e.touches[0].clientY - rect.top;
            const node = findNodeAt(mouseX, mouseY);
            if (!node) {
                isDragging = true;
                dragStartX = mouseX - viewX;
                dragStartY = mouseY - viewY;
            }
        } else if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            touchDist = Math.sqrt(dx * dx + dy * dy);
        }
    }

    function onTouchMove(e) {
        e.preventDefault();
        if (e.touches.length === 1 && isDragging) {
            const rect = canvas.getBoundingClientRect();
            mouseX = e.touches[0].clientX - rect.left;
            mouseY = e.touches[0].clientY - rect.top;
            viewX = mouseX - dragStartX;
            viewY = mouseY - dragStartY;
        } else if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const newDist = Math.sqrt(dx * dx + dy * dy);
            if (touchDist > 0) {
                const ratio = newDist / touchDist;
                viewScale = Math.max(0.3, Math.min(3, viewScale * ratio));
            }
            touchDist = newDist;
        }
    }

    function onTouchEnd(e) {
        if (e.touches.length === 0) {
            if (!isDragging) {
                const rect = canvas.getBoundingClientRect();
                const node = findNodeAt(mouseX, mouseY);
                if (node) {
                    selectedNode = node;
                    showDetailPanel(node);
                }
            }
            isDragging = false;
            touchDist = 0;
        }
    }

    // ===== Detail Panel =====
    function showDetailPanel(node) {
        const panel = document.getElementById('starmap-detail');
        if (!panel) return;

        const constellation = constellations[node.constellation];

        // Find connected nodes
        const connections = [];
        edges.forEach(e => {
            if (e.source === node) {
                connections.push({ node: e.target, type: e.type, direction: 'out' });
            } else if (e.target === node) {
                connections.push({ node: e.source, type: e.type, direction: 'in' });
            }
        });

        const connHtml = connections.map(c => {
            const arrow = c.direction === 'out' ? '→' : '←';
            return `<div class="sm-connection" data-node-id="${c.node.id}">
                <span class="sm-conn-arrow">${arrow}</span>
                <span class="sm-conn-type">${c.type.replace(/_/g, ' ')}</span>
                <span class="sm-conn-node">${c.node.label}</span>
            </div>`;
        }).join('');

        panel.innerHTML = `
            <button class="sm-panel-close" onclick="document.getElementById('starmap-detail').classList.remove('visible')">&times;</button>
            <div class="sm-panel-ornament" style="background:${node.color}"></div>
            <span class="sm-panel-constellation" style="color:${node.color}">${constellation?.name || ''}</span>
            <h3 class="sm-panel-title">${node.label}</h3>
            <div class="sm-panel-magnitude">Magnitude ${node.magnitude} · ${node.degree} connections</div>
            <div class="sm-panel-divider"></div>
            <p class="sm-panel-desc">${node.description}</p>
            ${connections.length > 0 ? `
                <div class="sm-panel-conn-label">Connected Stars (${connections.length})</div>
                <div class="sm-panel-connections">${connHtml}</div>
            ` : ''}
        `;
        panel.classList.add('visible');

        // Add click handlers for connections
        panel.querySelectorAll('.sm-connection').forEach(el => {
            el.addEventListener('click', () => {
                const nodeId = el.dataset.nodeId;
                const targetNode = nodeMap[nodeId];
                if (targetNode) {
                    selectedNode = targetNode;
                    showDetailPanel(targetNode);
                    // Center on node
                    viewX = width / 2 - targetNode.x * viewScale;
                    viewY = height / 2 - targetNode.y * viewScale;
                }
            });
        });
    }

    function hideDetailPanel() {
        const panel = document.getElementById('starmap-detail');
        if (panel) panel.classList.remove('visible');
    }

    // ===== Public API =====
    function filterByConstellation(constellationId) {
        if (constellationId === 'all') {
            nodes.forEach(n => { n._visible = true; });
        } else {
            nodes.forEach(n => { n._visible = (n.constellation === constellationId); });
        }
    }

    function resetView() {
        viewX = 0;
        viewY = 0;
        viewScale = 1;
        selectedNode = null;
        hideDetailPanel();
    }

    function destroy() {
        if (animFrame) cancelAnimationFrame(animFrame);
        window.removeEventListener('resize', resize);
    }

    return { init, resetView, filterByConstellation, destroy };
})();

// Export for module loading
if (typeof window !== 'undefined') {
    window.MarsStarmap = MarsStarmap;
}

export default MarsStarmap;
