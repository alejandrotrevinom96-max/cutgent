import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin } from "@pixiv/three-vrm";
import ThreeForceGraph from "three-forcegraph";
import type { VisemeEvent } from "../providers";

// SharedScene — EXPERIMENTAL (ADR D4): the avatar AND the force-directed knowledge
// graph in ONE WebGLRenderer / one scene / one rAF loop, so the graph is the
// avatar's literal "mind space". This is the 3D fusion; the default UI uses the
// robust VrmStage + 2D GraphView instead. Verify framerate on your GPU before
// adopting (the ADR's biggest empirical unknown). Single pinned `three` instance
// is required — three-forcegraph here uses the same THREE we import (BYO three).
export function SharedScene({ graph, visemes, state }: { graph: any; visemes: VisemeEvent[]; state: string }) {
  const mount = useRef<HTMLDivElement>(null);
  const visRef = useRef<{ events: VisemeEvent[]; start: number }>({ events: [], start: 0 });
  useEffect(() => { visRef.current = { events: visemes || [], start: performance.now() }; }, [visemes]);

  useEffect(() => {
    const el = mount.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = (THREE as any).NeutralToneMapping ?? THREE.ACESFilmicToneMapping;
    renderer.autoClear = false;
    el.appendChild(renderer.domElement);

    // two scenes, shared renderer, clearDepth between passes (graph behind, avatar front)
    const graphScene = new THREE.Scene();
    graphScene.fog = new THREE.Fog(0x0b0d12, 6, 22);
    const avatarScene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 1.35, 2.0);
    for (const sc of [graphScene, avatarScene]) sc.add(new THREE.AmbientLight(0xffffff, 1.0));
    const key = new THREE.DirectionalLight(0xffffff, 1.3); key.position.set(1, 2, 1.5); avatarScene.add(key);

    // graph "mind space" behind the avatar
    const fg = new ThreeForceGraph()
      .graphData({
        nodes: (graph?.nodes ?? []).map((n: any) => ({ id: n.id, name: n.title })),
        links: (graph?.edges ?? []).map((e: any) => ({ source: e.src, target: e.dst })),
      })
      .nodeRelSize(2)
      .nodeOpacity(0.8)
      .linkOpacity(0.25);
    (fg as unknown as THREE.Object3D).position.set(0, 1.4, -4);
    (fg as unknown as THREE.Object3D).scale.setScalar(0.02);
    graphScene.add(fg as unknown as THREE.Object3D);

    // avatar (VRM) in front; placeholder if absent
    let vrm: any = null, placeholder: THREE.Mesh | null = null;
    const loader = new GLTFLoader();
    loader.register((p) => new VRMLoaderPlugin(p));
    loader.load("./avatar.vrm",
      (gltf) => { vrm = gltf.userData.vrm; avatarScene.add(gltf.scene); vrm.scene.rotation.y = Math.PI; },
      undefined,
      () => { placeholder = new THREE.Mesh(new THREE.SphereGeometry(0.18, 32, 32), new THREE.MeshStandardMaterial({ color: 0x5b8cff })); placeholder.position.set(0, 1.35, 0); avatarScene.add(placeholder); });

    function resize() {
      const r = el.getBoundingClientRect();
      renderer.setSize(r.width, r.height, false);
      camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix();
    }
    resize();
    const ro = new ResizeObserver(resize); ro.observe(el);

    let raf = 0; const clock = new THREE.Clock();
    function frame() {
      const dt = clock.getDelta();
      fg.tickFrame(); // advance graph layout (freeze in production when idle)
      if (vrm) {
        const em = vrm.expressionManager;
        for (const id of ["aa", "ih", "ou", "ee", "oh"]) em?.setValue(id, 0);
        if (state === "speaking") {
          const { events, start } = visRef.current; const ms = performance.now() - start;
          for (const ev of events) if (ms >= ev.startMs && ms <= ev.startMs + ev.durMs) em?.setValue(ev.target.id, ev.weight);
        }
        em?.update(); vrm.update(dt);
      }
      renderer.clear();
      renderer.render(graphScene, camera);  // pass 1: mind space
      renderer.clearDepth();
      renderer.render(avatarScene, camera); // pass 2: avatar in front
      raf = requestAnimationFrame(frame);
    }
    frame();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); el.removeChild(renderer.domElement); };
  }, [graph]);

  return <div ref={mount} style={{ width: "100%", height: "100%" }} />;
}
