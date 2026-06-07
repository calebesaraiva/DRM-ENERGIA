import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const box = (width, height, depth, color) => new THREE.Mesh(
  new THREE.BoxGeometry(width, height, depth),
  new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.08 }),
);

function SolarEducationScene() {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#101827');
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 8.5, 16);
    camera.lookAt(0, 1, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight('#d9efff', '#253b32', 2.2));
    const light = new THREE.DirectionalLight('#fff1bf', 3.2);
    light.position.set(-6, 10, 6);
    scene.add(light);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(28, 16),
      new THREE.MeshStandardMaterial({ color: '#315f49', roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    const house = new THREE.Group();
    const houseBody = box(5.2, 3, 4.1, '#fff8e8');
    houseBody.position.y = 1.5;
    house.add(houseBody);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(3.8, 1.8, 4),
      new THREE.MeshStandardMaterial({ color: '#273449', roughness: 0.7 }),
    );
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 3.75;
    house.add(roof);
    const panelMaterial = new THREE.MeshStandardMaterial({ color: '#1677b8', roughness: 0.25, metalness: 0.62 });
    for (let x = -1.5; x <= 1.5; x += 0.78) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.07, 1.05), panelMaterial);
      panel.position.set(x, 4.48, -0.42);
      panel.rotation.x = -0.48;
      house.add(panel);
    }
    house.position.set(0, 0, -1);
    scene.add(house);

    const inverter = box(1.25, 1.8, 0.5, '#f8fafc');
    inverter.position.set(3.35, 1.8, 1.5);
    scene.add(inverter);
    const inverterLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 12, 12),
      new THREE.MeshBasicMaterial({ color: '#4ade80' }),
    );
    inverterLight.position.set(3.35, 2.05, 1.77);
    scene.add(inverterLight);

    const grid = new THREE.Group();
    for (const x of [-1.25, 1.25]) {
      const tower = box(0.18, 5.8, 0.18, '#aeb9c8');
      tower.position.set(x, 2.9, 0);
      grid.add(tower);
    }
    const cross = box(3.2, 0.18, 0.18, '#aeb9c8');
    cross.position.y = 4.6;
    grid.add(cross);
    grid.position.set(9.4, 0, -1);
    scene.add(grid);

    const batteryMeter = new THREE.Group();
    const meterBody = box(1.45, 2, 0.55, '#f8fafc');
    batteryMeter.add(meterBody);
    const meterFace = box(0.9, 0.62, 0.08, '#b8e3f7');
    meterFace.position.set(0, 0.35, 0.31);
    batteryMeter.add(meterFace);
    batteryMeter.position.set(6, 1.35, -0.2);
    scene.add(batteryMeter);

    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 24, 24),
      new THREE.MeshBasicMaterial({ color: '#ffb21c' }),
    );
    sun.position.set(-7.4, 7, -3);
    scene.add(sun);

    const flows = [
      { from: [-6.8, 6.5, -2.7], to: [-1, 4.5, -1.2], color: '#ffcf4a' },
      { from: [1.2, 4.2, -0.5], to: [3.3, 2.2, 1.4], color: '#f97316' },
      { from: [3.5, 1.9, 1.3], to: [0.5, 1.6, 1], color: '#4ade80' },
      { from: [3.6, 1.9, 1.2], to: [6, 1.7, -0.1], color: '#60a5fa' },
      { from: [6.4, 1.6, -0.2], to: [9.3, 3.8, -1], color: '#a78bfa' },
    ];
    const dots = [];
    flows.forEach((flow, flowIndex) => {
      for (let index = 0; index < 5; index += 1) {
        const dot = new THREE.Mesh(
          new THREE.SphereGeometry(0.1, 10, 10),
          new THREE.MeshBasicMaterial({ color: flow.color }),
        );
        dot.userData = { ...flow, offset: index / 5, flowIndex };
        dots.push(dot);
        scene.add(dot);
      }
    });

    const resize = () => {
      const width = Math.max(mount.clientWidth, 280);
      const height = Math.max(mount.clientHeight, 300);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.position.z = width < 650 ? 24 : 16;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    const clock = new THREE.Clock();
    let frame;
    const animate = () => {
      const elapsed = clock.getElapsedTime();
      dots.forEach(dot => {
        const progress = (elapsed * 0.34 + dot.userData.offset) % 1;
        const [fx, fy, fz] = dot.userData.from;
        const [tx, ty, tz] = dot.userData.to;
        dot.position.set(
          fx + (tx - fx) * progress,
          fy + (ty - fy) * progress + Math.sin(progress * Math.PI) * 0.35,
          fz + (tz - fz) * progress,
        );
      });
      sun.scale.setScalar(1 + Math.sin(elapsed * 2) * 0.04);
      inverterLight.material.color.set(elapsed % 2 > 0.28 ? '#4ade80' : '#f8fafc');
      camera.position.x = Math.sin(elapsed * 0.22) * 0.35;
      camera.lookAt(0.8, 1.5, 0);
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.dispose();
      scene.traverse(object => {
        object.geometry?.dispose();
        if (Array.isArray(object.material)) object.material.forEach(material => material.dispose());
        else object.material?.dispose();
      });
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <section className="education-3d-scene">
      <div className="education-3d-copy">
        <span>Energia em movimento</span>
        <h3>Veja o sistema trabalhando em tempo real.</h3>
        <p>Da luz nos módulos ao consumo instantâneo da casa, passando pelo inversor, medidor e rede da distribuidora.</p>
      </div>
      <div className="education-3d-canvas" ref={mountRef}></div>
      <div className="education-3d-legend" aria-hidden="true">
        <span>Luz solar</span><span>Conversão</span><span>Consumo</span><span>Créditos</span>
      </div>
    </section>
  );
}

export default SolarEducationScene;
