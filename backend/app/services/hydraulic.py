import numpy as np
import pandas as pd
from scipy.optimize import root_scalar

def solve_manning_depth(Q: float, S0: float, n: float, b0: float = 25.0, z_side: float = 2.5) -> float:
    """Solves for water depth y (m) in a trapezoidal cross-section given discharge Q (m³/s)."""
    if Q <= 0 or S0 <= 0:
        return 0.5
    
    S0 = max(0.0005, S0)
    
    def manning_residual(y):
        if y <= 0:
            return -Q
        area = (b0 + z_side * y) * y
        wetted_perimeter = b0 + 2.0 * y * np.sqrt(1.0 + z_side ** 2)
        r_hyd = area / wetted_perimeter
        q_calc = (1.0 / n) * area * (r_hyd ** (2.0 / 3.0)) * np.sqrt(S0)
        return q_calc - Q
    
    try:
        sol = root_scalar(manning_residual, bracket=[0.01, 100.0], method="brentq")
        return max(0.2, float(sol.root))
    except Exception:
        # Fallback approximation for wide channel: y ≈ ((Q * n) / (b0 * sqrt(S0)))^(3/5)
        return max(0.5, float(((Q * n) / (b0 * np.sqrt(S0))) ** 0.6))

def compute_hydraulics_along_profile(
    profile_df: pd.DataFrame,
    volume_m3: float,
    duration_hours: float,
    manning_n: float = 0.045
) -> pd.DataFrame:
    """Computes downstream peak discharge, depth, flood width, and arrival time along the profile."""
    df = profile_df.copy()
    duration_sec = max(600.0, duration_hours * 3600.0)
    
    # Base peak discharge at origin (approx triangular/trapezoidal hydrograph peak)
    q_peak_origin = (volume_m3 / duration_sec) * 1.5
    
    # Downstream attenuation factor k (mountain valleys have some valley storage & attenuation)
    attenuation_rate = 0.006 # ~0.6% reduction per km
    
    n_pts = len(df)
    dists_km = df["distance_km"].to_numpy()
    elevs_m = df["elevation_m"].to_numpy()
    
    # Compute local bed slope S0
    slopes = np.zeros(n_pts)
    for i in range(n_pts):
        if i == 0:
            dz = elevs_m[0] - elevs_m[min(5, n_pts - 1)]
            dx = (dists_km[min(5, n_pts - 1)] - dists_km[0]) * 1000.0
        elif i == n_pts - 1:
            dz = elevs_m[max(0, n_pts - 6)] - elevs_m[-1]
            dx = (dists_km[-1] - dists_km[max(0, n_pts - 6)]) * 1000.0
        else:
            dz = elevs_m[max(0, i - 2)] - elevs_m[min(n_pts - 1, i + 2)]
            dx = (dists_km[min(n_pts - 1, i + 2)] - dists_km[max(0, i - 2)]) * 1000.0
        slopes[i] = max(0.001, dz / max(10.0, dx))
    
    # Smooth slope
    slopes = pd.Series(slopes).rolling(5, center=True, min_periods=1).median().to_numpy()
    
    q_peaks = q_peak_origin * np.exp(-attenuation_rate * dists_km)
    
    # Valley bottom width increases downstream from gorge (30m) to wider valley (110m)
    b0_widths = np.interp(dists_km, [0, 80], [30.0, 110.0])
    # Valley side bank slope (horizontal : vertical ratio)
    z_banks = np.interp(dists_km, [0, 80], [3.5, 6.5])
    
    depths = np.zeros(n_pts)
    widths = np.zeros(n_pts)
    velocities = np.zeros(n_pts)
    celerities = np.zeros(n_pts)
    
    for i in range(n_pts):
        z_s = z_banks[i]
        b0 = b0_widths[i]
        y = solve_manning_depth(q_peaks[i], slopes[i], manning_n, b0=b0, z_side=z_s)
        area = (b0 + z_s * y) * y
        v = q_peaks[i] / max(1.0, area)
        c = 1.67 * v # Wave celerity for turbulent friction flow
        
        depths[i] = y
        # Top bank-to-bank water surface width intersecting both valley banks
        widths[i] = b0 + 2.0 * z_s * y
        velocities[i] = v
        celerities[i] = max(1.0, c)
    
    # Calculate arrival times t(x) = cumulative sum of dx / celerity
    arrival_times_sec = np.zeros(n_pts)
    for i in range(1, n_pts):
        dx_m = (dists_km[i] - dists_km[i - 1]) * 1000.0
        c_avg = (celerities[i] + celerities[i - 1]) / 2.0
        arrival_times_sec[i] = arrival_times_sec[i - 1] + (dx_m / c_avg)
    
    df["slope"] = slopes
    df["q_peak_m3s"] = q_peaks
    df["water_depth_m"] = depths
    df["wse_m"] = df["elevation_m"] + depths
    df["inundation_width_m"] = widths
    df["velocity_ms"] = velocities
    df["arrival_time_min"] = arrival_times_sec / 60.0
    
    return df
