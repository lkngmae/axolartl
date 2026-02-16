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

def get_artistic_keywords(tags):
    """Returns a list of keywords for querying based off location tags."""
    keywords = set() 

    if tags.get('natural') in ['beach', 'coastline']:
        keywords.update(KEYWORD_CATEGORIES['beach'])
        
    if tags.get('natural') in ['water', 'wetland']:
        keywords.update(KEYWORD_CATEGORIES['water'])
        
    if tags.get('leisure') in ['park', 'garden']:
        keywords.update(KEYWORD_CATEGORIES['greenery'])
    
    if tags.get('highway') == 'pedestrian' or tags.get('place') == 'square':
        keywords.update(KEYWORD_CATEGORIES['busy_street'])
        
    if tags.get('landuse') in ['retail', 'plaza', 'commercial']:
        keywords.update(KEYWORD_CATEGORIES['modern'])

    if tags.get('man_made') == 'pier':
        keywords.update(KEYWORD_CATEGORIES['pier'])
        
    if tags.get('bridge') == 'yes':
        keywords.update(KEYWORD_CATEGORIES['bridge'])
        
    if 'historic' in tags:
        keywords.update(KEYWORD_CATEGORIES['history'])
    
    if tags.get('tourism') == 'artwork':
        keywords.update(KEYWORD_CATEGORIES['art'])
        
    if tags.get('tourism') == 'viewpoint':
        keywords.update(KEYWORD_CATEGORIES['view'])

    return list(keywords)

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
            art_keywords = get_artistic_keywords(tags)

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

            # Insert Keywords
            for term in art_keywords:
                kw_id = get_or_create_keyword_id(cursor, term)
                
                insert_loc_key_query = """
                INSERT IGNORE INTO location_keywords (location_id, keyword_id)
                VALUES (%s, %s)
                """
                cursor.execute(insert_loc_key_query, (clean_id, kw_id))

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