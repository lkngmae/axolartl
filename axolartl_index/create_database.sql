CREATE DATABASE IF NOT EXISTS axolartl;
USE axolartl;
CREATE TABLE IF NOT EXISTS locations (
    id BIGINT PRIMARY KEY,          -- OSM ID
    name VARCHAR(255),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    coordinates POINT NOT NULL,
    SPATIAL INDEX(coordinates), 
    image_updated_at TIMESTAMP NULL DEFAULT NULL;
);

CREATE TABLE IF NOT EXISTS keywords (
    id INT AUTO_INCREMENT PRIMARY KEY,
    term VARCHAR(50) UNIQUE
);

CREATE TABLE IF NOT EXISTS location_keywords (
    location_id BIGINT,
    keyword_id INT,
    PRIMARY KEY (location_id, keyword_id),
    FOREIGN KEY (location_id) REFERENCES locations(id),
    FOREIGN KEY (keyword_id) REFERENCES keywords(id)
);

CREATE TABLE categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) UNIQUE
);

CREATE TABLE location_categories (
    location_id BIGINT,
    category_id INT,
    PRIMARY KEY (location_id, category_id),
    FOREIGN KEY (location_id) REFERENCES locations(id),
    FOREIGN KEY (category_id) REFERENCES categories(id)
);