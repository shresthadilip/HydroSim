# HydroSim 3D: Flood Routing, Hydraulic Modeling & Valley Risk Analysis System

**HydroSim 3D** is a web-based hydraulic flood simulation, flood wave routing, and 3D terrain risk visualization platform designed for steep mountainous valleys and river basins (such as the Bhotekoshi–Trishuli river corridor in Rasuwa, Nepal).

The application pairs a high-performance **FastAPI** scientific simulation engine with an interactive **Next.js** and **MapLibre GL 3D** frontend, delivering real-time hydraulic routing, dynamic flood extent mapping, automated downstream settlement vulnerability analytics, and interactive valley cross-section profiling.

---

## Key Features

- **Dynamic 1D Hydraulic Solver**: Implements the Manning-Strickler open-channel flow equations coupled with Brent's numerical root solver to compute depth, velocity, discharge, wave celerity, and arrival time at high spatial resolution along the river profile.
- **Topographic Terrain Extraction**: Direct sampling of high-resolution satellite Digital Elevation Models (DEM) for river thalweg bed elevations, slope gradients, and mountain valley cross-sections.
- **Geodesic & Metric Cartography**: Seamless UTM projection and reverse-geodesic transformations (`EPSG:32645` $\leftrightarrow$ `EPSG:4326`) for millimeter-accurate distance, normal vector, and polygon corridor generation.
- **Dynamic Bank-to-Bank Flood Extent**: Computes the exact physical waterline boundary where Water Surface Elevation ($\text{WSE}$) intersects the rising mountain valley topography on both banks.
- **3D Valley Cross-Section Analyzer**: Interactive, perpendicular slice generation at any river station upon clicking the map. Features hydrodynamic sub-grid channel bathymetry carving, vertical depth dimensions, and 3D extruded vertical planes in the 3D terrain.
- **Downstream Settlement Vulnerability Analytics**: Automated proximity detection and impact forecasting (peak flood depth, arrival time, water surface elevation) for downstream villages, infrastructure, and crossings.
- **Interactive 4D Timeline Player**: Scrubbable playback with time-synchronized flood front propagation, dynamic corridor growth, animated velocity wave vectors, and synchronized settlement warning badges.
- **Collapsible Dual-Drawer UI**: Glassmorphic dark-mode control panels designed to match on left and right, ensuring unobstructed 3D terrain visibility.

---

## Technical & Mathematical Formulations

This section provides the complete mathematical and physical principles governing HydroSim 3D.

```
                                      Mountain Valley Slope
               \                                                       /
                \                                                     /
   Water Plane   \===================================================/   <-- Water Surface Elevation: WSE = Z_bed + h
   Intersection   \                   WATER BODY                    /    <-- (Inundated Cross-Section Area: A)
                   \                                               /
                    \__________________ RIVERBED _________________/      <-- Thalweg Bed Elevation: Z_bed
                                    <-- Width W -->
```

---

### 1. Inflow Hydrograph & Peak Outflow Decay

When an upstream reservoir, glacial lake, or landslide dam releases a volume $V$ ($\text{m}^3$) over breach duration $t_d$ ($\text{hours}$), the initial peak outflow discharge $Q_{0}$ at the breach origin is modeled using a triangular/trapezoidal unit hydrograph peak:

$$Q_{0} = 1.5 \cdot \frac{V}{t_d \cdot 3600}$$

As the flood wave routes downstream through a mountain valley, channel storage, bed friction, and turbulent dispersion attenuate the peak discharge over stream distance $x$ ($\text{km}$):

$$Q_p(x) = Q_0 \cdot \exp(-k \cdot x)$$

where $k \approx 0.006\text{ km}^{-1}$ represents the spatial peak attenuation rate in steep Himalayan gorges.

---

### 2. Terrain Slope Derivation from DEM

The river centerline is discretized into station points $P_i(lon_i, lat_i)$ with cumulative downstream distance $x_i$. Elevations $Z_{\text{bed}}(x_i)$ are sampled directly from the 30m Digital Elevation Model GeoTIFF.

The local energy / bed slope $S_0(x_i)$ is computed using central finite differences across neighboring stations:

$$S_0(x_i) = \max\left(0.0005, \; \frac{Z_{\text{bed}}(x_{i-2}) - Z_{\text{bed}}(x_{i+2})}{x_{i+2} - x_{i-2}}\right)$$

Slopes are smoothed using a centered rolling median window ($W = 5$) to filter DEM raster quantization artifacts while preserving steep rapid drops.

---

### 3. 1D Manning-Strickler Hydraulic Solver

Open-channel flow depth $y(x)$ (or $h$) is computed by equating the physical discharge $Q(x)$ to the **Manning-Strickler equation** for a parameterized valley cross-section:

$$Q = \frac{1}{n} \cdot A(y) \cdot \left[R_h(y)\right]^{2/3} \cdot S_0^{1/2}$$

For a trapezoidal / parabolic mountain valley with base width $b_0(x)$ and side-slope ratio $z_{\text{side}}(x)$ (horizontal : vertical):
- **Wetted Cross-Sectional Area**:
  $$A(y) = (b_0 + z_{\text{side}} \cdot y) \cdot y$$
- **Wetted Perimeter**:
  $$P(y) = b_0 + 2 \cdot y \cdot \sqrt{1 + z_{\text{side}}^2}$$
- **Hydraulic Radius**:
  $$R_h(y) = \frac{A(y)}{P(y)} = \frac{(b_0 + z_{\text{side}} \cdot y) \cdot y}{b_0 + 2 \cdot y \cdot \sqrt{1 + z_{\text{side}}^2}}$$
- $n$: Manning roughness coefficient ($0.040 \le n \le 0.055$ for steep mountain gravel and boulder rivers).

#### Numerical Root Finding (Brent's Method)
To solve for depth $y$, the non-linear residual function:

$$f(y) = \frac{1}{n} \cdot (b_0 + z_{\text{side}} y) y \cdot \left(\frac{(b_0 + z_{\text{side}} y) y}{b_0 + 2 y \sqrt{1 + z_{\text{side}}^2}}\right)^{2/3} \cdot \sqrt{S_0} - Q(x) = 0$$

is solved numerically using **Brent's method** (`scipy.optimize.root_scalar(method='brentq')`) over the bracket $[0.01\text{m}, 100.0\text{m}]$ to achieve convergence within $10^{-6}\text{m}$ precision.

---

### 4. Flow Velocity, Wave Celerity & Arrival Time

Once depth $y(x)$ and area $A(x)$ are resolved:

1. **Mean Cross-Sectional Flow Velocity**:
   $$v(x) = \frac{Q(x)}{A(x)}$$

2. **Kinematic Flood Wave Celerity ($c$)**:
   In turbulent, friction-dominated shallow open channels, flood wave disturbance propagates faster than bulk water velocity:
   $$c(x) = \beta \cdot v(x), \quad \text{where } \beta = \frac{5}{3} \approx 1.67$$

3. **Cumulative Flood Arrival Time**:
   The travel time $T(x)$ required for the leading flood wave front to reach station $x$ from the breach origin ($x=0$) is computed via piecewise trapezoidal numerical integration:
   $$T(x) = \int_0^x \frac{d\xi}{c(\xi)} \approx \sum_{i=1}^{N} \frac{\Delta x_i}{\frac{c(x_i) + c(x_{i-1})}{2}}$$
   $$T_{\text{minutes}}(x) = \frac{T(x)}{60}$$

---

### 5. Water Surface Elevation ($\text{WSE}$)

Water Surface Elevation ($\text{WSE}$) represents the absolute geodetic elevation (meters above sea level) of the water surface plane at station $x$:

$$\text{WSE}(x) = Z_{\text{bed}}(x) + y(x)$$

---

### 6. Dynamic Flood Extent & Buffer Envelope Polygon Generation

Rather than applying a generic geometric buffer, the system constructs a hydro-topographically consistent polygon by determining where the horizontal water surface intersects the actual DEM valley walls.

```
Station i-1                       Station i                       Station i+1
    o                                 o                                o
    |                                 |                                |
    +-- Left Bank w_L,i-1 ------------+-- Left Bank w_L,i -------------+-- Left Bank w_L,i+1
    |                                 |                                |
  [ River Thalweg P_i-1 ] ---------> [ River Thalweg P_i ] ---------> [ River Thalweg P_i+1 ]
    |                                 |                                |
    +-- Right Bank w_R,i-1 -----------+-- Right Bank w_R,i ------------+-- Right Bank w_R,i+1
    |                                 |                                |
    o                                 o                                o
```

#### Step 1: Metric Projection & Normal Vector Computation
The river centerline is projected to Metric UTM Coordinates ($\text{EPSG:32645}$). At station $i$, the local flow tangent vector $\vec{t}_i$ and strictly perpendicular normal unit vector $\vec{n}_i$ are:

$$\vec{t}_i = \left(\frac{x_{i+1} - x_{i-1}}{\|\Delta P\|}, \; \frac{y_{i+1} - y_{i-1}}{\|\Delta P\|}\right) = (t_x, t_y)$$

$$\vec{n}_i = (-t_y, \; t_x) \quad \implies \quad \vec{n}_i \cdot \vec{t}_i = 0$$

#### Step 2: Channel Curvature & Centrifugal Bend Superelevation
In sharp mountain river bends and meanders, centrifugal acceleration acts on the high-velocity flow, tilting the water surface transversely across the channel (superelevation $\Delta h$).

##### River Curvature ($\kappa$) & Radius ($R_c$)
Given incoming and outgoing reach heading angles $\theta_{i-1}, \theta_i$ along segment length $ds$:

$$\kappa = \frac{d\theta}{ds}, \quad R_c = \frac{1}{\max(10^{-4}, |\kappa|)}$$

- $\kappa > 0$: River turns to the Left (Right bank is outer/concave, Left bank is inner/convex).
- $\kappa < 0$: River turns to the Right (Left bank is outer/concave, Right bank is inner/convex).

##### Centrifugal Transverse Superelevation ($\Delta h_{\text{super}}$)

$$\Delta h_{\text{super}} = \min\left(0.35 \cdot h, \; \frac{v^2 \cdot W}{g \cdot R_c}\right) = \min\left(0.35 \cdot h, \; \frac{v^2 \cdot W \cdot |\kappa|}{g}\right)$$

##### Asymmetric Bank Water Surface Elevations
The water level rises on the outer bank and lowers on the inner bank:

$$\text{WSE}_L(x) = \text{WSE}(x) - \frac{\Delta h_{\text{super}}}{2} \cdot \operatorname{sign}(\kappa)$$

$$\text{WSE}_R(x) = \text{WSE}(x) + \frac{\Delta h_{\text{super}}}{2} \cdot \operatorname{sign}(\kappa)$$

#### Step 3: Geometric DEM Transect Sampling & Bank Intersections
Along $\vec{n}_i$, sample points are placed outward at offsets $o_k \in [8\text{m}, 600\text{m}]$ on both the left ($+ \vec{n}_i$) and right ($- \vec{n}_i$) valley slopes, sampling elevations $Z(o_k)$ from the DEM raster.

The physical bank intersection offsets $w_L(x)$ and $w_R(x)$ are extracted via linear sub-grid interpolation using their respective asymmetric bank water surface elevations:

$$w_L(x) = o_{k-1} + \left(\frac{\text{WSE}_L(x) - Z(o_{k-1})}{Z(o_k) - Z(o_{k-1})}\right) \cdot (o_k - o_{k-1})$$

$$w_R(x) = o_{k-1} + \left(\frac{\text{WSE}_R(x) - Z(o_{k-1})}{Z(o_k) - Z(o_{k-1})}\right) \cdot (o_k - o_{k-1})$$

In sharp bends, this causes the outer bank inundation boundary to climb higher up the valley wall while the inner bank stays tighter, matching physical hydraulic behavior.

#### Step 4: Mesh Polygon Construction & Geodesic Transformation
For each step along the river, a quad is formed between consecutive stations $i$ and $i+1$:

$$\text{Quad}_i = \left[\left(P_i + \vec{n}_i w_{L,i}\right), \; \left(P_{i+1} + \vec{n}_{i+1} w_{L,i+1}\right), \; \left(P_{i+1} - \vec{n}_{i+1} w_{R,i+1}\right), \; \left(P_i - \vec{n}_i w_{R,i}\right), \; \left(P_i + \vec{n}_i w_{L,i}\right)\right]$$

Individual segment quads are dissolved into a single unified polygon using `shapely.ops.unary_union`, transformed back to WGS84 coordinates ($\text{EPSG:4326}$), and converted into GeoJSON.

#### Buffer Envelope
The disaster evaluation safety buffer (e.g. 2.0 km corridor) is generated by offsetting $P_i \pm \frac{W_{\text{buf}}}{2} \cdot \vec{n}_i$, forming a continuous risk assessment envelope across the entire valley.

---

### 7. Perpendicular Valley Cross-Section & Bathymetry Carving

When a user clicks on the map at coordinate $(lon_{\text{click}}, lat_{\text{click}})$:

1. **Orthogonal Projection**:
   The point is projected onto the metric river centerline via `downstream_m.project(click_pt)` to identify the exact station distance $s$ along the reach.

2. **Perpendicular Transect Orientation**:
   Forward and backward points $P(s + \delta)$ and $P(s - \delta)$ (with $\delta = 35\text{m}$) are sampled to compute the local smoothed unit tangent $\vec{t}$ and perpendicular normal vector $\vec{n} = (-t_y, t_x)$.

3. **Dense Profile Sampling (101 Points)**:
   A transect spanning the entire valley (e.g. $\pm 1150\text{m}$) is sampled across 101 points, explicitly incorporating the thalweg ($0\text{m}$) and exact left/right flood bank offsets ($w_L, w_R$).

4. **Hydrodynamic Sub-Grid Bathymetry Carving**:
   Because satellite DEM rasters (30m resolution) cannot resolve underwater river channels, the bedrock elevation is carved hydrodynamically:

   * **Inside Channel** ($|w| \le w_{\text{flood}}$):

$$Z_{\text{channel}}(w) = Z_{\text{bed}} + h \cdot \left(\frac{|w|}{w_{\text{flood}}}\right)^{1.7}$$

   Center elevation is strictly $Z_{\text{bed}}$ (depth = $h$ below $\text{WSE}$), smoothly rising to $\text{WSE}$ at both banks ($w = \pm w_{\text{flood}}$).

   * **Outside Channel** ($|w| > w_{\text{flood}}$):

$$Z_{\text{valley}}(w) = \text{WSE} + \max\left(0, \; Z_{\text{DEM}}(w) - Z_{\text{DEM}}(w_{\text{bank}})\right)$$

   The profile blends with the real DEM mountain valley slopes rising above $\text{WSE}$.

5. **Non-Overlapping 3D Extruded Vertical Planes**:
   In the 3D scene, two distinct, non-overlapping vertical planes are rendered:
   - **Blue Flood Extent Plane**: Spans $[-w_{\text{flood}}, +w_{\text{flood}}]$ with $1.0\text{m}$ ribbon thickness and height $H = \max(20\text{m}, 3h)$.
   - **Orange Buffer Plane**: Spans $[-w_{\text{buffer}}, -w_{\text{flood}}] \cup [+w_{\text{flood}}, +w_{\text{buffer}}]$ as a `MultiPolygon` on the valley slopes.
   - Both planes are densely tessellated along transect offsets so their base vertices hug the 3D terrain mesh without clipping or floating.

---

## Architecture & Project Structure

```
rasuwa-flood/
├── backend/
│   ├── app/
│   │   ├── main.py                     # FastAPI application entry point, CORS & routing
│   │   ├── core/
│   │   │   └── config.py               # River configurations, data paths & defaults
│   │   ├── models/
│   │   │   └── schemas.py              # Pydantic request/response data contracts
│   │   ├── api/
│   │   │   └── routes.py               # REST API endpoints (/rivers, /simulate, /cross-section)
│   │   ├── services/
│   │   │   ├── hydraulic.py            # 1D Manning solver, slope derivation & routing
│   │   │   ├── routing.py              # River centerline merge & upstream/downstream slicing
│   │   │   ├── simulation.py           # Multi-step simulation runner, corridor & impact builder
│   │   │   └── cross_section.py        # Perpendicular transect, bathymetry & 3D plane generator
│   │   └── data/                       # Spatial dataset assets (GeoJSON centerlines, DEM TIFFs, settlements)
│   └── pyproject.toml                  # Backend dependencies & UV configuration
│
└── frontend/
    ├── src/
    │   ├── app/
    │   │   ├── layout.tsx              # Root HTML layout with Inter font & metadata
    │   │   ├── page.tsx                # Main dashboard page, state coordinator & scrubber
    │   │   └── globals.css             # Vanilla CSS design system, glassmorphism & animations
    │   ├── components/
    │   │   ├── Map3D.tsx               # MapLibre GL 3D terrain, camera controls & in-river 3D planes
    │   │   ├── SimulationControls.tsx  # Parametric setup panel (volume, duration, breach location)
    │   │   ├── ImpactStats.tsx         # Downstream settlement impact cards & footprint statistics
    │   │   ├── TimelinePlayer.tsx      # Time-slider playback scrubber with speed controls
    │   │   └── CrossSectionModal.tsx   # Collapsible 410px valley cross-section SVG & bathymetry viewer
    │   ├── lib/
    │   │   └── api.ts                  # Fetch client for backend REST endpoints
    │   └── types/
    │       └── simulation.ts           # TypeScript interfaces for simulation & cross-section responses
    ├── package.json
    └── tsconfig.json
```

---

## API Reference

### 1. `GET /api/rivers`
Returns metadata and coordinate bounds for configured river corridors.

### 2. `POST /api/simulate`
Executes 1D hydraulic routing and spatial corridor extraction.

**Request Body**:
```json
{
  "river_id": "bhotekoshi",
  "origin_lon": 85.5194,
  "origin_lat": 28.2968,
  "volume_m3": 5000000.0,
  "duration_hours": 1.5,
  "manning_n": 0.045,
  "buffer_distance_km": 2.0,
  "max_distance_km": 100.0
}
```

**Response Payload**:
- `summary`: Peak outflow ($Q_p$), max depth, peak corridor width, total buffer area, affected settlement count.
- `steps`: Array of time-stamped simulation steps ($0 \to 100\text{ km}$), each containing flood front location, peak depth, velocity, discharge, arrival time, and dynamic GeoJSON polygons.
- `profile`: Complete 1D hydraulic station table.
- `settlement_impacts`: Array of vulnerable downstream settlements with expected flood arrival time, peak depth, and local WSE.

### 3. `POST /api/cross-section`
Extracts a perpendicular valley transect and 3D cross-section planes at the clicked coordinate.

**Request Body**:
```json
{
  "river_id": "bhotekoshi",
  "origin_lon": 85.5194,
  "origin_lat": 28.2968,
  "click_lon": 85.365,
  "click_lat": 28.243,
  "volume_m3": 5000000.0,
  "duration_hours": 1.5,
  "buffer_distance_km": 2.0
}
```

**Response Payload**:
- `station_distance_km`: River stationing distance from breach origin.
- `nearest_settlement`: Name of the closest downstream settlement.
- `bed_elevation_m`, `water_depth_m`, `wse_m`, `top_width_m`, `velocity_ms`, `discharge_m3s`, `arrival_time_min`.
- `transect_offsets_m`, `terrain_elevations_m`: Dense 101-point valley transect with carved bathymetry.
- `flood_curtains_3d_geojson`: Segmented 3D extruded ribbon for the blue flood channel plane.
- `buffer_curtains_3d_geojson`: Segmented 3D extruded `MultiPolygon` for the orange buffer plane.

---

## Getting Started

### Prerequisites
- **Python 3.10+** (with [`uv`](https://docs.astral.sh/uv/) recommended)
- **Node.js 18+** & `npm`

### 1. Backend Setup
```bash
cd backend

# Create virtual environment and install dependencies
uv sync

# Start FastAPI server on port 8000
uv run uvicorn app.main:app --reload --port 8000
```
API Documentation will be available at `http://localhost:8000/docs`.

### 2. Frontend Setup
```bash
cd frontend

# Install npm dependencies
npm install

# Start Next.js development server on port 3000
npm run dev
```
Open `http://localhost:3000` in your web browser.

---

## Production Deployment & CI/CD

For full production deployment instructions (FastAPI on VPS, Nginx reverse proxy on port 8001, Certbot SSL, Vercel frontend integration, and GitHub Actions automated deployment workflow), see:

👉 **[Complete Deployment Guide (DEPLOYMENT.md)](file:///d:/Projects/neuron/personal/rasuwa-flood/DEPLOYMENT.md)**

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend Engine** | Python 3.12, FastAPI, Uvicorn, Pydantic |
| **Scientific / Geospatial** | NumPy, SciPy (Brent root-scalar), Pandas, Shapely, PyProj, RasterIO |
| **Frontend Framework** | Next.js 16 (Turbopack, App Router), React 19, TypeScript |
| **3D Geospatial Engine** | MapLibre GL JS 4.x (3D Raster-DEM terrain with fill-extrusion) |
| **Styling & Icons** | Vanilla CSS Design Tokens, Glassmorphism, Tailwind utility classes, Lucide Icons |

---

## License
MIT License. Open-source research and engineering tool for disaster management and flood hazard assessment.
