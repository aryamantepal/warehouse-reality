"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createAmbientMotion,
  type DisplaySpeed,
} from "@/lib/scene/ambient-motion";
import { layoutBounds, MINIATURE_VIEW, TOP_VIEW } from "@/lib/scene/camera-fit";
import { exceptionOptions } from "@/lib/scene/exceptions";
import {
  CLOSED_DOOR,
  entitiesById,
  ILLUSTRATIVE_STATE,
  TARGET_DOOR,
} from "@/lib/scene/illustrative-state";
import { buildLayout, movingPair } from "@/lib/scene/layout";
import type { Placement, SceneState } from "@/lib/scene/types";
import {
  cycleId,
  DEFAULT_VIEW,
  followAfterSelect,
  followableIds,
  type ViewSettings,
} from "@/lib/scene/view-settings";
import { CameraRig } from "./camera-rig";
import { FollowRig } from "./follow-rig";
import { MiniatureLens } from "./miniature-lens";
import { PRIMITIVE_KIT } from "./model-kit";
import { type LivePoses, MotionClock, newDisplayClock } from "./motion-clock";
import { usePalette } from "./palette";
import { RouteLine } from "./route-line";
import { type MeshMode, SceneOverlay } from "./scene-overlay";
import { SelectionMarks } from "./selection-marks";
import { Fixtures, Shell } from "./site";
import { useGraphicsContext } from "./use-graphics-context";
import { useModelKit } from "./use-model-kit";
import { LANES, Vehicles } from "./vehicles";

const DEG = Math.PI / 180;
const CLICK_SLOP_PX = 5;
/** Sun from the south-west, high enough that dock faces stay lit. */
const SUN_AT = [-700, 1500, 900] as const;
const SHADOW_EXTENT = 1300;

/** What the dashboard needs to know to label its scene controls. */
export interface SceneStatus {
  meshes: MeshMode;
  /** The selection is a truck (trailer or tractor), so it can be followed. */
  canFollow: boolean;
  /** WebGL context lost: the view is paused, so its controls do nothing. */
  graphicsLost: boolean;
}

export interface FacilitySceneProps {
  /** The run state to draw; the illustrative state only when there is no run. */
  state?: SceneState;
  selectedId?: string | null;
  onSelectEntity?: (id: string | null) => void;
  view?: ViewSettings;
  /** Display pacing for the motion; 4× and 16× step at 8 Hz. */
  speed?: DisplaySpeed;
  /** The truck the camera chases, or null. */
  followId?: string | null;
  onFollow?: (id: string | null) => void;
  /** Changing this number stops following and frames the whole site again. */
  homeSignal?: number;
  onStatus?: (status: SceneStatus) => void;
}

const TRUCK_KINDS: ReadonlySet<string> = new Set(["trailer", "tractor"]);

/** Keys meant for a focused field; a select keeps letters for type-ahead but lets Escape through. */
const isTyping = (e: KeyboardEvent): boolean => {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable || t instanceof HTMLTextAreaElement) return true;
  if (t instanceof HTMLInputElement) return t.type !== "range";
  return t instanceof HTMLSelectElement && e.key !== "Escape";
};

export const FacilityScene = ({
  state = ILLUSTRATIVE_STATE,
  selectedId,
  onSelectEntity,
  view = DEFAULT_VIEW,
  speed = 1,
  followId: followProp,
  onFollow,
  homeSignal: homeProp = 0,
  onStatus,
}: FacilitySceneProps) => {
  const palette = usePalette();
  const entities = useMemo(() => entitiesById(state), [state]);
  const exceptions = useMemo(() => exceptionOptions(state), [state]);
  const layout = useMemo(
    () => buildLayout(state, movingPair(state) ?? [CLOSED_DOOR, TARGET_DOOR]),
    [state],
  );
  const bounds = useMemo(() => layoutBounds(layout.values()), [layout]);
  const motion = useMemo(
    () => createAmbientMotion(state, layout),
    [state, layout],
  );
  // Every entity's drawn pose; the motion clock rewrites the moving ones each frame.
  const live = useMemo<{ current: LivePoses }>(
    () => ({ current: new Map<string, Placement>(layout) }),
    [layout],
  );
  const poseVersion = useRef(0);
  // Outside the Canvas, so a graphics-context remount keeps every truck where it was.
  const clock = useRef(newDisplayClock());
  const [localHome, setLocalHome] = useState(0);
  const homeSignal = homeProp + localHome;
  const [internalFollow, setInternalFollow] = useState<string | null>(null);
  const followId = followProp !== undefined ? followProp : internalFollow;
  const setFollow = onFollow ?? setInternalFollow;
  const [hovered, setHovered] = useState<string | null>(null);
  const [internalSelected, setInternalSelected] = useState<string | null>(null);
  const selected = selectedId !== undefined ? selectedId : internalSelected;
  const setSelected = onSelectEntity ?? setInternalSelected;
  const modelsOn = view.models;
  const models = useModelKit(modelsOn);
  const { graphics, canvasKey, onCreated } = useGraphicsContext();

  const meshes: MeshMode = !modelsOn
    ? "off"
    : models.state === "ready"
      ? "models"
      : models.state;
  const kit = modelsOn && models.state === "ready" ? models.kit : PRIMITIVE_KIT;

  // A drag that orbits the camera must not count as a click, even if it ends near its start.
  const travel = useRef({ x: 0, y: 0, max: 0 });
  const onPointerDown = (e: ReactPointerEvent) => {
    travel.current = { x: e.clientX, y: e.clientY, max: 0 };
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (e.buttons === 0) return;
    const t = travel.current;
    travel.current = {
      ...t,
      max: Math.max(t.max, Math.hypot(e.clientX - t.x, e.clientY - t.y)),
    };
  };
  const pick = useMemo(
    () => ({
      onHover: setHovered,
      onSelect: (id: string | null) => {
        if (travel.current.max <= CLICK_SLOP_PX) setSelected(id);
      },
    }),
    [setSelected],
  );
  const onPointerMissed = (e: MouseEvent) => {
    setHovered(null);
    if (e.type === "click") pick.onSelect(null);
  };

  const selectedEntity = selected ? entities.get(selected) : undefined;
  const canFollow = selectedEntity
    ? TRUCK_KINDS.has(selectedEntity.kind)
    : false;
  const trucks = useMemo(() => followableIds(state, motion), [state, motion]);

  const graphicsLost = graphics === "lost";

  useEffect(() => {
    onStatus?.({ meshes, canFollow, graphicsLost });
  }, [onStatus, meshes, canFollow, graphicsLost]);

  const stopFollowing = useCallback(() => {
    setFollow(null);
    setLocalHome((n) => n + 1);
  }, [setFollow]);

  // A followed truck that leaves the state (a new run) ends the chase.
  useEffect(() => {
    if (followId && !entities.has(followId)) stopFollowing();
  }, [followId, entities, stopFollowing]);

  // Picking another truck moves the chase to it; picking anything else ends it.
  useEffect(() => {
    const next = followAfterSelect(followId, selected, canFollow);
    if (next === followId) return;
    if (next) setFollow(next);
    else stopFollowing();
  }, [followId, selected, canFollow, setFollow, stopFollowing]);

  // Switching to or from top-down ends the chase, so the fitted view never fights the follow rig.
  const lastTopDown = useRef(view.topDown);
  useEffect(() => {
    if (lastTopDown.current === view.topDown) return;
    lastTopDown.current = view.topDown;
    if (followId) stopFollowing();
  }, [view.topDown, followId, stopFollowing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (graphicsLost && e.key !== "Escape") return;
      if (e.key === "Escape") {
        if (followId) stopFollowing();
        else setSelected(null);
      } else if (e.key === "f" || e.key === "F") {
        if (followId) stopFollowing();
        else if (canFollow && selected) setFollow(selected);
      } else if (e.key === "[" || e.key === "]") {
        const next = cycleId(
          trucks,
          followId ?? selected,
          e.key === "]" ? 1 : -1,
        );
        if (!next) return;
        setSelected(next);
        setFollow(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    followId,
    selected,
    canFollow,
    trucks,
    graphicsLost,
    setSelected,
    setFollow,
    stopFollowing,
  ]);

  const route = followId && view.ambient ? motion.route(followId) : undefined;

  return (
    <div
      className="relative h-full w-full"
      onPointerDownCapture={onPointerDown}
      onPointerMoveCapture={onPointerMove}
    >
      <Canvas
        key={canvasKey}
        camera={{ fov: MINIATURE_VIEW.fovY / DEG, near: 5, far: 20000 }}
        dpr={[1, 1.5]}
        shadows="percentage"
        onCreated={onCreated}
        onPointerMissed={onPointerMissed}
        role="img"
        aria-label="Schematic 3D view of DFW Commerce Center Building I (schematic layout; run state from the engine when a run exists)"
      >
        <MotionClock
          motion={motion}
          layout={layout}
          live={live}
          version={poseVersion}
          clock={clock}
          on={view.ambient}
          speed={speed}
        />
        <color attach="background" args={[palette.bg]} />
        <hemisphereLight
          args={[palette.sky, palette.bounce, palette.skyIntensity]}
        />
        <directionalLight
          position={[...SUN_AT]}
          color={palette.sun}
          intensity={palette.sunIntensity}
          castShadow={view.shadows}
          shadow-mapSize={[4096, 4096]}
          shadow-bias={-0.0004}
          shadow-camera-left={-SHADOW_EXTENT}
          shadow-camera-right={SHADOW_EXTENT}
          shadow-camera-top={SHADOW_EXTENT}
          shadow-camera-bottom={-SHADOW_EXTENT}
          shadow-camera-near={100}
          shadow-camera-far={5000}
        />
        <Shell bounds={bounds} palette={palette} roof={view.roof} pick={pick} />
        {LANES.map((lane) => (
          <mesh key={`${lane.x},${lane.z}`} position={[lane.x, 1, lane.z]}>
            <boxGeometry args={[70, 0.4, 120]} />
            <meshLambertMaterial color={palette.staging} />
          </mesh>
        ))}
        <Fixtures state={state} layout={layout} palette={palette} pick={pick} />
        <Vehicles
          kit={kit}
          state={state}
          layout={layout}
          palette={palette}
          pick={pick}
          poses={live}
          version={poseVersion}
          moving={motion.ids}
        />
        <SelectionMarks
          selectedId={selected}
          hovered={hovered ? entities.get(hovered) : undefined}
          poses={live}
          onHoverLost={() => setHovered(null)}
        />
        <OrbitControls
          makeDefault
          enableDamping
          maxPolarAngle={Math.PI * 0.47}
        />
        <CameraRig
          bounds={bounds}
          view={view.topDown ? TOP_VIEW : MINIATURE_VIEW}
          homeSignal={homeSignal}
          paused={followId !== null}
        />
        <FollowRig followId={followId} poses={live} />
        {route && <RouteLine route={route} />}
        {view.lens && (
          <MiniatureLens
            focusId={followId ?? selected}
            poses={live}
            strength={view.lensStrength}
            saturation={palette.saturation}
          />
        )}
      </Canvas>
      <SceneOverlay
        meshes={meshes}
        graphicsLost={graphicsLost}
        exceptions={exceptions}
        selected={selectedEntity}
        ambient={view.ambient}
        canFollow={canFollow}
        following={followId !== null}
        onSelect={setSelected}
        onToggleFollow={() =>
          followId ? stopFollowing() : selected && setFollow(selected)
        }
      />
    </div>
  );
};
