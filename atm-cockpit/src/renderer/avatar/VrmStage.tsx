import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import type { VisemeEvent } from "../providers/tts";

// VrmStage — the avatar (ADR D4). Stylized VRM, one renderer/scene/loop, viseme
// blend on the audio clock, idle blink + gaze. Place a model at /public/avatar.vrm.
// If absent, renders a stylized placeholder head so the app still runs.
const EMOTION_KEYS = ["happy", "angry", "sad", "relaxed", "surprised"]; // neutral = rest

export function VrmStage({ visemes, state, affect }: { visemes: VisemeEvent[]; state: string; affect?: any }) {
  const mount = useRef<HTMLDivElement>(null);
  const visemeRef = useRef<{ events: VisemeEvent[]; start: number }>({ events: [], start: 0 });
  const affectRef = useRef<any>(affect || null);

  useEffect(() => { visemeRef.current = { events: visemes || [], start: performance.now() }; }, [visemes]);
  useEffect(() => { affectRef.current = affect || null; }, [affect]);

  useEffect(() => {
    const el = mount.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = (THREE as any).NeutralToneMapping ?? THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    camera.position.set(0, 1.35, 1.6);
    scene.add(new THREE.AmbientLight(0xffffff, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(1, 2, 1.5); scene.add(key);

    let vrm: any = null;
    let placeholder: THREE.Mesh | null = null;
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    loader.load(
      "./avatar.vrm",
      (gltf) => {
        vrm = gltf.userData.vrm;
        VRMUtils.removeUnnecessaryJoints(gltf.scene);
        scene.add(gltf.scene);
        vrm.scene.rotation.y = Math.PI; // face camera
      },
      undefined,
      () => {
        // no model present -> stylized placeholder so the stage still renders
        placeholder = new THREE.Mesh(
          new THREE.SphereGeometry(0.18, 32, 32),
          new THREE.MeshStandardMaterial({ color: 0x5b8cff, roughness: 0.5 }),
        );
        placeholder.position.set(0, 1.35, 0);
        scene.add(placeholder);
      },
    );

    function resize() {
      const r = el.getBoundingClientRect();
      renderer.setSize(r.width, r.height, false);
      camera.aspect = r.width / Math.max(1, r.height);
      camera.updateProjectionMatrix();
    }
    resize();
    const ro = new ResizeObserver(resize); ro.observe(el);

    let raf = 0; const clock = new THREE.Clock(); let nextBlink = 1 + Math.random() * 3;
    const applied: Record<string, number> = { happy: 0, angry: 0, sad: 0, relaxed: 0, surprised: 0 };
    function tick() {
      const dt = clock.getDelta();
      const t = clock.elapsedTime;

      if (vrm) {
        const em = vrm.expressionManager;
        // visemes on the audio clock
        const { events, start } = visemeRef.current;
        const ms = performance.now() - start;
        for (const id of ["aa", "ih", "ou", "ee", "oh"]) em?.setValue(id, 0);
        if (state === "speaking") {
          for (const ev of events) {
            if (ms >= ev.startMs && ms <= ev.startMs + ev.durMs) em?.setValue(ev.target.id, ev.weight);
          }
        }
        // emotion (affect): ease applied weights toward the target each frame so the
        // demeanor shift is FLUID, never a snap. Mouth visemes win while speaking.
        const tgt = affectRef.current?.expressions || {};
        const speaking = state === "speaking";
        for (const k of EMOTION_KEYS) {
          const want = (tgt[k] || 0) * (speaking && k === "happy" ? 0.5 : 1); // don't fight lipsync
          applied[k] += (want - applied[k]) * Math.min(1, dt * 4);
          em?.setValue(k, applied[k]);
        }
        // blink
        nextBlink -= dt;
        if (nextBlink < 0) { em?.setValue("blink", 1); if (nextBlink < -0.12) nextBlink = 2 + Math.random() * 3; }
        else em?.setValue("blink", 0);
        // idle breathing — a touch more alive when aroused/energetic
        const energy = affectRef.current?.energy ?? 0.35;
        vrm.scene.position.y = Math.sin(t * (1.2 + energy)) * (0.003 + energy * 0.004);
        vrm.lookAt && (vrm.lookAt.target = camera);
        em?.update();
        vrm.update(dt);
      } else if (placeholder) {
        const { events, start } = visemeRef.current;
        const ms = performance.now() - start;
        const open = state === "speaking" && events.some((e) => ms >= e.startMs && ms <= e.startMs + e.durMs);
        placeholder.scale.y = open ? 1.15 : 1; placeholder.position.y = 1.35 + Math.sin(t * 1.4) * 0.01;
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    }
    tick();

    return () => { cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); el.removeChild(renderer.domElement); };
  }, []);

  return <div ref={mount} style={{ width: "100%", height: "100%" }} />;
}
