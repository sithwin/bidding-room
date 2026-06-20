CREATE DATABASE carat_users;
CREATE DATABASE carat_catalogue;
CREATE DATABASE carat_auction_engine;
CREATE DATABASE carat_payments;
CREATE DATABASE carat_notifications;
CREATE DATABASE carat_shipping;

GRANT ALL PRIVILEGES ON DATABASE carat_users TO postgres;
GRANT ALL PRIVILEGES ON DATABASE carat_catalogue TO postgres;
GRANT ALL PRIVILEGES ON DATABASE carat_auction_engine TO postgres;
GRANT ALL PRIVILEGES ON DATABASE carat_payments TO postgres;
GRANT ALL PRIVILEGES ON DATABASE carat_notifications TO postgres;
GRANT ALL PRIVILEGES ON DATABASE carat_shipping TO postgres;
