"use client";

import { useState, useMemo } from "react";
import { CrossSectionData } from "@/types/simulation";
import {
  X,
  Waves,
  ArrowRightLeft,
  ArrowDown,
  Gauge,
  Clock,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Scan,
  PanelRightClose,
  ChevronLeft,
  Mountain,
} from "lucide-react";

interface CrossSectionModalProps {
  data: CrossSectionData;
  onClose: () => void;
}

export default function CrossSectionModal({ data, onClose }: CrossSectionModalProps) {
  const [hoverPoint, setHoverPoint] = useState<{ offset: number; elev: number; x: number; y: number } | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [focusOnFlood, setFocusOnFlood] = useState<boolean>(true);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  const {
    station_distance_km,
    nearest_settlement,
    bed_elevation_m,
    water_depth_m,
    wse_m,
    top_width_m,
    velocity_ms,
    discharge_m3s,
    arrival_time_min,
    buffer_distance_km,
    transect_offsets_m,
    terrain_elevations_m,
    flood_left_offset_m,
    flood_right_offset_m,
    buffer_left_offset_m,
    buffer_right_offset_m,
  } = data;

  // Responsive 410px-wide SVG coordinate dimensions
  const width = 380;
  const height = 190;
  const pad = { top: 26, right: 18, bottom: 34, left: 46 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const rawMinOffset = transect_offsets_m[0] ?? -500;
  const rawMaxOffset = transect_offsets_m[transect_offsets_m.length - 1] ?? 500;

  // Calculate dynamic X offset bounds based on zoom or focus on flood extent
  const { minOffset, maxOffset } = useMemo(() => {
    if (focusOnFlood) {
      const floodCenter = (flood_left_offset_m + flood_right_offset_m) / 2.0;
      const floodSpan = Math.max(50.0, (flood_right_offset_m - flood_left_offset_m) * 1.55);
      return {
        minOffset: floodCenter - floodSpan / 2.0,
        maxOffset: floodCenter + floodSpan / 2.0,
      };
    }

    if (zoomLevel > 1.0) {
      const fullSpan = rawMaxOffset - rawMinOffset;
      const zoomedSpan = fullSpan / zoomLevel;
      const center = (flood_left_offset_m + flood_right_offset_m) / 2.0;
      return {
        minOffset: center - zoomedSpan / 2.0,
        maxOffset: center + zoomedSpan / 2.0,
      };
    }

    return { minOffset: rawMinOffset, maxOffset: rawMaxOffset };
  }, [focusOnFlood, zoomLevel, rawMinOffset, rawMaxOffset, flood_left_offset_m, flood_right_offset_m]);

  // Compute dynamic elevation range of visible points
  const { minElev, maxElev, elevRange } = useMemo(() => {
    const visibleElevs: number[] = [];
    transect_offsets_m.forEach((off, i) => {
      if (off >= minOffset && off <= maxOffset) {
        visibleElevs.push(terrain_elevations_m[i]);
      }
    });

    if (visibleElevs.length === 0) {
      visibleElevs.push(bed_elevation_m, wse_m + 5.0);
    }

    const rawMin = Math.min(...visibleElevs, bed_elevation_m);
    const rawMax = Math.max(...visibleElevs, wse_m);
    const delta = Math.max(3.0, rawMax - rawMin);

    const computedMin = rawMin - Math.max(0.6, delta * 0.12);
    const computedMax = rawMax + Math.max(1.2, delta * 0.22);
    const range = Math.max(4.0, computedMax - computedMin);

    return {
      minElev: computedMin,
      maxElev: computedMax,
      elevRange: range,
    };
  }, [minOffset, maxOffset, transect_offsets_m, terrain_elevations_m, bed_elevation_m, wse_m]);

  const scaleX = (off: number) => pad.left + ((off - minOffset) / (maxOffset - minOffset)) * plotW;
  const scaleY = (elev: number) => pad.top + plotH - ((elev - minElev) / elevRange) * plotH;

  const handleZoomIn = () => {
    setFocusOnFlood(false);
    setZoomLevel((prev) => Math.min(6.0, prev * 1.4));
  };

  const handleZoomOut = () => {
    setFocusOnFlood(false);
    setZoomLevel((prev) => Math.max(1.0, prev / 1.4));
  };

  const handleResetZoom = () => {
    setFocusOnFlood(false);
    setZoomLevel(1.0);
  };

  const handleToggleFocusFlood = () => {
    setFocusOnFlood((prev) => !prev);
    setZoomLevel(1.0);
  };

  // Generate Terrain Path
  const terrainPoints = transect_offsets_m.map((off, i) => `${scaleX(off)},${scaleY(terrain_elevations_m[i])}`).join(" ");
  const bedrockPath = `M ${scaleX(minOffset)},${scaleY(minElev - 5)} L ${terrainPoints} L ${scaleX(maxOffset)},${scaleY(minElev - 5)} Z`;
  const terrainLine = `M ${terrainPoints}`;

  // Water Surface Line coordinates
  const waterX1 = scaleX(flood_left_offset_m);
  const waterX2 = scaleX(flood_right_offset_m);
  const waterY = scaleY(wse_m);
  const bedY = scaleY(bed_elevation_m);

  // Buffer coordinates
  const bufX1 = scaleX(buffer_left_offset_m);
  const bufX2 = scaleX(buffer_right_offset_m);

  // Submerged water polygon
  const waterSubmergedIndices = transect_offsets_m
    .map((off, i) => ({ off, elev: terrain_elevations_m[i] }))
    .filter(({ off }) => off >= flood_left_offset_m && off <= flood_right_offset_m);

  let waterPolyPoints = `${waterX1},${waterY} `;
  waterSubmergedIndices.forEach(({ off, elev }) => {
    waterPolyPoints += `${scaleX(off)},${scaleY(Math.min(wse_m, elev))} `;
  });
  waterPolyPoints += `${waterX2},${waterY}`;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const normX = (mouseX / rect.width) * width;
    if (normX < pad.left || normX > width - pad.right) {
      setHoverPoint(null);
      return;
    }
    const offVal = minOffset + ((normX - pad.left) / plotW) * (maxOffset - minOffset);
    let closestIdx = 0;
    let minDiff = Infinity;
    transect_offsets_m.forEach((off, i) => {
      const diff = Math.abs(off - offVal);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    });

    setHoverPoint({
      offset: transect_offsets_m[closestIdx],
      elev: terrain_elevations_m[closestIdx],
      x: scaleX(transect_offsets_m[closestIdx]),
      y: scaleY(terrain_elevations_m[closestIdx]),
    });
  };

  // If collapsed, show a sleek floating trigger pill on top-right
  if (isCollapsed) {
    return (
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2 animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={() => setIsCollapsed(false)}
          className="bg-slate-900/95 hover:bg-slate-800 text-slate-100 px-3.5 py-2.5 rounded-2xl border border-slate-700/70 shadow-2xl backdrop-blur-xl transition-all flex items-center gap-2.5 text-xs font-bold active:scale-95 group"
        >
          <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-sm">
            <Waves className="w-3.5 h-3.5" />
          </div>
          <div className="flex flex-col text-left">
            <span className="text-[10px] text-cyan-300 font-mono">Cross-Section {station_distance_km} km</span>
            <span className="text-white text-xs font-semibold">
              Depth: <b className="text-cyan-400">{water_depth_m}m</b> | Width: <b className="text-blue-300">{top_width_m}m</b>
            </span>
          </div>
          <ChevronLeft className="w-4 h-4 text-cyan-400 group-hover:-translate-x-0.5 transition-transform ml-1" />
        </button>

        <button
          onClick={onClose}
          className="p-2.5 bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-white rounded-2xl border border-slate-700/70 shadow-xl backdrop-blur-xl transition-colors"
          title="Close cross-section"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="absolute top-4 right-4 z-20 w-[410px] max-w-[calc(100vw-2rem)] bg-slate-900/95 backdrop-blur-2xl border border-slate-700/70 rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/80">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/20">
            <Waves className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-xs font-bold text-white tracking-wide">
                Valley Cross-Section
              </h3>
              <span className="text-[9.5px] font-mono px-1.5 py-0.2 rounded-md bg-cyan-950/80 text-cyan-300 border border-cyan-700/50 font-semibold">
                {station_distance_km} km
              </span>
            </div>
            <p className="text-[10px] text-slate-400 truncate max-w-[210px]">
              {nearest_settlement ? `Near ${nearest_settlement}` : "3D Terrain & Water Surface"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsCollapsed(true)}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
            title="Collapse panel (view 3D terrain)"
          >
            <PanelRightClose className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
            title="Close cross-section"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* KPI Stats Grid - 4 Compact Cards */}
      <div className="grid grid-cols-4 gap-1.5 p-2.5 mx-3 mt-2.5 bg-slate-950/60 rounded-2xl border border-slate-800/80 text-center">
        <div className="p-1">
          <span className="text-[9px] text-cyan-400 font-semibold uppercase tracking-wider block flex items-center justify-center gap-0.5">
            <ArrowDown className="w-2.5 h-2.5" /> Depth
          </span>
          <span className="text-xs font-bold font-mono text-cyan-200">{water_depth_m}m</span>
        </div>

        <div className="p-1">
          <span className="text-[9px] text-blue-400 font-semibold uppercase tracking-wider block flex items-center justify-center gap-0.5">
            <ArrowRightLeft className="w-2.5 h-2.5" /> Width
          </span>
          <span className="text-xs font-bold font-mono text-blue-200">{top_width_m}m</span>
        </div>

        <div className="p-1">
          <span className="text-[9px] text-emerald-400 font-semibold uppercase tracking-wider block flex items-center justify-center gap-0.5">
            <Gauge className="w-2.5 h-2.5" /> Speed
          </span>
          <span className="text-xs font-bold font-mono text-emerald-200">{velocity_ms}m/s</span>
        </div>

        <div className="p-1">
          <span className="text-[9px] text-purple-400 font-semibold uppercase tracking-wider block flex items-center justify-center gap-0.5">
            <Clock className="w-2.5 h-2.5" /> Arrival
          </span>
          <span className="text-xs font-bold font-mono text-purple-200">{arrival_time_min}m</span>
        </div>
      </div>

      {/* Interactive Zoom & Focus Control Toolbar */}
      <div className="flex items-center justify-between px-3 mt-2">
        <div className="flex items-center gap-1">
          <button
            onClick={handleToggleFocusFlood}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all shadow-sm ${
              focusOnFlood
                ? "bg-cyan-500 text-slate-950 shadow-cyan-500/25 border border-cyan-300"
                : "bg-slate-800/80 hover:bg-slate-700 text-cyan-300 border border-slate-700/60"
            }`}
            title="Focus directly on the active flood channel"
          >
            <Scan className="w-3 h-3" />
            {focusOnFlood ? "Flood Channel" : "Focus Flood"}
          </button>

          <button
            onClick={handleResetZoom}
            className={`flex items-center gap-1 px-2 py-1 rounded-xl text-[11px] font-semibold transition-all border ${
              !focusOnFlood && zoomLevel === 1.0
                ? "bg-slate-800 text-slate-200 border-slate-600"
                : "bg-slate-900/60 hover:bg-slate-800 text-slate-400 border-slate-700/50"
            }`}
            title="Fit full 2km valley span"
          >
            <Maximize2 className="w-2.5 h-2.5" />
            Full Valley
          </button>
        </div>

        <div className="flex items-center gap-0.5 bg-slate-950/80 p-0.5 rounded-xl border border-slate-800/80 text-xs">
          <button
            onClick={handleZoomIn}
            className="p-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-3 h-3" />
          </button>
          <span className="px-1 text-[10px] font-mono text-slate-400 font-semibold select-none">
            {focusOnFlood ? "Focus" : `${zoomLevel.toFixed(1)}x`}
          </span>
          <button
            onClick={handleZoomOut}
            className="p-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-3 h-3" />
          </button>
          <button
            onClick={handleResetZoom}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            title="Reset"
          >
            <RotateCcw className="w-2.5 h-2.5" />
          </button>
        </div>
      </div>

      {/* Responsive SVG Cross-Section Visualization */}
      <div className="p-3 pt-1.5 relative">
        <div className="bg-slate-950 rounded-2xl border border-slate-800/90 p-1.5 overflow-hidden shadow-inner">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-auto select-none"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverPoint(null)}
            onWheel={(e) => {
              if (e.deltaY < 0) handleZoomIn();
              else if (e.deltaY > 0) handleZoomOut();
            }}
          >
            <defs>
              <marker
                id="arrow-down-xs"
                viewBox="0 0 10 10"
                refX="5"
                refY="5"
                markerWidth="3.5"
                markerHeight="3.5"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#00e5ff" />
              </marker>
              <marker
                id="arrow-up-xs"
                viewBox="0 0 10 10"
                refX="5"
                refY="5"
                markerWidth="3.5"
                markerHeight="3.5"
                orient="auto"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#00e5ff" />
              </marker>
              <linearGradient id="waterGradXS" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00e5ff" stopOpacity="0.7" />
                <stop offset="100%" stopColor="#0284c7" stopOpacity="0.85" />
              </linearGradient>
            </defs>

            {/* Gridlines */}
            {[0.25, 0.5, 0.75, 1.0].map((frac, idx) => {
              const yVal = pad.top + plotH * (1 - frac);
              const elevVal = minElev + elevRange * frac;
              return (
                <g key={idx}>
                  <line
                    x1={pad.left}
                    y1={yVal}
                    x2={width - pad.right}
                    y2={yVal}
                    stroke="#334155"
                    strokeDasharray="3 3"
                    strokeOpacity={0.35}
                  />
                  <text
                    x={pad.left - 4}
                    y={yVal + 3}
                    fill="#64748b"
                    fontSize="8"
                    fontFamily="monospace"
                    textAnchor="end"
                  >
                    {Math.round(elevVal)}m
                  </text>
                </g>
              );
            })}

            {/* Centerline axis */}
            <line
              x1={scaleX(0)}
              y1={pad.top}
              x2={scaleX(0)}
              y2={height - pad.bottom}
              stroke="#475569"
              strokeDasharray="2 2"
              strokeOpacity={0.5}
            />

            {/* 2km Buffer Boundary Orange Vertical Planes */}
            <g>
              <rect
                x={bufX1 - 1.5}
                y={pad.top - 8}
                width="3"
                height={height - pad.bottom - (pad.top - 8)}
                fill="#e8871e"
                fillOpacity={0.2}
              />
              <line
                x1={bufX1}
                y1={pad.top - 10}
                x2={bufX1}
                y2={height - pad.bottom}
                stroke="#e8871e"
                strokeWidth="1.5"
                strokeDasharray="3 2"
              />
              <rect
                x={bufX2 - 1.5}
                y={pad.top - 8}
                width="3"
                height={height - pad.bottom - (pad.top - 8)}
                fill="#e8871e"
                fillOpacity={0.2}
              />
              <line
                x1={bufX2}
                y1={pad.top - 10}
                x2={bufX2}
                y2={height - pad.bottom}
                stroke="#e8871e"
                strokeWidth="1.5"
                strokeDasharray="3 2"
              />
            </g>

            {/* Valley Bedrock Fill */}
            <path d={bedrockPath} fill="#0f172a" fillOpacity={0.92} />

            {/* Submerged Inundated Water Body Fill */}
            <polygon
              points={waterPolyPoints}
              fill="url(#waterGradXS)"
            />

            {/* Flood Extent Blue Vertical Planes */}
            <g>
              <rect
                x={waterX1 - 2}
                y={waterY - 18}
                width="4"
                height={height - pad.bottom - (waterY - 18)}
                fill="#00b4d8"
                fillOpacity={0.25}
              />
              <line
                x1={waterX1}
                y1={waterY - 20}
                x2={waterX1}
                y2={height - pad.bottom}
                stroke="#00e5ff"
                strokeWidth="1.5"
                strokeDasharray="3 2"
              />

              <rect
                x={waterX2 - 2}
                y={waterY - 18}
                width="4"
                height={height - pad.bottom - (waterY - 18)}
                fill="#00b4d8"
                fillOpacity={0.25}
              />
              <line
                x1={waterX2}
                y1={waterY - 20}
                x2={waterX2}
                y2={height - pad.bottom}
                stroke="#00e5ff"
                strokeWidth="1.5"
                strokeDasharray="3 2"
              />
            </g>

            {/* Horizontal Water Surface Elevation (WSE) Line */}
            <line
              x1={waterX1}
              y1={waterY}
              x2={waterX2}
              y2={waterY}
              stroke="#00f0ff"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <line
              x1={waterX1}
              y1={waterY}
              x2={waterX2}
              y2={waterY}
              stroke="#00f0ff"
              strokeWidth="6"
              strokeOpacity={0.3}
              strokeLinecap="round"
            />

            {/* WSE Label */}
            <text
              x={(waterX1 + waterX2) / 2}
              y={waterY - 5}
              fill="#00f0ff"
              fontSize="8.5"
              fontWeight="bold"
              fontFamily="sans-serif"
              textAnchor="middle"
            >
              WSE {wse_m}m
            </text>

            {/* Vertical Water Depth Dimension Indicator */}
            {bedY - waterY > 8 && (
              <g>
                <line
                  x1={scaleX(0)}
                  y1={waterY + 2}
                  x2={scaleX(0)}
                  y2={bedY - 2}
                  stroke="#ffffff"
                  strokeWidth="1.2"
                  markerStart="url(#arrow-down-xs)"
                  markerEnd="url(#arrow-up-xs)"
                />
                <rect
                  x={scaleX(0) + 4}
                  y={(waterY + bedY) / 2 - 7}
                  width="56"
                  height="14"
                  rx="3"
                  fill="#020617"
                  stroke="#00e5ff"
                  strokeWidth="0.8"
                  fillOpacity={0.92}
                />
                <text
                  x={scaleX(0) + 32}
                  y={(waterY + bedY) / 2 + 3}
                  fill="#38bdf8"
                  fontSize="7.5"
                  fontFamily="monospace"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  h = {water_depth_m}m
                </text>
              </g>
            )}

            {/* 3D Valley Terrain Surface Line */}
            <path
              d={terrainLine}
              fill="none"
              stroke="#94a3b8"
              strokeWidth="2.0"
              strokeLinecap="round"
            />

            {/* Bed Elevation Dot */}
            <circle
              cx={scaleX(0)}
              cy={bedY}
              r="3.5"
              fill="#38bdf8"
              stroke="#ffffff"
              strokeWidth="1.2"
            />

            {/* Left / Right Bank Indicators */}
            <text
              x={scaleX(minOffset) + 4}
              y={height - pad.bottom + 13}
              fill="#94a3b8"
              fontSize="8"
              fontFamily="sans-serif"
            >
              ◀ Left
            </text>
            <text
              x={scaleX(0)}
              y={height - pad.bottom + 13}
              fill="#38bdf8"
              fontSize="8"
              fontFamily="sans-serif"
              textAnchor="middle"
            >
              Bed {bed_elevation_m}m
            </text>
            <text
              x={scaleX(maxOffset) - 4}
              y={height - pad.bottom + 13}
              fill="#94a3b8"
              fontSize="8"
              fontFamily="sans-serif"
              textAnchor="end"
            >
              Right ▶
            </text>

            {/* Dynamic X-axis distance labels */}
            {[0, 0.5, 1.0].map((frac, idx) => {
              const offVal = Math.round(minOffset + (maxOffset - minOffset) * frac);
              return (
                <text
                  key={idx}
                  x={scaleX(offVal)}
                  y={height - pad.bottom + 24}
                  fill="#64748b"
                  fontSize="7.5"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  {offVal > 0 ? `+${offVal}m` : `${offVal}m`}
                </text>
              );
            })}

            {/* Hover Tooltip crosshair */}
            {hoverPoint && (
              <g>
                <circle
                  cx={hoverPoint.x}
                  cy={hoverPoint.y}
                  r="3.5"
                  fill="#f59e0b"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                />
                <line
                  x1={hoverPoint.x}
                  y1={pad.top}
                  x2={hoverPoint.x}
                  y2={height - pad.bottom}
                  stroke="#f59e0b"
                  strokeDasharray="2 2"
                  strokeOpacity={0.8}
                />
                <rect
                  x={Math.min(width - 90, Math.max(pad.left, hoverPoint.x - 45))}
                  y={Math.max(pad.top, hoverPoint.y - 24)}
                  width="90"
                  height="20"
                  rx="4"
                  fill="#020617"
                  stroke="#475569"
                  strokeWidth="1"
                />
                <text
                  x={Math.min(width - 90, Math.max(pad.left, hoverPoint.x - 45)) + 45}
                  y={Math.max(pad.top, hoverPoint.y - 24) + 13}
                  fill="#ffffff"
                  fontSize="8"
                  fontFamily="monospace"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {Math.round(hoverPoint.offset)}m | {hoverPoint.elev.toFixed(1)}m
                </text>
              </g>
            )}
          </svg>
        </div>
      </div>

      {/* Footer Legend */}
      <div className="flex items-center justify-between px-3.5 py-2 border-t border-slate-800/80 bg-slate-950/70 text-[9.5px] text-slate-400">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="w-2 h-1 bg-slate-400 rounded-full inline-block"></span>
            <span>Slope</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-1 bg-cyan-400 border-t border-cyan-300 inline-block"></span>
            <span>WSE</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-1 h-2.5 bg-cyan-500/50 border border-cyan-300 inline-block"></span>
            <span>Flood Plane</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-1 h-2.5 bg-amber-500/50 border border-amber-400 inline-block"></span>
            <span>Buffer Plane</span>
          </div>
        </div>

        <span className="text-[9px] text-slate-500">
          In 3D Terrain
        </span>
      </div>
    </div>
  );
}
