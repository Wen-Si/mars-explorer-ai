/* ============================================
   MARS 3D GLOBE — Three.js Renderer
   Renders a high-fidelity Mars sphere with
   interactive feature markers.
   ============================================ */

import * as THREE from 'three';

const MarsGlobe = (function () {
    let scene, camera, renderer, mars, atmosphere, starField3D;
    let markers = [];
    let raycaster, mouse;
    let container;
    let isDragging = false;
    let prevMouse = { x: 0, y: 0 };
    let rotation = { x: 0.2, y: 0 };
    let targetRotation = { x: 0.2, y: 0 };
    let autoRotate = true;
    let zoom = 3.2;
    let targetZoom = 3.2;
    let featuresData = [];
    let activeFilter = 'all';
    let onMarkerClick = null;
    let animFrameId = null;

    const TYPE_COLORS = {
        volcano: '#d4571e',   // mars-glow — bright orange for Montes
        canyon:  '#c9a84c',   // brass-glow — gold for Valles
        crater:  '#8c2e10',   // mars-deep — dark red for Crateres
        plain:   '#7a8a4e',   // olive sage — muted green for Planitiae
        region:  '#b08d3e',   // brass-light — bronze for Terrae
        pole:    '#f5ecda',   // paper-light — ivory for Polus
    };

    function init(containerId, features, clickCallback) {
        container = document.getElementById(containerId);
        featuresData = features;
        onMarkerClick = clickCallback;

        scene = new THREE.Scene();

        const width = container.clientWidth;
        const height = container.clientHeight;

        camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        camera.position.set(0, 0, zoom);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        container.appendChild(renderer.domElement);

        raycaster = new THREE.Raycaster();
        mouse = new THREE.Vector2();

        // Lighting — warm observatory tones
        const ambient = new THREE.AmbientLight(0x3a2a18, 0.65);
        scene.add(ambient);

        const sunLight = new THREE.DirectionalLight(0xffe4c4, 1.4);
        sunLight.position.set(5, 3, 5);
        scene.add(sunLight);

        const rimLight = new THREE.DirectionalLight(0xc9a84c, 0.2);
        rimLight.position.set(-5, 0, -3);
        scene.add(rimLight);

        // Create Mars
        createMars();

        // Atmosphere glow
        createAtmosphere();

        // Background stars
        createStarField();

        // Feature markers
        createMarkers();

        // Events
        setupEvents();

        // Start render loop
        animate();

        // Hide loading screen
        setTimeout(() => {
            const loader = document.getElementById('globe-loading');
            if (loader) loader.classList.add('hidden');
        }, 800);
    }

    function createMars() {
        const geometry = new THREE.SphereGeometry(1, 128, 128);

        const textureLoader = new THREE.TextureLoader();
        textureLoader.crossOrigin = 'anonymous';

        const texture = textureLoader.load('data/textures/mars_color.jpg', (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        });

        const material = new THREE.MeshPhongMaterial({
            map: texture,
            shininess: 2,
            specular: new THREE.Color(0x331100),
            bumpScale: 0.015,
        });

        // Try to load bump map
        textureLoader.load('data/textures/mars_bump.jpg', (bumpTex) => {
            material.bumpMap = bumpTex;
            material.needsUpdate = true;
        }, undefined, () => {
            // Bump map failed, that's fine
        });

        mars = new THREE.Mesh(geometry, material);
        mars.rotation.y = 0;
        scene.add(mars);
    }

    function createAtmosphere() {
        const geometry = new THREE.SphereGeometry(1.04, 64, 64);
        const material = new THREE.ShaderMaterial({
            uniforms: {
                glowColor: { value: new THREE.Color(0xc1440e) },
            },
            vertexShader: `
                varying vec3 vNormal;
                varying vec3 vPosition;
                void main() {
                    vNormal = normalize(normalMatrix * normal);
                    vPosition = position;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 glowColor;
                varying vec3 vNormal;
                void main() {
                    float intensity = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.5);
                    gl_FragColor = vec4(glowColor, 1.0) * intensity * 0.6;
                }
            `,
            blending: THREE.AdditiveBlending,
            side: THREE.BackSide,
            transparent: true,
        });
        atmosphere = new THREE.Mesh(geometry, material);
        scene.add(atmosphere);
    }

    function createStarField() {
        const starGeometry = new THREE.BufferGeometry();
        const starCount = 3000;
        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3);

        for (let i = 0; i < starCount; i++) {
            const r = 80 + Math.random() * 120;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = r * Math.cos(phi);

            const tint = Math.random();
            // Warm cream-ivory stars (like aged star chart ink)
            colors[i * 3] = 0.95 + tint * 0.05;     // R
            colors[i * 3 + 1] = 0.88 + tint * 0.07;  // G
            colors[i * 3 + 2] = 0.72 + tint * 0.13;  // B
        }

        starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        starGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const starMaterial = new THREE.PointsMaterial({
            size: 0.4,
            vertexColors: true,
            transparent: true,
            opacity: 0.6,
        });

        starField3D = new THREE.Points(starGeometry, starMaterial);
        scene.add(starField3D);
    }

    // Convert lat/lon to 3D position on sphere
    function latLonToVec3(lat, lon, radius) {
        const phi = (90 - lat) * (Math.PI / 180);
        const theta = (lon) * (Math.PI / 180);
        const x = -radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.cos(phi);
        const z = radius * Math.sin(phi) * Math.sin(theta);
        return new THREE.Vector3(x, y, z);
    }

    function createMarkers() {
        // Clear existing markers
        markers.forEach(m => {
            scene.remove(m.group);
        });
        markers = [];

        featuresData.forEach((feature, index) => {
            if (activeFilter !== 'all' && feature.type !== activeFilter) return;

            const pos = latLonToVec3(feature.latitude, feature.longitude, 1.0);
            const color = new THREE.Color(TYPE_COLORS[feature.type] || '#ffffff');

            const group = new THREE.Group();

            // Pin point on surface
            const pinGeom = new THREE.SphereGeometry(0.012, 16, 16);
            const pinMat = new THREE.MeshBasicMaterial({ color: color });
            const pin = new THREE.Mesh(pinGeom, pinMat);
            pin.position.copy(pos);
            group.add(pin);

            // Glowing ring
            const ringGeom = new THREE.RingGeometry(0.02, 0.035, 24);
            const ringMat = new THREE.MeshBasicMaterial({
                color: color,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.5,
            });
            const ring = new THREE.Mesh(ringGeom, ringMat);
            ring.position.copy(pos);
            ring.lookAt(0, 0, 0);
            ring.rotateX(Math.PI);
            group.add(ring);

            // Vertical beam for larger features
            if (['volcano', 'pole', 'canyon'].includes(feature.type)) {
                const beamHeight = 0.08;
                const beamGeom = new THREE.CylinderGeometry(0.003, 0.003, beamHeight, 8);
                const beamMat = new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: 0.6,
                });
                const beam = new THREE.Mesh(beamGeom, beamMat);
                const beamPos = pos.clone().multiplyScalar(1.04);
                beam.position.copy(beamPos);
                beam.lookAt(0, 0, 0);
                beam.rotateX(Math.PI / 2);
                group.add(beam);
            }

            // Store metadata
            group.userData = { feature, index, pin, ring };
            scene.add(group);
            markers.push({ group, feature, index, pin, ring, basePos: pos.clone() });
        });
    }

    function setupEvents() {
        const canvas = renderer.domElement;

        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mouseup', onMouseUp);
        canvas.addEventListener('mouseleave', onMouseUp);
        canvas.addEventListener('wheel', onWheel, { passive: false });
        canvas.addEventListener('click', onClick);
        canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        canvas.addEventListener('touchmove', onTouchMove, { passive: false });
        canvas.addEventListener('touchend', onTouchEnd);

        window.addEventListener('resize', onResize);
    }

    function onMouseDown(e) {
        isDragging = true;
        prevMouse = { x: e.clientX, y: e.clientY };
        autoRotate = false;
    }

    function onMouseMove(e) {
        if (!isDragging) return;
        const dx = e.clientX - prevMouse.x;
        const dy = e.clientY - prevMouse.y;
        targetRotation.y += dx * 0.005;
        targetRotation.x += dy * 0.005;
        targetRotation.x = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, targetRotation.x));
        prevMouse = { x: e.clientX, y: e.clientY };
    }

    function onMouseUp() { isDragging = false; }

    function onWheel(e) {
        e.preventDefault();
        targetZoom += e.deltaY * 0.002;
        targetZoom = Math.max(1.8, Math.min(6, targetZoom));
    }

    function onClick(e) {
        if (isDragging) return;
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);

        // Check marker hits
        const pinMeshes = markers.map(m => m.pin);
        const intersects = raycaster.intersectObjects(pinMeshes);

        if (intersects.length > 0) {
            const hitPin = intersects[0].object;
            const marker = markers.find(m => m.pin === hitPin);
            if (marker && onMarkerClick) {
                onMarkerClick(marker.feature, marker.index);
            }
        }
    }

    function onTouchStart(e) {
        if (e.touches.length === 1) {
            isDragging = true;
            prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            autoRotate = false;
        }
    }

    function onTouchMove(e) {
        if (!isDragging || e.touches.length !== 1) return;
        e.preventDefault();
        const dx = e.touches[0].clientX - prevMouse.x;
        const dy = e.touches[0].clientY - prevMouse.y;
        targetRotation.y += dx * 0.005;
        targetRotation.x += dy * 0.005;
        targetRotation.x = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, targetRotation.x));
        prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }

    function onTouchEnd() { isDragging = false; }

    function onResize() {
        if (!container) return;
        const w = container.clientWidth;
        const h = container.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    }

    function animate() {
        animFrameId = requestAnimationFrame(animate);

        // Smooth rotation
        rotation.x += (targetRotation.x - rotation.x) * 0.08;
        rotation.y += (targetRotation.y - rotation.y) * 0.08;

        if (autoRotate) {
            targetRotation.y += 0.001;
        }

        if (mars) {
            mars.rotation.x = rotation.x;
            mars.rotation.y = rotation.y;
        }
        if (atmosphere) {
            atmosphere.rotation.x = rotation.x;
            atmosphere.rotation.y = rotation.y;
        }

        // Update markers to follow Mars rotation
        markers.forEach((m, i) => {
            m.group.rotation.x = rotation.x;
            m.group.rotation.y = rotation.y;
            // Pulse the ring
            const t = Date.now() * 0.002 + i * 0.5;
            const scale = 1 + Math.sin(t) * 0.15;
            if (m.ring) m.ring.scale.set(scale, scale, scale);
        });

        // Smooth zoom
        zoom += (targetZoom - zoom) * 0.1;
        camera.position.z = zoom;

        // Rotate stars slowly
        if (starField3D) {
            starField3D.rotation.y += 0.00005;
        }

        renderer.render(scene, camera);
    }

    function setFilter(type) {
        activeFilter = type;
        createMarkers();
    }

    function toggleAutoRotate() {
        autoRotate = !autoRotate;
        return autoRotate;
    }

    function resetView() {
        targetRotation = { x: 0.2, y: 0 };
        targetZoom = 3.2;
        autoRotate = true;
    }

    function flyTo(lat, lon) {
        // Convert lat/lon to rotation values
        targetRotation.y = -lon * (Math.PI / 180);
        targetRotation.x = lat * (Math.PI / 180);
        targetZoom = 2.2;
        autoRotate = false;
    }

    function dispose() {
        if (animFrameId) cancelAnimationFrame(animFrameId);
    }

    return {
        init,
        setFilter,
        toggleAutoRotate,
        resetView,
        flyTo,
        dispose,
        TYPE_COLORS,
    };
})();

// Expose to global scope for app.js
window.MarsGlobe = MarsGlobe;
