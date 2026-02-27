import json
import mysql.connector
from mysql.connector import Error
from typing import Dict, Iterable, List, Set

DB_CONFIG = {
    'host': 'localhost',
    'database': 'axolartl',
    'user': 'axolotl',
    'password': '3axolotls'
}

GEOJSON_FILE = 'raw_overpass_data.geojson'

IGNORED_PREFIXES = ('tiger:', 'source:', '@')
NON_SEMANTIC_KEYS = {
    'name',
    'name:en',
    'name:es',
    'old_name',
    'alt_name',
    'description',
    'operator',
    'ref',
    'wikidata',
    'wikipedia',
    'website',
    'contact:website',
    'phone',
    'fixme',
    'note',
}
KEYWORD_TERM_MAX_LEN = 50


def normalize_tag_value(value) -> str:
    """Normalizes OSM tag values to keyword-safe lowercase strings."""
    if value is None:
        return ''
    if isinstance(value, bool):
        value = 'yes' if value else 'no'
    normalized = str(value).strip().lower()
    return normalized


def is_meaningful_tag(key: str, value: str) -> bool:
    """Filters out noisy/metadata tags and empty values."""
    if not key or not value:
        return False
    if any(key.startswith(prefix) for prefix in IGNORED_PREFIXES):
        return False
    if key in NON_SEMANTIC_KEYS:
        return False
    if len(value) > 80:
        return False
    return True


def get_osm_keywords(tags: Dict[str, object]) -> List[str]:
    """
    Returns deduplicated keywords directly derived from OSM properties.
    Includes special mappings and general key:value tags for meaningful fields.
    """
    keywords: Set[str] = set()
    normalized_tags: Dict[str, str] = {}

    for raw_key, raw_value in tags.items():
        key = str(raw_key).strip().lower()
        value = normalize_tag_value(raw_value)
        if not is_meaningful_tag(key, value):
            continue
        normalized_tags[key] = value

        keywords.add(f'{key}:{value}')

    # Preserve existing schema compatibility: keywords.term is VARCHAR(50).
    bounded_keywords = [term for term in keywords if len(term) <= KEYWORD_TERM_MAX_LEN]
    return sorted(bounded_keywords)

def get_or_create_keyword_id(cursor, term):
    """Finds a keyword's ID. If it doesn't exist, creates it."""
    cursor.execute("SELECT id FROM keywords WHERE term = %s", (term,))
    result = cursor.fetchone()
    if result:
        return result[0]
    
    # If the keyword does not exist, insert it.
    cursor.execute("INSERT INTO keywords (term) VALUES (%s)", (term,))
    return cursor.lastrowid

def insert_data():
    """Inserts all data in GEOJSON_FILE to database described in DB_CONFIG"""
    conn = None
    cursor = None
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        if not conn.is_connected():
            print("Failed to connect to MySQL")
            return

        cursor = conn.cursor()

        with open(GEOJSON_FILE, 'r') as f:
            data = json.load(f)

        features: Iterable[Dict[str, object]] = data.get('features', [])
        total_features = len(features)
        print(f"Processing {total_features} features from {GEOJSON_FILE}...")

        processed = 0
        skipped = 0

        for index, feature in enumerate(features, start=1):
            props = feature.get('properties', {})
            geometry = feature.get('geometry', {})

            # Extract Data.
            osm_id = props.get('@id') # Overpass usually returns IDs like "node/12345"
            # Clean ID to be an integer (remove "node/" or "way/")
            clean_id_str = ''.join(filter(str.isdigit, str(osm_id)))
            if not clean_id_str:
                skipped += 1
                continue
            clean_id = int(clean_id_str)

            # Get Name (set to "Untitled Location" if missing).
            name = props.get('name', 'Untitled Artistic Spot')

            # Get Coordinates (GeoJSON is [Lon, Lat])
            coordinates = geometry.get('coordinates', [])
            if not isinstance(coordinates, list) or len(coordinates) < 2:
                skipped += 1
                continue
            lon, lat = coordinates[0], coordinates[1]

            # Always clear existing links first so reruns are deterministic.
            cursor.execute("DELETE FROM location_keywords WHERE location_id = %s", (clean_id,))

            # Generate OSM keywords directly from tags.
            tags = props
            osm_keywords = get_osm_keywords(tags)

            if not osm_keywords:
                skipped += 1
                continue

            # Insert Location
            # Note: ST_GeomFromText uses 'POINT(longitude latitude)' order.
            insert_loc_query = """
            INSERT INTO locations (id, name, latitude, longitude, coordinates)
            VALUES (%s, %s, %s, %s, ST_GeomFromText('POINT(%s %s)'))
            ON DUPLICATE KEY UPDATE
                name = VALUES(name),
                latitude = VALUES(latitude),
                longitude = VALUES(longitude),
                coordinates = VALUES(coordinates);
            """
            cursor.execute(insert_loc_query, (clean_id, name, lat, lon, lon, lat))

            # Insert keyword mappings.
            location_keyword_rows = []
            for term in osm_keywords:
                kw_id = get_or_create_keyword_id(cursor, term)
                location_keyword_rows.append((clean_id, kw_id))

            if location_keyword_rows:
                cursor.executemany(
                    """
                    INSERT IGNORE INTO location_keywords (location_id, keyword_id)
                    VALUES (%s, %s)
                    """,
                    location_keyword_rows
                )

            processed += 1
            if index % 250 == 0 or index == total_features:
                print(
                    f"Processed {index}/{total_features} features "
                    f"(indexed={processed}, skipped={skipped})"
                )

        conn.commit()
        print(
            f"Done. Indexed {processed} locations, skipped {skipped} "
            f"out of {total_features} features."
        )

    except Error as e:
        print(f"Error: {e}")
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

if __name__ == '__main__':
    insert_data()
