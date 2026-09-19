from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"

RIVER_FILES = {
    "bhotekoshi": {
        "id": "bhotekoshi",
        "name": "Bhotekoshi River (Landslide / GLOF Origin)",
        "region": "Rasuwa – Upper Gorge",
        "file": DATA_DIR / "bhotekoshi_river.geojson",
        "dem_file": DATA_DIR / "tiff" / "dem_2km_buffer.tif",
        "cities_file": DATA_DIR / "cities.geojson",
        "default_origin": [85.5194, 28.2968],
        "default_zoom": 12.8,
        "default_bounds": [[85.2, 28.1], [85.55, 28.35]],
        "manning_n": 0.048,
    },
    "rasuwagadhi": {
        "id": "rasuwagadhi",
        "name": "Rasuwagadhi Border River Basin",
        "region": "Northern Rasuwa",
        "file": DATA_DIR / "bhotekoshi_river.geojson",
        "dem_file": DATA_DIR / "tiff" / "dem_2km_buffer.tif",
        "cities_file": DATA_DIR / "cities.geojson",
        "default_origin": [85.3794, 28.2783],
        "default_zoom": 13.5,
        "default_bounds": [[85.25, 28.15], [85.45, 28.32]],
        "manning_n": 0.045,
    },
    "trishuli": {
        "id": "trishuli",
        "name": "Trishuli River Corridor",
        "region": "Nuwakot – Devighat Section",
        "file": DATA_DIR / "bhotekoshi_river.geojson",
        "dem_file": DATA_DIR / "tiff" / "dem_2km_buffer.tif",
        "cities_file": DATA_DIR / "cities.geojson",
        "default_origin": [85.2165, 28.0995],
        "default_zoom": 12.0,
        "default_bounds": [[84.95, 27.8], [85.35, 28.15]],
        "manning_n": 0.038,
    },
}
