import json
import mysql.connector
from mysql.connector import Error
from typing import Dict, Iterable, List, Set

DB_CONFIG = {
    'host': 'localhost',
    'database': 'axolartl',
    'user': 'root',
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

# Only index tags that are likely to be visually descriptive for artists.
# Everything else (addresses, lanes, reference ids, etc.) bloats TF-IDF and
# dilutes match quality.
ALLOWED_KEYS = {
    # Natural / outdoors
    'natural',
    'water',
    'wetland',
    'landuse',
    'surface',
    'garden:type',
    'leisure',

    # Points of interest / content
    'tourism',
    'amenity',
    'historic',
    'ruins',
    'memorial',

    # Built environment / structures
    'man_made',
    'building',
    'bridge',
    'barrier',

    # Art-specific tags present in your dataset
    'artwork_type',
    'material',
    'artist_name',
}

# For some keys, only a subset of values are meaningful/descriptive.
ALLOWED_VALUES_BY_KEY = {
    'landuse': {'grass'},
    'leisure': {'park', 'garden', 'dog_park'},
    'tourism': {'artwork', 'viewpoint', 'picnic_site'},
    'amenity': {'fountain', 'library'},
    'man_made': {'bridge', 'pier'},
    'historic': {'ruins', 'memorial', 'monument', 'building', 'district', 'yes', 'aircraft', 'battlefield', 'manor', 'factory'},
    'water': {'lake', 'pond', 'reservoir', 'river', 'stream', 'basin', 'fountain'},
    'wetland': {'marsh', 'saltmarsh'},
    'natural': {'beach', 'water', 'wetland', 'peak'},
    'artwork_type': {'bust', 'installation', 'mural', 'sculpture', 'statue', 'stone'},
    'material': {'bronze', 'concrete', 'metal', 'rock', 'stainless_steel', 'steel', 'stone', 'wood'},
    'surface': {'asphalt', 'concrete', 'grass', 'metal', 'paved', 'paving_stones', 'plastic', 'sand', 'unpaved', 'wood'},
}

# Explicitly ignore noisy keys even if they slip past NON_SEMANTIC_KEYS.
IGNORED_KEY_SUBSTRINGS = (
    'addr:',
    ':lanes',
    'destination:',
    'maxspeed',
    'check_date',
    'source_ref',
    'gnis:',
    'name:etymology',
    'wikidata',
    'wikipedia',
    'ref:',
    'old_ref',
    'bridge_ref',
    'inscription',
    'operator',
    'opening_hours',
    'contact:',
)


def is_descriptive_value(value: str) -> bool:
    if not value:
        return False
    # Numeric ids, postcodes, elevations, house numbers, etc.
    digits = sum(c.isdigit() for c in value)
    if digits >= max(4, int(0.6 * len(value))):
        return False
    # Pipe/semicolon-heavy multi-valued lane metadata etc.
    if '|' in value or ';' in value:
        return False
    if 'http://' in value or 'https://' in value:
        return False
    return True


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
    if any(substr in key for substr in IGNORED_KEY_SUBSTRINGS):
        return False
    if key not in ALLOWED_KEYS:
        return False
    allowed_values = ALLOWED_VALUES_BY_KEY.get(key)
    if allowed_values is not None and value not in allowed_values:
        return False
    if len(value) > 80:
        return False
    if key == 'artist_name':
        # Allow multiple artist names separated by semicolons.
        if '|' in value:
            return False
    elif not is_descriptive_value(value):
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

        # Remove any keywords that are no longer referenced by any location.
        # This keeps the keywords table focused on the descriptive index terms
        # we actually use for TF-IDF matching.
        cursor.execute(
            """
            DELETE k
            FROM keywords k
            LEFT JOIN location_keywords lk ON lk.keyword_id = k.id
            WHERE lk.keyword_id IS NULL
            """
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
