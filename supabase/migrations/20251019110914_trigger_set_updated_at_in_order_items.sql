CREATE OR REPLACE TRIGGER "trigger_set_updated_at_in_order_items" 
BEFORE UPDATE ON "public"."order_items" 
FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at_order_items"();