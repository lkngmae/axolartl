import json
from typing import Dict, Iterable, List, Set, Tuple

GEOJSON_FILE = 'raw_overpass_data.geojson'
OUTPUT_FILE = 'location_suitability.json'

# Keep these in sync with json_to_mysql.py so the suitability file only covers
# the descriptive keywords that make it into the TF-IDF index.
ALLOWED_KEYS = {
    'natural',
    'water',
    'wetland',
    'landuse',
    'surface',
    'garden:type',
    'leisure',
    'highway',
    'footway',
    'tourism',
    'amenity',
    'historic',
    'ruins',
    'memorial',
    'man_made',
    'building',
    'bridge',
    'barrier',
    'artwork_type',
    'material',
    'artist_name',
}

ALLOWED_VALUES_BY_KEY = {
    'landuse': {'grass', 'meadow', 'forest', 'recreation_ground'},
    'leisure': {'park', 'garden', 'dog_park', 'playground', 'pitch', 'sports_centre', 'golf_course', 'nature_reserve', 'swimming_pool'},
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

KEYWORD_TERM_MAX_LEN = 50
IGNORED_PREFIXES = ('tiger:', 'source:', '@')

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


def normalize_tag_value(value) -> str:
    if value is None:
        return ''
    if isinstance(value, bool):
        value = 'yes' if value else 'no'
    return str(value).strip().lower()


def is_descriptive_value(value: str) -> bool:
    if not value:
        return False
    digits = sum(c.isdigit() for c in value)
    if digits >= max(4, int(0.6 * len(value))):
        return False
    if '|' in value:
        return False
    if 'http://' in value or 'https://' in value:
        return False
    return True


def is_meaningful_tag(key: str, value: str) -> bool:
    if not key or not value:
        return False
    if any(key.startswith(prefix) for prefix in IGNORED_PREFIXES):
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
        # Allow semicolon-delimited multiple names.
        return True
    return is_descriptive_value(value)


def get_osm_keywords(tags: Dict[str, object]) -> List[str]:
    keywords: Set[str] = set()
    for raw_key, raw_value in tags.items():
        key = str(raw_key).strip().lower()
        value = normalize_tag_value(raw_value)
        if not is_meaningful_tag(key, value):
            continue
        term = f'{key}:{value}'
        if len(term) <= KEYWORD_TERM_MAX_LEN:
            keywords.add(term)
    return sorted(keywords)


def split_term(term: str) -> Tuple[str, str]:
    parts = term.split(':')
    if len(parts) < 2:
        return term, ''
    return ':'.join(parts[:-1]), parts[-1]


def indoor_score_for_term(term: str) -> float:
    """
    Returns an 'indoor likelihood' score:
      1.0 = indoors
      0.0 = outdoors
      0.5 = ambiguous / could be either
    """
    key, value = split_term(term)

    # Strong outdoor signals
    if key in {'natural', 'water', 'wetland', 'landuse', 'leisure', 'garden:type', 'surface', 'barrier', 'bridge', 'highway', 'footway'}:
        return 0.0
    if key == 'tourism' and value in {'viewpoint', 'picnic_site'}:
        return 0.0
    if key == 'man_made' and value in {'bridge', 'pier'}:
        return 0.0
    if key == 'ruins':
        return 0.0
    if key == 'historic' and value in {'ruins'}:
        return 0.0

    # Strong indoor signals
    if key == 'building':
        return 1.0
    if key == 'historic' and value in {'building', 'manor', 'factory'}:
        return 1.0
    if key == 'amenity' and value == 'library':
        return 1.0

    # Often outdoors but can be mixed
    if key == 'amenity' and value == 'fountain':
        return 0.0
    if key == 'tourism' and value == 'artwork':
        return 0.5
    if key == 'historic' and value in {'memorial', 'monument', 'battlefield', 'district', 'aircraft', 'yes'}:
        return 0.5
    if key == 'memorial':
        return 0.5
    if key == 'artwork_type':
        return 0.5
    if key in {'material', 'artist_name'}:
        return 0.5

    return 0.5


def generate() -> Dict[str, float]:
    with open(GEOJSON_FILE, 'r') as f:
        data = json.load(f)

    features: Iterable[Dict[str, object]] = data.get('features', [])
    terms: Set[str] = set()

    for feature in features:
        props = feature.get('properties', {}) or {}
        terms.update(get_osm_keywords(props))

    result: Dict[str, float] = {}
    for term in sorted(terms):
        result[term] = float(indoor_score_for_term(term))

    return result


if __name__ == '__main__':
    suitability = generate()
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(suitability, f, indent=2, sort_keys=True)
    print(f"Wrote {len(suitability)} terms to {OUTPUT_FILE}")
