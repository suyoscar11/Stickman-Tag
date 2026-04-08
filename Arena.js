import * as THREE from 'three';
import GameObject3D from './GameObject3D.js';

export default class Arena extends GameObject3D {
    constructor(scene) {
        super(scene);

        // 1. Bright grass-like floor
        const floorGeo = new THREE.PlaneGeometry(80, 80);
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0x6abf4b,
            roughness: 0.9,
            metalness: 0.0,
        });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        this.mesh.add(floor);

        // Subtle lighter grid lines
        const gridHelper = new THREE.GridHelper(80, 40, 0x80d468, 0x5ea83e);
        gridHelper.material.opacity = 0.3;
        gridHelper.material.transparent = true;
        gridHelper.position.y = 0.01;
        this.mesh.add(gridHelper);

        // Soft white boundary lines
        const edgeGeo = new THREE.PlaneGeometry(80, 0.4);
        const edgeMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.5,
        });

        const edges = [
            { pos: [0, 0.02, -40], rot: [-Math.PI / 2, 0, 0] },
            { pos: [0, 0.02, 40], rot: [-Math.PI / 2, 0, 0] },
            { pos: [-40, 0.02, 0], rot: [-Math.PI / 2, 0, Math.PI / 2] },
            { pos: [40, 0.02, 0], rot: [-Math.PI / 2, 0, Math.PI / 2] },
        ];

        edges.forEach(e => {
            const line = new THREE.Mesh(edgeGeo, edgeMat);
            line.position.set(...e.pos);
            line.rotation.set(...e.rot);
            this.mesh.add(line);
        });

        // 2. Clean semi-transparent walls with soft blue tint
        const wallMat = new THREE.MeshStandardMaterial({
            color: 0x88bbee,
            transparent: true,
            opacity: 0.18,
            emissive: 0x4488cc,
            emissiveIntensity: 0.1,
            roughness: 0.3,
        });

        const buildWall = (w, h, d, x, y, z) => {
            const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
            wall.position.set(x, y, z);
            this.mesh.add(wall);
            this.addBoxCollider(x, 0, z, w, h, d);
        };

        buildWall(80, 8, 4, 0, 4, -42);
        buildWall(80, 8, 4, 0, 4, 42);
        buildWall(4, 8, 80, -42, 4, 0);
        buildWall(4, 8, 80, 42, 4, 0);

        // 3. Bright, playful obstacles with rounded feel
        const obstacleColors = [
            { color: 0xff6b6b, emissive: 0x993333 },  // Coral red
            { color: 0x51cf66, emissive: 0x2d7a3a },  // Fresh green
            { color: 0x339af0, emissive: 0x1a5f99 },  // Sky blue
            { color: 0xfcc419, emissive: 0x997a10 },  // Sunny yellow
            { color: 0xcc5de8, emissive: 0x7a3899 },  // Soft purple
            { color: 0x22b8cf, emissive: 0x147a8a },  // Teal
            { color: 0xff922b, emissive: 0x99571a },  // Orange
        ];

        const buildObstacle = (w, h, d, x, z) => {
            const palette = obstacleColors[Math.floor(Math.random() * obstacleColors.length)];
            const obsMat = new THREE.MeshStandardMaterial({
                color: palette.color,
                emissive: palette.emissive,
                emissiveIntensity: 0.15,
                roughness: 0.6,
                metalness: 0.05,
            });
            const obs = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), obsMat);
            obs.position.set(x, h / 2, z);
            obs.castShadow = true;
            obs.receiveShadow = true;
            this.mesh.add(obs);
            this.addBoxCollider(x, 0, z, w, h, d);

            // Soft top highlight
            if (h > 2) {
                const topGeo = new THREE.PlaneGeometry(w - 0.1, d - 0.1);
                const topMat = new THREE.MeshBasicMaterial({
                    color: 0xffffff,
                    transparent: true,
                    opacity: 0.08,
                });
                const topFace = new THREE.Mesh(topGeo, topMat);
                topFace.rotation.x = -Math.PI / 2;
                topFace.position.set(x, h + 0.01, z);
                this.mesh.add(topFace);
            }
        };

        // Hand-placed central cover
        buildObstacle(4, 3, 4, 10, 10);
        buildObstacle(8, 2, 4, -15, 20);
        buildObstacle(2, 6, 2, 20, -15);
        buildObstacle(10, 4, 10, -20, -20);

        // Parkour-friendly mid-height platforms
        buildObstacle(6, 1.5, 6, 0, 20);
        buildObstacle(5, 2.5, 3, -25, 5);
        buildObstacle(3, 2, 5, 30, -5);

        // Procedurally scattered blocks
        for (let i = 0; i < 15; i++) {
            const x = (Math.random() - 0.5) * 60;
            const z = (Math.random() - 0.5) * 60;
            const w = 2 + Math.random() * 4;
            const h = 1 + Math.random() * 5;
            const d = 2 + Math.random() * 4;
            buildObstacle(w, h, d, x, z);
        }
    }
}
