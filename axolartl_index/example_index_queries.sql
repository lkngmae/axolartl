USE axolartl;
SELECT l.name, l.latitude, l.longitude
FROM locations l
JOIN location_keywords lk ON l.id = lk.location_id
JOIN keywords k ON lk.keyword_id = k.id
WHERE k.term = 'nature';