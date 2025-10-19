CREATE OR REPLACE TRIGGER "trigger_set_updated_at_in_products" 
BEFORE UPDATE ON "public"."products" 
FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at_products"();