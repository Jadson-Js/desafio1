CREATE OR REPLACE TRIGGER "trigger_set_updated_at_in_orders" 
BEFORE UPDATE ON "public"."orders" 
FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at_orders"();