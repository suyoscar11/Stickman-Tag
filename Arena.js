import * as THREE from 'three';
import GameObject3D from './GameObject3D.js';

export default class Arena extends GameObject3D {
    constructor(scene, chapterIndex = 0) {
        super(scene);
        this.chapterIndex = chapterIndex;

        // Build the base floor + walls, then chapter-specific decorations
        const builders = [
            () => this.buildPark(),
            () => this.buildStreets(),
            () => this.buildFactory(),
            () => this.buildRooftops(),
        ];

        (builders[chapterIndex] || builders[0])();
        this.buildBoundaryWalls();
    }

    // ---- SHARED HELPERS ----
    addFloor(color, roughness = 0.9) {
        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(80, 80),
            new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        this.mesh.add(floor);
    }

    addGrid(color1, color2, opacity = 0.3) {
        const g = new THREE.GridHelper(80, 40, color1, color2);
        g.material.opacity = opacity;
        g.material.transparent = true;
        g.position.y = 0.01;
        this.mesh.add(g);
    }

    buildBoundaryWalls() {
        const wallMat = new THREE.MeshStandardMaterial({
            color: 0x88bbee, transparent: true, opacity: 0.12,
            emissive: 0x4488cc, emissiveIntensity: 0.05, roughness: 0.3,
        });
        const bw = (w, h, d, x, y, z) => {
            this.mesh.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat).translateX(x).translateY(y).translateZ(z));
            this.addBoxCollider(x, 0, z, w, h, d);
        };
        // Taller walls (40 units) and pulled inward to align with the hard clamp at +/-39
        bw(80, 40, 4, 0, 20, -42);
        bw(80, 40, 4, 0, 20, 42);
        bw(4, 40, 80, -42, 20, 0);
        bw(4, 40, 80, 42, 20, 0);
    }

    addBox(w, h, d, x, z, mat) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x, h / 2, z);
        m.castShadow = true; m.receiveShadow = true;
        this.mesh.add(m);
        this.addBoxCollider(x, 0, z, w, h, d);
        return m;
    }

    addCylinder(r, h, x, z, mat, segments = 12) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segments), mat);
        m.position.set(x, h / 2, z);
        m.castShadow = true; m.receiveShadow = true;
        this.mesh.add(m);
        this.addBoxCollider(x, 0, z, r * 2, h, r * 2);
        return m;
    }

    // Simple low-poly tree
    addTree(x, z, trunkColor = 0x8B4513, leafColor = 0x228B22, scale = 1) {
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.2 * scale, 0.3 * scale, 2.5 * scale, 6),
            new THREE.MeshStandardMaterial({ color: trunkColor, roughness: 0.9 })
        );
        trunk.position.set(x, 1.25 * scale, z);
        trunk.castShadow = true;
        this.mesh.add(trunk);

        const leaves = new THREE.Mesh(
            new THREE.SphereGeometry(1.5 * scale, 8, 6),
            new THREE.MeshStandardMaterial({ color: leafColor, roughness: 0.8, emissive: leafColor, emissiveIntensity: 0.05 })
        );
        leaves.position.set(x, 3.5 * scale, z);
        leaves.castShadow = true;
        this.mesh.add(leaves);

        this.addBoxCollider(x, 0, z, 0.6 * scale, 2.5 * scale, 0.6 * scale);
    }

    // ================================================================
    // CHAPTER 1: THE PARK
    // ================================================================
    buildPark() {
        this.addFloor(0x6abf4b);
        this.addGrid(0x80d468, 0x5ea83e, 0.2);

        const benchMat = new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.8 });
        const pathMat = new THREE.MeshStandardMaterial({ color: 0xd4c5a9, roughness: 0.95 });
        const rockMat = new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.9 });
        const fenceMat = new THREE.MeshStandardMaterial({ color: 0xdeb887, roughness: 0.7 });

        // Winding path across the park
        const pathPositions = [
            { x: -30, z: 0 }, { x: -15, z: 5 }, { x: 0, z: 0 }, { x: 15, z: -5 }, { x: 30, z: 0 },
        ];
        pathPositions.forEach(p => {
            const path = new THREE.Mesh(
                new THREE.PlaneGeometry(12, 4),
                pathMat
            );
            path.rotation.x = -Math.PI / 2;
            path.position.set(p.x, 0.02, p.z);
            path.rotation.z = Math.random() * 0.3;
            path.receiveShadow = true;
            this.mesh.add(path);
        });

        // Trees scattered around
        const treePositions = [
            [-25, -15], [-18, 25], [-30, -30], [-8, -25], [5, 30],
            [20, 20], [28, -20], [35, 10], [-35, 12], [12, -30],
            [-20, 0], [0, 15], [25, -8], [-10, 10], [30, 30],
        ];
        treePositions.forEach(([x, z]) => {
            this.addTree(x, z, 0x8B4513, 0x228B22, 0.8 + Math.random() * 0.5);
        });

        // Park benches (small box obstacles)
        const benchPositions = [[-12, 8], [10, -12], [-25, 20], [20, 25]];
        benchPositions.forEach(([x, z]) => {
            this.addBox(2.5, 0.8, 0.8, x, z, benchMat);
        });

        // Rocks
        const rockPositions = [[5, -20], [-15, -10], [25, 5], [-5, 25]];
        rockPositions.forEach(([x, z]) => {
            const s = 1 + Math.random() * 2;
            const rock = new THREE.Mesh(
                new THREE.DodecahedronGeometry(s, 0),
                rockMat
            );
            rock.position.set(x, s * 0.5, z);
            rock.rotation.set(Math.random(), Math.random(), Math.random());
            rock.castShadow = true;
            this.mesh.add(rock);
            this.addBoxCollider(x, 0, z, s * 1.5, s, s * 1.5);
        });

        // Wooden fence sections
        const fencePositions = [
            { x: -20, z: -20, len: 10, rot: 0 },
            { x: 15, z: 15, len: 8, rot: Math.PI / 4 },
        ];
        fencePositions.forEach(f => {
            for (let i = 0; i < f.len; i += 1.5) {
                const post = new THREE.Mesh(
                    new THREE.BoxGeometry(0.2, 1.5, 0.2),
                    fenceMat
                );
                const ox = f.x + Math.cos(f.rot) * i;
                const oz = f.z + Math.sin(f.rot) * i;
                post.position.set(ox, 0.75, oz);
                post.castShadow = true;
                this.mesh.add(post);
            }
            this.addBoxCollider(
                f.x + Math.cos(f.rot) * f.len / 2,
                0,
                f.z + Math.sin(f.rot) * f.len / 2,
                Math.abs(Math.cos(f.rot)) * f.len + 0.3,
                1.5,
                Math.abs(Math.sin(f.rot)) * f.len + 0.3
            );
        });

        // Low flower bushes (non-collidable decoration)
        for (let i = 0; i < 12; i++) {
            const bush = new THREE.Mesh(
                new THREE.SphereGeometry(0.6 + Math.random() * 0.4, 6, 5),
                new THREE.MeshStandardMaterial({
                    color: [0x2ecc71, 0x27ae60, 0x1abc9c][Math.floor(Math.random() * 3)],
                    roughness: 0.9,
                })
            );
            bush.position.set((Math.random() - 0.5) * 60, 0.4, (Math.random() - 0.5) * 60);
            this.mesh.add(bush);
        }

        // Playground platforms
        const playMat = new THREE.MeshStandardMaterial({ color: 0xff6b6b, roughness: 0.5 });
        this.addBox(4, 2, 4, 0, 0, playMat);
        this.addBox(3, 3, 3, -8, -5, new THREE.MeshStandardMaterial({ color: 0x339af0, roughness: 0.5 }));
        this.addBox(5, 1.5, 5, 10, 10, new THREE.MeshStandardMaterial({ color: 0xfcc419, roughness: 0.5 }));
    }

    // ================================================================
    // CHAPTER 2: THE STREETS
    // ================================================================
    buildStreets() {
        // Asphalt floor
        this.addFloor(0x555555);
        this.addGrid(0x666666, 0x4a4a4a, 0.15);

        const bldgColors = [0x95a5a6, 0x7f8c8d, 0xbdc3c7, 0xa0aab0, 0x8395a7];
        const roadMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.95 });
        const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.85 });
        const carMat1 = new THREE.MeshStandardMaterial({ color: 0xe74c3c, roughness: 0.4, metalness: 0.3 });
        const carMat2 = new THREE.MeshStandardMaterial({ color: 0x3498db, roughness: 0.4, metalness: 0.3 });

        // Road markings (flat planes)
        for (let i = -35; i <= 35; i += 5) {
            const stripe = new THREE.Mesh(
                new THREE.PlaneGeometry(2, 0.3),
                new THREE.MeshBasicMaterial({ color: 0xf1c40f })
            );
            stripe.rotation.x = -Math.PI / 2;
            stripe.position.set(i, 0.02, 0);
            this.mesh.add(stripe);
        }

        // Sidewalks
        const swPositions = [
            { x: 0, z: -8, w: 80, d: 3 },
            { x: 0, z: 8, w: 80, d: 3 },
        ];
        swPositions.forEach(s => {
            const sw = new THREE.Mesh(new THREE.BoxGeometry(s.w, 0.3, s.d), sidewalkMat);
            sw.position.set(s.x, 0.15, s.z);
            sw.receiveShadow = true;
            this.mesh.add(sw);
        });

        // Buildings along the edges (tall, can't enter — just visual backdrop + collider)
        const buildingData = [
            // Back row
            { x: -30, z: -30, w: 10, h: 15, d: 8 },
            { x: -15, z: -30, w: 8, h: 20, d: 8 },
            { x: 0, z: -32, w: 12, h: 12, d: 6 },
            { x: 15, z: -30, w: 8, h: 18, d: 8 },
            { x: 30, z: -30, w: 10, h: 14, d: 8 },
            // Front row
            { x: -30, z: 30, w: 10, h: 16, d: 8 },
            { x: -12, z: 32, w: 12, h: 22, d: 6 },
            { x: 8, z: 30, w: 8, h: 13, d: 8 },
            { x: 25, z: 32, w: 14, h: 18, d: 6 },
            // Side buildings
            { x: -35, z: 0, w: 6, h: 10, d: 12 },
            { x: -35, z: 18, w: 6, h: 14, d: 10 },
            { x: 35, z: -10, w: 6, h: 16, d: 10 },
            { x: 35, z: 15, w: 6, h: 12, d: 12 },
        ];

        buildingData.forEach(b => {
            const color = bldgColors[Math.floor(Math.random() * bldgColors.length)];
            const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.1 });
            this.addBox(b.w, b.h, b.d, b.x, b.z, mat);

            // Windows (dark stripes)
            const windowMat = new THREE.MeshBasicMaterial({ color: 0x2c3e50, transparent: true, opacity: 0.4 });
            for (let y = 2; y < b.h - 1; y += 2.5) {
                const win = new THREE.Mesh(new THREE.PlaneGeometry(b.w * 0.8, 0.8), windowMat);
                win.position.set(b.x, y, b.z + b.d / 2 + 0.01);
                this.mesh.add(win);
            }
        });

        // Street trees
        [[-20, -12], [-5, 12], [10, -12], [25, 12], [-30, 12]].forEach(([x, z]) => {
            this.addTree(x, z, 0x5d4037, 0x4caf50, 0.7);
        });

        // Parked cars (box obstacles)
        this.addBox(4, 1.5, 2, -10, -3, carMat1);
        this.addBox(4, 1.5, 2, 12, 3, carMat2);
        this.addBox(4, 1.5, 2, -22, 3, carMat1);

        // Dumpsters
        const dumpMat = new THREE.MeshStandardMaterial({ color: 0x2d6a4f, roughness: 0.8 });
        this.addBox(2, 1.8, 1.5, 5, -15, dumpMat);
        this.addBox(2, 1.8, 1.5, -18, 15, dumpMat);

        // Fire hydrants
        const hydrantMat = new THREE.MeshStandardMaterial({ color: 0xe74c3c, roughness: 0.5 });
        [[-8, -12], [15, 12], [-25, 8]].forEach(([x, z]) => {
            this.addCylinder(0.3, 1.0, x, z, hydrantMat, 8);
        });

        // Street lamps (thin poles — mostly decorative)
        const lampMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.5, metalness: 0.5 });
        [[-15, -8], [0, 8], [15, -8], [30, 8]].forEach(([x, z]) => {
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 6, 6), lampMat);
            pole.position.set(x, 3, z);
            this.mesh.add(pole);
            // Lamp head
            const lamp = new THREE.Mesh(
                new THREE.SphereGeometry(0.3, 6, 6),
                new THREE.MeshBasicMaterial({ color: 0xffeaa7 })
            );
            lamp.position.set(x, 6.2, z);
            this.mesh.add(lamp);
        });

        // Crate obstacles in alleys
        const crateMat = new THREE.MeshStandardMaterial({ color: 0xd4a574, roughness: 0.8 });
        this.addBox(2, 2, 2, 20, -18, crateMat);
        this.addBox(1.5, 1.5, 1.5, 21, -16, crateMat);
        this.addBox(2, 3, 2, -5, 20, crateMat);
    }

    // ================================================================
    // CHAPTER 3: THE FACTORY
    // ================================================================
    buildFactory() {
        // Concrete floor
        this.addFloor(0x666666, 0.95);
        this.addGrid(0x777777, 0x555555, 0.12);

        const metalMat = new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.4, metalness: 0.6 });
        const rustMat = new THREE.MeshStandardMaterial({ color: 0xb87333, roughness: 0.7, metalness: 0.3 });
        const hazardMat = new THREE.MeshStandardMaterial({ color: 0xf1c40f, roughness: 0.5 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.6, metalness: 0.4 });
        const pipeMat = new THREE.MeshStandardMaterial({ color: 0xff922b, roughness: 0.4, metalness: 0.3 });

        // Hazard stripes on floor
        for (let i = -35; i <= 35; i += 15) {
            const stripe = new THREE.Mesh(
                new THREE.PlaneGeometry(6, 0.5),
                new THREE.MeshBasicMaterial({ color: 0xf39c12, transparent: true, opacity: 0.4 })
            );
            stripe.rotation.x = -Math.PI / 2;
            stripe.position.set(i, 0.015, 0);
            this.mesh.add(stripe);
        }

        // Large machinery blocks
        this.addBox(8, 6, 6, -20, -20, darkMat);
        this.addBox(6, 8, 4, 20, -15, darkMat);
        this.addBox(10, 4, 8, 0, 20, metalMat);

        // Pipes (horizontal)
        const pipePositions = [
            { x: 0, z: -10, len: 14, h: 2.5 },
            { x: -15, z: 10, len: 10, h: 1.0 },
            { x: 20, z: 5, len: 8, h: 3.5 },
            { x: -25, z: -5, len: 12, h: 0.8 },
        ];
        pipePositions.forEach(p => {
            const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, p.len, 10), pipeMat);
            pipe.rotation.z = Math.PI / 2;
            pipe.position.set(p.x, p.h + 0.5, p.z);
            pipe.castShadow = true;
            this.mesh.add(pipe);

            // Supports
            const supGeo = new THREE.CylinderGeometry(0.12, 0.15, p.h + 0.5, 6);
            [-p.len / 2, p.len / 2].forEach(offset => {
                const sup = new THREE.Mesh(supGeo, metalMat);
                sup.position.set(p.x + offset, (p.h + 0.5) / 2, p.z);
                this.mesh.add(sup);
            });

            this.addBoxCollider(p.x, p.h, p.z, p.len, 1, 1);
            this.addBoxCollider(p.x - p.len / 2, 0, p.z, 0.4, p.h + 1, 0.4);
            this.addBoxCollider(p.x + p.len / 2, 0, p.z, 0.4, p.h + 1, 0.4);
        });

        // Vertical pipes/pillars
        [[-30, 15], [-10, -25], [15, 25], [30, -25], [0, -30]].forEach(([x, z]) => {
            this.addCylinder(0.4, 7, x, z, rustMat, 8);
        });

        // Conveyor belts (flat raised platforms)
        this.addBox(16, 1, 3, -5, -5, metalMat);
        this.addBox(12, 1, 3, 10, 12, metalMat);

        // Crates and barrels
        const crateMat = new THREE.MeshStandardMaterial({ color: 0xd4a574, roughness: 0.8 });
        const barrelMat = new THREE.MeshStandardMaterial({ color: 0x2ecc71, roughness: 0.5 });
        [[-8, 18], [25, 0], [-30, -10], [5, 30], [15, -25]].forEach(([x, z]) => {
            if (Math.random() > 0.5) {
                this.addBox(2, 2, 2, x, z, crateMat);
            } else {
                this.addCylinder(0.7, 1.8, x, z, barrelMat, 10);
            }
        });

        // Hazard barriers
        [[-15, -15], [10, -20], [25, 20]].forEach(([x, z]) => {
            this.addBox(4, 1.2, 0.3, x, z, hazardMat);
        });

        // Catwalks (elevated narrow paths)
        const catwalkMat = new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.5, metalness: 0.5 });
        this.addBox(20, 0.2, 2, 0, 0, catwalkMat);
        // Raise it
        const catwalk = this.mesh.children[this.mesh.children.length - 1];
        catwalk.position.y = 3;
        // Re-add collider at correct height
        this.colliders.pop();
        this.addBoxCollider(0, 2.9, 0, 20, 0.2, 2);

        // Support legs for catwalk
        [-9, -3, 3, 9].forEach(x => {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3, 0.3), metalMat);
            leg.position.set(x, 1.5, 0);
            this.mesh.add(leg);
        });
    }

    // ================================================================
    // CHAPTER 4: THE ROOFTOPS
    // ================================================================
    buildRooftops() {
        // Concrete rooftop floor
        this.addFloor(0x7f8c8d, 0.85);
        this.addGrid(0x95a5a6, 0x6c7a7d, 0.1);

        const concreteMat = new THREE.MeshStandardMaterial({ color: 0x95a5a6, roughness: 0.8 });
        const ventMat = new THREE.MeshStandardMaterial({ color: 0xbdc3c7, roughness: 0.4, metalness: 0.5 });
        const acMat = new THREE.MeshStandardMaterial({ color: 0xdfe6e9, roughness: 0.5, metalness: 0.3 });
        const antennaMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.3, metalness: 0.7 });
        const ledgeMat = new THREE.MeshStandardMaterial({ color: 0x636e72, roughness: 0.7 });
        const neonMat = new THREE.MeshStandardMaterial({ color: 0xff6b6b, emissive: 0xff6b6b, emissiveIntensity: 0.5 });

        // Rooftop edges / ledges
        this.addBox(80, 0.8, 1.5, 0, -39, ledgeMat);
        this.addBox(80, 0.8, 1.5, 0, 39, ledgeMat);
        this.addBox(1.5, 0.8, 80, -39, 0, ledgeMat);
        this.addBox(1.5, 0.8, 80, 39, 0, ledgeMat);

        // Skyline buildings in background (beyond walls, visible but not reachable)
        const skyBldgMat = new THREE.MeshStandardMaterial({ color: 0x2d3436, roughness: 0.6 });
        const skyBldgLitMat = new THREE.MeshStandardMaterial({ color: 0x353b48, roughness: 0.6 });
        const skylineData = [
            { x: -50, z: -55, w: 12, h: 30, d: 10 },
            { x: -30, z: -55, w: 8, h: 45, d: 8 },
            { x: -10, z: -58, w: 14, h: 35, d: 6 },
            { x: 10, z: -55, w: 10, h: 50, d: 10 },
            { x: 30, z: -55, w: 12, h: 25, d: 8 },
            { x: 50, z: -55, w: 8, h: 40, d: 10 },
            { x: -50, z: 55, w: 10, h: 35, d: 10 },
            { x: -25, z: 58, w: 14, h: 42, d: 6 },
            { x: 5, z: 55, w: 8, h: 28, d: 10 },
            { x: 25, z: 55, w: 12, h: 38, d: 8 },
            { x: 48, z: 55, w: 10, h: 48, d: 10 },
        ];
        skylineData.forEach(b => {
            const mat = Math.random() > 0.5 ? skyBldgMat : skyBldgLitMat;
            const bldg = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mat);
            bldg.position.set(b.x, b.h / 2 - 5, b.z); // offset down so they peek above
            this.mesh.add(bldg);

            // Lit windows
            const winMat = new THREE.MeshBasicMaterial({ color: 0xffeaa7, transparent: true, opacity: 0.3 });
            for (let y = 0; y < b.h - 2; y += 3) {
                for (let wx = -b.w / 2 + 1.5; wx < b.w / 2 - 1; wx += 2.5) {
                    if (Math.random() > 0.4) {
                        const win = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.5), winMat);
                        const side = b.z < 0 ? b.d / 2 + 0.01 : -b.d / 2 - 0.01;
                        win.position.set(b.x + wx, b.h / 2 - 5 + y - b.h / 2 + 2, b.z + side);
                        this.mesh.add(win);
                    }
                }
            }
        });

        // AC units on rooftop
        [[-15, -10], [10, -15], [-20, 20], [25, 10], [0, 25], [-30, 5], [15, -25]].forEach(([x, z]) => {
            const w = 2 + Math.random() * 2;
            const h = 1.5 + Math.random() * 1.5;
            this.addBox(w, h, w, x, z, acMat);

            // Fan on top
            const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 8), ventMat);
            fan.position.set(x, h + 0.05, z);
            this.mesh.add(fan);
        });

        // Antennas
        [[-25, -25], [20, 25], [0, -20], [30, -15]].forEach(([x, z]) => {
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 8, 6), antennaMat);
            pole.position.set(x, 4, z);
            pole.castShadow = true;
            this.mesh.add(pole);

            // Red light on top
            const light = new THREE.Mesh(
                new THREE.SphereGeometry(0.15, 6, 6),
                neonMat
            );
            light.position.set(x, 8.2, z);
            this.mesh.add(light);
        });

        // Water tanks
        const tankMat = new THREE.MeshStandardMaterial({ color: 0x636e72, roughness: 0.6, metalness: 0.3 });
        [[-10, 15], [25, -5]].forEach(([x, z]) => {
            // Cylindrical tank on legs
            this.addCylinder(2, 3, x, z, tankMat, 10);
        });

        // Vents
        [[-5, -30], [15, 30], [-30, -15], [30, 25]].forEach(([x, z]) => {
            const vent = new THREE.Mesh(
                new THREE.BoxGeometry(1.5, 2, 1.5),
                ventMat
            );
            vent.position.set(x, 1, z);
            vent.castShadow = true;
            this.mesh.add(vent);
            this.addBoxCollider(x, 0, z, 1.5, 2, 1.5);
        });

        // Rooftop level changes (raised platforms like different building heights)
        this.addBox(15, 2, 15, -15, -5, concreteMat);
        this.addBox(12, 3, 10, 18, 18, concreteMat);
        this.addBox(8, 1.5, 12, 5, -20, concreteMat);

        // Neon sign
        const signMat = new THREE.MeshStandardMaterial({
            color: 0x00b894, emissive: 0x00b894, emissiveIntensity: 0.8
        });
        const sign = new THREE.Mesh(new THREE.BoxGeometry(6, 2, 0.2), signMat);
        sign.position.set(0, 5, -38);
        this.mesh.add(sign);

        // Pipes along edges
        [[-38, 0], [38, 0]].forEach(([x, z]) => {
            const pipe = new THREE.Mesh(
                new THREE.CylinderGeometry(0.3, 0.3, 60, 8),
                new THREE.MeshStandardMaterial({ color: 0xff922b, roughness: 0.4, metalness: 0.3 })
            );
            pipe.position.set(x, 0.3, z);
            pipe.rotation.x = Math.PI / 2;
            this.mesh.add(pipe);
        });
    }
}
