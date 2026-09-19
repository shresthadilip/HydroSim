import json
from pathlib import Path
from typing import List, Dict, Any, Tuple
import numpy as np
import pandas as pd
from shapely.geometry import Point, Polygon, MultiPolygon, LineString, mapping
from shapely.ops import unary_union, transform as shp_transform
from pyproj import Transformer

from app.core.config import RIVER_FILES
from app.models.schemas import (
    SimulationRequest,
    SimulationResponse,
    SimulationSummary,
    SimulationStep,
    AffectedCity,
)
from app.services.routing import get_merged_river_line, slice_downstream_from_origin
from app.services.hydraulic import compute_hydraulics_along_profile

import rasterio

METRIC_CRS = "EPSG:32645"
WGS84 = "EPSG:4326"

_TO_METRIC = Transformer.from_crs(WGS84, METRIC_CRS, always_xy=True).transform
_TO_WGS84 = Transformer.from_crs(METRIC_CRS, WGS84, always_xy=True).transform

def build_wse_dem_inundation_polygon(
    hydraulics_df: pd.DataFrame,
    dem_path: Path,
    max_segments: int = 350,
    transect_half_width_m: float = 600.0,
    n_transect_samples: int = 25,
    min_half_width_m: float = 30.0
) -> Dict[str, Any]:
    """
    Computes the flood extent polygon by evaluating Water Surface Elevation (WSE = Z_bed + depth)
    along the downstream river centerline and intersecting horizontal WSE planes with the 3D DEM valley walls.
    """
    n_pts = len(hydraulics_df)
    if n_pts < 2:
        return {
            "type": "FeatureCollection",
            "features": [],
            "properties": {"area_km2": 0.0}
        }

    # 1. Downstream river centerline feature
    line_coords = [[round(float(r.lon), 6), round(float(r.lat), 6)] for _, r in hydraulics_df.iterrows()]
    line_feature = {
        "type": "Feature",
        "geometry": {
            "type": "LineString",
            "coordinates": line_coords,
        },
        "properties": {
            "kind": "centerline",
            "max_depth_m": round(float(hydraulics_df["water_depth_m"].max()), 2),
            "front_distance_km": round(float(hydraulics_df["distance_km"].iloc[-1]), 2),
        }
    }

    # 2. Sample stations along reach
    n_samples = min(max_segments, n_pts)
    sample_indices = np.linspace(0, n_pts - 1, n_samples, dtype=int)
    sampled = hydraulics_df.iloc[sample_indices].reset_index(drop=True)

    # Metric coordinates
    pts_m = np.array([
        shp_transform(_TO_METRIC, Point(sampled.at[i, "lon"], sampled.at[i, "lat"])).coords[0]
        for i in range(len(sampled))
    ])
    
    wse_arr = sampled["wse_m"].to_numpy() if "wse_m" in sampled.columns else (sampled["elevation_m"] + sampled["water_depth_m"]).to_numpy()
    z_bed_arr = sampled["elevation_m"].to_numpy()
    depth_arr = sampled["water_depth_m"].to_numpy()
    widths_approx = sampled["inundation_width_m"].to_numpy()

    # Transect offset distances (geometric distribution from 8m to 600m)
    offsets_pos = np.geomspace(8.0, transect_half_width_m, n_transect_samples)

    # Pre-calculate normals and channel curvature for bend superelevation
    normals = np.zeros((len(sampled), 2))
    curvatures = np.zeros(len(sampled))

    for i in range(len(sampled)):
        if i == 0:
            dx = pts_m[1, 0] - pts_m[0, 0]
            dy = pts_m[1, 1] - pts_m[0, 1]
            th_next = np.arctan2(dy, dx)
            th_prev = th_next
            ds = max(1.0, np.hypot(dx, dy))
        elif i == len(sampled) - 1:
            dx = pts_m[-1, 0] - pts_m[-2, 0]
            dy = pts_m[-1, 1] - pts_m[-2, 1]
            th_prev = np.arctan2(dy, dx)
            th_next = th_prev
            ds = max(1.0, np.hypot(dx, dy))
        else:
            dx1 = pts_m[i, 0] - pts_m[i - 1, 0]
            dy1 = pts_m[i, 1] - pts_m[i - 1, 1]
            dx2 = pts_m[i + 1, 0] - pts_m[i, 0]
            dy2 = pts_m[i + 1, 1] - pts_m[i, 1]
            th_prev = np.arctan2(dy1, dx1)
            th_next = np.arctan2(dy2, dx2)
            ds = max(1.0, (np.hypot(dx1, dy1) + np.hypot(dx2, dy2)) / 2.0)

            dx = pts_m[i + 1, 0] - pts_m[i - 1, 0]
            dy = pts_m[i + 1, 1] - pts_m[i - 1, 1]

        hyp = np.hypot(dx, dy)
        if hyp > 1e-6:
            normals[i] = [-dy / hyp, dx / hyp]
        else:
            normals[i] = [0.0, 1.0]

        d_theta = (th_next - th_prev + np.pi) % (2 * np.pi) - np.pi
        curvatures[i] = d_theta / ds

    # Smooth curvature along reach
    curvatures = pd.Series(curvatures).rolling(5, center=True, min_periods=1).mean().to_numpy()

    # Batch sample DEM across all transect points if DEM exists
    dem_exists = dem_path.exists()
    left_bank_widths = np.zeros(len(sampled))
    right_bank_widths = np.zeros(len(sampled))
    vel_arr = sampled["velocity_ms"].to_numpy() if "velocity_ms" in sampled.columns else np.full(len(sampled), 4.5)

    if dem_exists:
        try:
            # Build list of all query coordinates
            all_query_wgs = []
            index_map = [] # (station_idx, side: 'L'/'R', offset_idx)

            for i in range(len(sampled)):
                nx, ny = normals[i]
                for k, off in enumerate(offsets_pos):
                    # Left bank (+)
                    xl, yl = pts_m[i, 0] + nx * off, pts_m[i, 1] + ny * off
                    pt_wgs_l = shp_transform(_TO_WGS84, Point(xl, yl))
                    all_query_wgs.append((pt_wgs_l.x, pt_wgs_l.y))
                    index_map.append((i, 'L', k))

                    # Right bank (-)
                    xr, yr = pts_m[i, 0] - nx * off, pts_m[i, 1] - ny * off
                    pt_wgs_r = shp_transform(_TO_WGS84, Point(xr, yr))
                    all_query_wgs.append((pt_wgs_r.x, pt_wgs_r.y))
                    index_map.append((i, 'R', k))

            with rasterio.open(dem_path) as ds:
                nodata = ds.nodata
                elev_samples = [v[0] for v in ds.sample(all_query_wgs)]

            # Map elevations back to stations and find intersection
            station_left_elevs = {i: [] for i in range(len(sampled))}
            station_right_elevs = {i: [] for i in range(len(sampled))}

            for (i, side, k), elev in zip(index_map, elev_samples):
                if nodata is not None and elev == nodata:
                    elev = np.nan
                if side == 'L':
                    station_left_elevs[i].append((offsets_pos[k], elev))
                else:
                    station_right_elevs[i].append((offsets_pos[k], elev))

            for i in range(len(sampled)):
                wse_center = wse_arr[i]
                v = max(1.0, vel_arr[i])
                w_approx = max(20.0, float(widths_approx[i]))
                kap = curvatures[i] # +: turning left, -: turning right
                
                # Centrifugal superelevation: delta_h = (v^2 * W * |kappa|) / g
                delta_h = min(0.35 * depth_arr[i], (v ** 2 * w_approx * abs(kap)) / 9.81)
                
                # Turning Left (kap > 0): Right bank is outer (+delta_h/2), Left bank is inner (-delta_h/2)
                # Turning Right (kap < 0): Left bank is outer (+delta_h/2), Right bank is inner (-delta_h/2)
                wse_left = wse_center - (delta_h / 2.0) * np.sign(kap)
                wse_right = wse_center + (delta_h / 2.0) * np.sign(kap)

                hw_default = max(min_half_width_m, float(widths_approx[i]) / 2.0)

                # Left bank intersection with wse_left
                l_found = False
                prev_off, prev_elev = 0.0, z_bed_arr[i]
                for off, elev in station_left_elevs[i]:
                    if not np.isnan(elev) and elev >= wse_left:
                        dz = elev - prev_elev
                        if dz > 1e-4:
                            frac = (wse_left - prev_elev) / dz
                            interp_off = prev_off + frac * (off - prev_off)
                        else:
                            interp_off = off
                        left_bank_widths[i] = max(min_half_width_m, interp_off)
                        l_found = True
                        break
                    prev_off, prev_elev = off, elev
                if not l_found:
                    left_bank_widths[i] = hw_default

                # Right bank intersection with wse_right
                r_found = False
                prev_off, prev_elev = 0.0, z_bed_arr[i]
                for off, elev in station_right_elevs[i]:
                    if not np.isnan(elev) and elev >= wse_right:
                        dz = elev - prev_elev
                        if dz > 1e-4:
                            frac = (wse_right - prev_elev) / dz
                            interp_off = prev_off + frac * (off - prev_off)
                        else:
                            interp_off = off
                        right_bank_widths[i] = max(min_half_width_m, interp_off)
                        r_found = True
                        break
                    prev_off, prev_elev = off, elev
                if not r_found:
                    right_bank_widths[i] = hw_default
                    right_bank_widths[i] = hw_default
        except Exception as e:
            print("DEM cross-section sampling fallback:", e)
            for i in range(len(sampled)):
                hw = max(min_half_width_m, float(widths_approx[i]) / 2.0)
                left_bank_widths[i] = hw
                right_bank_widths[i] = hw
    else:
        for i in range(len(sampled)):
            hw = max(min_half_width_m, float(widths_approx[i]) / 2.0)
            left_bank_widths[i] = hw
            right_bank_widths[i] = hw

    # Smooth the bank intersection widths slightly along the corridor to prevent single-pixel spikes
    left_bank_widths = pd.Series(left_bank_widths).rolling(5, center=True, min_periods=1).mean().to_numpy()
    right_bank_widths = pd.Series(right_bank_widths).rolling(5, center=True, min_periods=1).mean().to_numpy()

    # Construct continuous polygon segments from the left and right bank intersections
    buffers = []
    for i in range(len(sampled) - 1):
        p1 = Point(pts_m[i])
        p2 = Point(pts_m[i + 1])
        seg = LineString([p1, p2])
        
        avg_hw = max(min_half_width_m, float(left_bank_widths[i] + right_bank_widths[i] + left_bank_widths[i + 1] + right_bank_widths[i + 1]) / 4.0)
        buffers.append(seg.buffer(avg_hw, cap_style=1, join_style=1))

    merged_poly = unary_union(buffers)
    if merged_poly.geom_type == "GeometryCollection":
        polys = [g for g in merged_poly.geoms if g.geom_type in ("Polygon", "MultiPolygon")]
        merged_poly = unary_union(polys) if polys else Polygon()
    elif merged_poly.geom_type not in ("Polygon", "MultiPolygon"):
        merged_poly = Polygon()

    merged_poly_simple = merged_poly.simplify(6.0, preserve_topology=True)
    if merged_poly_simple.geom_type == "GeometryCollection":
        polys = [g for g in merged_poly_simple.geoms if g.geom_type in ("Polygon", "MultiPolygon")]
        merged_poly_simple = unary_union(polys) if polys else Polygon()

    poly_wgs = shp_transform(_TO_WGS84, merged_poly_simple)
    
    total_area_km2 = round(float(merged_poly.area / 1_000_000.0), 2)
    max_bank_width = round(float((left_bank_widths + right_bank_widths).max()), 1)

    poly_feature = {
        "type": "Feature",
        "geometry": mapping(poly_wgs),
        "properties": {
            "kind": "wse_flood_extent",
            "max_wse_m": round(float(wse_arr.max()), 1),
            "max_depth_m": round(float(depth_arr.max()), 2),
            "avg_depth_m": round(float(depth_arr.mean()), 2),
            "max_width_m": max_bank_width,
            "front_distance_km": round(float(sampled["distance_km"].iloc[-1]), 2),
            "arrival_time_min": round(float(sampled["arrival_time_min"].iloc[-1]), 1),
            "area_km2": total_area_km2,
        }
    }

    return {
        "type": "FeatureCollection",
        "features": [poly_feature],
        "properties": poly_feature["properties"]
    }

def build_river_buffer_polygon(downstream_line_wgs84: LineString, buffer_km: float = 2.0) -> Dict[str, Any]:
    """Generates the configured buffer zone boundary (e.g. 2km yellow dotted line) around the downstream reach."""
    line_m = shp_transform(_TO_METRIC, downstream_line_wgs84)
    buffer_m = max(200.0, float(buffer_km) * 1000.0)
    buf_poly_m = line_m.buffer(buffer_m, cap_style=1, join_style=1)
    if buf_poly_m.geom_type == "GeometryCollection":
        polys = [g for g in buf_poly_m.geoms if g.geom_type in ("Polygon", "MultiPolygon")]
        buf_poly_m = unary_union(polys) if polys else Polygon()
    elif buf_poly_m.geom_type not in ("Polygon", "MultiPolygon"):
        buf_poly_m = Polygon()

    buf_poly_simple = buf_poly_m.simplify(15.0, preserve_topology=True)
    if buf_poly_simple.geom_type == "GeometryCollection":
        polys = [g for g in buf_poly_simple.geoms if g.geom_type in ("Polygon", "MultiPolygon")]
        buf_poly_simple = unary_union(polys) if polys else Polygon()

    buf_poly_wgs = shp_transform(_TO_WGS84, buf_poly_simple)
    
    return {
        "type": "Feature",
        "geometry": mapping(buf_poly_wgs),
        "properties": {
            "kind": "buffer_zone",
            "buffer_km": buffer_km,
            "area_km2": round(float(buf_poly_m.area / 1_000_000.0), 2),
        }
    }

def find_affected_settlements(
    cities_geojson_path: Path,
    downstream_line_wgs84: LineString,
    hydraulics_df: pd.DataFrame,
    max_offset_m: float = 3500.0
) -> List[AffectedCity]:
    """Finds settlements adjacent to the downstream segment and computes arrival time & depth."""
    if not cities_geojson_path.exists():
        return []
        
    data = json.loads(cities_geojson_path.read_text(encoding="utf-8"))
    line_m = shp_transform(_TO_METRIC, downstream_line_wgs84)
    total_len_m = line_m.length
    
    affected = []
    dists_km = hydraulics_df["distance_km"].to_numpy()
    depths = hydraulics_df["water_depth_m"].to_numpy()
    widths = hydraulics_df["inundation_width_m"].to_numpy()
    arrival_times = hydraulics_df["arrival_time_min"].to_numpy()
    elevs = hydraulics_df["elevation_m"].to_numpy()
    
    for feat in data.get("features", []):
        props = feat.get("properties", {})
        lon, lat = feat["geometry"]["coordinates"]
        pt_m = shp_transform(_TO_METRIC, Point(lon, lat))
        
        dist_along_m = line_m.project(pt_m)
        offset_m = pt_m.distance(line_m.interpolate(dist_along_m))
        
        # Check if point falls within downstream range and within valley buffer
        if 0 <= dist_along_m <= total_len_m and offset_m <= max_offset_m:
            dist_km = dist_along_m / 1000.0
            idx = int(np.interp(dist_km, dists_km, np.arange(len(dists_km))))
            
            affected.append(AffectedCity(
                name=props.get("name_en") or props.get("name") or "Settlement",
                distance_km=round(float(dist_km), 2),
                elevation_m=round(float(elevs[idx]), 1),
                arrival_time_min=round(float(arrival_times[idx]), 1),
                peak_depth_m=round(float(depths[idx]), 2),
                inundation_width_m=round(float(widths[idx]), 1),
                lon=round(float(lon), 5),
                lat=round(float(lat), 5),
            ))
            
    affected.sort(key=lambda c: c.distance_km)
    return affected

def run_flood_simulation(req: SimulationRequest) -> SimulationResponse:
    cfg = RIVER_FILES.get(req.river_id, RIVER_FILES["bhotekoshi"])
    
    full_line = get_merged_river_line(cfg["file"])
    downstream_line, profile_df, snap_dist_m = slice_downstream_from_origin(
        full_line,
        req.origin_lon,
        req.origin_lat,
        cfg["dem_file"],
        max_distance_km=req.max_distance_km
    )
    
    manning_n = req.manning_n or cfg.get("manning_n", 0.045)
    hydraulics_df = compute_hydraulics_along_profile(
        profile_df,
        volume_m3=req.volume_m3,
        duration_hours=req.duration_hours,
        manning_n=manning_n
    )
    
    # 1. Full estimated WSE-DEM intersected flood extent polygon footprint
    affected_area_polygon = build_wse_dem_inundation_polygon(
        hydraulics_df,
        dem_path=cfg["dem_file"],
        max_segments=350,
        min_half_width_m=30.0
    )
    total_area_km2 = float(affected_area_polygon.get("properties", {}).get("area_km2", 23.2))

    # 2. Generate 40 smooth animation time steps for active channel water wave (Blue Surge Wave)
    n_pts = len(hydraulics_df)
    n_steps = 40
    step_indices = np.linspace(2, n_pts, n_steps, dtype=int)
    
    steps: List[SimulationStep] = []
    
    for idx in step_indices:
        curr_row = hydraulics_df.iloc[idx - 1]
        steps.append(SimulationStep(
            time_min=round(float(curr_row["arrival_time_min"]), 1),
            distance_km=round(float(curr_row["distance_km"]), 2),
            front_lon=round(float(curr_row["lon"]), 5),
            front_lat=round(float(curr_row["lat"]), 5),
            peak_discharge_m3s=round(float(curr_row["q_peak_m3s"]), 1),
            water_depth_m=round(float(curr_row["water_depth_m"]), 2),
            inundation_width_m=round(float(curr_row["inundation_width_m"]), 1),
        ))
    
    affected_settlements = find_affected_settlements(
        cfg["cities_file"],
        downstream_line,
        hydraulics_df
    )
    
    total_len_km = float(hydraulics_df["distance_km"].iloc[-1])
    total_time_min = float(hydraulics_df["arrival_time_min"].iloc[-1])
    max_depth = float(hydraulics_df["water_depth_m"].max())
    max_width = float(hydraulics_df["inundation_width_m"].max())
    elev_drop = float(hydraulics_df["elevation_m"].iloc[0] - hydraulics_df["elevation_m"].iloc[-1])
    peak_q0 = float(hydraulics_df["q_peak_m3s"].iloc[0])
    
    buffer_km = req.buffer_distance_km if req.buffer_distance_km is not None else 2.0
    buffer_zone_polygon = build_river_buffer_polygon(downstream_line, buffer_km=buffer_km)

    summary = SimulationSummary(
        total_volume_m3=req.volume_m3,
        duration_hours=req.duration_hours,
        peak_discharge_m3s=round(peak_q0, 1),
        total_river_length_km=round(total_len_km, 2),
        total_transit_time_min=round(total_time_min, 1),
        max_flood_depth_m=round(max_depth, 2),
        max_flood_width_m=round(max_width, 1),
        elevation_drop_m=round(elev_drop, 1),
        total_affected_area_km2=round(total_area_km2, 2),
        buffer_distance_km=round(float(buffer_km), 2)
    )
    
    profile_dict = {
        "distance_km": [round(float(v), 3) for v in hydraulics_df["distance_km"]],
        "elevation_m": [round(float(v), 1) for v in hydraulics_df["elevation_m"]],
        "water_depth_m": [round(float(v), 2) for v in hydraulics_df["water_depth_m"]],
        "arrival_time_min": [round(float(v), 1) for v in hydraulics_df["arrival_time_min"]],
        "lon": [round(float(v), 5) for v in hydraulics_df["lon"]],
        "lat": [round(float(v), 5) for v in hydraulics_df["lat"]],
    }
    
    return SimulationResponse(
        success=True,
        summary=summary,
        affected_settlements=affected_settlements,
        affected_area_polygon=affected_area_polygon,
        buffer_zone_polygon=buffer_zone_polygon,
        steps=steps,
        profile=profile_dict
    )
