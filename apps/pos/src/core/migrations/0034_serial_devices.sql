CREATE TABLE serial_devices (
  role TEXT NOT NULL PRIMARY KEY CHECK (role IN ('scale', 'reader')),
  vendor_id TEXT NOT NULL CHECK (
    length(vendor_id) = 4 AND vendor_id NOT GLOB '*[^0-9a-f]*'
  ),
  product_id TEXT NOT NULL CHECK (
    length(product_id) = 4 AND product_id NOT GLOB '*[^0-9a-f]*'
  ),
  UNIQUE (vendor_id, product_id)
);
