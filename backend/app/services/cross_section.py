import json
from pathlib import Path
from typing import Dict, Any, Optional, List, Tuple
import numpy as np
import pandas as pd
import rasterio
from shapely.geometry import Point, LineString, mapping, shape
from shapely.ops import transform as shp_transform
from pyproj import Transformer

from app.core.config import RIVER_FILES
from app.models.schemas import CrossSectionRequest, CrossSectionResponse
from app.services.routing import get_merged_river_line, slice_downstream_from_origin
from app.services.hydraulic import compute_hydraulics_along_profile

METRIC_CRS = "EPSG:32645"
WGS84 = "EPSG:4326"

_TO_METRIC = Transformer.from_crs(WGS84, METRIC_CRS, always_xy=True).transform
_TO_WGS84 = Transformer.from_crs(METRIC_CRS, WGS84, always_xy=True).transform

def extract_valley_cross_section(req: CrossSectionRequest) -> CrossSectionResponse:
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
    
    # Convert full river line and downstream reach to Metric UTM for precise projection
    full_line_m = shp_transform(_TO_METRIC, full_line)
    downstream_m = shp_transform(_TO_METRIC, downstream_line)
    click_pt_m = shp_transform(_TO_METRIC, Point(req.click_lon, req.click_lat))
    
    # Project clicked point onto river centerline
    station_dist_m = downstream_m.project(click_pt_m)
    station_pt_m = downstream_m.interpolate(station_dist_m)
    station_dist_km = station_dist_m / 1000.0
    
    # Find closest station index in hydraulics_df
    dists_km = hydraulics_df["distance_km"].to_numpy()
    idx = int(np.argmin(np.abs(dists_km - station_dist_km)))
    row = hydraulics_df.iloc[idx]
    
    center_lon = float(row["lon"])
    center_lat = float(row["lat"])
    bed_elev = float(row["elevation_m"])
    water_depth = float(row["water_depth_m"])
    wse = float(row["wse_m"])
    velocity = float(row["velocity_ms"])
    discharge = float(row["q_peak_m3s"])
    arrival_time = float(row["arrival_time_min"])
    inundation_width = float(row["inundation_width_m"])
    
    # Calculate exact smoothed local tangent and perpendicular normal vector at station
    tangent_delta = 35.0
    d_fwd = min(downstream_m.length, station_dist_m + tangent_delta)
    d_bwd = max(0.0, station_dist_m - tangent_delta)
    p_fwd = downstream_m.interpolate(d_fwd)
    p_bwd = downstream_m.interpolate(d_bwd)
    
    dx = p_fwd.x - p_bwd.x
    dy = p_fwd.y - p_bwd.y
    hyp = np.hypot(dx, dy)
    if hyp > 1e-6:
        tx = dx / hyp
        ty = dy / hyp
    else:
        tx, ty = 0.0, -1.0
        
    # Normal unit vector strictly perpendicular to river flow: (nx, ny) . (tx, ty) = 0
    nx = -ty
    ny = tx
        
    # Cross-section span: cover full buffer zone width (e.g. 1000m on each side for 2km buffer)
    buffer_km = req.buffer_distance_km if req.buffer_distance_km else 2.0
    half_buffer_m = (buffer_km * 1000.0) / 2.0
    transect_span_m = max(600.0, half_buffer_m * 1.15)
    
    # Left and Right Bank Flood Offsets
    flood_half_w = max(15.0, inundation_width / 2.0)
    flood_left_off = -flood_half_w
    flood_right_off = flood_half_w
    
    # Generate 101 sample points including exact bank offsets and center
    raw_offsets = np.linspace(-transect_span_m, transect_span_m, 97)
    offsets_m = np.sort(np.unique(np.concatenate([raw_offsets, [flood_left_off, flood_right_off, 0.0]])))
    n_samples = len(offsets_m)
    
    transect_coords_wgs = []
    for off in offsets_m:
        x_m = station_pt_m.x + nx * off
        y_m = station_pt_m.y + ny * off
        pt_wgs = shp_transform(_TO_WGS84, Point(x_m, y_m))
        transect_coords_wgs.append((pt_wgs.x, pt_wgs.y))
        
    # Sample DEM elevations
    dem_path = cfg["dem_file"]
    dem_samples = []
    with rasterio.open(dem_path) as ds:
        nodata = ds.nodata
        samples = [v[0] for v in ds.sample(transect_coords_wgs)]
        for elev in samples:
            if nodata is not None and elev == nodata:
                dem_samples.append(np.nan)
            else:
                dem_samples.append(float(elev))
                
    # Clean DEM series
    dem_series = pd.Series(dem_samples).interpolate(limit_direction="both")
    if dem_series.isnull().all():
        dem_series = pd.Series(bed_elev + 0.003 * (offsets_m ** 2))
    dem_raw = dem_series.to_numpy()
    
    # Calculate local river curvature for bend superelevation
    d_prev = max(0.0, station_dist_m - 40.0)
    d_next = min(downstream_m.length, station_dist_m + 40.0)
    p_prev = downstream_m.interpolate(d_prev)
    p_next = downstream_m.interpolate(d_next)
    
    th1 = np.arctan2(station_pt_m.y - p_prev.y, station_pt_m.x - p_prev.x)
    th2 = np.arctan2(p_next.y - station_pt_m.y, p_next.x - station_pt_m.x)
    d_th = (th2 - th1 + np.pi) % (2 * np.pi) - np.pi
    ds_curv = max(1.0, (d_next - d_prev) / 2.0)
    local_curv = d_th / ds_curv # 1/m
    
    # Centrifugal Superelevation: delta_h = (v^2 * W * |kappa|) / g
    superelevation_m = min(0.35 * water_depth, (velocity ** 2 * inundation_width * abs(local_curv)) / 9.81)
    
    # Asymmetric bank water surface elevations
    wse_l = wse - (superelevation_m / 2.0) * np.sign(local_curv)
    wse_r = wse + (superelevation_m / 2.0) * np.sign(local_curv)

    # Compute physical riverbed channel bathymetry & blend with mountain valley DEM
    # 1) Inside flood extent (|off| <= flood_half_w): parabolic riverbed rising to bank WSEs
    # 2) Outside flood extent (|off| > flood_half_w): mountain valley slopes rising above respective bank WSEs
    elevations_clean = np.zeros(n_samples, dtype=float)
    
    # Find DEM values at left and right bank locations
    idx_l = np.argmin(np.abs(offsets_m - flood_left_off))
    idx_r = np.argmin(np.abs(offsets_m - flood_right_off))
    dem_at_l = dem_raw[idx_l]
    dem_at_r = dem_raw[idx_r]
    
    for i, off in enumerate(offsets_m):
        abs_off = abs(off)
        if abs_off <= flood_half_w:
            # Hydrodynamic riverbed bathymetry tilted by superelevation
            ratio = abs_off / max(1e-3, flood_half_w)
            bank_target_wse = wse_l if off < 0 else wse_r
            elevations_clean[i] = bed_elev + (bank_target_wse - bed_elev) * (ratio ** 1.7)
        elif off < flood_left_off:
            # Left mountain slope
            delta_slope = max(0.0, dem_raw[i] - dem_at_l)
            elevations_clean[i] = wse_l + delta_slope
        else:
            # Right mountain slope
            delta_slope = max(0.0, dem_raw[i] - dem_at_r)
            elevations_clean[i] = wse_r + delta_slope
            
    # Buffer left and right offsets
    buffer_left_off = -half_buffer_m
    buffer_right_off = half_buffer_m
    
    # Find nearest settlement
    nearest_settlement = None
    if cfg["cities_file"].exists():
        cities_data = json.loads(cfg["cities_file"].read_text(encoding="utf-8"))
        min_d = 999999.0
        for feat in cities_data.get("features", []):
            c_lon, c_lat = feat["geometry"]["coordinates"]
            c_pt_m = shp_transform(_TO_METRIC, Point(c_lon, c_lat))
            d_along = downstream_m.project(c_pt_m)
            dist_diff = abs(d_along - station_dist_m)
            if dist_diff < min_d and dist_diff < 3000:
                min_d = dist_diff
                nearest_settlement = feat["properties"].get("name", "")
                
    # Helper to construct densely segmented ribbon polygons that follow 3D terrain perfectly
    def make_segmented_ribbon(off_min: float, off_max: float, thickness_m: float = 1.0) -> List[List[float]]:
        # Filter offsets within [off_min, off_max]
        sub_offsets = [float(o) for o in offsets_m if (off_min - 1e-3) <= o <= (off_max + 1e-3)]
        if len(sub_offsets) < 2:
            sub_offsets = [off_min, off_max]
        else:
            if abs(sub_offsets[0] - off_min) > 1e-3:
                sub_offsets.insert(0, off_min)
            if abs(sub_offsets[-1] - off_max) > 1e-3:
                sub_offsets.append(off_max)
                
        half_t = thickness_m / 2.0
        ring = []
        
        # Forward edge along +half_t (positive stream-tangent offset)
        for off in sub_offsets:
            pt = shp_transform(_TO_WGS84, Point(station_pt_m.x + nx * off + tx * half_t, station_pt_m.y + ny * off + ty * half_t))
            ring.append([round(pt.x, 7), round(pt.y, 7)])
            
        # Backward edge along -half_t (negative stream-tangent offset)
        for off in reversed(sub_offsets):
            pt = shp_transform(_TO_WGS84, Point(station_pt_m.x + nx * off - tx * half_t, station_pt_m.y + ny * off - ty * half_t))
            ring.append([round(pt.x, 7), round(pt.y, 7)])
            
        # Close polygon ring
        ring.append(ring[0])
        return ring

    # 1. 3D Flood Extent Blue Vertical Plane (Strictly across flood channel between left & right bank)
    flood_plane_ring = make_segmented_ribbon(flood_left_off, flood_right_off, thickness_m=1.0)
    flood_plane_h = max(20.0, water_depth * 3.0)
    flood_curtains_3d_geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [flood_plane_ring]
                },
                "properties": {
                    "name": "Flood Extent Vertical Plane",
                    "height": round(flood_plane_h, 1),
                    "base_height": 0.0,
                    "wse_m": round(wse, 1),
                    "depth_m": round(water_depth, 2),
                    "top_width_m": round(abs(flood_right_off - flood_left_off), 1),
                    "color": "#00e5ff"
                }
            }
        ]
    }

    # 2. 3D 2km Buffer Orange Vertical Plane (Outside flood channel wings, zero overlap with blue plane)
    buf_ring_l = make_segmented_ribbon(buffer_left_off, flood_left_off, thickness_m=1.0)
    buf_ring_r = make_segmented_ribbon(flood_right_off, buffer_right_off, thickness_m=1.0)
    buf_plane_h = 35.0
    buffer_curtains_3d_geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "MultiPolygon",
                    "coordinates": [[buf_ring_l], [buf_ring_r]]
                },
                "properties": {
                    "name": "2km Buffer Vertical Plane",
                    "height": round(buf_plane_h, 1),
                    "base_height": 0.0,
                    "color": "#e8871e"
                }
            }
        ]
    }

    water_body_3d_geojson = None

    # 4. 3D Sampled Valley Profile Line
    transect_profile_3d_geojson = {
        "type": "Feature",
        "geometry": {
            "type": "LineString",
            "coordinates": [[transect_coords_wgs[i][0], transect_coords_wgs[i][1], float(elevations_clean[i])] for i in range(n_samples)]
        },
        "properties": {
            "kind": "valley_profile_3d",
            "station_km": round(station_dist_km, 2)
        }
    }

    # Transect Cut Line GeoJSON Feature (Full multi-point line across the valley)
    transect_line_geojson = {
        "type": "Feature",
        "geometry": {
            "type": "LineString",
            "coordinates": transect_coords_wgs
        },
        "properties": {
            "kind": "cross_section_transect",
            "station_km": round(station_dist_km, 2),
            "depth_m": round(water_depth, 2),
            "wse_m": round(wse, 1)
        }
    }
    
    return CrossSectionResponse(
        success=True,
        station_distance_km=round(station_dist_km, 2),
        nearest_settlement=nearest_settlement,
        bed_elevation_m=round(bed_elev, 1),
        water_depth_m=round(water_depth, 2),
        wse_m=round(wse, 1),
        top_width_m=round(abs(flood_right_off - flood_left_off), 1),
        velocity_ms=round(velocity, 2),
        discharge_m3s=round(discharge, 1),
        arrival_time_min=round(arrival_time, 1),
        buffer_distance_km=round(buffer_km, 2),
        transect_offsets_m=[round(float(o), 1) for o in offsets_m],
        terrain_elevations_m=[round(float(e), 1) for e in elevations_clean],
        flood_left_offset_m=round(float(flood_left_off), 1),
        flood_right_offset_m=round(float(flood_right_off), 1),
        buffer_left_offset_m=round(float(buffer_left_off), 1),
        buffer_right_offset_m=round(float(buffer_right_off), 1),
        transect_line_geojson=transect_line_geojson,
        center_coords=[round(center_lon, 6), round(center_lat, 6)],
        water_body_3d_geojson=water_body_3d_geojson,
        flood_curtains_3d_geojson=flood_curtains_3d_geojson,
        buffer_curtains_3d_geojson=buffer_curtains_3d_geojson,
        transect_profile_3d_geojson=transect_profile_3d_geojson
    )
