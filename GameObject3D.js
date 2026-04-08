import * as THREE from 'three';

export default class GameObject3D {
    constructor(scene) {
        this.scene = scene;
        this.mesh = new THREE.Group();
        this.scene.add(this.mesh);
        this.colliders = []; // Array to hold collision data
    }

    // Helper to create basic AABB colliders
    addBoxCollider(x, y, z, width, height, depth) {
        const halfW = width / 2;
        const halfD = depth / 2;
        this.colliders.push({
            type: 'box',
            min: new THREE.Vector3(x - halfW, y, z - halfD),
            max: new THREE.Vector3(x + halfW, y + height, z + halfD),
            top: y + height
        });
    }

    update(dt) {
        // Override in child classes
    }

    destroy() {
        this.scene.remove(this.mesh);
    }
}
