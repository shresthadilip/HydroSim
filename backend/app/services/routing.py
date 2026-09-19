import json
from pathlib import Path
from typing import Tuple, List, Dict, Any, Optional
import numpy as np
import pandas as pd
import rasterio
from pyproj import Transformer
from shapely.geometry import LineString, Point, shape
from shapely.ops import linemerge, transform as shp_transform

METRIC_CRS = "EPSG:32645"
WGS84 = "EPSG:4326"

_TO_METRIC = Transformer.from_crs(WGS84, METRIC_CRS, always_xy=True).transform
_TO_WGS84 = Transformer.from_crs(METRIC_CRS, WGS84, always_xy=True).transform

def _dist(a, b) -> float:
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5

def get_merged_river_line(geojson_path: Path, max_gap_m: float = 5000.0) -> LineString:
    data = json.loads(geojson_path.read_text(encoding="utf-8"))
    raw_lines = []
    for feat in data["features"]:
        geom = shape(feat["geometry"])
        if geom.geom_type == "LineString":
            raw_lines.append(geom)
        elif geom.geom_type == "MultiLineString":
            raw_lines.extend(geom.geoms)

    merged = linemerge(raw_lines)
    parts = [list(g.coords) for g in getattr(merged, "geoms", [merged])]

    threshold_deg = max_gap_m / 111_320.0
    seed = max(range(len(parts)), key=lambda i: len(parts[i]))
    chain = list(parts[seed])
    remaining = set(range(len(parts))) - {seed}

    while remaining:
        head, tail = chain[0], chain[-1]
        best = None
        for i in remaining:
            p = parts[i]
            for gap, end, fwd in (
                (_dist(tail, p[0]), "tail", True),
                (_dist(tail, p[-1]), "tail", False),
                (_dist(head, p[0]), "head", False),
                (_dist(head, p[-1]), "head", True),
            ):
                if best is None or gap < best[0]:
                    best = (gap, i, end, fwd)
        gap, i, end, fwd = best
        if gap > threshold_deg:
            break
        p = parts[i] if fwd else parts[i][::-1]
        if end == "tail":
            chain.extend(p[1:] if _dist(chain[-1], p[0]) < 1e-9 else p)
        else:
            chain = (p[:-1] if _dist(p[-1], chain[0]) < 1e-9 else p) + chain
        remaining.discard(i)

    line = LineString(chain)
    # Orient north -> south (upstream -> downstream)
    if line.coords[0][1] < line.coords[-1][1]:
        line = LineString(list(line.coords)[::-1])
    return line

def slice_downstream_from_origin(
    full_line_wgs84: LineString,
    origin_lon: float,
    origin_lat: float,
    dem_path: Path,
    max_distance_km: Optional[float] = None,
    step_m: float = 50.0
) -> Tuple[LineString, pd.DataFrame, float]:
    """Snaps origin point to river, slices downstream portion (up to max_distance_km), and builds DEM profile."""
    line_m = shp_transform(_TO_METRIC, full_line_wgs84)
    origin_pt_m = shp_transform(_TO_METRIC, Point(origin_lon, origin_lat))
    
    # Project origin onto river line
    snap_dist_m = line_m.project(origin_pt_m)
    total_len_m = line_m.length
    
    # Generate downstream distances from snapped point to end or distance limit
    remaining_len_m = total_len_m - snap_dist_m
    if remaining_len_m < 500: # If picked too close to end, take at least 500m
        snap_dist_m = max(0, total_len_m - 1000)
        remaining_len_m = total_len_m - snap_dist_m

    if max_distance_km is not None and max_distance_km > 0:
        target_len_m = min(remaining_len_m, float(max_distance_km) * 1000.0)
        end_dist_m = snap_dist_m + target_len_m
    else:
        end_dist_m = total_len_m
        target_len_m = remaining_len_m

    n_steps = max(int(target_len_m // step_m), 10)
    dists_along_full_m = np.linspace(snap_dist_m, end_dist_m, n_steps + 1)
    
    pts_m = [line_m.interpolate(d) for d in dists_along_full_m]
    pts_wgs = [shp_transform(_TO_WGS84, p) for p in pts_m]
    
    downstream_line = LineString([(p.x, p.y) for p in pts_wgs])
    
    lons = np.array([p.x for p in pts_wgs])
    lats = np.array([p.y for p in pts_wgs])
    rel_dists_km = (dists_along_full_m - snap_dist_m) / 1000.0
    
    # Sample DEM
    with rasterio.open(dem_path) as ds:
        nodata = ds.nodata
        elevations = np.array([v[0] for v in ds.sample(zip(lons, lats))], dtype="float64")
    
    if nodata is not None:
        elevations[elevations == nodata] = np.nan
        
    elevations = (
        pd.Series(elevations)
        .interpolate(limit_direction="both")
        .rolling(7, center=True, min_periods=1)
        .median()
        .to_numpy()
    )
    
    profile_df = pd.DataFrame({
        "lon": lons,
        "lat": lats,
        "distance_km": rel_dists_km,
        "elevation_m": elevations,
    })
    
    return downstream_line, profile_df, snap_dist_m
