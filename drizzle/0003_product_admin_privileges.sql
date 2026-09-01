-- B11 product administration requires narrowly-scoped runtime writes.
-- Keep DELETE and all unrelated privileges unavailable to cnc_center_app.

GRANT SELECT, INSERT, UPDATE
ON TABLE
  "products",
  "product_prices",
  "inventory"
TO "cnc_center_app";

GRANT SELECT, INSERT
ON TABLE
  "inventory_movements"
TO "cnc_center_app";