"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { SimulationResponse, SimulationStep, RiverInfo, CrossSectionData, AffectedCity } from "@/types/simulation";
import { fetchCrossSection } from "@/lib/api";
import { Mountain, Navigation, Crosshair, AlertTriangle, X } from "lucide-react";

interface Map3DProps {
  river: RiverInfo;
  originCoords: [number, number];
  onOriginChange: (coords: [number, number]) => void;
  simulationResult: SimulationResponse | null;
  currentStep: SimulationStep | null;
  isPickingOrigin: boolean;
  showAffectedZone?: boolean;
  setShowAffectedZone?: (show: boolean) => void;
  showBufferZone?: boolean;
  setShowBufferZone?: (show: boolean) => void;
  activeCrossSection?: CrossSectionData | null;
  onSelectCrossSection?: (data: CrossSectionData | null) => void;
  selectedSettlement?: AffectedCity | null;
  onSelectSettlement?: (settlement: AffectedCity | null) => void;
}

function normalizeGeoJSON(data: any): GeoJSON.FeatureCollection {
  if (!data) return { type: "FeatureCollection", features: [] };

  const flattenGeometries = (geom: any, props: any = {}): GeoJSON.Feature[] => {
    if (!geom) return [];
    if (geom.type === "GeometryCollection") {
      return (geom.geometries || []).flatMap((g: any) => flattenGeometries(g, props));
    }
    if (
      geom.type === "Polygon" ||
      geom.type === "MultiPolygon" ||
      geom.type === "LineString" ||
      geom.type === "MultiLineString" ||
      geom.type === "Point" ||
      geom.type === "MultiPoint"
    ) {
      if (Array.isArray(geom.coordinates) && geom.coordinates.length > 0) {
        return [{ type: "Feature", properties: props, geometry: geom }];
      }
    }
    return [];
  };

  if (data.type === "FeatureCollection") {
    const validFeatures: GeoJSON.Feature[] = [];
    (data.features || []).forEach((f: any) => {
      if (!f || !f.geometry) return;
      validFeatures.push(...flattenGeometries(f.geometry, f.properties || {}));
    });
    return { type: "FeatureCollection", features: validFeatures };
  }

  if (data.type === "Feature") {
    return { type: "FeatureCollection", features: flattenGeometries(data.geometry, data.properties || {}) };
  }

  if (data.type === "GeometryCollection") {
    return { type: "FeatureCollection", features: flattenGeometries(data, {}) };
  }

  return { type: "FeatureCollection", features: flattenGeometries(data, {}) };
}

function computeGeoJSONBounds(fc: GeoJSON.FeatureCollection): [[number, number], [number, number]] | null {
  let minLon = Infinity,
    minLat = Infinity,
    maxLon = -Infinity,
    maxLat = -Infinity;
  const processCoords = (coords: any) => {
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      minLon = Math.min(minLon, coords[0]);
      maxLon = Math.max(maxLon, coords[0]);
      minLat = Math.min(minLat, coords[1]);
      maxLat = Math.max(maxLat, coords[1]);
    } else if (Array.isArray(coords)) {
      coords.forEach(processCoords);
    }
  };

  if (!fc || !fc.features) return null;
  fc.features.forEach((f) => {
    if (f && f.geometry && (f.geometry as any).coordinates) {
      processCoords((f.geometry as any).coordinates);
    }
  });

  if (minLon === Infinity) return null;
  return [
    [minLon, minLat],
    [maxLon, maxLat],
  ];
}

function addGeoJsonSourceAsync(map: maplibregl.Map, id: string, url: string) {
  if (!map.getSource(id)) {
    map.addSource(id, {
      type: "geojson",
      tolerance: 0,
      data: { type: "FeatureCollection", features: [] },
    });
  }
  fetch(url)
    .then((r) => r.json())
    .then((gj) => {
      const src = map.getSource(id) as maplibregl.GeoJSONSource;
      if (src) src.setData(normalizeGeoJSON(gj));
    })
    .catch((err) => console.error("Failed to load geojson:", url, err));
}

export default function Map3D({
  river,
  originCoords,
  onOriginChange,
  simulationResult,
  currentStep,
  isPickingOrigin,
  showAffectedZone: showAffectedZoneProp,
  setShowAffectedZone: setShowAffectedZoneProp,
  showBufferZone: showBufferZoneProp,
  setShowBufferZone: setShowBufferZoneProp,
  activeCrossSection,
  onSelectCrossSection,
  selectedSettlement,
  onSelectSettlement,
}: Map3DProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const originMarkerRef = useRef<maplibregl.Marker | null>(null);
  const frontMarkerRef = useRef<maplibregl.Marker | null>(null);
  const csMarkerRef = useRef<maplibregl.Marker | null>(null);
  const settlementMarkerRef = useRef<maplibregl.Marker | null>(null);

  const simulationResultRef = useRef<SimulationResponse | null>(simulationResult);
  const onSelectCrossSectionRef = useRef(onSelectCrossSection);
  const onSelectSettlementRef = useRef(onSelectSettlement);
  const isPickingOriginRef = useRef(isPickingOrigin);

  useEffect(() => {
    simulationResultRef.current = simulationResult;
  }, [simulationResult]);

  useEffect(() => {
    onSelectCrossSectionRef.current = onSelectCrossSection;
  }, [onSelectCrossSection]);

  useEffect(() => {
    onSelectSettlementRef.current = onSelectSettlement;
  }, [onSelectSettlement]);

  useEffect(() => {
    isPickingOriginRef.current = isPickingOrigin;
  }, [isPickingOrigin]);

  const [is3D, setIs3D] = useState(true);
  const [followWave, setFollowWave] = useState(true);
  const [internalShowAffectedZone, setInternalShowAffectedZone] = useState(true);
  const [internalShowBufferZone, setInternalShowBufferZone] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(false);

  const isYellowZoneVisible = showAffectedZoneProp !== undefined ? showAffectedZoneProp : internalShowAffectedZone;
  const toggleYellowZone = () => {
    const next = !isYellowZoneVisible;
    if (setShowAffectedZoneProp) setShowAffectedZoneProp(next);
    else setInternalShowAffectedZone(next);
  };

  const isBufferZoneVisible = showBufferZoneProp !== undefined ? showBufferZoneProp : internalShowBufferZone;
  const toggleBufferZone = () => {
    const next = !isBufferZoneVisible;
    if (setShowBufferZoneProp) setShowBufferZoneProp(next);
    else setInternalShowBufferZone(next);
  };

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          esriImagery: {
            type: "raster",
            tiles: [
              "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            ],
            tileSize: 256,
            attribution: "Esri World Imagery",
          },
          terrainSource: {
            type: "raster-dem",
            tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
            encoding: "terrarium",
            tileSize: 256,
            maxzoom: 15,
          },
        },
        layers: [
          {
            id: "esri-basemap",
            type: "raster",
            source: "esriImagery",
          },
        ],
      },
      center: originCoords,
      zoom: river.default_zoom || 12.0,
      pitch: 54,
      bearing: 115,
      maxPitch: 85,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "bottom-right");
    map.addControl(new maplibregl.ScaleControl(), "bottom-left");

    map.on("load", () => {
      // 1. Set 3D terrain
      map.setTerrain({ source: "terrainSource", exaggeration: 1.1 });

      // 2. River Centerline Layer
      addGeoJsonSourceAsync(map, "river-centerline", "/data/bhotekoshi_river.geojson");

      // 2. River Centerline Layer (Matching original project: #0f5fa6, width 2)
      addGeoJsonSourceAsync(map, "river-centerline", "/data/bhotekoshi_river.geojson");

      map.addLayer({
        id: "river-centerline-layer",
        type: "line",
        source: "river-centerline",
        paint: {
          "line-color": "#0f5fa6",
          "line-width": 2.0,
          "line-opacity": 1.0,
        },
      });

      // 3. Disaster Evaluation Buffer Zone (Matching original project: #e8871e, width 1.5, dasharray [3, 2])
      map.addSource("buffer-zone-poly", {
        type: "geojson",
        tolerance: 0,
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: "buffer-zone-outline",
        type: "line",
        source: "buffer-zone-poly",
        paint: {
          "line-color": "#e8871e",
          "line-width": 1.6,
          "line-dasharray": [3, 2],
          "line-opacity": 1.0,
        },
      });

      // 4. Estimated Hydraulic Flood Extent (Matching original project: #1f9dd6, opacity 0.35, outline #0b5b7a, width 1.5)
      map.addSource("affected-area-poly", {
        type: "geojson",
        tolerance: 0,
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: "affected-area-fill",
        type: "fill",
        source: "affected-area-poly",
        paint: {
          "fill-color": "#1f9dd6",
          "fill-opacity": 0.35,
        },
      });

      map.addLayer({
        id: "affected-area-outline",
        type: "line",
        source: "affected-area-poly",
        paint: {
          "line-color": "#0b5b7a",
          "line-width": 1.5,
          "line-opacity": 1.0,
        },
      });

      // 5. Cities / Settlements Layer (Matching original project: #ffffff circle, #333333 stroke, radius 5)
      addGeoJsonSourceAsync(map, "settlements", "/data/cities.geojson");

      map.addLayer({
        id: "settlements-layer",
        type: "circle",
        source: "settlements",
        paint: {
          "circle-color": "#ffffff",
          "circle-radius": 5,
          "circle-stroke-color": "#333333",
          "circle-stroke-width": 1.5,
          "circle-opacity": 1.0,
        },
      });

      // 6. Active Cross-Section Transect Cut Line (Cyan glow + solid white line across valley)
      map.addSource("transect-cut-line", {
        type: "geojson",
        tolerance: 0,
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: "transect-cut-glow",
        type: "line",
        source: "transect-cut-line",
        paint: {
          "line-color": "#00e5ff",
          "line-width": 6.0,
          "line-opacity": 0.85,
          "line-blur": 2.0,
        },
      });

      map.addLayer({
        id: "transect-cut-solid",
        type: "line",
        source: "transect-cut-line",
        paint: {
          "line-color": "#ffffff",
          "line-width": 2.5,
          "line-opacity": 1.0,
        },
      });

      // 7. In-River 3D Flood Extent Blue Vertical Plane (Segmented crisp transverse curtain)
      map.addSource("cs-flood-curtains-src", {
        type: "geojson",
        tolerance: 0,
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: "cs-flood-curtains-extrusion",
        type: "fill-extrusion",
        source: "cs-flood-curtains-src",
        paint: {
          "fill-extrusion-color": ["coalesce", ["get", "color"], "#00e5ff"],
          "fill-extrusion-height": ["coalesce", ["get", "height"], 25],
          "fill-extrusion-base": ["coalesce", ["get", "base_height"], 0],
          "fill-extrusion-opacity": 0.85,
        },
      });

      // 8. In-River 3D 2km Buffer Orange Vertical Plane (Segmented crisp transverse curtains on outer wings)
      map.addSource("cs-buffer-curtains-src", {
        type: "geojson",
        tolerance: 0,
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: "cs-buffer-curtains-extrusion",
        type: "fill-extrusion",
        source: "cs-buffer-curtains-src",
        paint: {
          "fill-extrusion-color": ["coalesce", ["get", "color"], "#e8871e"],
          "fill-extrusion-height": ["coalesce", ["get", "height"], 35],
          "fill-extrusion-base": ["coalesce", ["get", "base_height"], 0],
          "fill-extrusion-opacity": 0.75,
        },
      });

      // Settlement hover tooltip popup (zero external font dependencies)
      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 12,
        className: "settlement-popup",
      });

      map.on("mouseenter", "settlements-layer", (e) => {
        map.getCanvas().style.cursor = "pointer";
        if (e.features && e.features[0] && e.features[0].geometry.type === "Point") {
          const coords = (e.features[0].geometry as any).coordinates.slice();
          const props = e.features[0].properties || {};
          const name = props.name || "Settlement";
          const nameEn = props.name_en ? ` (${props.name_en})` : "";
          const region = props.region ? `<span class="text-[10px] text-slate-400 block">${props.region}</span>` : "";

          popup
            .setLngLat(coords)
            .setHTML(`
              <div class="bg-slate-900/95 text-slate-100 px-3 py-1.5 rounded-xl border border-slate-700 shadow-2xl text-xs font-semibold backdrop-blur-md">
                <div class="flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full bg-amber-400 inline-block"></span>
                  <span class="font-bold text-amber-300">${name}${nameEn}</span>
                </div>
                ${region}
              </div>
            `)
            .addTo(map);
        }
      });

      map.on("mouseleave", "settlements-layer", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });

      // Click on settlement point to select and focus
      map.on("click", "settlements-layer", (e) => {
        if (e.features && e.features[0]) {
          const props = e.features[0].properties || {};
          const name = props.name;
          const match = simulationResultRef.current?.affected_settlements.find(
            (s) => s.name.toLowerCase() === (name || "").toLowerCase()
          );
          if (match && onSelectSettlementRef.current) {
            onSelectSettlementRef.current(match);
          }
        }
      });

      setMapLoaded(true);
    });

    // Map click handler (Origin selection or Valley Cross-Section Inspection)
    map.on("click", async (e) => {
      const clickLng = e.lngLat.lng;
      const clickLat = e.lngLat.lat;

      // If user is actively picking origin or simulation has not been computed yet
      if (isPickingOriginRef.current || !simulationResultRef.current) {
        onOriginChange([clickLng, clickLat]);
        return;
      }

      // If simulation result exists, fetch cross-section profile at clicked valley point
      if (onSelectCrossSectionRef.current) {
        try {
          const summary = simulationResultRef.current.summary;
          const csData = await fetchCrossSection({
            river_id: river.id,
            origin_lon: originCoords[0],
            origin_lat: originCoords[1],
            click_lon: clickLng,
            click_lat: clickLat,
            volume_m3: summary?.total_volume_m3 || 5_000_000,
            duration_hours: summary?.duration_hours || 1.5,
            buffer_distance_km: summary?.buffer_distance_km || 2.0,
          });
          onSelectCrossSectionRef.current(csData);
        } catch (err) {
          console.error("Failed to extract valley cross section:", err);
        }
      }
    });

    mapRef.current = map;
    if (typeof window !== "undefined") {
      (window as any).__map = map;
    }

    return () => {
      map.remove();
    };
  }, []);

  // Fly to selected river when river changes
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    if (
      river?.default_origin &&
      Number.isFinite(river.default_origin[0]) &&
      Number.isFinite(river.default_origin[1])
    ) {
      mapRef.current.flyTo({
        center: river.default_origin,
        zoom: river.default_zoom || 12.0,
        pitch: is3D ? 54 : 0,
        bearing: is3D ? 115 : 0,
        duration: 1800,
        curve: 1.2,
      });
    }
  }, [river, mapLoaded]);

  // Update Full Estimated Flood Extent & Buffer Zone when simulation arrives
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    // 1. Hydraulic Flood Extent
    const affectedSrc = mapRef.current.getSource("affected-area-poly") as maplibregl.GeoJSONSource;
    if (affectedSrc) {
      if (simulationResult && simulationResult.affected_area_polygon) {
        affectedSrc.setData(normalizeGeoJSON(simulationResult.affected_area_polygon));
      } else {
        affectedSrc.setData({ type: "FeatureCollection", features: [] });
      }
    }

    // 2. Disaster Evaluation Buffer Zone (Yellow Dotted Line)
    const bufferSrc = mapRef.current.getSource("buffer-zone-poly") as maplibregl.GeoJSONSource;
    if (bufferSrc) {
      if (simulationResult && simulationResult.buffer_zone_polygon) {
        bufferSrc.setData(normalizeGeoJSON(simulationResult.buffer_zone_polygon));
      } else {
        bufferSrc.setData({ type: "FeatureCollection", features: [] });
      }
    }

    if (
      simulationResult &&
      Array.isArray(originCoords) &&
      Number.isFinite(originCoords[0]) &&
      Number.isFinite(originCoords[1])
    ) {
      mapRef.current.flyTo({
        center: originCoords,
        zoom: 12.5,
        pitch: 58,
        bearing: 118,
        duration: 1600,
      });
    }
  }, [simulationResult, mapLoaded]);

  // Update 3D In-River Cross-Section Layers and In-Scene Marker when activeCrossSection changes
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;

    // 1. Transect Cut Line
    const cutSrc = map.getSource("transect-cut-line") as maplibregl.GeoJSONSource;
    if (cutSrc) {
      if (activeCrossSection && activeCrossSection.transect_line_geojson) {
        cutSrc.setData(normalizeGeoJSON(activeCrossSection.transect_line_geojson));
      } else {
        cutSrc.setData({ type: "FeatureCollection", features: [] });
      }
    }

    // 2. 3D Submerged Water Body (Extrusion)
    const waterSrc = map.getSource("cs-water-body-src") as maplibregl.GeoJSONSource;
    if (waterSrc) {
      if (activeCrossSection && activeCrossSection.water_body_3d_geojson) {
        waterSrc.setData(normalizeGeoJSON(activeCrossSection.water_body_3d_geojson));
      } else {
        waterSrc.setData({ type: "FeatureCollection", features: [] });
      }
    }

    // 3. 3D Flood Extent Blue Vertical Planes
    const floodCurtainSrc = map.getSource("cs-flood-curtains-src") as maplibregl.GeoJSONSource;
    if (floodCurtainSrc) {
      if (activeCrossSection && activeCrossSection.flood_curtains_3d_geojson) {
        floodCurtainSrc.setData(normalizeGeoJSON(activeCrossSection.flood_curtains_3d_geojson));
      } else {
        floodCurtainSrc.setData({ type: "FeatureCollection", features: [] });
      }
    }

    // 4. 3D 2km Buffer Orange Vertical Planes
    const bufferCurtainSrc = map.getSource("cs-buffer-curtains-src") as maplibregl.GeoJSONSource;
    if (bufferCurtainSrc) {
      if (activeCrossSection && activeCrossSection.buffer_curtains_3d_geojson) {
        bufferCurtainSrc.setData(normalizeGeoJSON(activeCrossSection.buffer_curtains_3d_geojson));
      } else {
        bufferCurtainSrc.setData({ type: "FeatureCollection", features: [] });
      }
    }

    // 5. In-Scene 3D Floating HTML Billboard Marker above the river & Camera focus
    if (
      activeCrossSection &&
      Array.isArray(activeCrossSection.center_coords) &&
      Number.isFinite(activeCrossSection.center_coords[0]) &&
      Number.isFinite(activeCrossSection.center_coords[1])
    ) {
      if (!csMarkerRef.current) {
        const csEl = document.createElement("div");
        csEl.className = "cs-3d-floating-marker";
        csEl.innerHTML = `
          <div class="relative group cursor-pointer -translate-y-8 select-none">
            <div class="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/95 border-2 border-cyan-400 text-slate-100 rounded-2xl shadow-2xl backdrop-blur-xl text-xs font-bold ring-4 ring-cyan-500/20">
              <span class="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
              <div class="flex flex-col">
                <span class="text-cyan-300 text-[11px] uppercase tracking-wider">River Cross-Section</span>
                <span class="text-white text-[12px]">Depth: <b class="text-cyan-300">${activeCrossSection.water_depth_m}m</b> | WSE: <b class="text-cyan-300">${activeCrossSection.wse_m}m</b></span>
              </div>
            </div>
            <div class="w-2.5 h-2.5 bg-cyan-400 rotate-45 mx-auto -mt-1 shadow-md"></div>
          </div>
        `;

        csMarkerRef.current = new maplibregl.Marker({ element: csEl, anchor: "bottom" })
          .setLngLat(activeCrossSection.center_coords)
          .addTo(map);
      } else {
        csMarkerRef.current.setLngLat(activeCrossSection.center_coords);
      }

      // Smoothly focus map camera on the 3D cross-section location
      map.easeTo({
        center: activeCrossSection.center_coords,
        zoom: 13.0,
        pitch: is3D ? 48 : 0,
        bearing: is3D ? 115 : 0,
        duration: 1200,
      });
    } else {
      if (csMarkerRef.current) {
        csMarkerRef.current.remove();
        csMarkerRef.current = null;
      }
    }
  }, [activeCrossSection, mapLoaded]);

  // Focus and display 3D billboard on selected downstream settlement
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;

    if (
      selectedSettlement &&
      typeof selectedSettlement.lon === "number" &&
      typeof selectedSettlement.lat === "number" &&
      Number.isFinite(selectedSettlement.lon) &&
      Number.isFinite(selectedSettlement.lat)
    ) {
      const coords: [number, number] = [selectedSettlement.lon, selectedSettlement.lat];

      if (settlementMarkerRef.current) {
        settlementMarkerRef.current.remove();
        settlementMarkerRef.current = null;
      }

      const el = document.createElement("div");
      el.className = "settlement-3d-highlight-marker";
      el.innerHTML = `
        <div class="relative group cursor-pointer -translate-y-8 select-none">
          <div class="flex items-center gap-2.5 px-3.5 py-2 bg-slate-900/95 border-2 border-amber-400 text-slate-100 rounded-2xl shadow-2xl backdrop-blur-xl text-xs font-bold ring-4 ring-amber-500/25">
            <span class="w-3 h-3 rounded-full bg-amber-400 animate-ping"></span>
            <div class="flex flex-col">
              <div class="flex items-center gap-1.5">
                <span class="text-amber-300 text-[12px] font-extrabold uppercase tracking-wider">${selectedSettlement.name}</span>
                <span class="text-[10px] text-slate-400 font-mono">(${selectedSettlement.distance_km.toFixed(1)} km)</span>
              </div>
              <div class="flex items-center gap-2 text-[11px] font-mono text-slate-300 mt-0.5">
                <span>Depth: <b class="text-cyan-300">${selectedSettlement.peak_depth_m.toFixed(1)}m</b></span>
                <span>&middot;</span>
                <span>Arrival: <b class="text-red-300">+${Math.round(selectedSettlement.arrival_time_min)} min</b></span>
              </div>
            </div>
          </div>
          <div class="w-3 h-3 bg-amber-400 rotate-45 mx-auto -mt-1.5 shadow-md"></div>
        </div>
      `;

      settlementMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat(coords)
        .addTo(map);

      map.easeTo({
        center: coords,
        zoom: 12.8,
        pitch: is3D ? 45 : 0,
        bearing: is3D ? 115 : 0,
        duration: 1400,
      });
    } else {
      if (settlementMarkerRef.current) {
        settlementMarkerRef.current.remove();
        settlementMarkerRef.current = null;
      }
    }
  }, [selectedSettlement, mapLoaded, is3D]);

  // Toggle Visibility of Hydraulic Flood Extent
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;
    const vis = isYellowZoneVisible ? "visible" : "none";
    if (map.getLayer("affected-area-glow")) {
      map.setLayoutProperty("affected-area-glow", "visibility", vis);
    }
    if (map.getLayer("affected-area-fill")) {
      map.setLayoutProperty("affected-area-fill", "visibility", vis);
    }
    if (map.getLayer("affected-area-outline")) {
      map.setLayoutProperty("affected-area-outline", "visibility", vis);
    }
  }, [isYellowZoneVisible, mapLoaded]);

  // Toggle Visibility of Buffer Zone (Dotted Yellow Line)
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;
    const vis = isBufferZoneVisible ? "visible" : "none";
    if (map.getLayer("buffer-zone-outline")) {
      map.setLayoutProperty("buffer-zone-outline", "visibility", vis);
    }
  }, [isBufferZoneVisible, mapLoaded]);

  // Update Origin Marker Position
  useEffect(() => {
    if (!mapRef.current) return;

    if (
      Array.isArray(originCoords) &&
      originCoords.length >= 2 &&
      Number.isFinite(originCoords[0]) &&
      Number.isFinite(originCoords[1])
    ) {
      if (!originMarkerRef.current) {
        const el = document.createElement("div");
        el.className = "origin-pulse-marker";
        el.innerHTML = `
          <div class="relative flex items-center justify-center cursor-pointer group">
            <span class="animate-ping absolute inline-flex h-8 w-8 rounded-full bg-red-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-6 w-6 bg-gradient-to-tr from-red-600 to-rose-500 border-2 border-white shadow-2xl items-center justify-center text-[11px] text-white font-black">📍</span>
          </div>
        `;

        originMarkerRef.current = new maplibregl.Marker({ element: el, draggable: true })
          .setLngLat(originCoords)
          .addTo(mapRef.current);

        originMarkerRef.current.on("dragend", () => {
          const lngLat = originMarkerRef.current?.getLngLat();
          if (lngLat && Number.isFinite(lngLat.lng) && Number.isFinite(lngLat.lat)) {
            onOriginChange([lngLat.lng, lngLat.lat]);
          }
        });
      } else {
        originMarkerRef.current.setLngLat(originCoords);
      }
    }
  }, [originCoords]);

  // Update Flood Front Marker & Camera on Current Step Change
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    if (
      currentStep &&
      Number.isFinite(currentStep.front_lon) &&
      Number.isFinite(currentStep.front_lat)
    ) {
      // Update flood front pulse marker
      if (!frontMarkerRef.current) {
        const frontEl = document.createElement("div");
        frontEl.innerHTML = `
          <div class="relative flex items-center justify-center pointer-events-none">
            <span class="animate-ping absolute inline-flex h-12 w-12 rounded-full bg-cyan-400 opacity-90"></span>
            <span class="relative inline-flex rounded-full h-5 w-5 bg-cyan-300 border-2 border-white shadow-2xl"></span>
          </div>
        `;
        frontMarkerRef.current = new maplibregl.Marker({ element: frontEl })
          .setLngLat([currentStep.front_lon, currentStep.front_lat])
          .addTo(mapRef.current);
      } else {
        frontMarkerRef.current.setLngLat([currentStep.front_lon, currentStep.front_lat]);
      }

      // Smoothly track / ease camera along the flood wave front if enabled
      if (followWave) {
        mapRef.current.easeTo({
          center: [currentStep.front_lon, currentStep.front_lat],
          duration: 700,
          easing: (t) => t,
        });
      }
    } else {
      if (frontMarkerRef.current) {
        frontMarkerRef.current.remove();
        frontMarkerRef.current = null;
      }
    }
  }, [currentStep, mapLoaded, followWave]);

  // Toggle 3D Terrain & Pitch
  const toggle3D = () => {
    const map = mapRef.current;
    if (!map) return;
    const nextState = !is3D;
    setIs3D(nextState);

    if (nextState) {
      map.setTerrain({ source: "terrainSource", exaggeration: 1.1 });
      map.easeTo({ pitch: 54, bearing: 115, duration: 900 });
    } else {
      map.setTerrain(null);
      map.easeTo({ pitch: 0, bearing: 0, duration: 900 });
    }
  };

  const flyToOrigin = () => {
    if (!mapRef.current) return;
    mapRef.current.flyTo({
      center: originCoords,
      zoom: 13.5,
      pitch: is3D ? 58 : 0,
      bearing: is3D ? 115 : 0,
      duration: 1400,
    });
  };

  const fitCorridor = () => {
    if (!mapRef.current) return;
    mapRef.current.flyTo({
      center: [85.35, 28.19],
      zoom: 12.2,
      pitch: is3D ? 56 : 0,
      bearing: is3D ? 110 : 0,
      duration: 1600,
    });
  };

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Center-Aligned Map Floating Tool Buttons Header Bar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-2xl p-1.5 rounded-2xl border border-slate-700/60 shadow-2xl">
        <button
          onClick={toggle3D}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold backdrop-blur-md transition-all shadow-md ${
            is3D
              ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-cyan-500/20 border border-cyan-300/40"
              : "bg-slate-800/80 text-slate-300 border border-slate-700/50 hover:bg-slate-700"
          }`}
          title="Toggle 3D Himalayan Terrain View"
        >
          <Mountain className="w-3.5 h-3.5" />
          {is3D ? "3D Terrain ON" : "2D Top-down"}
        </button>

        <button
          onClick={fitCorridor}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold backdrop-blur-md transition-all shadow-md bg-slate-800/80 text-slate-300 border border-slate-700/50 hover:bg-slate-700 hover:text-white"
          title="Fit full downstream flood corridor & buffer envelope"
        >
          <Navigation className="w-3.5 h-3.5 text-cyan-400 rotate-45" />
          Full Corridor
        </button>

        <button
          onClick={flyToOrigin}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold backdrop-blur-md transition-all shadow-md bg-slate-800/80 text-slate-300 border border-slate-700/50 hover:bg-slate-700 hover:text-white"
          title="Fly to breach origin"
        >
          <Crosshair className="w-3.5 h-3.5 text-red-400" />
          Focus Origin
        </button>

        {simulationResult && (
          <button
            onClick={() => setFollowWave(!followWave)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold backdrop-blur-md transition-all shadow-md ${
              followWave
                ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-blue-500/20 border border-blue-400/40"
                : "bg-slate-800/80 text-slate-300 border border-slate-700/50 hover:bg-slate-700"
            }`}
            title="Auto-follow flood wave as it flows downstream"
          >
            <Navigation className={`w-3.5 h-3.5 ${followWave ? "animate-pulse" : ""}`} />
            {followWave ? "Follow Wave ON" : "Follow Wave OFF"}
          </button>
        )}

        {selectedSettlement && (
          <div className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-xl text-xs font-semibold bg-amber-950/80 text-amber-300 border border-amber-500/50 shadow-md">
            <span>Focus: <b>{selectedSettlement.name}</b></span>
            <button
              onClick={() => onSelectSettlement?.(null)}
              className="p-1 hover:bg-amber-900/50 rounded-lg text-amber-400 hover:text-white transition-colors"
              title="Clear settlement focus"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {isPickingOrigin && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-amber-500/90 text-slate-950 font-semibold px-4 py-1.5 rounded-full text-xs shadow-xl backdrop-blur-md animate-bounce">
          🎯 Click anywhere along the river gorge to place breach origin
        </div>
      )}
    </div>
  );
}
