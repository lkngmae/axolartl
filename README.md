# AXOLARTL - HOW TO RUN

## SETTING UP THE ENV 
You will need the following Environment Variables:
```
DB_USER="whatever_username_you_want"\
DB_PASSWORD="whatever_password_you_want"\
GOOGLE_WEATHER_API_KEY="your_google_maps_platform_api_key"\
GOOGLE_MAPS_API_KEY="your_google_maps_platform_api_key"\
GOOGLE_PLACES_API_KEY="your_google_maps_platform_api_key"
```
You will define the DB_USER and DB_PASSWORD in the setting up the database set.
For the Google API keys, you need to login (with your google account) into Google Cloud Console, search through Google's APIs and Services for the Maps library, and get your key (should work for all maps-related apis (weather, maps, places)). You may need to provide a credit card to get a free trial to Google's APIs (more instructions on the console itself). 

## SETTING UP THE DATABASE

Install MYSQL according to your operating system's specific instructions. 

Then in your terminal, run:
```
mysql -u root -p
```
Once logged into MYSQL, run:
```
CREATE DATABASE IF NOT EXISTS axolartl;
CREATE USER 'the_same_user_put_for_DB_USER'@'localhost' IDENTIFIED BY 'the_same_password_put_for_DB_PASSWORD';
GRANT ALL PRIVILEGES ON axolartl.* TO 'the_same_user_put_for_DB_USER'@'localhost';
```

Then, exit out of mysql (type exit in the terminal), and login again, this time as the new user.
```
mysql -u the_same_user_put_for_DB_USER -p
```
Enter your password (the_same_password_put_for_DB_PASSWORD) at the prompt.

Then, go to our create_database.sql file. 
Copy and paste the sql file's contents into your open mysql terminal (this will add the tables into your newly created user's axolartl database). 

Ensure python is installed. You also have to install the python library mysql-connector-python:
```
pip install mysql-connector-python
```

Then run the following two commands:
```
python3 json_to_mysql.py
python3 categories_to_mysql.py
```

These fill in the databases with data from our raw_overpass_data.geojson file. 

## RUNNING THE APP

Run backend:
```
cd axolartl/query_environment/qe_app/qe_backend
npm i
node server.js
```

Run frontend:
```
cd axolartl/query_environment/qe_app
npm i
npx expo start
```

Use the Expo Go app to preview on a mobile device by scanning the QR code.
