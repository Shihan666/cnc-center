-- Runtime database access must remain explicitly least-privileged.
-- The migration owner previously had broad default table/sequence grants
-- for cnc_center_app, causing newly-created application tables to inherit
-- unnecessary INSERT/UPDATE/DELETE privileges.

ALTER DEFAULT PRIVILEGES
FOR ROLE "cnc_center_admin"
IN SCHEMA "public"
REVOKE ALL PRIVILEGES
ON TABLES
FROM "cnc_center_app";

ALTER DEFAULT PRIVILEGES
FOR ROLE "cnc_center_admin"
IN SCHEMA "public"
REVOKE ALL PRIVILEGES
ON SEQUENCES
FROM "cnc_center_app";

-- Remove inherited broad privileges from all existing application tables
-- before applying the explicit runtime matrix below.
REVOKE ALL PRIVILEGES
ON ALL TABLES IN SCHEMA "public"
FROM "cnc_center_app";

REVOKE ALL PRIVILEGES
ON ALL SEQUENCES IN SCHEMA "public"
FROM "cnc_center_app";

GRANT SELECT
ON TABLE
  "products",
  "product_prices"
TO "cnc_center_app";

GRANT SELECT, UPDATE
ON TABLE
  "inventory"
TO "cnc_center_app";

GRANT SELECT, INSERT
ON TABLE
  "inventory_movements"
TO "cnc_center_app";

GRANT SELECT, INSERT, UPDATE
ON TABLE
  "orders",
  "inventory_reservations",
  "payments"
TO "cnc_center_app";

GRANT SELECT, INSERT
ON TABLE
  "order_items",
  "order_status_history"
TO "cnc_center_app";
