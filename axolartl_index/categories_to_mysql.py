import json
import mysql.connector
from mysql.connector import Error

DB_CONFIG = {
    'host': 'localhost',
    'database': 'axolartl',
    'user': 'axolotl',
    'password': '3axolotls'
}

GEOJSON_FILE = 'raw_overpass_data.geojson'

KEYWORD_CATEGORIES = {
    'beach': ['nature', 'ocean', 'sea', 'seaside', 'sand', 'water', 'waves', 'coast', 'shore', 'sunset', 'horizon', 'blue'],
    'water': ['nature', 'water', 'lake', 'pond', 'reflection', 'blue', 'calm'],
    'wetland': ['nature', 'wetland', 'marsh', 'moss', 'tide'],
    'greenery': ['nature', 'green', 'plants', 'trees', 'grass', 'quiet', 'serene', 'garden', 'park', 'floral'],
    'busy_street': ['urban', 'busy', 'people', 'crowds', 'street', 'city', 'walk', 'movement', 'chaos', 'life'],
    'modern': ['urban', 'modern', 'architecture', 'glass', 'concrete', 'city', 'lines', 'geometric'],
    'pier': ['structure', 'ocean', 'perspective', 'iconic', 'wood', 'pillars', 'pier', 'fishing', 'vanishing point'],
    'bridge': ['structure', 'bridge', 'perspective', 'engineering', 'crossing', 'geometry'],
    'history': ['history', 'old', 'ruins', 'decay', 'stone', 'ancient', 'weathered', 'rustic'],
    'art': ['art', 'sculpture', 'culture', 'statue', 'creative', 'monument', 'installation'],
    'view': ['view', 'panorama', 'landscape', 'horizon', 'scenic', 'lookout', 'high']
}

def get_artistic_data(tags):
    """Returns (keywords, categories) based on location tags."""
    keywords = set()
    categories = set()

    if tags.get('natural') in ['beach', 'coastline']:
        keywords.update(KEYWORD_CATEGORIES['beach'])
        categories.add('beach')

    if tags.get('natural') in ['water', 'wetland']:
        keywords.update(KEYWORD_CATEGORIES['water'])
        categories.add('water')

    if tags.get('leisure') in ['park', 'garden']:
        keywords.update(KEYWORD_CATEGORIES['greenery'])
        categories.add('greenery')

    if tags.get('highway') == 'pedestrian' or tags.get('place') == 'square':
        keywords.update(KEYWORD_CATEGORIES['busy_street'])
        categories.add('busy_street')

    if tags.get('landuse') in ['retail', 'plaza', 'commercial']:
        keywords.update(KEYWORD_CATEGORIES['modern'])
        categories.add('modern')

    if tags.get('man_made') == 'pier':
        keywords.update(KEYWORD_CATEGORIES['pier'])
        categories.add('pier')

    if tags.get('bridge') == 'yes':
        keywords.update(KEYWORD_CATEGORIES['bridge'])
        categories.add('bridge')

    if 'historic' in tags:
        keywords.update(KEYWORD_CATEGORIES['history'])
        categories.add('history')

    if tags.get('tourism') == 'artwork':
        keywords.update(KEYWORD_CATEGORIES['art'])
        categories.add('art')

    if tags.get('tourism') == 'viewpoint':
        keywords.update(KEYWORD_CATEGORIES['view'])
        categories.add('view')

    return list(keywords), list(categories)

def get_or_create_category_id(cursor, name):
    cursor.execute("SELECT id FROM categories WHERE name = %s", (name,))
    result = cursor.fetchone()
    if result:
        return result[0]

    cursor.execute("INSERT INTO categories (name) VALUES (%s)", (name,))
    return cursor.lastrowid

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
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        if not conn.is_connected():
            print("Failed to connect to MySQL")
            return

        cursor = conn.cursor()

        with open(GEOJSON_FILE, 'r') as f:
            data = json.load(f)

        print(f"Processing {len(data['features'])} locations...")

        for feature in data['features']:
            props = feature['properties']
            geometry = feature['geometry']
            
            # Extract Data.
            osm_id = props.get('@id') # Overpass usually returns IDs like "node/12345"
            # Clean ID to be an integer (remove "node/" or "way/")
            clean_id = int(''.join(filter(str.isdigit, str(osm_id))))
            
            # Get Name (set to "Untitled Location" if missing).
            name = props.get('name', 'Untitled Artistic Spot')
            
            # Get Coordinates (GeoJSON is [Lon, Lat])
            lon = geometry['coordinates'][0]
            lat = geometry['coordinates'][1]

            # Generate Keywords based on tags.
            tags = props 
            art_keywords, art_categories = get_artistic_data(tags)

            if not art_keywords:
                continue # Skip locations that didn't match any keywords

            # Insert Location
            # Note: ST_GeomFromText uses 'POINT(longitude latitude)' order.
            insert_loc_query = """
            INSERT INTO locations (id, name, latitude, longitude, coordinates)
            VALUES (%s, %s, %s, %s, ST_GeomFromText('POINT(%s %s)'))
            ON DUPLICATE KEY UPDATE name = VALUES(name);
            """
            cursor.execute(insert_loc_query, (clean_id, name, lat, lon, lon, lat))

             # Insert Categories
            for category_name in art_categories:
                cat_id = get_or_create_category_id(cursor, category_name)

                insert_loc_cat_query = """
                INSERT IGNORE INTO location_categories (location_id, category_id)
                VALUES (%s, %s)
                """
                cursor.execute(insert_loc_cat_query, (clean_id, cat_id))
           

        conn.commit()
        print("yayayayay! Database populated.")

    except Error as e:
        print(f"Error: {e}")
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

if __name__ == '__main__':
    insert_data()