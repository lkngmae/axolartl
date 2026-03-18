import json
import mysql.connector
from mysql.connector import Error
from typing import Dict, Iterable, List, Set, Optional

DB_CONFIG = {
    'host': 'localhost',
    'database': 'axolartl',
    'user': 'root'
}

GEOJSON_FILE = 'raw_overpass_data.geojson'
CATEGORY_SYNONYMS_FILE = 'category_synonyms.json'
KEYWORD_TERM_MAX_LEN = 50


def normalize(value) -> str:
    if value is None:
        return ''
    if isinstance(value, bool):
        value = 'yes' if value else 'no'
    return str(value).strip().lower()


def derive_categories(tags: Dict[str, object]) -> List[str]:
    """
    Derives high-level categories from real OSM tags.
    Keeps category logic separate from keyword logic.
    """
    normalized = {str(k).lower(): normalize(v) for k, v in tags.items()}
    categories: Set[str] = set()

    natural = normalized.get('natural')
    leisure = normalized.get('leisure')
    tourism = normalized.get('tourism')
    highway = normalized.get('highway')
    footway = normalized.get('footway')
    man_made = normalized.get('man_made')
    landuse = normalized.get('landuse')
    bridge = normalized.get('bridge')
    historic = normalized.get('historic')
    water = normalized.get('water')

    # Values below are constrained to values that exist in raw_overpass_data.geojson.
    if natural in {'beach'}:
        categories.add('beach')

    if (
        leisure in {'park', 'garden', 'dog_park'}
        or landuse in {'grass'}
    ):
        categories.add('greenery')

    if (
        bridge == 'yes'
        or man_made in {'bridge', 'pier'}
        or tourism == 'viewpoint'
    ):
        categories.add('structure')

    if (
        natural in {'water', 'wetland'}
        or water in {'lake', 'pond', 'reservoir', 'river', 'stream', 'basin', 'fountain'}
    ):
        categories.add('water')

    if historic:
        categories.add('history')

    if tourism in {'artwork'}:
        categories.add('art')

    if tourism == 'viewpoint':
        categories.add('view')
    if natural in {'peak'}:
        categories.add('view')

    if (
        highway in {
            'footway', 'pedestrian', 'secondary', 'motorway', 'motorway_link',
            'cycleway', 'primary', 'path', 'tertiary', 'unclassified', 'service',
            'residential', 'steps', 'primary_link', 'secondary_link', 'track'
        }
        or footway in {'crossing', 'sidewalk'}
        or landuse in {'residential'}
        or normalized.get('place') in {'islet'}
    ):
        categories.add('urban')

    return sorted(categories)

def load_category_synonyms() -> Dict[str, List[str]]:
    """
    Loads category -> synonym list mapping.

    Expected file format:
      { "history": ["history", "old", ...], "art": ["art", ...], ... }
    """
    try:
        with open(CATEGORY_SYNONYMS_FILE, 'r') as f:
            data = json.load(f)
        if isinstance(data, dict):
            cleaned: Dict[str, List[str]] = {}
            for raw_key, raw_values in data.items():
                key = normalize(raw_key)
                if not key:
                    continue
                if not isinstance(raw_values, list):
                    continue
                values: List[str] = []
                for v in raw_values:
                    term = normalize(v)
                    if term:
                        values.append(term)
                cleaned[key] = values
            return cleaned
    except FileNotFoundError:
        pass
    except json.JSONDecodeError:
        pass

    return {}


def get_or_create_category_id(cursor, name: str) -> int:
    cursor.execute("SELECT id FROM categories WHERE LOWER(name) = LOWER(%s)", (name,))
    result = cursor.fetchone()
    if result:
        return result[0]
    cursor.execute("INSERT INTO categories (name) VALUES (%s)", (name,))
    return cursor.lastrowid

def get_or_create_keyword_id(cursor, term: str) -> Optional[int]:
    """
    Finds a keyword's ID. If it doesn't exist, creates it.

    Returns None for empty or overlong terms (keywords.term is VARCHAR(50)).
    """
    normalized = normalize(term)
    if not normalized:
        return None
    if len(normalized) > KEYWORD_TERM_MAX_LEN:
        return None

    cursor.execute("SELECT id FROM keywords WHERE term = %s", (normalized,))
    result = cursor.fetchone()
    if result:
        return result[0]

    cursor.execute("INSERT INTO keywords (term) VALUES (%s)", (normalized,))
    return cursor.lastrowid


def insert_data() -> None:
    conn = None
    cursor = None
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        if not conn.is_connected():
            print("Failed to connect to MySQL")
            return

        cursor = conn.cursor()

        category_synonyms = load_category_synonyms()

        with open(GEOJSON_FILE, 'r') as f:
            data = json.load(f)

        features: Iterable[Dict[str, object]] = data.get('features', [])
        total_features = len(features)
        print(f"Processing {total_features} features from {GEOJSON_FILE}...")

        indexed = 0
        skipped = 0

        for index, feature in enumerate(features, start=1):
            props = feature.get('properties', {})
            geometry = feature.get('geometry', {})

            osm_id = props.get('@id')
            clean_id_str = ''.join(filter(str.isdigit, str(osm_id)))
            if not clean_id_str:
                skipped += 1
                continue
            clean_id = int(clean_id_str)

            name = props.get('name', 'Untitled Artistic Spot')
            coords = geometry.get('coordinates', [])
            if not isinstance(coords, list) or len(coords) < 2:
                skipped += 1
                continue
            lon, lat = coords[0], coords[1]

            # Always clear existing links first so reruns are deterministic.
            cursor.execute("DELETE FROM location_categories WHERE location_id = %s", (clean_id,))

            categories = derive_categories(props)
            if not categories:
                skipped += 1
                continue

            cursor.execute(
                """
                INSERT INTO locations (id, name, latitude, longitude, coordinates)
                VALUES (%s, %s, %s, %s, ST_GeomFromText('POINT(%s %s)'))
                ON DUPLICATE KEY UPDATE
                    name = VALUES(name),
                    latitude = VALUES(latitude),
                    longitude = VALUES(longitude),
                    coordinates = VALUES(coordinates)
                """,
                (clean_id, name, lat, lon, lon, lat)
            )

            rows = []
            for category_name in categories:
                cat_id = get_or_create_category_id(cursor, category_name)
                rows.append((clean_id, cat_id))

            if rows:
                cursor.executemany(
                    """
                    INSERT IGNORE INTO location_categories (location_id, category_id)
                    VALUES (%s, %s)
                    """,
                    rows
                )

            # Add per-category synonym terms into the keyword index, so TF-IDF can
            # match plain-language queries (e.g. "ruins") even when the source
            # OSM tags are structured (e.g. historic:*).
            synonym_terms: Set[str] = set()
            for category_name in categories:
                key = normalize(category_name)
                if not key:
                    continue
                synonym_terms.add(key)
                for term in category_synonyms.get(key, []):
                    synonym_terms.add(normalize(term))

            if synonym_terms:
                kw_rows = []
                for term in sorted(synonym_terms):
                    kw_id = get_or_create_keyword_id(cursor, term)
                    if kw_id is None:
                        continue
                    kw_rows.append((clean_id, kw_id))

                if kw_rows:
                    cursor.executemany(
                        """
                        INSERT IGNORE INTO location_keywords (location_id, keyword_id)
                        VALUES (%s, %s)
                        """,
                        kw_rows
                    )

            indexed += 1
            if index % 250 == 0 or index == total_features:
                print(
                    f"Processed {index}/{total_features} features "
                    f"(indexed={indexed}, skipped={skipped})"
                )

        conn.commit()
        print(
            f"Done. Indexed categories for {indexed} locations, skipped {skipped} "
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
