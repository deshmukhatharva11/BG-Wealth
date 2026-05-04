document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('particleCanvas');
    if (!canvas || typeof THREE === 'undefined') return;

    const container = document.querySelector('.hero-visual');
    if (!container) return;

    // --- Scene Setup ---
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.z = 320; 

    const renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // --- Particle System Configuration ---
    // Use an Icosahedron to get an incredibly uniform, mathematical lattice structure
    const baseRadius = 140;
    // Lowered detail from 40 to 25 to significantly reduce the particle count
    const geometry = new THREE.IcosahedronGeometry(baseRadius, window.innerWidth > 768 ? 25 : 15);
    
    // Store original positions for deformation
    const initialPositions = new Float32Array(geometry.attributes.position.array);
    const vertexCount = initialPositions.length / 3;
    
    // Create Teal-to-Gold gradient colors
    const colors = new Float32Array(vertexCount * 3);
    const colorTop = new THREE.Color('#4fd1c5');  // Teal
    const colorBottom = new THREE.Color('#D4AF37'); // Gold

    for (let i = 0; i < vertexCount; i++) {
        const y = initialPositions[i * 3 + 1];
        const yRatio = (y + baseRadius) / (baseRadius * 2); // Map y from 0 to 1
        const mixedColor = colorBottom.clone().lerp(colorTop, yRatio);
        
        colors[i * 3] = mixedColor.r;
        colors[i * 3 + 1] = mixedColor.g;
        colors[i * 3 + 2] = mixedColor.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Create a circular texture with a soft edge
    const createCircleTexture = () => {
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        // Draw soft glowing circle
        const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.8)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.fill();
        return new THREE.CanvasTexture(canvas);
    };

    // Main Solid Blob Material
    // depthWrite: true and alphaTest are critical so the front particles hide the back ones, creating a solid 3D shape!
    const material = new THREE.PointsMaterial({
        size: 1.5, 
        vertexColors: true,
        map: createCircleTexture(),
        transparent: true,
        opacity: 0.7, // minor decrease in opacity
        alphaTest: 0.1, // Discard transparent pixels so they don't mess up the depth buffer
        depthWrite: true, 
        blending: THREE.NormalBlending
    });

    const particleSystem = new THREE.Points(geometry, material);
    scene.add(particleSystem);

    // --- Floating Out-of-Focus Particles ---
    // Add the blurry foreground lights, constrained to the circle/sphere shape
    const floatGeometry = new THREE.BufferGeometry();
    const floatCount = 40;
    const floatPos = new Float32Array(floatCount * 3);
    for(let i=0; i<floatCount; i++) {
        const theta = Math.random() * 2 * Math.PI;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = baseRadius + 10 + Math.random() * 30; // Constrained strictly to the sphere radius
        
        floatPos[i*3] = r * Math.sin(phi) * Math.cos(theta);
        floatPos[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
        floatPos[i*3+2] = r * Math.cos(phi);
    }
    floatGeometry.setAttribute('position', new THREE.BufferAttribute(floatPos, 3));
    
    const floatMaterial = new THREE.PointsMaterial({
        size: 12.0,
        color: new THREE.Color('#D4AF37'), // Gold highlights
        map: createCircleTexture(),
        transparent: true,
        opacity: 0.3, // minor decrease in opacity
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    const floatSystem = new THREE.Points(floatGeometry, floatMaterial);
    scene.add(floatSystem);


    // --- Positioning within Hero ---
    function updatePosition() {
        particleSystem.position.x = 0;
        particleSystem.position.y = 0;
    }
    updatePosition();

    // --- Animation Loop ---
    let time = 0;
    const clock = new THREE.Clock();

    function animate() {
        requestAnimationFrame(animate);

        const delta = clock.getDelta();
        time += delta * 0.6; // Speed of undulation

        // Gentle overall rotation
        particleSystem.rotation.y += 0.05 * delta;
        particleSystem.rotation.x += 0.03 * delta;
        
        // Rotate foreground particles slowly
        floatSystem.rotation.y -= 0.02 * delta;

        // Structured organic 3D deformation (Cartesian noise instead of spherical)
        const positionsAttribute = geometry.attributes.position;
        const posArray = positionsAttribute.array;
        
        for (let i = 0; i < posArray.length; i += 3) {
            const ix = initialPositions[i];
            const iy = initialPositions[i + 1];
            const iz = initialPositions[i + 2];
            
            // Removed heavy curves per user request to maintain a perfect sphere
            const currentRadius = baseRadius;

            // Normalize direction vector and multiply by new radius
            const len = Math.sqrt(ix*ix + iy*iy + iz*iz);
            const nx = ix / len;
            const ny = iy / len;
            const nz = iz / len;

            posArray[i] = nx * currentRadius;
            posArray[i + 1] = ny * currentRadius;
            posArray[i + 2] = nz * currentRadius;
        }
        
        positionsAttribute.needsUpdate = true;
        renderer.render(scene, camera);
    }

    // --- Handle Resize ---
    window.addEventListener('resize', () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
        updatePosition();
    });

    // Start animation
    animate();
});
